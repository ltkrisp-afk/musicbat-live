import {beginObservation,observationMode} from '../../../lib/listening-observation';
import {radioMembershipMode} from '../../../lib/membership-radio-boundary';
import {plusAccess} from '../../../lib/radio-plus';
import { verifiedCurrentAgreement } from "../../../lib/agreement-integrity";
import { parseRightsDeclaration } from "../../../lib/artist-rights-declaration";
import { env } from "cloudflare:workers";
import { expireWithdrawnCheckouts, readStripeWebhookBody, StripeWebhookBodyTooLarge } from "./stripe/stripe";
import { getChatGPTUser } from "../../chatgpt-auth";

type ActionBody = {
  metadata?: unknown;
  permission?: string;
  action?: string;
  artistId?: string;
  title?: string;
  artistName?: string;
  audioUrl?: string;
  rightsAttested?: boolean;
  trackId?: number;
  creationClassification?: string;
  listenId?: string;
  performanceKey?: string;
  kind?: string;
  enabled?: boolean;
  saleEnabled?: boolean;
  salePriceCents?: number;
  saleRightsAttested?: boolean;
  energyLane?: string;
  signal?: string;
  primaryGenre?: string;
  subgenre?: string;
  style?: string;
  representativeId?: string;
  moodTags?: string[];
};

// Versioned interchange fields. Submitted names identify declared contributors;
// they do not establish ownership or grant any permission.
function recordingMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CATALOG_METADATA');
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {version:1};
  for (const key of ['album','isrc','iswc','songwriters','publishers','recordingRightsHolders','compositionRightsHolders']) {
    const entry = input[key];
    if (entry === undefined) continue;
    if (['album','isrc','iswc'].includes(key)) {
      if (typeof entry !== 'string' || entry.length > (key==='album'?200:30)) throw new Error('CATALOG_METADATA');
      const normalized=key==='album'?entry.trim():entry.toUpperCase().replace(/[ .-]/g,'');
      if (normalized && key==='isrc' && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(normalized)) throw new Error('CATALOG_METADATA');
      if (normalized && key==='iswc' && !/^T[0-9]{10}$/.test(normalized)) throw new Error('CATALOG_METADATA');
      result[key]=normalized;
    } else {
      if (!Array.isArray(entry) || entry.length>50 || entry.some(n=>typeof n!=='string' || !n.trim() || n.length>200)) throw new Error('CATALOG_METADATA');
      result[key]=entry.map(n=>(n as string).trim());
    }
  }
  return result;
}

/** Bounded extraction of common ID3v2, RIFF INFO and FLAC Vorbis fields.
 * Unsupported tags remain absent. Never infer rights or overwrite explicit input.
 * No decompression, artwork parsing, network requests or tag-controlled allocation. */
async function audioMetadata(file: File, format: string) {
  const bytes=new Uint8Array(await file.arrayBuffer()), view=new DataView(bytes.buffer);
  const text=(start:number,end:number)=>new TextDecoder().decode(bytes.subarray(start,end)).replace(/\0/g,'').trim().slice(0,200);
  const tags:Record<string,string>={};
  const technical:Record<string,unknown>={version:1,format,bytes:file.size,extraction:'partial'};
  const names:Record<string,string>={TIT2:'title',TPE1:'artist',TALB:'album',TSRC:'isrc',TCOM:'songwriter',TITLE:'title',ARTIST:'artist',ALBUM:'album',ISRC:'isrc',COMPOSER:'songwriter',INAM:'title',IART:'artist',IPRD:'album'};
  const tag=(name:string,value:string)=>{if(names[name] && value) tags[names[name]]=value.slice(0,200)};
  if(format==='wav') {
    for(let offset=12,count=0;offset+8<=bytes.length && count++<4096;) {
      const name=text(offset,offset+4), size=view.getUint32(offset+4,true), start=offset+8,end=start+size;
      if(end>bytes.length) break;
      if(name==='fmt' && size>=16) {technical.sampleRate=view.getUint32(start+4,true);technical.channels=view.getUint16(start+2,true);technical.bitsPerSample=view.getUint16(start+14,true);technical.byteRate=view.getUint32(start+8,true);}
      if(name==='data') technical.audioBytes=size;
      if(name==='LIST' && text(start,start+4)==='INFO') {
        for(let i=start+4,n=0;i+8<=end && n++<256;) {const length=view.getUint32(i+4,true);if(i+8+length>end)break;tag(text(i,i+4),text(i+8,i+8+length));i+=8+length+(length%2);}
      }
      offset=end+(size%2);
    }
    if(Number(technical.byteRate)>0 && Number(technical.audioBytes)>=0) technical.durationMs=Math.round(Number(technical.audioBytes)/Number(technical.byteRate)*1000);
  } else if(format==='flac') {
    for(let offset=4,count=0;offset+4<=bytes.length && count++<128;) {
      const kind=bytes[offset]&127,last=!!(bytes[offset]&128),length=(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3],start=offset+4,end=start+length;
      if(end>bytes.length)break;
      if(kind===0 && length===34) {
        const high=view.getUint32(start+10,false),low=view.getUint32(start+14,false),rate=high>>>12;
        technical.sampleRate=rate;technical.channels=((high>>>9)&7)+1;technical.bitsPerSample=((high>>>4)&31)+1;
        if(rate)technical.durationMs=Math.round(((high&15)*4294967296+low)/rate*1000);
      }
      if(kind===4 && length<=1048576 && length>=8) {
        let i=start+4+view.getUint32(start,true);
        if(i+4<=end) {const entries=Math.min(view.getUint32(i,true),256);i+=4;for(let n=0;n<entries && i+4<=end;n++){const size=view.getUint32(i,true);i+=4;if(i+size>end)break;const entry=text(i,i+size),eq=entry.indexOf('=');if(eq>0)tag(entry.slice(0,eq).toUpperCase(),entry.slice(eq+1));i+=size;}}
      }
      offset=end;if(last)break;
    }
  } else if(format==='mp3' && text(0,3)==='ID3' && [3,4].includes(bytes[3]) && !(bytes[5]&0xc0)) {
    const sync=(i:number)=>((bytes[i]&127)<<21)|((bytes[i+1]&127)<<14)|((bytes[i+2]&127)<<7)|(bytes[i+3]&127);
    const end=Math.min(bytes.length,10+sync(6),1048576);
    for(let i=10,n=0;i+10<=end && n++<256;) {
      const id=text(i,i+4),size=bytes[3]===4?sync(i+4):view.getUint32(i+4,false),start=i+10;
      if(!size || start+size>end)break;
      if(names[id] && !bytes[i+9]) {
        const encoding=bytes[start],decoder=encoding===0?'windows-1252':encoding===1?'utf-16':encoding===2?'utf-16be':'utf-8';
        tag(id,new TextDecoder(decoder).decode(bytes.subarray(start+1,start+Math.min(size,4096))).replace(/\0/g,'').trim());
      }
      i=start+size;
    }
  }
  return {technical,tags};
}

