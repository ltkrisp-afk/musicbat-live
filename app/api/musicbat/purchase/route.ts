import { env } from "cloudflare:workers";
import { buyerIdentity } from "./buyer";

function response(data: unknown, status = 200, cookie?: string | null) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return response({ error: "Open MusicBat to buy this song." }, 403);
    if (!env.DB || !env.BUCKET) return response({ error: "Purchases are temporarily unavailable." }, 503);
    let body: { trackId?: unknown };
    try { body = await request.json(); } catch { return response({ error: "Choose a valid song." }, 400); }
    const trackId = Number(body.trackId);
    if (!Number.isInteger(trackId) || trackId < 1) return response({ error: "Choose a valid song." }, 400);
    const track = await env.DB.prepare("SELECT id, title, artist_name, audio_url FROM tracks WHERE id = ? AND status = 'active' AND rights_attested = 1")
      .bind(trackId).first<{ id: number; title: string; artist_name: string; audio_url: string }>();
    if (!track) return response({ error: "That song is unavailable." }, 404);
    const assetId = /^\/api\/musicbat\/audio\/([0-9a-f-]{36}\.(?:mp3|wav|flac))$/.exec(track.audio_url)?.[1];
    if (!assetId || !(await env.BUCKET.head(`tracks/${assetId}`))) return response({ error: "This song needs its original music file before it can be sold." }, 409);
    const buyer = (await buyerIdentity(request, true))!;
    // Repeated taps reuse the same draft; client-supplied prices or paid flags are ignored.
    let purchase = await env.DB.prepare("SELECT id, title, artist_name FROM purchases WHERE buyer_hash = ? AND track_id = ? AND audio_path = ? AND status = 'awaiting_checkout' AND created_at > datetime('now', '-1 day') ORDER BY created_at DESC LIMIT 1")
      .bind(buyer.hash, trackId, track.audio_url).first<{ id: string; title: string; artist_name: string }>();
    if (!purchase) {
      const id = crypto.randomUUID();
      purchase = await env.DB.prepare("INSERT INTO purchases (id, buyer_hash, track_id, title, artist_name, audio_path) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, title, artist_name")
        .bind(id, buyer.hash, trackId, track.title, track.artist_name, track.audio_url).first();
    }
    if (!purchase) throw new Error("Purchase draft could not be saved");
    // No live checkout exists yet. Connecting an account alone must not charge an unpriced,
    // stream-only recording; the next integration binds sale consent, price and wallet checkout.
    return response({ purchase: { ...purchase, trackId }, status: "awaiting_checkout", checkoutAvailable: false,
      message: `You selected “${purchase.title}”. Checkout is coming soon. You have not been charged.` }, 200, buyer.cookie);
  } catch (error) {
    console.error("MusicBat purchase preparation error", error);
    return response({ error: "Could not prepare this purchase. Try again shortly." }, 503);
  }
}

export async function GET(request: Request) {
  try {
    if (!env.DB) return response({ error: "Purchases are temporarily unavailable." }, 503);
    const buyer = await buyerIdentity(request);
    if (!buyer) return response({ error: "This purchase was not found on this device." }, 404);
    const id = new URL(request.url).searchParams.get("id");
    const purchase = await env.DB.prepare("SELECT id, track_id, title, artist_name, status FROM purchases WHERE id = ? AND buyer_hash = ?")
      .bind(id, buyer.hash).first<{ id: string; status: string }>();
    if (!purchase) return response({ error: "Purchase not found." }, 404);
    return response({ purchase, downloadUrl: purchase.status === "paid" ? `/api/musicbat/purchase/${purchase.id}/download` : null });
  } catch (error) {
    console.error("MusicBat purchase status error", error);
    return response({ error: "Purchase status is temporarily unavailable." }, 503);
  }
}
