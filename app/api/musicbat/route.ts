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
};

const hangerKinds = new Set(["keep_in_rotation", "standout", "want_more"]);

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
      const rows = await db.prepare(`
        SELECT t.id AS track_id, t.title, t.artist_name,
          COUNT(h.id) AS signal_count,
          COUNT(DISTINCT h.listener_id) AS citizen_count
        FROM tracks t
        LEFT JOIN hangers h ON h.track_id = t.id
        WHERE t.status = 'active' AND t.rights_attested = 1
        GROUP BY t.id, t.title, t.artist_name
        HAVING COUNT(h.id) > 0
        ORDER BY signal_count DESC, citizen_count DESC, t.id ASC
        LIMIT 25
      `).all();
      return Response.json({ rows: rows.results });
    }

    const user = await getChatGPTUser();
    const rows = await db.prepare(`
      SELECT t.id, t.title, t.artist_name, t.audio_url, t.created_at,
        COUNT(h.id) AS signal_count,
        SUM(CASE WHEN h.kind = 'keep_in_rotation' THEN 1 ELSE 0 END) AS rotation_priority,
        MAX(CASE WHEN h.listener_id = ? THEN h.kind END) AS listener_hanger,
        EXISTS(SELECT 1 FROM listens l WHERE l.track_id = t.id AND l.listener_id = ? AND l.qualified = 1) AS listener_qualified
      FROM tracks t
      LEFT JOIN hangers h ON h.track_id = t.id
      WHERE t.status = 'active' AND t.rights_attested = 1
      GROUP BY t.id, t.title, t.artist_name, t.audio_url, t.created_at
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 50
    `).bind(user?.userId ?? "", user?.userId ?? "").all();
    return Response.json({ tracks: rows.results }, { headers: { "cache-control": "private, no-store", "vary": "Cookie" } });
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
      const file = form.get("audio");
      if (!title || !artistName) return fail("Track title and artist or band name are required.");
      if (title.length > 120 || artistName.length > 80) return fail("Track title or artist name is too long.");
      if (form.get("rightsAttested") !== "true") return fail("Rights attestation is required.");
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
          INSERT INTO tracks (artist_id, artist_name, title, audio_url, rights_attested, status)
          VALUES (?, ?, ?, ?, 1, 'active')
          RETURNING id, title, artist_name, audio_url, created_at
        `).bind(user.userId, artistName, title, audioUrl).first();
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
      const trackId = Number(body.trackId);
      const kind = body.kind ?? "";
      if (!Number.isInteger(trackId) || trackId < 1) return fail("Valid track is required.");
      if (!hangerKinds.has(kind)) return fail("Choose a valid Hanger response.");
      if (body.enabled !== undefined && (kind !== "keep_in_rotation" || typeof body.enabled !== "boolean")) return fail("Choose a valid rotation state.");
      const track = await db.prepare("SELECT id FROM tracks WHERE id = ? AND status = 'active' AND rights_attested = 1").bind(trackId).first();
      if (!track) return fail("That track is unavailable.", 404);
      const qualified = await db.prepare(`
        SELECT id FROM listens
        WHERE track_id = ? AND listener_id = ? AND qualified = 1
        ORDER BY qualified_at DESC LIMIT 1
      `).bind(trackId, user.userId).first();
      if (!qualified) return fail("A qualified listen is required before placing a Hanger.", 409);
      if (kind === "keep_in_rotation" && body.enabled === false) {
        // A listener preference never changes the track's Radio eligibility.
        await db.prepare("DELETE FROM hangers WHERE track_id = ? AND listener_id = ? AND kind = 'keep_in_rotation'").bind(trackId, user.userId).run();
        return Response.json({ recorded: true, kind, enabled: false });
      }
      await db.prepare(`
        INSERT INTO hangers (track_id, listener_id, kind)
        VALUES (?, ?, ?)
        ON CONFLICT(track_id, listener_id)
        DO UPDATE SET kind = excluded.kind, created_at = CURRENT_TIMESTAMP
      `).bind(trackId, user.userId, kind).run();
      return Response.json({ recorded: true, kind });
    }

    return fail("Unknown MusicBat action.");
  } catch (error) {
    return publicError(error);
  }
}