const energyLanes = new Set(["soft", "medium", "hard", "turbo"]);
const primaryGenres = new Set(["Alternative", "Blues", "Classical", "Country", "Electronic", "Experimental", "Folk", "Hip-Hop", "Jazz", "Metal", "Other", "Punk", "Pop", "Rock"]);

const shockScoreSql = `
  (COALESCE((SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'up' AND f.rowid = (SELECT MAX(latest.rowid) FROM radio_feedback latest WHERE latest.track_id = f.track_id AND latest.listener_id = f.listener_id)), 0)
   - COALESCE((SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'down' AND f.rowid = (SELECT MAX(latest.rowid) FROM radio_feedback latest WHERE latest.track_id = f.track_id AND latest.listener_id = f.listener_id)), 0)
   + 2 * COALESCE((SELECT COUNT(*) FROM track_keeps k WHERE k.track_id = t.id), 0)
   + COALESCE((SELECT COUNT(*) FROM listens l WHERE l.track_id = t.id AND l.completed_at IS NOT NULL), 0)
   + 2 * MAX(0, (SELECT COUNT(*) FROM listens l WHERE l.track_id = t.id AND l.qualified = 1)
                 - (SELECT COUNT(DISTINCT listener_id) FROM listens l WHERE l.track_id = t.id AND l.qualified = 1))
   + 3 * COALESCE((SELECT COUNT(*) FROM purchases p WHERE p.track_id = t.id AND p.status = 'paid'), 0))`;

const shockStatsSql = `
  (SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'up' AND f.rowid = (SELECT MAX(latest.rowid) FROM radio_feedback latest WHERE latest.track_id = f.track_id AND latest.listener_id = f.listener_id)) AS up_count,
  (SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'down' AND f.rowid = (SELECT MAX(latest.rowid) FROM radio_feedback latest WHERE latest.track_id = f.track_id AND latest.listener_id = f.listener_id)) AS down_count,
  (SELECT COUNT(*) FROM track_keeps k WHERE k.track_id = t.id) AS keep_count,
  (SELECT COUNT(*) FROM listens l WHERE l.track_id = t.id AND l.completed_at IS NOT NULL) AS completion_count,
  MAX(0, (SELECT COUNT(*) FROM listens l WHERE l.track_id = t.id AND l.qualified = 1)
         - (SELECT COUNT(DISTINCT listener_id) FROM listens l WHERE l.track_id = t.id AND l.qualified = 1)) AS repeat_count,
  (SELECT COUNT(*) FROM purchases p WHERE p.track_id = t.id AND p.status = 'paid') AS purchase_count`;

function database() {
  if (!env.DB) throw new Error("MusicBat storage is unavailable.");
  return env.DB;
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function requireUser() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("SIGN_IN_REQUIRED");
  return user;
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message === "CATALOG_METADATA") return fail("Check optional credits and identifiers. Use a recording ISRC and composition ISWC when available.");
  if (message === "SIGN_IN_REQUIRED") return fail("Sign in to use MusicBat.", 401);
  if (message.includes("no such table")) return fail("MusicBat is finishing its first setup. Try again shortly.", 503);
  console.error("MusicBat API error", error);
  return fail("MusicBat could not complete that action.", 500);
}

/** Explicit sandbox-only opt-in; no production or live-mode fallback. */
async function cloudflareRadioService() {
  if(env.MUSICBAT_CLOUDFLARE_RADIO!=='test' || env.MUSICBAT_STRIPE_MODE!=='test' || !env.DB || !env.BUCKET)return undefined;
  return (await import('../../../lib/d1-radio-service')).d1RadioService(env.DB,env.BUCKET);
}

/** Consent is committed first. A failed sidecar sync never undoes withdrawal;
 * the channel gateway independently checks this catalog on every delivery. */
async function syncArtistRadio(id: number) {
  const row=await database().prepare('SELECT status,radio_enabled,primary_genre,subgenre,style,creation_classification FROM tracks WHERE id=?').bind(id).first<{status:string;radio_enabled:number;primary_genre:string;subgenre:string|null;style:string|null;creation_classification:string|null}>();
  if (!row) return false;
  const body=JSON.stringify({trackId:String(id),reference:'authenticated-artist-catalog',
    action:row.status==='active' && row.radio_enabled===1?'classify':'withdraw',creationClassification:row.creation_classification,
    category:{genre:row.primary_genre,...(row.subgenre?{subgenre:row.subgenre}:{}),...(row.style?{style:row.style}:{})}});
  try {
    const service=env.RADIO_SERVICE ?? await cloudflareRadioService();
    if (service) return (await service.fetch(new Request('https://radio.internal/catalog/control',{method:'POST',headers:{'authorization':'Bearer '+(env.RADIO_RUNTIME_TOKEN ?? '')},body}))).ok;
    if (!env.RADIO_RUNTIME_ORIGIN || !env.RADIO_RUNTIME_TOKEN) return false;
    const url=new URL(env.RADIO_RUNTIME_ORIGIN);
    if (url.protocol!=='https:' || url.pathname!=='/' || url.username || url.password || url.search || url.hash) return false;
    return (await fetch(new URL('/catalog/control',url),{method:'POST',headers:{'authorization':'Bearer '+env.RADIO_RUNTIME_TOKEN},body,redirect:'error',signal:AbortSignal.timeout(2000)})).ok;
  } catch { return false; }
}

async function assignedPerformance(userId: string, request: Request) {
  const headers=new Headers({'x-musicbat-listener':userId,'x-musicbat-territory':(request as Request & {cf?:{country?:string}}).cf?.country ?? 'unknown','authorization':'Bearer '+(env.RADIO_RUNTIME_TOKEN ?? '')});
  try {
    const mode=radioMembershipMode(env);
    headers.set('x-musicbat-plus-until',String(mode?await plusAccess(database(),userId,Date.now(),mode):0));
    let response;
    const service=env.RADIO_SERVICE ?? await cloudflareRadioService();
    if (service) response=await service.fetch(new Request('https://radio.internal/channel',{headers}));
    else if (env.RADIO_RUNTIME_ORIGIN && env.RADIO_RUNTIME_TOKEN) {
      const url=new URL(env.RADIO_RUNTIME_ORIGIN);
      if (url.protocol!=='https:' || url.pathname!=='/' || url.username || url.password || url.search || url.hash) return null;
      response=await fetch(new URL('/channel',url),{headers,redirect:'error',signal:AbortSignal.timeout(2000)});
    }
    if (!response?.ok) return null;
    const data=await response.json() as {snapshot:{simulation:boolean;status:string;channelId:string;category:unknown;performance:{trackId:string;authorityId:string;startedAt:number;endsAt:number;offsetMs:number}|null}};
    return data.snapshot.status==='playing' && !data.snapshot.simulation && data.snapshot.performance ? {trackId:data.snapshot.performance.trackId,interactive:!!data.snapshot.category && typeof data.snapshot.category==='object' && typeof (data.snapshot.category as {genre?:unknown}).genre==='string',key:data.snapshot.channelId+':'+data.snapshot.performance.authorityId,startedAt:data.snapshot.performance.startedAt,endsAt:data.snapshot.performance.endsAt,offsetMs:data.snapshot.performance.offsetMs} : null;
  } catch {return null;}
}

