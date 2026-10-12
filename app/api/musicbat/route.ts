import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

type ActionBody = {
  action?: string;
  title?: string;
  artistName?: string;
  audioUrl?: string;
  rightsAttested?: boolean;
  trackId?: number;
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
  if (message === "SIGN_IN_REQUIRED") return fail("Sign in to use MusicBat.", 401);
  if (message.includes("no such table")) return fail("MusicBat is finishing its first setup. Try again shortly.", 503);
  console.error("MusicBat API error", error);
  return fail("MusicBat could not complete that action.", 500);
}

/** Consent is committed first. A failed sidecar sync never undoes withdrawal;
 * the channel gateway independently checks this catalog on every delivery. */
async function syncArtistRadio(id: number) {
  const row=await database().prepare('SELECT status,radio_enabled,primary_genre,subgenre,style FROM tracks WHERE id=?').bind(id).first<{status:string;radio_enabled:number;primary_genre:string;subgenre:string|null;style:string|null}>();
  if (!row) return false;
  const body=JSON.stringify({trackId:String(id),reference:'authenticated-artist-catalog',
    action:row.status==='active' && row.radio_enabled===1?'classify':'withdraw',
    category:{genre:row.primary_genre,...(row.subgenre?{subgenre:row.subgenre}:{}),...(row.style?{style:row.style}:{})}});
  try {
    if (env.RADIO_SERVICE) return (await env.RADIO_SERVICE.fetch(new Request('https://radio.internal/catalog/control',{method:'POST',headers:{'authorization':'Bearer '+(env.RADIO_RUNTIME_TOKEN ?? '')},body}))).ok;
    if (!env.RADIO_RUNTIME_ORIGIN || !env.RADIO_RUNTIME_TOKEN) return false;
    const url=new URL(env.RADIO_RUNTIME_ORIGIN);
    if (url.protocol!=='https:' || url.pathname!=='/' || url.username || url.password || url.search || url.hash) return false;
    return (await fetch(new URL('/catalog/control',url),{method:'POST',headers:{'authorization':'Bearer '+env.RADIO_RUNTIME_TOKEN},body,redirect:'error',signal:AbortSignal.timeout(2000)})).ok;
  } catch { return false; }
}

async function assignedPerformance(userId: string, request: Request) {
  const headers=new Headers({'x-musicbat-listener':userId,'x-musicbat-territory':(request as Request & {cf?:{country?:string}}).cf?.country ?? 'unknown','authorization':'Bearer '+(env.RADIO_RUNTIME_TOKEN ?? '')});
  try {
    let response;
    if (env.RADIO_SERVICE) response=await env.RADIO_SERVICE.fetch(new Request('https://radio.internal/channel',{headers}));
    else if (env.RADIO_RUNTIME_ORIGIN && env.RADIO_RUNTIME_TOKEN) {
      const url=new URL(env.RADIO_RUNTIME_ORIGIN);
      if (url.protocol!=='https:' || url.pathname!=='/' || url.username || url.password || url.search || url.hash) return null;
      response=await fetch(new URL('/channel',url),{headers,redirect:'error',signal:AbortSignal.timeout(2000)});
    }
    if (!response?.ok) return null;
    const data=await response.json() as {snapshot:{simulation:boolean;status:string;channelId:string;performance:{trackId:string;authorityId:string}|null}};
    return data.snapshot.status==='playing' && !data.snapshot.simulation && data.snapshot.performance ? {trackId:data.snapshot.performance.trackId,key:data.snapshot.channelId+':'+data.snapshot.performance.authorityId} : null;
  } catch {return null;}
}

