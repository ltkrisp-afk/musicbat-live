import { evaluateRadioPlayback, type ComplianceContext, type PlaybackEvent, type StatutoryGate } from './radio-compliance';
import { matchesRadioCategory, parseCategoryCommand, type Category, type CategoryTrack } from './radio-category';
import type { PlaybackMode } from './playback-authorization';

/** Storage adapter must provide one real SQLite connection and BEGIN IMMEDIATE semantics.
 * Cloudflare D1 is NOT this adapter. */
export interface RadioDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...params: (string | number)[]): unknown;
    all(...params: (string | number)[]): unknown[];
    run(...params: (string | number)[]): unknown;
  };
}
export type ScheduledTrack = CategoryTrack & { durationMs: number; sourceRevision?: string };
export type SharedChannelConfig = {
  category: Category | null; mode: PlaybackMode; territory: string; minimumArtists: number;
  review: { reference: string; verifiedAt: number; expiresAt: number } | null;
  gate: StatutoryGate | null;
};
export type ChannelSnapshot = {
  simulation: boolean; channelId: string; category: Category | null; revision: number; serverNow: number;
  status: 'playing' | 'silent'; reason: string;
  performance: { sequence: number; authorityId: string; trackId: string; startedAt: number; endsAt: number; offsetMs: number } | null;
};
type ChannelRow = { id: string; config_json: string; created_at: number; last_clock: number; revision: number; ledger_sequence: number };
type EventRow = { sequence: number; track_json: string; started_at: number; ended_at: number; closed: number };
export type ListenerAuthority = { id: string; plusUntil: number | null };
export type ChannelOption = { category: Category | null; dormant: boolean; locked: boolean };
const same = (a: Category | null, b: Category | null) => JSON.stringify(a) === JSON.stringify(b);
const inCategory = matchesRadioCategory;

/** Server-owned clock/catalog/configuration. Listener commands never carry clocks, tracks or modes.
 * Media is delivered separately after current authority/source validation. */
