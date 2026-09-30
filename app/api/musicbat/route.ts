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
  signal?: "up" | "down";
  enabled?: boolean;
  saleEnabled?: boolean;
  salePriceCents?: number;
  saleRightsAttested?: boolean;
};

// New choices override, never mutate or double-count, the matching legacy choice.
const feedbackCte = `WITH votes AS (
  SELECT track_id, listener_id, signal FROM radio_feedback
  UNION ALL
  SELECT h.track_id, h.listener_id, 'up' FROM hangers h
  WHERE h.kind IN ('standout', 'want_more') AND NOT EXISTS (
    SELECT 1 FROM radio_feedback f WHERE f.track_id = h.track_id AND f.listener_id = h.listener_id)
), keeps AS (
  SELECT track_id, listener_id FROM track_keeps WHERE enabled = 1
  UNION ALL
  SELECT h.track_id, h.listener_id FROM hangers h
  WHERE h.kind = 'keep_in_rotation' AND NOT EXISTS (
    SELECT 1 FROM track_keeps k WHERE k.track_id = h.track_id AND k.listener_id = h.listener_id)
)`;
const rankingSql = `(SELECT COALESCE(SUM(CASE WHEN signal = 'up' THEN 1 ELSE -1 END), 0) FROM votes v WHERE v.track_id = t.id)
  + 2 * (SELECT COUNT(*) FROM keeps k WHERE k.track_id = t.id)`;

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

    if (view === "weight-room") {
      const rows = await db.prepare(`${feedbackCte}
        SELECT t.id AS track_id, t.title, t.artist_name,
          ${rankingSql} AS signal_count,
          (SELECT COUNT(*) FROM (SELECT listener_id FROM votes WHERE track_id = t.id
            UNION SELECT listener_id FROM keeps WHERE track_id = t.id)) AS citizen_count
        FROM tracks t
        WHERE t.status = 'active' AND t.rights_attested = 1
          AND (EXISTS(SELECT 1 FROM votes WHERE track_id = t.id) OR EXISTS(SELECT 1 FROM keeps WHERE track_id = t.id))
        ORDER BY signal_count DESC, citizen_count DESC, t.id ASC LIMIT 25
      `).all();
      return Response.json({ rows: rows.results });
    }

    const viewer = await getChatGPTUser();
    const rows = await db.prepare(`${feedbackCte}
      SELECT t.id, t.title, t.artist_name, t.audio_url, t.created_at, t.keep_in_rotation,
        t.sale_enabled, t.sale_price_cents, t.sale_currency,
        (t.artist_id = ?) AS can_manage,
        EXISTS(SELECT 1 FROM artist_accounts a WHERE a.artist_id = t.artist_id AND a.charges_enabled = 1 AND a.payouts_enabled = 1 AND a.details_submitted = 1) AS seller_ready,
        EXISTS(SELECT 1 FROM listens l WHERE l.track_id = t.id AND l.listener_id = ? AND l.qualified = 1) AS viewer_qualified,
        (SELECT signal FROM votes WHERE track_id = t.id AND listener_id = ?) AS viewer_signal,
        EXISTS(SELECT 1 FROM keeps WHERE track_id = t.id AND listener_id = ?) AS viewer_keep_in_rotation,
        (SELECT COUNT(*) FROM keeps WHERE track_id = t.id) AS keep_count,
        (SELECT COUNT(*) FROM votes WHERE track_id = t.id AND signal = 'up') AS up_count,
        (SELECT COUNT(*) FROM votes WHERE track_id = t.id AND signal = 'down') AS down_count,
        ${rankingSql} AS signal_count
      FROM tracks t
      WHERE t.status = 'active' AND t.rights_attested = 1
      ORDER BY t.created_at DESC, t.id DESC
    `).bind(viewer?.userId ?? "", viewer?.userId ?? "", viewer?.userId ?? "", viewer?.userId ?? "").all();
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
      const file = form.get("audio");
      if (!title || !artistName) return fail("Track title and artist or band name are required.");
      if (title.length > 120 || artistName.length > 80) return fail("Track title or artist name is too long.");
      if (form.get("rightsAttested") !== "true") return fail("Rights attestation is required.");
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
          INSERT INTO tracks (artist_id, artist_name, title, audio_url, rights_attested, sale_enabled, sale_rights_attested, sale_price_cents, sale_currency, status)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'usd', 'active')
          RETURNING id, title, artist_name, audio_url, created_at, sale_enabled, sale_price_cents, sale_currency
        `).bind(user.userId, artistName, title, audioUrl, saleEnabled ? 1 : 0, saleEnabled ? 1 : 0, saleEnabled ? salePriceCents : null).first();
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

    if (body.action === "radio_feedback" || body.action === "toggle_keep" || body.action === "toggle_rotation_hanger") {
      const trackId = Number(body.trackId);
      const voting = body.action === "radio_feedback";
      if (!Number.isInteger(trackId) || trackId < 1) return fail("A valid track is required.");
      if (voting ? !["up", "down"].includes(body.signal ?? "") : typeof body.enabled !== "boolean") {
        return fail("Choose a valid track response.");
      }
      const track = await db.prepare("SELECT id FROM tracks WHERE id = ? AND status = 'active' AND rights_attested = 1").bind(trackId).first();
      if (!track) return fail("That track is unavailable.", 404);
      const qualified = await db.prepare("SELECT id FROM listens WHERE track_id = ? AND listener_id = ? AND qualified = 1 LIMIT 1").bind(trackId, user.userId).first();
      if (!qualified) return fail("Listen for at least 12 seconds before responding.", 409);
      if (voting) {
        await db.prepare(`INSERT INTO radio_feedback (track_id, listener_id, signal) VALUES (?, ?, ?)
          ON CONFLICT(track_id, listener_id) DO UPDATE SET signal = excluded.signal, updated_at = CURRENT_TIMESTAMP
          WHERE radio_feedback.signal != excluded.signal`).bind(trackId, user.userId, body.signal).run();
      } else {
        // Retain an explicit OFF row so legacy keeps do not reappear.
        await db.prepare(`INSERT INTO track_keeps (track_id, listener_id, enabled) VALUES (?, ?, ?)
          ON CONFLICT(track_id, listener_id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
          WHERE track_keeps.enabled != excluded.enabled`).bind(trackId, user.userId, body.enabled ? 1 : 0).run();
      }
      return Response.json(voting ? { recorded: true, signal: body.signal } : { recorded: body.enabled });
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
      if (Number(listen.elapsed) < 12) return fail("Keep listening before placing a Hanger.", 409);
      await db.prepare("UPDATE listens SET qualified = 1, qualified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(listenId).run();
      return Response.json({ qualified: true });
    }

    if (body.action === "hanger") {
      return fail("These legacy controls have been replaced. Refresh to use Like this, Not for me, and Keep in Rotation.", 409);
    }

    return fail("Unknown MusicBat action.");
  } catch (error) {
    return publicError(error);
  }
}