async function registeredRadioTrack(id: number, category: {genre:string;subgenre?:string;style?:string}) {
  const headers={'authorization':'Bearer '+(env.RADIO_RUNTIME_TOKEN ?? '')};
  try {
    let response;
    const path='/catalog/status?trackId='+id;
    const service=env.RADIO_SERVICE ?? await cloudflareRadioService();
    if (service) response=await service.fetch(new Request('https://radio.internal'+path,{headers}));
    else if (env.RADIO_RUNTIME_ORIGIN && env.RADIO_RUNTIME_TOKEN) {
      const origin=new URL(env.RADIO_RUNTIME_ORIGIN);
      if (origin.protocol!=='https:' || origin.pathname!=='/' || origin.username || origin.password || origin.search || origin.hash) return false;
      response=await fetch(new URL(path,origin),{headers,redirect:'error',signal:AbortSignal.timeout(2000)});
    }
    if (!response?.ok) return false;
    const data=await response.json() as {registered:boolean;category:unknown};
    return data.registered && JSON.stringify(data.category)===JSON.stringify(category);
  } catch {return false;}
}

export async function GET(request: Request) {
  try {
    const db = database();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "tracks";

    if (view === 'checkout-cleanup') {
      const user=await requireUser();
      const rows=await db.prepare(`SELECT p.track_id,j.state,count(*) AS operations,min(j.next_attempt_at) AS next_attempt_at,max(j.attempts) AS attempts
        FROM checkout_recovery_jobs j JOIN purchases p ON p.id=j.purchase_id JOIN tracks t ON t.id=p.track_id
        WHERE t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)
        GROUP BY p.track_id,j.state ORDER BY p.track_id,j.state LIMIT 200`).bind(user.userId,user.userId).all();
      return Response.json({operations:rows.results},{headers:{'cache-control':'private, no-store'}});
    }

    if (view === 'license-records') {
      const user=await requireUser();
      const after=Number(url.searchParams.get('after') ?? 0);
      if(!Number.isSafeInteger(after) || after<0)return fail('Choose a valid record cursor.');
      const records=await db.prepare(`SELECT a.*,v.body,v.acceptance_text,d.declaration_version,d.declaration_json,e.sha256,e.reviewed_at,e.electronic_consent,e.retainable_copy_confirmed,e.schedules_json,
        (SELECT json_group_array(json_object('decision',r.decision,'reviewed_by',r.reviewed_by,'reviewed_at',r.reviewed_at,'evidence_reference',r.evidence_reference)) FROM artist_rights_reviews r WHERE r.acceptance_id=a.id) AS reviews
        FROM artist_license_acceptances a JOIN direct_license_versions v ON v.version=a.agreement_version
        LEFT JOIN artist_rights_declarations d ON d.acceptance_id=a.id
        LEFT JOIN artist_acceptance_evidence e ON e.acceptance_id=a.id
        WHERE a.account_id=? AND a.track_id>? ORDER BY a.track_id LIMIT 100`).bind(user.userId,after).all();
      return Response.json({records:records.results,nextAfter:records.results.length===100?records.results[99].track_id:null},{headers:{'cache-control':'private, no-store'}});
    }

    if (view === 'catalog-export') {
      const user=await requireUser();
      const after=Number(url.searchParams.get('after') ?? 0);
      if(!Number.isSafeInteger(after) || after<0)return fail('Choose a valid catalog cursor.');
      const rows=await db.prepare(`SELECT t.id,t.artist_name,t.title,t.primary_genre,t.subgenre,t.style,t.status,t.radio_enabled,t.sale_enabled,t.compilation_allowed,t.licensing_allowed,t.recording_metadata,t.technical_metadata,t.creation_classification FROM tracks t WHERE t.id>? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)) ORDER BY t.id LIMIT 100`).bind(after,user.userId,user.userId).all();
      return Response.json({schema:'musicbat.catalog.v1',tracks:rows.results.map(row=>({...row,recording_metadata:JSON.parse(String(row.recording_metadata)),technical_metadata:JSON.parse(String(row.technical_metadata))})),nextAfter:rows.results.length===100?rows.results[99].id:null},{headers:{'cache-control':'private, no-store'}});
    }

    if (view === "rotunda") {
      const user = await requireUser();
      const rows = await db.prepare(`SELECT t.*, 1 AS can_manage, ${shockStatsSql},
        (SELECT COUNT(DISTINCT l.listener_id) FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.listener_id!=t.artist_id) AS listener_count,
        (SELECT COUNT(DISTINCT l.listener_id) FROM listens l WHERE l.track_id=t.id AND l.listener_id!=t.artist_id) AS discovery_listener_count,
        (SELECT COUNT(*) FROM artist_follows f WHERE f.artist_id=t.artist_id AND f.listener_id!=t.artist_id) AS follower_count,
        (SELECT COUNT(*) FROM purchases p WHERE p.track_id=t.id) AS checkout_count,
        (SELECT slug FROM artist_pages WHERE account_id=t.artist_id) AS artist_slug,
        CASE WHEN t.status != 'active' OR t.radio_enabled = 0 THEN 'withdrawn'
          WHEN EXISTS(SELECT 1 FROM playback_permissions p WHERE p.track_id=t.id AND p.artist_authorized=1 AND p.recording_basis='direct' AND p.withdrawn_at IS NULL AND p.free_allowed=1 AND p.starts_at<=unixepoch('now')*1000 AND p.reviewed_at<=unixepoch('now')*1000 AND length(trim(p.recording_evidence))>0 AND length(trim(p.composition_evidence))>0 AND length(trim(p.reviewed_by))>0 AND p.expires_at > ?)
          THEN 'rights reviewed; runtime registration required' ELSE 'awaiting rights review' END AS radio_status
        FROM tracks t WHERE t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)
        ORDER BY t.created_at DESC, t.id DESC`).bind(Date.now(), user.userId, user.userId).all();
      const profile = await db.prepare('SELECT artist_name FROM artist_profiles WHERE account_id=?').bind(user.userId).first();
      await Promise.all(rows.results.map(async row => {
        if (row.radio_status==='rights reviewed; runtime registration required' && await registeredRadioTrack(Number(row.id),{genre:String(row.primary_genre),...(row.subgenre?{subgenre:String(row.subgenre)}:{}),...(row.style?{style:String(row.style)}:{})})) row.radio_status='registered in Radio pool';
      }));
      const history=await db.prepare(`SELECT a.track_id,a.action,a.detail,a.created_at FROM artist_track_audit a JOIN tracks t ON t.id=a.track_id WHERE a.action IN ('upload','set_creation_classification') AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority r WHERE r.track_id=t.id AND r.account_id=? AND r.revoked_at IS NULL)) ORDER BY a.created_at DESC`).bind(user.userId,user.userId).all();
      return Response.json({tracks:rows.results, creationHistory:history.results, profile, accountId:user.userId}, {headers:{'cache-control':'private, no-store'}});
    }

    if (view === 'artists') {
      const user=await getChatGPTUser();
      const artists=await db.prepare(`SELECT p.account_id AS artist_id,p.slug,
        COALESCE((SELECT artist_name FROM artist_profiles WHERE account_id=p.account_id),
          (SELECT artist_name FROM tracks WHERE artist_id=p.account_id ORDER BY id DESC LIMIT 1)) AS artist_name,
        (SELECT COUNT(*) FROM tracks WHERE artist_id=p.account_id AND status='active' AND rights_attested=1) AS track_count,
        EXISTS(SELECT 1 FROM artist_follows WHERE artist_id=p.account_id AND listener_id=?) AS following,
        p.account_id=? AS is_owner
        FROM artist_pages p ORDER BY artist_name COLLATE NOCASE`).bind(user?.userId ?? '',user?.userId ?? '').all();
      const managed=user ? await db.prepare(`SELECT 1 FROM artist_profiles WHERE account_id=? UNION SELECT 1 FROM tracks WHERE artist_id=? UNION SELECT 1 FROM track_authority WHERE account_id=? AND revoked_at IS NULL LIMIT 1`).bind(user.userId,user.userId,user.userId).first() : null;
      const artistIdentity=user ? artists.results.find(artist=>artist.artist_id===user.userId)?.artist_name ?? null : null;
      return Response.json({artists:artists.results,canManage:Boolean(managed),signedIn:Boolean(user),artistIdentity}, {headers:{'cache-control':'private, no-store','vary':'Cookie'}});
    }
    if (view === "shock-room") {
      const user = await requireUser();
      const managed = await db.prepare("SELECT 1 FROM artist_profiles WHERE account_id=? UNION SELECT 1 FROM tracks WHERE artist_id=? UNION SELECT 1 FROM track_authority WHERE account_id=? AND revoked_at IS NULL LIMIT 1").bind(user.userId,user.userId,user.userId).first();
      if (!managed) return fail("Artist access is required for Shock Room.",403);
      const rows = await db.prepare(`SELECT * FROM (
        SELECT t.id AS track_id, t.title, t.artist_name, t.primary_genre, t.energy_lane,
          EXISTS(SELECT 1 FROM saved_recordings s WHERE s.track_id=t.id AND s.account_id=?) AS viewer_saved,
        ${shockStatsSql}, ${shockScoreSql} AS shock_score,
          ROW_NUMBER() OVER (PARTITION BY t.primary_genre, t.energy_lane ORDER BY ${shockScoreSql} DESC, t.title COLLATE NOCASE, t.id) AS position
        FROM tracks t
        WHERE t.status = 'active' AND t.rights_attested = 1
      ) ranked WHERE track_id IN (SELECT t.id FROM tracks t WHERE t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))
        ORDER BY primary_genre, energy_lane, position, track_id
      `).bind(user.userId,user.userId).all();
      return Response.json({ rows: rows.results }, {headers:{'cache-control':'private, no-store','vary':'Cookie'}});
    }

    const viewer = await getChatGPTUser();
    const rows = await db.prepare(`
      SELECT t.id, t.artist_id, (SELECT slug FROM artist_pages WHERE account_id=t.artist_id) AS artist_slug, t.title, t.artist_name, t.audio_url, t.created_at, t.keep_in_rotation, t.energy_lane,
        t.primary_genre, t.subgenre, t.style, t.radio_enabled, t.status, t.mood_tags,
        t.sale_enabled, t.sale_price_cents, t.sale_currency,
        EXISTS(SELECT 1 FROM playback_permissions p WHERE p.track_id=t.id AND p.recording_basis='direct' AND p.artist_authorized=1 AND p.free_allowed=1 AND p.withdrawn_at IS NULL AND p.starts_at<=unixepoch('now')*1000 AND p.expires_at>unixepoch('now')*1000 AND length(trim(p.recording_evidence))>0 AND length(trim(p.composition_evidence))>0 AND length(trim(p.reviewed_by))>0) AS radio_rights_reviewed,
        (t.artist_id = ?) AS can_manage,
        EXISTS(SELECT 1 FROM artist_accounts a WHERE a.artist_id = t.artist_id AND a.charges_enabled = 1 AND a.payouts_enabled = 1 AND a.details_submitted = 1) AS seller_ready,
        EXISTS(SELECT 1 FROM listens l WHERE l.track_id = t.id AND l.listener_id = ? AND l.qualified = 1) AS viewer_qualified,
        EXISTS(SELECT 1 FROM track_keeps k WHERE k.track_id = t.id AND k.listener_id = ?) AS viewer_keep_in_rotation,
        EXISTS(SELECT 1 FROM saved_recordings s WHERE s.track_id=t.id AND s.account_id=?) AS viewer_saved,
        ${shockStatsSql}, ${shockScoreSql} AS shock_score,
        ROW_NUMBER() OVER (PARTITION BY t.primary_genre, t.energy_lane ORDER BY ${shockScoreSql} DESC, t.title COLLATE NOCASE, t.id) AS position
      FROM tracks t
      WHERE t.status = 'active' AND t.rights_attested = 1
      ORDER BY t.created_at DESC, t.id DESC
    `).bind(viewer?.userId ?? "", viewer?.userId ?? "", viewer?.userId ?? "", viewer?.userId ?? "").all();
    return Response.json({ tracks: rows.results.map((track) => {
      const visible = { ...track };
      if (!track.can_manage) for (const key of ['up_count','down_count','keep_count','completion_count','repeat_count','purchase_count','shock_score','position']) delete visible[key];
      return { ...visible, rotation_eligible: track.radio_enabled === 1 && track.radio_rights_reviewed === 1 };
    }) }, { headers: { "cache-control": "private, no-store", "vary": "Cookie" } });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  if (env.MUSICBAT_RELEASE_PAUSED === "1") return Response.json({ error: "MusicBat is briefly paused for an update." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });
  try {
    const user = await requireUser();
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return fail("Cross-origin changes are not allowed.",403);
    const db = database();
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (!env.BUCKET) return fail("Audio uploads are temporarily unavailable. Try again shortly.", 503);
      const maximumBytes = 25 * 1024 * 1024;
      if (Number(request.headers.get("content-length")) > maximumBytes + 65536) return fail("Choose an audio file under 25 MB.", 413);
      // Bound the multipart body before parsing, including clients without Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return fail("Choose an audio file.");
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maximumBytes + 65536) {
          await reader.cancel();
          return fail("Choose an audio file under 25 MB.", 413);
        }
        chunks.push(value);
      }
      let form: FormData;
      try {
        form = await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
      } catch { return fail("The upload could not be read. Choose your file again."); }
      const title = String(form.get("title") ?? "").trim();
      const artistName = String(form.get("artistName") ?? "").trim();
      const saleEnabled = form.get("saleEnabled") === "true";
      const saleRightsAttested = form.get("saleRightsAttested") === "true";
      const salePriceCents = Number(form.get("salePriceCents"));
      const energyLane = String(form.get("energyLane") ?? "medium");
      const primaryGenre = String(form.get("primaryGenre") ?? "").trim();
      const style = String(form.get("style") ?? "").trim();
      const rawSubgenre = String(form.get("subgenre") ?? "").trim();
      const subgenre = rawSubgenre || null;
      const rawMoodTags = String(form.get("moodTags") ?? "");
      const moodTags = [...new Set(rawMoodTags.split(",").map((tag) => tag.trim()).filter(Boolean))];
      const file = form.get("audio");
      if (!title || !artistName) return fail("Track title and artist or band name are required.");
      if (title.length > 120 || artistName.length > 80) return fail("Track title or artist name is too long.");
      if (form.get("rightsAttested") !== "true") return fail("Rights attestation is required.");
      const agreementVersion = form.get("agreementVersion");
      const agreement = await verifiedCurrentAgreement(db);
      if (!agreement) return fail("Artist uploads are unavailable until the complete Direct Licensing Agreement is approved.", 503);
      if (form.get("agreementAccepted") !== "true" || agreementVersion !== agreement.version)
        return fail("Accept the current Direct Licensing Agreement before uploading. Reload the upload form if the agreement has changed.", 409);
      const finalVersion = agreement.version === '2026-10-29.3';
      let reviewedAt = Number(form.get('agreementReviewedAt'));
      const reviewReceiptId=String(form.get('reviewReceiptId')??'');
      if (finalVersion) {
        const receipt=await db.prepare('SELECT reviewed_at FROM agreement_review_receipts WHERE id=? AND account_id=? AND agreement_version=? AND sha256=?').bind(reviewReceiptId,user.userId,agreement.version,agreement.sha256).first<{reviewed_at:number}>();
        if(!receipt || receipt.reviewed_at<Date.now()-86400000) return fail('Open the current agreement for this signed-in account before accepting.',409);
        reviewedAt=receipt.reviewed_at;
      }
      if (finalVersion && (form.get('agreementDigest')!==agreement.sha256 || !Number.isSafeInteger(reviewedAt) || reviewedAt<=0 || reviewedAt>Date.now() || form.get('electronicConsent')!=='true' || form.get('retainableCopyConfirmed')!=='true'))
        return fail('Open the complete agreement, consent to electronic contracting and confirm you can retain a copy.',409);
      const completedSchedules:Record<string,string>={};
      if (finalVersion) {
        try {
          const fields=JSON.parse(String(form.get('completedSchedules') ?? 'null'));
          for (const key of ['noticeContact','scope','beneficiaryInstructions']) {
            if (typeof fields?.[key]!=='string' || !fields[key].trim() || fields[key].length>4000) throw new Error('Missing execution particulars');
            completedSchedules[key]=fields[key].trim();
          }
        } catch { return fail('Complete the recording-specific notice, scope and beneficiary instructions.',422); }
      }
      let rights;
      try { rights = parseRightsDeclaration(JSON.parse(String(form.get("rightsDeclaration") ?? 'null'))); }
      catch (error) { return fail(error instanceof Error ? error.message : 'Complete the artist rights declarations.', 422); }
      if (!rights.declaration.creationClassification) return fail('Declare Human, Human + AI, or AI for this recording.',422);
      if (!energyLanes.has(energyLane)) return fail("Choose a valid Radio energy lane.");
      if (!primaryGenres.has(primaryGenre)) return fail("Choose a valid primary genre.");
      if (style.length > 80 || (style && !rawSubgenre)) return fail("Style requires a subgenre and must be 80 characters or fewer.");
      if (rawSubgenre.length > 80) return fail("Subgenre must be 80 characters or fewer.");
      if (rawMoodTags.length > 240 || moodTags.length > 5 || moodTags.some((tag) => tag.length > 40)) return fail("Use up to five mood tags, each 40 characters or fewer.");
      if (saleEnabled && !saleRightsAttested) return fail("Sale authorization is required to sell this track.");
      if (saleEnabled && (!Number.isInteger(salePriceCents) || salePriceCents < 50 || salePriceCents > 100000)) return fail("Set a sale price from $0.50 to $1,000.00.");
      if (!(file instanceof File) || !file.size) return fail("Choose an audio file.");
      if (file.size > maximumBytes) return fail("Choose an audio file under 25 MB.", 413);
      const extension = file.name.split(".").pop()?.toLowerCase();
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const prefix = new TextDecoder().decode(signature);
      const audioTypes: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac" };
      const valid = (extension === "mp3" && (prefix.startsWith("ID3") || (signature[0] === 255 && (signature[1] & 224) === 224)))
        || (extension === "wav" && prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WAVE")
        || (extension === "flac" && prefix.startsWith("fLaC"));
      if (!extension || !valid) return fail("Choose an MP3, WAV, or FLAC audio file. MP3 is recommended for Radio.");
      let submitted: Record<string,unknown>;
      try { submitted=recordingMetadata(JSON.parse(String(form.get('metadata') ?? '{}'))); }
      catch { return fail('Check the optional recording metadata.'); }
      const extracted=await audioMetadata(file,extension);
      const metadata={...recordingMetadata({...(extracted.tags.album?{album:extracted.tags.album}:{}),...(extracted.tags.isrc && /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(extracted.tags.isrc)?{isrc:extracted.tags.isrc}:{})}),...submitted};
      const assetId = `${crypto.randomUUID()}.${extension}`;
      const key = `tracks/${assetId}`;
      const audioUrl = `/api/musicbat/audio/${assetId}`;
      await env.BUCKET.put(key, file, {
        httpMetadata: { contentType: audioTypes[extension] },
        customMetadata: { artistId: user.userId, originalFilename: file.name.slice(0, 200) },
      });
      let track;
      try {
        const now=Date.now();
        const acceptanceId=crypto.randomUUID();
        const result=await db.batch([
          db.prepare(`INSERT INTO tracks (artist_id,artist_name,title,audio_url,rights_attested,energy_lane,primary_genre,subgenre,mood_tags,sale_enabled,sale_rights_attested,sale_price_cents,sale_currency,status,style,recording_metadata,technical_metadata,radio_enabled,creation_classification)
            VALUES (?,?,?,?,1,?,?,?,?,?,?,?,'usd','active',?,?,?,?,?) RETURNING *`)
            .bind(user.userId,artistName,title,audioUrl,energyLane,primaryGenre,subgenre,JSON.stringify(moodTags),saleEnabled && !rights.reviewRequired && !finalVersion?1:0,saleEnabled?1:0,saleEnabled?salePriceCents:null,style||null,JSON.stringify(metadata),JSON.stringify({...extracted.technical,embedded:extracted.tags}),rights.reviewRequired || finalVersion?0:1,rights.declaration.creationClassification),
          // Same D1 transaction as the track. Recheck the active version at commit time.
          // A missing/changed agreement produces NULL and aborts the entire batch.
          db.prepare(`INSERT INTO artist_license_acceptances
            (id,track_id,account_id,agreement_version,accepted,accepted_at)
            VALUES (?,(SELECT id FROM tracks WHERE audio_url=? AND artist_id=?),?,
              (SELECT version FROM direct_license_current WHERE id=1 AND version=?),1,?)`)
            .bind(acceptanceId,audioUrl,user.userId,user.userId,agreement.version,now),
          db.prepare(`INSERT INTO artist_rights_declarations (acceptance_id,track_id,declaration_version,declaration_json,review_required)
            VALUES (?,(SELECT id FROM tracks WHERE audio_url=? AND artist_id=?),?,?,?)`)
            .bind(acceptanceId,audioUrl,user.userId,rights.declaration.version,JSON.stringify(rights.declaration),rights.reviewRequired?1:0),
          ...(finalVersion ? [db.prepare(`INSERT INTO artist_acceptance_evidence
            (acceptance_id,review_receipt_id,sha256,reviewed_at,electronic_consent,retainable_copy_confirmed,legal_name,capacity,schedules_json) VALUES (?,?,?,?,1,1,?,?,?)`)
            .bind(acceptanceId,reviewReceiptId,agreement.sha256,reviewedAt,rights.declaration.legalName,rights.declaration.capacity,JSON.stringify({completedSchedules,declaration:rights.declaration,requestedUses:{download:saleEnabled},version:agreement.version}))] : []),
          db.prepare('INSERT INTO artist_profiles VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET artist_name=excluded.artist_name,updated_at=excluded.updated_at').bind(user.userId,artistName,now,now),
          db.prepare("INSERT OR IGNORE INTO artist_pages VALUES (?,'artist-' || lower(hex(?)))").bind(user.userId,user.userId),
          db.prepare('INSERT INTO artist_track_audit SELECT ?,id,?,?,?,? FROM tracks WHERE audio_url=? AND artist_id=?').bind(crypto.randomUUID(),user.userId,'upload',JSON.stringify({artistName,primaryGenre,subgenre,style,rightsAttested:true,saleEnabled,creationClassification:rights.declaration.creationClassification}),now,audioUrl,user.userId),
        ]);
        track=result[0].results[0];
        if (!track) throw new Error('Track registration failed');
      } catch (error) {
        await env.BUCKET.delete(key);
        throw error;
      }
      return Response.json({ track, rightsReview: rights.reviewRequired ? "required" : "declared" }, { status: 201 });
    }
    let body: ActionBody;
    try { body = JSON.parse(await readStripeWebhookBody(request, 16384)) as ActionBody; }
    catch (error) { return fail(error instanceof StripeWebhookBodyTooLarge ? "Action request is too large." : "A valid action is required.", error instanceof StripeWebhookBodyTooLarge ? 413 : 400); }
    if (!body || Array.isArray(body) || typeof body !== "object") return fail("A valid action is required.");
    for (const key of ["title","artistName","primaryGenre","subgenre","style","energyLane","representativeId"] as const) if (body[key] !== undefined && typeof body[key] !== "string") return fail("Metadata fields must be text.");

    if (body.action === 'follow_artist') {
      if(typeof body.artistId!=='string' || typeof body.enabled!=='boolean') return fail('Choose an artist and follow state.');
      if(body.artistId===user.userId)return fail('This is your artist page. Use your artist controls to manage your music.',403);
      if(!await db.prepare('SELECT 1 FROM artist_pages WHERE account_id=?').bind(body.artistId).first()) return fail('Artist not found.',404);
      if(body.enabled) await db.prepare('INSERT OR IGNORE INTO artist_follows(listener_id,artist_id) VALUES (?,?)').bind(user.userId,body.artistId).run();
      else await db.prepare('DELETE FROM artist_follows WHERE listener_id=? AND artist_id=?').bind(user.userId,body.artistId).run();
      return Response.json({following:body.enabled});
    }
    if (body.action === 'set_artist_identity') {
      const name=body.artistName?.trim();
      if (!name || name.length>80) return fail('Choose an artist or band name, up to 80 characters.');
      await db.prepare('INSERT INTO artist_profiles VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET artist_name=excluded.artist_name,updated_at=excluded.updated_at').bind(user.userId,name,Date.now(),Date.now()).run();
      await db.prepare("INSERT OR IGNORE INTO artist_pages VALUES (?,'artist-' || lower(hex(?)))").bind(user.userId,user.userId).run();
      return Response.json({saved:true});
    }
    if (['set_creation_classification','set_recording_metadata','set_catalog_permission','edit_metadata','set_radio','withdraw_track','delete_track','grant_representative','revoke_representative'].includes(body.action ?? '')) {
      const id = Number(body.trackId);
      if (!Number.isSafeInteger(id) || id < 1) return fail('A valid track is required.');
      const track = await db.prepare(`SELECT t.* FROM tracks t WHERE t.id=? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))`).bind(id,user.userId,user.userId).first<{id:number;artist_id:string;status:string}>();
      if (!track) return fail('Only an authorized artist or representative can manage this track.',403);
      const now = Date.now();
      const statements = [];
      if (body.action === 'grant_representative' || body.action === 'revoke_representative') {
        if (track.artist_id !== user.userId) return fail('Only the submitting account may appoint representatives.',403);
        if (!body.representativeId?.trim() || body.representativeId.length > 200) return fail('A verified representative account ID is required.');
        const account = await db.prepare('SELECT account_id FROM artist_profiles WHERE account_id=?').bind(body.representativeId).first();
        if (!account) return fail('The representative must first sign in and create an artist identity.');
        statements.push(body.action === 'grant_representative'
          ? db.prepare('INSERT INTO track_authority VALUES (?,?,?,?,NULL) ON CONFLICT(track_id,account_id) DO UPDATE SET granted_by=excluded.granted_by,granted_at=excluded.granted_at,revoked_at=NULL').bind(id,body.representativeId,user.userId,now)
          : db.prepare('UPDATE track_authority SET revoked_at=? WHERE track_id=? AND account_id=?').bind(now,id,body.representativeId));
      } else {
        if (track.status === 'deleted' && body.action !== 'delete_track') return fail('Deleted tracks cannot be changed.',409);
        if (body.action === 'set_creation_classification') {
          if (!['Human','Human + AI','AI'].includes(body.creationClassification ?? '')) return fail('Choose Human, Human + AI, or AI.',422);
          statements.push(db.prepare("UPDATE tracks SET creation_classification=? WHERE id=? AND status!='deleted' AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))").bind(body.creationClassification,id,user.userId,user.userId));
        } else if (body.action === 'set_recording_metadata') {
          const metadata=recordingMetadata(body.metadata);
          statements.push(db.prepare("UPDATE tracks SET recording_metadata=? WHERE id=? AND status!='deleted' AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))").bind(JSON.stringify(metadata),id,user.userId,user.userId));
        } else if (body.action === 'set_catalog_permission') {
          if (!['compilation','licensing'].includes(body.permission ?? '') || typeof body.enabled!=='boolean') return fail('Choose a permission and ON/OFF state.');
          const column=body.permission==='compilation'?'compilation_allowed':'licensing_allowed';
          statements.push(db.prepare(`UPDATE tracks SET ${column}=? WHERE id=? AND status='active' AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))`).bind(body.enabled?1:0,id,user.userId,user.userId));
        } else if (body.action === 'edit_metadata') {
          const title=body.title?.trim() ?? '', genre=body.primaryGenre ?? '', sub=body.subgenre?.trim() ?? '', style=body.style?.trim() ?? '';
          if (!title || title.length>120 || !primaryGenres.has(genre) || sub.length>80 || style.length>80 || (style && !sub) || !energyLanes.has(body.energyLane ?? '')) return fail('Choose a valid title, Genre → Subgenre → Style and energy lane.');
          statements.push(db.prepare('UPDATE tracks SET title=?,primary_genre=?,subgenre=?,style=?,energy_lane=? WHERE id=? AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(title,genre,sub||null,style||null,body.energyLane,id,user.userId,user.userId));
        } else if (body.action === 'set_radio') {
          if (typeof body.enabled !== 'boolean') return fail('Choose radio participation on or off.');
          if (body.enabled && await db.prepare('SELECT 1 FROM artist_rights_holds WHERE track_id=?').bind(id).first()) return fail('Rights review is required before enabling this recording.',409);
          statements.push(db.prepare("UPDATE tracks SET radio_enabled=?,status='active' WHERE id=? AND status!='deleted' AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))").bind(body.enabled?1:0,id,user.userId,user.userId));
          // Returning to Radio is a new request; withdrawn grants are never silently restored.
          if (!body.enabled) statements.push(db.prepare('UPDATE playback_permissions SET withdrawn_at=? WHERE track_id=? AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=playback_permissions.track_id AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)))').bind(now,id,user.userId,user.userId));
        } else {
          statements.push(db.prepare('UPDATE tracks SET status=?,radio_enabled=0,sale_enabled=0,sale_rights_attested=0,compilation_allowed=0,licensing_allowed=0 WHERE id=? AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(body.action==='delete_track'?'deleted':'withdrawn',id,user.userId,user.userId));
          statements.push(db.prepare('UPDATE playback_permissions SET withdrawn_at=? WHERE track_id=? AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=playback_permissions.track_id AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)))').bind(now,id,user.userId,user.userId));
        }
      }
      statements.push(db.prepare('INSERT INTO artist_track_audit SELECT ?,id,?,?,?,? FROM tracks t WHERE t.id=? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(crypto.randomUUID(),user.userId,body.action,JSON.stringify(body),now,id,user.userId,user.userId));
      const results=await db.batch(statements);
      if (results[0].meta.changes===0) return fail('Track authority changed. Refresh your catalog.',403);
      const checkoutCleanup = ['withdraw_track','delete_track'].includes(body.action ?? '')
        ? await expireWithdrawnCheckouts({ ...env, DB: db }, id) : undefined;
      const radioSynchronized = await syncArtistRadio(id);
      let contentRemoval: string | undefined;
      if (body.action==='delete_track') {
        // Consent is already revoked. A concurrent purchase must have captured
        // its snapshot before this commit; keep pending payments as well as paid.
        const retained=await db.prepare("SELECT t.audio_url FROM tracks t WHERE t.id=? AND t.status='deleted' AND NOT EXISTS(SELECT 1 FROM rights_case_current c WHERE c.track_id=t.id AND c.state IN ('received','hold')) AND NOT EXISTS(SELECT 1 FROM purchases p WHERE p.audio_path=t.audio_url AND (p.status IN ('paid','pending','awaiting_checkout','payment_review') OR p.sale_withdrawn_at IS NOT NULL AND p.cleanup_state!='expired' AND p.status!='refunded')) AND NOT EXISTS(SELECT 1 FROM tracks other WHERE other.audio_url=t.audio_url AND other.id!=t.id AND other.status!='deleted')").bind(id).first<{audio_url:string}>();
        const asset=retained && /^\/api\/musicbat\/audio\/([0-9a-f-]{36}\.(?:mp3|wav|flac))$/.exec(retained.audio_url)?.[1];
        contentRemoval='retained for purchase obligations';
        if(asset) {
          try { if(!env.BUCKET) throw new Error('storage unavailable'); await env.BUCKET.delete('tracks/'+asset);contentRemoval='removed'; }
          catch {contentRemoval='retry required';}
        }
      }
      return Response.json({saved:true,recordsPreserved:true,radioSynchronized,contentRemoval,checkoutCleanup});
    }

    if (body.action === "add_track") {
      return fail("Upload your music file with its track title and artist or band name.");
    }

    if (body.action === "set_rotation_priority") {
      const trackId = Number(body.trackId);
      if (!Number.isInteger(trackId) || trackId < 1 || typeof body.enabled !== "boolean") return fail("A valid track and ON/OFF state are required.");
      // Eligibility is controlled by status/rights, never by this priority flag.
      const track = await db.prepare(`
        UPDATE tracks SET keep_in_rotation = ?
        WHERE id = ? AND status != 'deleted' AND (artist_id = ? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))
        RETURNING id, keep_in_rotation, status, rights_attested
      `).bind(body.enabled ? 1 : 0, trackId, user.userId, user.userId).first();
      if (!track) return fail("Only the uploading artist can edit this track's priority.", 403);
      if (track) {
        await db.prepare('INSERT INTO artist_track_audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),trackId,user.userId,body.action,JSON.stringify(body),Date.now()).run();
        await syncArtistRadio(trackId);
      }
      return Response.json({ track });
    }

    if (body.action === "set_energy_lane") {
      const trackId = Number(body.trackId);
      const energyLane = body.energyLane ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !energyLanes.has(energyLane)) return fail("Choose a valid track and Radio energy lane.");
      const track = await db.prepare(`
        UPDATE tracks SET energy_lane = ? WHERE id = ? AND status != 'deleted' AND (artist_id = ? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))
        RETURNING id, energy_lane
      `).bind(energyLane, trackId, user.userId, user.userId).first();
      if (!track) return fail("Only the uploading artist can assign this track's energy lane.", 403);
      if (track) {
        await db.prepare('INSERT INTO artist_track_audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),trackId,user.userId,body.action,JSON.stringify(body),Date.now()).run();
        await syncArtistRadio(trackId);
      }
      return Response.json({ track });
    }

    if (body.action === "set_primary_genre") {
      const trackId = Number(body.trackId);
      const primaryGenre = body.primaryGenre ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !primaryGenres.has(primaryGenre)) return fail("Choose a valid track and primary genre.");
      const track = await db.prepare(`UPDATE tracks SET primary_genre = ?, subgenre=NULL, style=NULL WHERE id = ? AND status != 'deleted' AND (artist_id = ? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))
        RETURNING id, primary_genre`).bind(primaryGenre, trackId, user.userId, user.userId).first();
      if (!track) return fail("Only the uploading artist can change this track's genre.", 403);
      if (track) {
        await db.prepare('INSERT INTO artist_track_audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),trackId,user.userId,body.action,JSON.stringify(body),Date.now()).run();
        await syncArtistRadio(trackId);
      }
      return Response.json({ track });
    }

    if (body.action === "radio_feedback" || body.action === "toggle_keep") {
      const assigned = await assignedPerformance(user.userId, request);
      if (!assigned?.interactive || assigned.trackId !== String(body.trackId)) return fail("Radio Plus listening is required for counted signals.", 403);
    }

    if (body.action === "radio_feedback") {
      const trackId = Number(body.trackId);
      const listenId = body.listenId?.trim() ?? "";
      const signal = body.signal ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !listenId || !["up", "down"].includes(signal)) return fail("A valid track, listen, and triangle signal are required.");
      const listen = await db.prepare(`
        SELECT l.id, t.artist_id FROM listens l
        JOIN tracks t ON t.id = l.track_id
        WHERE l.id = ? AND l.track_id = ? AND l.listener_id = ? AND l.qualified = 1 AND t.status = 'active' AND t.rights_attested = 1 AND t.radio_enabled = 1
      `).bind(listenId, trackId, user.userId).first<{ id: string; artist_id: string }>();
      if (!listen) return fail("Start listening to this track before sending feedback.", 409);
      await db.prepare(`
        INSERT INTO radio_feedback (id, track_id, artist_id, listener_id, listen_id, energy_lane, signal)
        SELECT ?, ?, ?, ?, ?, energy_lane, ? FROM tracks WHERE id = ?
      `).bind(crypto.randomUUID(), trackId, listen.artist_id, user.userId, listenId, signal, trackId).run();
      return Response.json({ recorded: true, signal });
    }

    if (body.action === "toggle_keep") {
      const trackId = Number(body.trackId);
      if (!Number.isInteger(trackId) || trackId < 1 || typeof body.enabled !== "boolean") return fail("A valid track and ON/OFF state are required.");
      const qualified = await db.prepare("SELECT l.id FROM listens l JOIN tracks t ON t.id=l.track_id WHERE l.track_id = ? AND l.listener_id = ? AND l.qualified = 1 AND t.status='active' AND t.radio_enabled=1 LIMIT 1").bind(trackId, user.userId).first();
      if (!qualified) return fail("Listen for at least 12 seconds before keeping a track.", 409);
      if (body.enabled) {
        await db.prepare(`INSERT INTO track_keeps (track_id, listener_id) VALUES (?, ?)
          ON CONFLICT(track_id, listener_id) DO NOTHING`).bind(trackId, user.userId).run();
      } else {
        await db.prepare("DELETE FROM track_keeps WHERE track_id = ? AND listener_id = ?").bind(trackId, user.userId).run();
      }
      return Response.json({ recorded: body.enabled });
    }

    if (body.action === "set_sale_settings") {
      const trackId = Number(body.trackId);
      const enabled = body.saleEnabled === true;
      const price = Number(body.salePriceCents);
      if (!Number.isInteger(trackId) || trackId < 1) return fail("A valid track is required.");
      if (enabled && body.saleRightsAttested !== true) return fail("Confirm that MusicBat may sell and deliver this recording.");
      if (enabled && (!Number.isInteger(price) || price < 50 || price > 100000)) return fail("Set a sale price from $0.50 to $1,000.00.");
      if (enabled && await db.prepare('SELECT 1 FROM artist_rights_holds WHERE track_id=?').bind(trackId).first()) return fail('Rights review is required before enabling sales.',409);
      const track = await db.prepare(`
        UPDATE tracks SET sale_enabled = ?, sale_rights_attested = ?, sale_price_cents = ?, sale_currency = 'usd'
        WHERE id = ? AND (status = 'active' OR ? = 0) AND status != 'deleted' AND (artist_id = ? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))
        RETURNING id, sale_enabled, sale_price_cents, sale_currency
      `).bind(enabled ? 1 : 0, enabled ? 1 : 0, enabled ? price : null, trackId, enabled ? 1 : 0, user.userId, user.userId).first();
      if (!track) return fail("Only the uploading artist can edit this track's sale settings.", 403);
      if (track) {
        await db.prepare('INSERT INTO artist_track_audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),trackId,user.userId,body.action,JSON.stringify(body),Date.now()).run();
        await syncArtistRadio(trackId);
      }
      const checkoutCleanup = !enabled ? await expireWithdrawnCheckouts({ ...env, DB: db }, trackId) : undefined;
      return Response.json({ track, checkoutCleanup });
    }

    if (body.action === "start_listen") {
      const trackId = Number(body.trackId);
      if (!Number.isInteger(trackId) || trackId < 1) return fail("Valid track is required.");
      const track = await db.prepare("SELECT id FROM tracks WHERE id = ? AND status = 'active' AND rights_attested = 1").bind(trackId).first();
      if (!track) return fail("That track is unavailable.", 404);
      const assigned=await assignedPerformance(user.userId,request);
      if (!assigned || assigned.trackId!==String(trackId) || body.performanceKey!==assigned.key) return fail('Listen to the assigned Radio performance before responding.',409);
      // One atomic statement prevents concurrent retries from adding repeat-listen points.
      await db.prepare(`INSERT INTO listens (id, track_id, listener_id, qualified, radio_performance)
        SELECT ?, ?, ?, 0, ? WHERE NOT EXISTS (
          SELECT 1 FROM listens WHERE track_id=? AND listener_id=? AND radio_performance=?
        )`).bind(crypto.randomUUID(),trackId,user.userId,assigned.key,trackId,user.userId,assigned.key).run();
      const listen = await db.prepare("SELECT id FROM listens WHERE track_id=? AND listener_id=? AND radio_performance=? LIMIT 1").bind(trackId,user.userId,assigned.key).first<{id:string}>();
      await beginObservation(db,user.userId,listen!.id,assigned,observationMode(env));
      return Response.json({ listenId:listen!.id, minimumSeconds: 12 });
    }

    if (body.action === "qualify_listen") {
      const trackId = Number(body.trackId);
      const listenId = body.listenId?.trim() ?? "";
      const listen = await db.prepare(`
        SELECT id, radio_performance, (unixepoch('now') - unixepoch(started_at)) AS elapsed
        FROM listens WHERE id = ? AND track_id = ? AND listener_id = ?
      `).bind(listenId, trackId, user.userId).first<{ id: string; elapsed: number; radio_performance:string|null }>();
      if (!listen) return fail("Listening session was not found.", 404);
      const assigned=await assignedPerformance(user.userId,request);
      if (!assigned || assigned.trackId!==String(trackId) || assigned.key!==listen.radio_performance) return fail('This Radio performance has ended or changed.',409);
      if (!assigned.interactive) return fail("Free Radio listens do not create counted signals.",403);
      if (Number(listen.elapsed) < 12) return fail("Keep listening before responding.", 409);
      await db.prepare("UPDATE listens SET qualified = 1, qualified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(listenId).run();
      return Response.json({ qualified: true });
    }

    if (body.action === "complete_listen") {
      const trackId = Number(body.trackId);
      const listenId = body.listenId?.trim() ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !listenId) return fail("A valid track and listen are required.");
      const verified=await db.prepare("SELECT 1 FROM listening_observations WHERE listen_id=? AND listener_id=? AND track_id=? AND mode=? AND state='completed' AND verified_completion_at IS NOT NULL").bind(listenId,user.userId,trackId,observationMode(env)).first();
      if(!verified)return fail('Delivered audio and observed full-recording playback are required for verified completion.',409);
      const completed = await db.prepare(`UPDATE listens SET completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND track_id = ? AND listener_id = ? AND qualified = 1 RETURNING id`).bind(listenId, trackId, user.userId).first();
      if (!completed) return fail("A qualified listen is required to record completion.", 409);
      return Response.json({ completed: true });
    }

    return fail("Unknown MusicBat action.");
  } catch (error) {
    return publicError(error);
  }
}