export class SharedRadioEngine {
  constructor(private db: RadioDatabase, private clock: () => number, private execution: 'simulation' | 'live' = 'simulation') {}
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private now() {
    const n = this.clock();
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid-server-clock');
    return n;
  }
  private channel(id: string): ChannelRow {
    const row = this.db.prepare('SELECT * FROM radio_engine_channels WHERE id=?').get(id) as ChannelRow | undefined;
    if (!row) throw new Error('unknown-shared-channel');
    return row;
  }
  private config(row: ChannelRow): SharedChannelConfig {
    const c = JSON.parse(row.config_json) as SharedChannelConfig;
    if ((c.category !== null && !parseCategoryCommand(c.category)) || !['free-radio', 'radio-plus'].includes(c.mode) ||
      !c.territory?.trim() || !Number.isSafeInteger(c.minimumArtists) || c.minimumArtists < 1 ||
      (c.mode === 'free-radio' && c.category !== null)) throw new Error('invalid-channel-configuration');
    return c;
  }
  private authorize(listener: ListenerAuthority, c: SharedChannelConfig, now: number) {
    if (!listener.id?.trim() || listener.id.length > 200) throw new Error('invalid-listener');
    if (c.mode === 'radio-plus' && (!Number.isSafeInteger(listener.plusUntil) || listener.plusUntil! <= now))
      throw new Error('radio-plus-entitlement-required');
  }
  private context(row: ChannelRow, c: SharedChannelConfig, now: number, durationMs: number, history: PlaybackEvent[]): ComplianceContext {
    return { execution: this.execution, mode: c.mode, territory: c.territory, channelId: row.id, now, durationMs,
      gate: c.gate, channelCreatedAt: row.created_at, historyComplete: true, history,
      noninteractive: true, requirementsEnforced: true };
  }
  private pool(row: ChannelRow, c: SharedChannelConfig, now: number, history: PlaybackEvent[]) {
    const review = c.review;
    if (!review?.reference?.trim() || !Number.isSafeInteger(review.verifiedAt) || review.verifiedAt < 0 || review.verifiedAt > now ||
      !Number.isSafeInteger(review.expiresAt) || review.expiresAt <= now) return { tracks: [], decisions: [], reason: 'channel-review-missing' };
    const tracks = this.db.prepare('SELECT track_json FROM radio_engine_catalog ORDER BY id').all()
      .map(v => JSON.parse((v as { track_json: string }).track_json) as ScheduledTrack).filter(t => inCategory(t, c.category));
    if (tracks.some(t => !parseCategoryCommand(t.category) || !Number.isSafeInteger(t.durationMs) || t.durationMs < 1 ||
      t.durationMs > 24 * 60 * 60 * 1000 || !t.id?.trim())) throw new Error('invalid-reviewed-catalog');
    const decisions = tracks.map(t => evaluateRadioPlayback(t, this.context(row, c, now, t.durationMs, history)));
    if (tracks.some(t => t.metadataReviewed !== true || !t.albumId?.trim() || !Array.isArray(t.artistIds) ||
      !t.artistIds.length || t.artistIds.some(id => !id?.trim()) || !Array.isArray(t.compilationIds) ||
      t.compilationIds.some(id => !id?.trim()))) throw new Error('invalid-reviewed-metadata');
    const eligible = tracks.filter((t, i) => decisions[i].allowed && review.expiresAt > now + t.durationMs);
    const artists = new Set(eligible.flatMap(t => t.artistIds));
    return { tracks: artists.size >= c.minimumArtists ? eligible : [], decisions,
      reason: artists.size < c.minimumArtists ? 'category-dormant' : 'no-authorized-compliant-track' };
  }
  private advance(id: string, now: number): ChannelSnapshot {
    const row = this.channel(id), c = this.config(row);
    if (now < row.last_clock || now < row.created_at) throw new Error('server-clock-regressed');
    const rows = this.db.prepare('SELECT * FROM radio_engine_events WHERE channel_id=? ORDER BY sequence').all(id) as EventRow[];
    const audit = this.db.prepare('SELECT count(*) AS count,coalesce(max(revision),0) AS revision FROM radio_engine_decisions WHERE channel_id=?').get(id) as {count:number;revision:number};
    if (rows.length !== row.ledger_sequence || audit.count !== row.revision || audit.revision !== row.revision)
      throw new Error('channel-ledger-incomplete');
    const history: PlaybackEvent[] = [];
    let active: EventRow | null = null;
    for (let i = 0; i < rows.length; i++) {
      const e = rows[i];
      if (e.sequence !== i + 1 || !Number.isSafeInteger(e.started_at) || !Number.isSafeInteger(e.ended_at) ||
        e.started_at < row.created_at || e.started_at > now || e.ended_at <= e.started_at || (i && e.started_at < rows[i - 1].ended_at) ||
        (e.closed === 0 && i !== rows.length - 1)) throw new Error('channel-ledger-invalid');
      if (!e.closed && e.ended_at > now) active = e;
      else {
        if (e.ended_at > now) throw new Error('channel-ledger-future-event');
        history.push({channelId: id, track: JSON.parse(e.track_json), startedAt: e.started_at, endedAt: e.ended_at});
        if (!e.closed) this.db.prepare('UPDATE radio_engine_events SET closed=1 WHERE channel_id=? AND sequence=?').run(id, e.sequence);
      }
    }
    let reason = 'shared-channel-current';
    if (active) {
      const old = JSON.parse(active.track_json) as ScheduledTrack;
      const current = this.db.prepare('SELECT track_json FROM radio_engine_catalog WHERE id=?').get(old.id) as {track_json: string} | undefined;
      const track = current ? JSON.parse(current.track_json) as ScheduledTrack : null;
      const remaining = active.ended_at - now;
      const validReview = c.review?.reference?.trim() && Number.isSafeInteger(c.review.verifiedAt) && c.review.verifiedAt >= 0 &&
        c.review.verifiedAt <= now && Number.isSafeInteger(c.review.expiresAt) && c.review.expiresAt > active.ended_at;
      if (!track || !inCategory(track, c.category) || !validReview ||
        !evaluateRadioPlayback(track, this.context(row, c, now, remaining, history)).allowed ||
        JSON.stringify({...track, permission:null}) !== JSON.stringify({...old, permission:null})) {
        // A zero-byte-at-start cancellation creates no performance; otherwise preserve elapsed history.
        if (now === active.started_at) this.db.prepare('DELETE FROM radio_engine_events WHERE channel_id=? AND sequence=?').run(id, active.sequence);
        else {
          this.db.prepare('UPDATE radio_engine_events SET ended_at=?,closed=1 WHERE channel_id=? AND sequence=?').run(now,id,active.sequence);
          history.push({channelId:id,track:old,startedAt:active.started_at,endedAt:now});
        }
        active = null; reason = 'active-rights-revoked';
      }
    }
    if (!active) {
      const p = this.pool(row,c,now,history);
      // Fair deterministic rotation based on persistent channel history, never listener signals.
      const lastSequence = new Map(history.map((e,i) => [e.track.id,i]));
      const selected = [...p.tracks].sort((a,b) => (lastSequence.get(a.id) ?? -1) - (lastSequence.get(b.id) ?? -1) || a.id.localeCompare(b.id))[0];
      reason = selected ? 'authorized-track-selected' : p.reason;
      row.revision++;
      this.db.prepare('INSERT INTO radio_engine_decisions VALUES (?,?,?,?,?)').run(id,row.revision,now,JSON.stringify(p.decisions),reason);
      if (selected) {
        if (!Number.isSafeInteger(now + selected.durationMs)) throw new Error('invalid-server-clock');
        const sequence = history.length + 1;
        active = {sequence,track_json:JSON.stringify(selected),started_at:now,ended_at:now+selected.durationMs,closed:0};
        this.db.prepare('INSERT INTO radio_engine_events VALUES (?,?,?,?,?,0)').run(id,sequence,active.track_json,now,active.ended_at);
      }
    }
    this.db.prepare('UPDATE radio_engine_channels SET last_clock=?,revision=?,ledger_sequence=? WHERE id=?')
      .run(now,row.revision,history.length+(active?1:0),id);
    return {simulation:this.execution === 'simulation',channelId:id,category:c.category,revision:row.revision,serverNow:now,
      status:active?'playing':'silent',reason,performance:active?{sequence:active.sequence,authorityId:`${row.revision}:${active.sequence}`,trackId:(JSON.parse(active.track_json) as ScheduledTrack).id,
        startedAt:active.started_at,endsAt:active.ended_at,offsetMs:now-active.started_at}:null};
  }
  tune(listener: ListenerAuthority, command: unknown): ChannelSnapshot {
    return this.transaction(() => {
      const now = this.now();
      const category = command === null ? null : parseCategoryCommand(command);
      if (command !== null && !category) throw new Error('invalid-category-command');
      const channels = this.db.prepare('SELECT * FROM radio_engine_channels ORDER BY id').all() as ChannelRow[];
      const candidates = channels.filter(row => {
        const c = this.config(row);
        return same(c.category,category) && c.mode === (category ? 'radio-plus' : 'free-radio');
      });
      if (candidates.length !== 1) throw new Error('shared-channel-not-established');
      const row = candidates[0]; this.authorize(listener,this.config(row),now);
      const result = this.advance(row.id,now);
      this.db.prepare('INSERT INTO radio_engine_sessions VALUES (?,?,?) ON CONFLICT(listener_id) DO UPDATE SET channel_id=excluded.channel_id,updated_at=excluded.updated_at').run(listener.id,row.id,now);
      return result;
    });
  }
  reconnect(listener: ListenerAuthority): ChannelSnapshot {
    return this.transaction(() => {
      const session = this.db.prepare('SELECT channel_id FROM radio_engine_sessions WHERE listener_id=?').get(listener.id) as {channel_id:string} | undefined;
      if (!session) throw new Error('listener-session-missing');
      const now=this.now(), row=this.channel(session.channel_id);
      this.authorize(listener,this.config(row),now);
      return this.advance(row.id,now);
    });
  }
  /** First connection joins Free Radio. Reconnect preserves an existing assignment. */
  connect(listener: ListenerAuthority): ChannelSnapshot {
    const existing = this.db.prepare('SELECT channel_id FROM radio_engine_sessions WHERE listener_id=?').get(listener.id);
    return existing ? this.reconnect(listener) : this.tune(listener, null);
  }
  /** Trusted scheduler tick, independent of listener pause/disconnection. Gaps are silence,
   * not fabricated historical transmissions; overdue tracks end at their recorded boundary. */
  tick(channelId: string) { return this.transaction(() => this.advance(channelId,this.now())); }
  /** Depth availability is based on reviewed catalog depth, not a playback guarantee.
   * Actual tuning still rechecks transactional history and all rights. */
  navigation(listener: ListenerAuthority): ChannelOption[] {
    return this.transaction(() => {
      const now = this.now();
      return (this.db.prepare('SELECT * FROM radio_engine_channels ORDER BY id').all() as ChannelRow[]).map(row => {
        const c = this.config(row);
        if (now < row.last_clock) throw new Error('server-clock-regressed');
        this.authorize({...listener, plusUntil: Number.MAX_SAFE_INTEGER}, c, now);
        return {category:c.category,dormant:this.pool(row,c,now,[]).tracks.length === 0,
          locked:c.mode === 'radio-plus' && (!Number.isSafeInteger(listener.plusUntil) || listener.plusUntil! <= now)};
      });
    });
  }
}
