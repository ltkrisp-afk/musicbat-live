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

    const rows = await db.prepare(`
      SELECT t.id, t.title, t.artist_name, t.audio_url, t.created_at,
        COUNT(h.id) AS signal_count
      FROM tracks t
      LEFT JOIN hangers h ON h.track_id = t.id
      WHERE t.status = 'active' AND t.rights_attested = 1
      GROUP BY t.id, t.title, t.artist_name, t.audio_url, t.created_at
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 50
    `).all();
    return Response.json({ tracks: rows.results });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const db = database();
    const body = (await request.json()) as ActionBody;

    if (body.action === "add_track") {
      const title = body.title?.trim() ?? "";
      const artistName = body.artistName?.trim() || user.displayName;
      const audioUrl = body.audioUrl?.trim() ?? "";
      if (!title || !audioUrl) return fail("Track title and direct audio URL are required.");
      if (!body.rightsAttested) return fail("Rights attestation is required.");
      let parsed: URL;
      try { parsed = new URL(audioUrl); } catch { return fail("Enter a valid direct audio URL."); }
      if (!["https:", "http:"].includes(parsed.protocol)) return fail("Audio URL must use HTTP or HTTPS.");

      const result = await db.prepare(`
        INSERT INTO tracks (artist_id, artist_name, title, audio_url, rights_attested, status)
        VALUES (?, ?, ?, ?, 1, 'active')
        RETURNING id, title, artist_name, audio_url, created_at
      `).bind(user.userId, artistName.slice(0, 80), title.slice(0, 120), audioUrl).first();
      return Response.json({ track: result }, { status: 201 });
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
      if (!hangerKinds.has(kind)) return fail("Choose a valid Hanger response.");
      const qualified = await db.prepare(`
        SELECT id FROM listens
        WHERE track_id = ? AND listener_id = ? AND qualified = 1
        ORDER BY qualified_at DESC LIMIT 1
      `).bind(trackId, user.userId).first();
      if (!qualified) return fail("A qualified listen is required before placing a Hanger.", 409);
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