async function registeredRadioTrack(id: number, category: {genre:string;subgenre?:string;style?:string}) {
  const headers={'authorization':'Bearer '+(env.RADIO_RUNTIME_TOKEN ?? '')};
  try {
    let response;
    const path='/catalog/status?trackId='+id;
    if (env.RADIO_SERVICE) response=await env.RADIO_SERVICE.fetch(new Request('https://radio.internal'+path,{headers}));
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

    if (view === "rotunda") {
      const user = await requireUser();
      const rows = await db.prepare(`SELECT t.*, 1 AS can_manage,
        CASE WHEN t.status != 'active' OR t.radio_enabled = 0 THEN 'withdrawn'
          WHEN EXISTS(SELECT 1 FROM playback_permissions p WHERE p.track_id=t.id AND p.artist_authorized=1 AND p.recording_basis='direct' AND p.withdrawn_at IS NULL AND p.free_allowed=1 AND p.starts_at<=unixepoch('now')*1000 AND p.reviewed_at<=unixepoch('now')*1000 AND length(trim(p.recording_evidence))>0 AND length(trim(p.composition_evidence))>0 AND length(trim(p.reviewed_by))>0 AND p.expires_at > ?)
          THEN 'rights reviewed; runtime registration required' ELSE 'awaiting rights review' END AS radio_status
        FROM tracks t WHERE t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)
        ORDER BY t.created_at DESC, t.id DESC`).bind(Date.now(), user.userId, user.userId).all();
      const profile = await db.prepare('SELECT artist_name FROM artist_profiles WHERE account_id=?').bind(user.userId).first();
      await Promise.all(rows.results.map(async row => {
        if (row.radio_status==='rights reviewed; runtime registration required' && await registeredRadioTrack(Number(row.id),{genre:String(row.primary_genre),...(row.subgenre?{subgenre:String(row.subgenre)}:{}),...(row.style?{style:String(row.style)}:{})})) row.radio_status='registered in Radio pool';
      }));
      return Response.json({tracks:rows.results, profile, accountId:user.userId}, {headers:{'cache-control':'private, no-store'}});
    }

    if (view === "shock-room") {
      const rows = await db.prepare(`
        SELECT t.id AS track_id, t.title, t.artist_name, t.primary_genre, t.energy_lane,
          ${shockStatsSql}, ${shockScoreSql} AS shock_score,
          ROW_NUMBER() OVER (PARTITION BY t.primary_genre, t.energy_lane ORDER BY ${shockScoreSql} DESC, t.title COLLATE NOCASE, t.id) AS position
        FROM tracks t
        WHERE t.status = 'active' AND t.rights_attested = 1
        ORDER BY t.primary_genre, t.energy_lane, position, t.id
      `).all();
      return Response.json({ rows: rows.results });
    }

    const viewer = await getChatGPTUser();
    const rows = await db.prepare(`
      SELECT t.id, t.artist_id, t.title, t.artist_name, t.audio_url, t.created_at, t.keep_in_rotation, t.energy_lane,
        t.primary_genre, t.subgenre, t.style, t.radio_enabled, t.status, t.mood_tags,
        t.sale_enabled, t.sale_price_cents, t.sale_currency,
        EXISTS(SELECT 1 FROM playback_permissions p WHERE p.track_id=t.id AND p.recording_basis='direct' AND p.artist_authorized=1 AND p.free_allowed=1 AND p.withdrawn_at IS NULL AND p.starts_at<=unixepoch('now')*1000 AND p.expires_at>unixepoch('now')*1000 AND length(trim(p.recording_evidence))>0 AND length(trim(p.composition_evidence))>0 AND length(trim(p.reviewed_by))>0) AS radio_rights_reviewed,
        (t.artist_id = ?) AS can_manage,
        EXISTS(SELECT 1 FROM artist_accounts a WHERE a.artist_id = t.artist_id AND a.charges_enabled = 1 AND a.payouts_enabled = 1 AND a.details_submitted = 1) AS seller_ready,
        EXISTS(SELECT 1 FROM listens l WHERE l.track_id = t.id AND l.listener_id = ? AND l.qualified = 1) AS viewer_qualified,
        EXISTS(SELECT 1 FROM track_keeps k WHERE k.track_id = t.id AND k.listener_id = ?) AS viewer_keep_in_rotation,
        ${shockStatsSql}, ${shockScoreSql} AS shock_score,
        ROW_NUMBER() OVER (PARTITION BY t.primary_genre, t.energy_lane ORDER BY ${shockScoreSql} DESC, t.title COLLATE NOCASE, t.id) AS position
      FROM tracks t
      WHERE t.status = 'active' AND t.rights_attested = 1
      ORDER BY t.created_at DESC, t.id DESC
    `).bind(viewer?.userId ?? "", viewer?.userId ?? "", viewer?.userId ?? "").all();
    return Response.json({ tracks: rows.results.map((track) => ({ ...track, rotation_eligible: track.radio_enabled === 1 && track.radio_rights_reviewed === 1 })) }, { headers: { "cache-control": "private, no-store", "vary": "Cookie" } });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
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
        const result=await db.batch([
          db.prepare(`INSERT INTO tracks (artist_id,artist_name,title,audio_url,rights_attested,energy_lane,primary_genre,subgenre,mood_tags,sale_enabled,sale_rights_attested,sale_price_cents,sale_currency,status,style)
            VALUES (?,?,?,?,1,?,?,?,?,?,?,?,'usd','active',?) RETURNING *`)
            .bind(user.userId,artistName,title,audioUrl,energyLane,primaryGenre,subgenre,JSON.stringify(moodTags),saleEnabled?1:0,saleEnabled?1:0,saleEnabled?salePriceCents:null,style||null),
          db.prepare('INSERT INTO artist_profiles VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET artist_name=excluded.artist_name,updated_at=excluded.updated_at').bind(user.userId,artistName,now,now),
          db.prepare('INSERT INTO artist_track_audit SELECT ?,id,?,?,?,? FROM tracks WHERE audio_url=? AND artist_id=?').bind(crypto.randomUUID(),user.userId,'upload',JSON.stringify({artistName,primaryGenre,subgenre,style,rightsAttested:true,saleEnabled}),now,audioUrl,user.userId),
        ]);
        track=result[0].results[0];
        if (!track) throw new Error('Track registration failed');
      } catch (error) {
        await env.BUCKET.delete(key);
        throw error;
      }
      return Response.json({ track }, { status: 201 });
    }
    const body = (await request.json()) as ActionBody;
    if (!body || Array.isArray(body) || typeof body !== "object") return fail("A valid action is required.");
    for (const key of ["title","artistName","primaryGenre","subgenre","style","energyLane","representativeId"] as const) if (body[key] !== undefined && typeof body[key] !== "string") return fail("Metadata fields must be text.");

    if (body.action === 'set_artist_identity') {
      const name=body.artistName?.trim();
      if (!name || name.length>80) return fail('Choose an artist or band name, up to 80 characters.');
      await db.prepare('INSERT INTO artist_profiles VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET artist_name=excluded.artist_name,updated_at=excluded.updated_at').bind(user.userId,name,Date.now(),Date.now()).run();
      return Response.json({saved:true});
    }
    if (['edit_metadata','set_radio','withdraw_track','delete_track','grant_representative','revoke_representative'].includes(body.action ?? '')) {
      const id = Number(body.trackId);
      if (!Number.isSafeInteger(id) || id < 1) return fail('A valid track is required.');
      const track = await db.prepare(`SELECT t.* FROM tracks t WHERE t.id=? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))`).bind(id,user.userId,user.userId).first<{id:number;artist_id:string;status:string}>();
      if (!track) return fail('Only an authorized artist or representative can manage this track.',403);
      const now = Date.now();
      const statements = [];
      if (body.action === 'grant_representative' || body.action === 'revoke_representative') {
        if (track.artist_id !== user.userId) return fail('Only the owner may appoint representatives.',403);
        if (!body.representativeId?.trim() || body.representativeId.length > 200) return fail('A verified representative account ID is required.');
        const account = await db.prepare('SELECT account_id FROM artist_profiles WHERE account_id=?').bind(body.representativeId).first();
        if (!account) return fail('The representative must first sign in and create an artist identity.');
        statements.push(body.action === 'grant_representative'
          ? db.prepare('INSERT INTO track_authority VALUES (?,?,?,?,NULL) ON CONFLICT(track_id,account_id) DO UPDATE SET granted_by=excluded.granted_by,granted_at=excluded.granted_at,revoked_at=NULL').bind(id,body.representativeId,user.userId,now)
          : db.prepare('UPDATE track_authority SET revoked_at=? WHERE track_id=? AND account_id=?').bind(now,id,body.representativeId));
      } else {
        if (track.status === 'deleted') return fail('Deleted tracks cannot be changed.',409);
        if (body.action === 'edit_metadata') {
          const title=body.title?.trim() ?? '', genre=body.primaryGenre ?? '', sub=body.subgenre?.trim() ?? '', style=body.style?.trim() ?? '';
          if (!title || title.length>120 || !primaryGenres.has(genre) || sub.length>80 || style.length>80 || (style && !sub) || !energyLanes.has(body.energyLane ?? '')) return fail('Choose a valid title, Genre → Subgenre → Style and energy lane.');
          statements.push(db.prepare('UPDATE tracks SET title=?,primary_genre=?,subgenre=?,style=?,energy_lane=? WHERE id=? AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(title,genre,sub||null,style||null,body.energyLane,id,user.userId,user.userId));
        } else if (body.action === 'set_radio') {
          if (typeof body.enabled !== 'boolean') return fail('Choose radio participation on or off.');
          statements.push(db.prepare("UPDATE tracks SET radio_enabled=?,status='active' WHERE id=? AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))").bind(body.enabled?1:0,id,user.userId,user.userId));
          // Returning to Radio is a new request; withdrawn grants are never silently restored.
          if (!body.enabled) statements.push(db.prepare('UPDATE playback_permissions SET withdrawn_at=? WHERE track_id=? AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=playback_permissions.track_id AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)))').bind(now,id,user.userId,user.userId));
        } else {
          statements.push(db.prepare('UPDATE tracks SET status=?,radio_enabled=0,sale_enabled=0,sale_rights_attested=0 WHERE id=? AND (artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=tracks.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(body.action==='delete_track'?'deleted':'withdrawn',id,user.userId,user.userId));
          statements.push(db.prepare('UPDATE playback_permissions SET withdrawn_at=? WHERE track_id=? AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=playback_permissions.track_id AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL)))').bind(now,id,user.userId,user.userId));
        }
      }
      statements.push(db.prepare('INSERT INTO artist_track_audit SELECT ?,id,?,?,?,? FROM tracks t WHERE t.id=? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(crypto.randomUUID(),user.userId,body.action,JSON.stringify(body),now,id,user.userId,user.userId));
      const results=await db.batch(statements);
      if (results[0].meta.changes===0) return fail('Track authority changed. Refresh your catalog.',403);
      const radioSynchronized = await syncArtistRadio(id);
      return Response.json({saved:true,recordsPreserved:true,radioSynchronized});
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

    if (body.action === "radio_feedback") {
      const trackId = Number(body.trackId);
      const listenId = body.listenId?.trim() ?? "";
      const signal = body.signal ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !listenId || !["up", "down"].includes(signal)) return fail("A valid track, listen, and triangle signal are required.");
      const listen = await db.prepare(`
        SELECT l.id, t.artist_id FROM listens l
        JOIN tracks t ON t.id = l.track_id
        WHERE l.id = ? AND l.track_id = ? AND l.listener_id = ? AND l.qualified = 1 AND t.status = 'active' AND t.rights_attested = 1
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
      const qualified = await db.prepare("SELECT id FROM listens WHERE track_id = ? AND listener_id = ? AND qualified = 1 LIMIT 1").bind(trackId, user.userId).first();
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
      return Response.json({ track });
    }

    if (body.action === "start_listen") {
      const trackId = Number(body.trackId);
      if (!Number.isInteger(trackId) || trackId < 1) return fail("Valid track is required.");
      const track = await db.prepare("SELECT id FROM tracks WHERE id = ? AND status = 'active' AND rights_attested = 1").bind(trackId).first();
      if (!track) return fail("That track is unavailable.", 404);
      const assigned=await assignedPerformance(user.userId,request);
      if (!assigned || assigned.trackId!==String(trackId) || body.performanceKey!==assigned.key) return fail('Listen to the assigned Radio performance before responding.',409);
      const listenId = crypto.randomUUID();
      await db.prepare("INSERT INTO listens (id, track_id, listener_id, qualified, radio_performance) VALUES (?, ?, ?, 0, ?)").bind(listenId, trackId, user.userId,assigned.key).run();
      return Response.json({ listenId, minimumSeconds: 12 });
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
      if (Number(listen.elapsed) < 12) return fail("Keep listening before responding.", 409);
      await db.prepare("UPDATE listens SET qualified = 1, qualified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(listenId).run();
      return Response.json({ qualified: true });
    }

    if (body.action === "complete_listen") {
      const trackId = Number(body.trackId);
      const listenId = body.listenId?.trim() ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !listenId) return fail("A valid track and listen are required.");
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
