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
  kind?: string;
  enabled?: boolean;
  saleEnabled?: boolean;
  salePriceCents?: number;
  saleRightsAttested?: boolean;
  energyLane?: string;
  signal?: string;
  primaryGenre?: string;
  subgenre?: string;
  moodTags?: string[];
};

const energyLanes = new Set(["soft", "medium", "hard", "turbo"]);
const primaryGenres = new Set(["Alternative", "Blues", "Classical", "Country", "Electronic", "Experimental", "Folk", "Hip-Hop", "Jazz", "Metal", "Other", "Punk", "Pop", "Rock"]);

const shockScoreSql = `
  (COALESCE((SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'up'), 0)
   - COALESCE((SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'down'), 0)
   + 2 * COALESCE((SELECT COUNT(*) FROM track_keeps k WHERE k.track_id = t.id), 0)
   + COALESCE((SELECT COUNT(*) FROM listens l WHERE l.track_id = t.id AND l.completed_at IS NOT NULL), 0)
   + 2 * MAX(0, (SELECT COUNT(*) FROM listens l WHERE l.track_id = t.id AND l.qualified = 1)
                 - (SELECT COUNT(DISTINCT listener_id) FROM listens l WHERE l.track_id = t.id AND l.qualified = 1))
   + 3 * COALESCE((SELECT COUNT(*) FROM purchases p WHERE p.track_id = t.id AND p.status = 'paid'), 0))`;

const shockStatsSql = `
  (SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'up') AS up_count,
  (SELECT COUNT(DISTINCT listener_id) FROM radio_feedback f WHERE f.track_id = t.id AND f.signal = 'down') AS down_count,
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

export async function GET(request: Request) {
  try {
    const db = database();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "tracks";

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
        t.primary_genre, t.subgenre, t.mood_tags,
        t.sale_enabled, t.sale_price_cents, t.sale_currency,
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
    return Response.json({ tracks: rows.results.map((track) => ({ ...track, rotation_eligible: true })) }, { headers: { "cache-control": "private, no-store", "vary": "Cookie" } });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
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
        track = await db.prepare(`
          INSERT INTO tracks (artist_id, artist_name, title, audio_url, rights_attested, energy_lane, primary_genre, subgenre, mood_tags, sale_enabled, sale_rights_attested, sale_price_cents, sale_currency, status)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'usd', 'active')
          RETURNING id, title, artist_name, audio_url, created_at, energy_lane, primary_genre, subgenre, mood_tags, sale_enabled, sale_price_cents, sale_currency
        `).bind(user.userId, artistName, title, audioUrl, energyLane, primaryGenre, subgenre, JSON.stringify(moodTags), saleEnabled ? 1 : 0, saleEnabled ? 1 : 0, saleEnabled ? salePriceCents : null).first();
        if (!track) throw new Error("Track registration failed");
      } catch (error) {
        await env.BUCKET.delete(key);
        throw error;
      }
      return Response.json({ track }, { status: 201 });
    }
    const body = (await request.json()) as ActionBody;

    if (body.action === "add_track") {
      return fail("Upload your music file with its track title and artist or band name.");
    }

    if (body.action === "set_rotation_priority") {
      const trackId = Number(body.trackId);
      if (!Number.isInteger(trackId) || trackId < 1 || typeof body.enabled !== "boolean") return fail("A valid track and ON/OFF state are required.");
      // Eligibility is controlled by status/rights, never by this priority flag.
      const track = await db.prepare(`
        UPDATE tracks SET keep_in_rotation = ?
        WHERE id = ? AND artist_id = ?
        RETURNING id, keep_in_rotation, status, rights_attested
      `).bind(body.enabled ? 1 : 0, trackId, user.userId).first();
      if (!track) return fail("Only the uploading artist can edit this track's priority.", 403);
      return Response.json({ track });
    }

    if (body.action === "set_energy_lane") {
      const trackId = Number(body.trackId);
      const energyLane = body.energyLane ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !energyLanes.has(energyLane)) return fail("Choose a valid track and Radio energy lane.");
      const track = await db.prepare(`
        UPDATE tracks SET energy_lane = ? WHERE id = ? AND artist_id = ?
        RETURNING id, energy_lane
      `).bind(energyLane, trackId, user.userId).first();
      if (!track) return fail("Only the uploading artist can assign this track's energy lane.", 403);
      return Response.json({ track });
    }

    if (body.action === "set_primary_genre") {
      const trackId = Number(body.trackId);
      const primaryGenre = body.primaryGenre ?? "";
      if (!Number.isInteger(trackId) || trackId < 1 || !primaryGenres.has(primaryGenre)) return fail("Choose a valid track and primary genre.");
      const track = await db.prepare(`UPDATE tracks SET primary_genre = ? WHERE id = ? AND artist_id = ?
        RETURNING id, primary_genre`).bind(primaryGenre, trackId, user.userId).first();
      if (!track) return fail("Only the uploading artist can change this track's genre.", 403);
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
        WHERE id = ? AND artist_id = ?
        RETURNING id, sale_enabled, sale_price_cents, sale_currency
      `).bind(enabled ? 1 : 0, enabled ? 1 : 0, enabled ? price : null, trackId, user.userId).first();
      if (!track) return fail("Only the uploading artist can edit this track's sale settings.", 403);
      return Response.json({ track });
    }

    if (body.action === "start_listen") {
      const trackId = Number(body.trackId);
      if (!Number.isInteger(trackId) || trackId < 1) return fail("Valid track is required.");
      const track = await db.prepare("SELECT id FROM tracks WHERE id = ? AND status = 'active' AND rights_attested = 1").bind(trackId).first();
      if (!track) return fail("That track is unavailable.", 404);
      const listenId = crypto.randomUUID();
      await db.prepare("INSERT INTO listens (id, track_id, listener_id, qualified) VALUES (?, ?, ?, 0)").bind(listenId, trackId, user.userId).run();
      return Response.json({ listenId, minimumSeconds: 12 });
    }

    if (body.action === "qualify_listen") {
      const trackId = Number(body.trackId);
      const listenId = body.listenId?.trim() ?? "";
      const listen = await db.prepare(`
        SELECT id, (unixepoch('now') - unixepoch(started_at)) AS elapsed
        FROM listens WHERE id = ? AND track_id = ? AND listener_id = ?
      `).bind(listenId, trackId, user.userId).first<{ id: string; elapsed: number }>();
      if (!listen) return fail("Listening session was not found.", 404);
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
