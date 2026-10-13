import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { SharedRadioEngine, type ScheduledTrack, type SharedChannelConfig, type ListenerAuthority } from '../lib/shared-radio-engine';
import { createRadioTransport } from '../lib/shared-radio-transport';
import { evaluateRadioPlayback } from '../lib/radio-compliance';
import { parseCategoryCommand } from '../lib/radio-category';

export type ReviewedAsset = {
  /** Path relative to the private asset root. Never a public URL. */
  path: string; sha256: string; size: number; mediaType: 'audio/wav' | 'audio/mpeg' | 'audio/flac';
  lawfulCopyReference: string; reviewedBy: string; reviewedAt: number;
  durationEvidence: string; contractReference: string;
  restrictionsReviewed: true;
};
type SourceRow = { track_json: string; asset_json: string; status: string };
export type RuntimeOptions = { databasePath: string; assetRoot: string; gatewayToken: string; clock?: () => number; tickMs?: number };

/** Real disk SQLite authority and media delivery, with no production access.
 * The private gateway authenticates identity/territory; membership is always read here.
 * Administrative methods are never exposed as listener HTTP routes. */
export class RadioRuntime {
  readonly db: DatabaseSync;
  readonly engine: SharedRadioEngine;
  private clock: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private healthy = true;
  private closed = false;
  private transport: (request: Request) => Promise<Response>;
  private token: Buffer;
  constructor(private options: RuntimeOptions) {
    if (!options.gatewayToken || options.gatewayToken.length < 32) throw new Error('private-gateway-token-required');
    if (options.databasePath === ':memory:') throw new Error('persistent-database-required');
    this.token = Buffer.from(options.gatewayToken);
    this.clock = options.clock ?? Date.now;
    this.db = new DatabaseSync(options.databasePath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const exists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='radio_engine_channels'").get();
    if (!exists) this.db.exec(readFileSync(new URL('../drizzle/0008_shared_radio_engine.sql', import.meta.url), 'utf8'));
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    this.engine = new SharedRadioEngine(this.db, this.clock, 'live');
    this.transport = createRadioTransport(this.engine, {
      authority: async request => this.authority(request),
      territory: channelId => this.channelConfig(channelId).territory,
      sourceEligible: async (id, listener) => this.sourceEligible(id, listener),
      media: async (id, request) => this.media(id, request),
    });
  }
  private audit(id: string | null, action: string, detail: string) {
    this.db.prepare('INSERT INTO radio_runtime_audit(track_id,action,decided_at,detail) VALUES (?,?,?,?)').run(id, action, this.clock(), detail);
  }
  private channelConfig(id: string): SharedChannelConfig {
    const row = this.db.prepare('SELECT config_json FROM radio_engine_channels WHERE id=?').get(id) as { config_json: string } | undefined;
    if (!row) throw new Error('unknown-channel');
    return JSON.parse(row.config_json);
  }
  private authority(request: Request): (ListenerAuthority & { territory: string }) | null {
    const presented = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '');
    if (presented.length !== this.token.length || !timingSafeEqual(presented, this.token)) return null;
    const id = request.headers.get('x-musicbat-listener'), territory = request.headers.get('x-musicbat-territory');
    if (!id?.trim() || id.length > 200 || !territory || !/^([A-Z]{2}|unknown)$/.test(territory)) return null;
    const member = this.db.prepare('SELECT plus_until,withdrawn_at,evidence FROM radio_memberships WHERE listener_id=?').get(id) as { plus_until: number | null; withdrawn_at: number | null; evidence: string } | undefined;
    return { id, territory, plusUntil: member && member.withdrawn_at === null && member.evidence.trim() ? member.plus_until : null };
  }
  private source(id: string) {
    const row = this.db.prepare('SELECT * FROM radio_sources WHERE id=?').get(id) as SourceRow | undefined;
    return row ? { track: JSON.parse(row.track_json) as ScheduledTrack, asset: JSON.parse(row.asset_json) as ReviewedAsset, status: row.status } : null;
  }
  private assetValid(asset: ReviewedAsset) {
    return asset && asset.path?.trim() && !isAbsolute(asset.path) && !asset.path.split(/[\\/]/).includes('..') &&
      /^[a-f0-9]{64}$/.test(asset.sha256) && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 100 * 1024 * 1024 &&
      ['audio/wav', 'audio/mpeg', 'audio/flac'].includes(asset.mediaType) && asset.lawfulCopyReference?.trim() &&
      asset.contractReference?.trim() && asset.durationEvidence?.trim() && asset.reviewedBy?.trim() &&
      asset.restrictionsReviewed === true &&
      Number.isSafeInteger(asset.reviewedAt) && asset.reviewedAt >= 0 && asset.reviewedAt <= this.clock();
  }
  private sourceEligible(id: string, listener: ListenerAuthority) {
    const s = this.source(id);
    const assignment = this.db.prepare('SELECT channel_id FROM radio_engine_sessions WHERE listener_id=?').get(listener.id) as { channel_id: string } | undefined;
    let allowed = false;
    if (s && assignment && s.status === 'active' && this.assetValid(s.asset)) {
      const config = this.channelConfig(assignment.channel_id);
      const catalog = this.db.prepare('SELECT track_json FROM radio_engine_catalog WHERE id=?').get(id) as { track_json: string } | undefined;
      allowed = !!catalog && catalog.track_json === JSON.stringify(s.track) && evaluateRadioPlayback(s.track, {
        execution: 'live', mode: config.mode, territory: config.territory, channelId: assignment.channel_id,
        now: this.clock(), durationMs: 1, gate: null, channelCreatedAt: 0, historyComplete: true, history: [],
        noninteractive: true, requirementsEnforced: true,
      }).allowed;
    }
    this.audit(id, 'source-check', allowed ? 'allowed' : 'denied');
    return allowed;
  }
  private async media(id: string, request: Request) {
    const s = this.source(id);
    if (!s || !this.assetValid(s.asset)) return new Response(null, { status: 403 });
    const root = await realpath(this.options.assetRoot), file = await realpath(resolve(root, s.asset.path));
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('asset-outside-private-root');
    // Hash the actual immutable bytes on every delivery, including range/HEAD.
    // No cached grant or path is a substitute for current source eligibility.
    const bytes = await readFile(file);
    const current = this.source(id);
    if (!current || current.status !== 'active' || JSON.stringify(current.asset) !== JSON.stringify(s.asset) ||
        JSON.stringify(current.track) !== JSON.stringify(s.track)) return new Response(null, { status:409 });
    if (bytes.length !== s.asset.size || createHash('sha256').update(bytes).digest('hex') !== s.asset.sha256) {
      this.audit(id, 'asset-rejected', 'immutable-asset-mismatch');
      return new Response(null, { status: 403 });
    }
    const etag = '"' + s.asset.sha256 + '"';
    const headers = new Headers({ 'content-type': s.asset.mediaType, 'content-length': String(bytes.length),
      'accept-ranges': 'bytes', etag, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    let start = 0, end = bytes.length - 1, status = 200;
    const range = request.headers.get('range'), ifRange = request.headers.get('if-range');
    if (request.method !== 'HEAD' && range && (!ifRange || ifRange === etag)) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m && (m[1] || m[2])) {
        start = m[1] ? Number(m[1]) : Math.max(0, bytes.length - Number(m[2]));
        end = m[1] && m[2] ? Math.min(Number(m[2]), end) : end;
      } else start = NaN;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes.length || end < start)
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${bytes.length}`, 'cache-control': 'no-store' } });
      status = 206; headers.set('content-range', `bytes ${start}-${end}/${bytes.length}`); headers.set('content-length', String(end - start + 1));
    }
    this.audit(id, 'media-delivery', JSON.stringify({ status, start, end, sha256: s.asset.sha256 }));
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes.subarray(start, end + 1)), { status, headers });
  }
  /** Reviewed import only. Upload attestations never call this method. Source and
   * scheduling records are updated together on the same transactional authority. */
  publishSource(track: ScheduledTrack, asset: ReviewedAsset) {
    if (!this.assetValid(asset) || !track.id?.trim() || !parseCategoryCommand(track.category) ||
        !Number.isSafeInteger(track.durationMs) || track.durationMs < 1 || track.durationMs > 86400000 ||
        !track.metadataReviewed || !track.artistIds?.length || track.artistIds.some(id => !id?.trim()) ||
        !track.albumId?.trim() || !Array.isArray(track.compilationIds) || !track.permission ||
        track.permission.recording_basis !== 'direct' || !Object.hasOwn(track, 'directRestrictions')) throw new Error('reviewed-direct-source-required');
    const now = this.clock();
    if (!evaluateRadioPlayback(track, { execution:'live',mode:'free-radio',territory:track.permission.territory,
      channelId:'reviewed-import',now,durationMs:track.durationMs,gate:null,channelCreatedAt:0,
      historyComplete:true,history:[],noninteractive:true,requirementsEnforced:true }).allowed &&
        !evaluateRadioPlayback(track, { execution:'live',mode:'radio-plus',territory:track.permission.territory,
      channelId:'reviewed-import',now,durationMs:track.durationMs,gate:null,channelCreatedAt:0,
      historyComplete:true,history:[],noninteractive:true,requirementsEnforced:true }).allowed)
      throw new Error('current-source-permissions-required');
    const root = realpathSync(this.options.assetRoot), file = realpathSync(resolve(root, asset.path));
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('asset-outside-private-root');
    const bytes = readFileSync(file);
    if (bytes.length !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw new Error('immutable-asset-mismatch');
    if (asset.mediaType === 'audio/wav') {
      // PCM WAV duration is checked against the actual bytes, not the filename.
      if (bytes.length < 44 || bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WAVE')
        throw new Error('invalid-reviewed-wav');
      let byteRate = 0, dataSize = 0;
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const size = bytes.readUInt32LE(offset + 4), end = offset + 8 + size;
        if (end > bytes.length) throw new Error('invalid-reviewed-wav');
        const kind = bytes.toString('ascii', offset, offset + 4);
        if (kind === 'fmt ' && size >= 16) {
          if (bytes.readUInt16LE(offset + 8) !== 1) throw new Error('pcm-wav-required');
          byteRate = bytes.readUInt32LE(offset + 16);
        }
        if (kind === 'data') dataSize += size;
        offset = end + size % 2;
      }
      if (!byteRate || !dataSize || Math.abs(dataSize * 1000 / byteRate - track.durationMs) > 1)
        throw new Error('reviewed-duration-mismatch');
    }
    track = { ...track, sourceRevision:asset.sha256 };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO radio_sources VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET track_json=excluded.track_json,asset_json=excluded.asset_json,status=excluded.status,updated_at=excluded.updated_at')
        .run(track.id, JSON.stringify(track), JSON.stringify(asset), 'active', this.clock());
      this.db.prepare('INSERT INTO radio_engine_catalog VALUES (?,?) ON CONFLICT(id) DO UPDATE SET track_json=excluded.track_json').run(track.id, JSON.stringify(track));
      this.audit(track.id, 'reviewed-source-import', asset.contractReference);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  withdraw(id: string, reference: string) {
    if (!reference?.trim()) throw new Error('withdrawal-reference-required');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare("UPDATE radio_sources SET status='withdrawn',updated_at=? WHERE id=?").run(this.clock(), id);
      this.db.prepare('DELETE FROM radio_engine_catalog WHERE id=?').run(id);
      this.audit(id, 'withdrawal', reference); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.tick();
  }
  classify(id: string, category: unknown) {
    const parsed=parseCategoryCommand(category), source=this.source(id);
    if (!parsed) throw new Error('invalid-classification');
    if (!source || source.status!=='active') return false;
    if (JSON.stringify(source.track.category)===JSON.stringify(parsed)) return false;
    const track={...source.track,category:parsed,sourceRevision:createHash('sha256').update(source.asset.sha256+JSON.stringify(parsed)).digest('hex')};
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE radio_sources SET track_json=?,updated_at=? WHERE id=?').run(JSON.stringify(track),this.clock(),id);
      this.db.prepare('UPDATE radio_engine_catalog SET track_json=? WHERE id=?').run(JSON.stringify(track),id);
      this.audit(id,'artist-classification',JSON.stringify(parsed));this.db.exec('COMMIT');
    } catch(error){this.db.exec('ROLLBACK');throw error;}
    this.tick(); return true;
  }
  establishChannel(id: string, config: SharedChannelConfig) {
    if (!id?.trim() || !config.review?.reference?.trim() ||
        !Number.isSafeInteger(config.review.verifiedAt) || config.review.verifiedAt < 0 || config.review.verifiedAt > this.clock() ||
        !Number.isSafeInteger(config.review.expiresAt) || config.review.expiresAt <= this.clock() ||
        (config.category !== null && !parseCategoryCommand(config.category)) ||
        config.mode !== (config.category ? 'radio-plus' : 'free-radio') || !/^([A-Z]{2}|worldwide)$/.test(config.territory) ||
        !Number.isSafeInteger(config.minimumArtists) || config.minimumArtists < 1 || config.gate !== null)
      throw new Error('reviewed-direct-channel-required');
    const now = this.clock();
    // Existing timeline/configuration is never reset on startup/import.
    this.db.prepare('INSERT INTO radio_engine_channels VALUES (?,?,?, ?,0,0) ON CONFLICT(id) DO NOTHING').run(id, JSON.stringify(config), now, now);
  }
  setMembership(id: string, plusUntil: number | null, evidence: string) {
    if (!id?.trim() || !evidence?.trim() || (plusUntil !== null && !Number.isSafeInteger(plusUntil))) throw new Error('membership-evidence-required');
    this.db.prepare('INSERT INTO radio_memberships VALUES (?,?,?,NULL) ON CONFLICT(listener_id) DO UPDATE SET plus_until=excluded.plus_until,evidence=excluded.evidence,withdrawn_at=NULL').run(id, plusUntil, evidence);
  }
  tick() {
    const channels = this.db.prepare('SELECT id FROM radio_engine_channels ORDER BY id').all() as { id: string }[];
    try { for (const row of channels) this.engine.tick(row.id); this.healthy = true; }
    catch (error) { this.healthy = false; throw error; }
  }
  start() {
    if (this.timer) return;
    this.tick();
    const interval = this.options.tickMs ?? 100;
    if (!Number.isSafeInteger(interval) || interval < 20 || interval > 1000) throw new Error('invalid-scheduler-interval');
    this.timer = setInterval(() => { try { this.tick(); } catch { /* Fail closed; next tick retries, without resetting any ledger. */ } }, interval);
    this.timer.unref();
  }
  async fetch(request: Request) {
    if (this.closed || !this.healthy) return Response.json({ error: 'Radio authority unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    if (new URL(request.url).pathname === '/catalog/status') {
      const presented=Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '');
      if (presented.length!==this.token.length || !timingSafeEqual(presented,this.token)) return new Response(null,{status:401});
      if (request.method!=='GET') return new Response(null,{status:405});
      const id=new URL(request.url).searchParams.get('trackId') ?? '',source=this.source(id);
      const registered=source?.status==='active' && !!this.db.prepare('SELECT id FROM radio_engine_catalog WHERE id=?').get(id);
      return Response.json({registered:!!registered,category:source?.track.category ?? null},{headers:{'cache-control':'no-store'}});
    }
    if (new URL(request.url).pathname === '/catalog/control') {
      const presented=Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '');
      if (presented.length!==this.token.length || !timingSafeEqual(presented,this.token)) return new Response(null,{status:401});
      if (request.method!=='POST') return new Response(null,{status:405});
      const body=await request.json() as {trackId?:string;action?:string;reference?:string;category?:unknown};
      if (!body.trackId || !body.reference?.trim()) return new Response(null,{status:400});
      if (body.action==='classify') return Response.json({changed:this.classify(body.trackId,body.category)});
      if (body.action!=='withdraw') return new Response(null,{status:400});
      this.withdraw(body.trackId,body.reference);
      return Response.json({withdrawn:true});
    }
    return this.transport(request);
  }
  close() { if (this.closed) return; if (this.timer) clearInterval(this.timer); this.timer = null; this.closed = true; this.db.close(); }
}
