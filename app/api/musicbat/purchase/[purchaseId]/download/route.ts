import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";

export async function GET(request: Request) {
  try {
    if (!env.DB || !env.BUCKET) return Response.json({ error: "Downloads are temporarily unavailable." }, { status: 503 });
    const id = new URL(request.url).pathname.split("/").at(-2);
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in to access purchased music." }, { status: 401, headers: { "cache-control": "private, no-store" } });
    const purchase = await env.DB.prepare("SELECT title, artist_name, audio_path, status FROM purchases WHERE id = ? AND buyer_account_id = ?")
      .bind(id, user.userId).first<{ title: string; artist_name: string; audio_path: string; status: string }>();
    if (!purchase) return Response.json({ error: "Purchase not found." }, { status: 404 });
    if (purchase.status !== "paid") return Response.json({ error: "Confirmed payment is required before downloading this purchase." }, { status: 402 });
    const assetId = /^\/api\/musicbat\/audio\/([0-9a-f-]{36}\.(mp3|wav|flac))$/.exec(purchase.audio_path);
    if (!assetId) return Response.json({ error: "The purchased music file is unavailable." }, { status: 404 });
    const object = await env.BUCKET.get(`tracks/${assetId[1]}`);
    if (!object) return Response.json({ error: "The purchased music file is unavailable." }, { status: 404 });
    const filename = `${purchase.artist_name} - ${purchase.title}`.replace(/[\u0000-\u001f\u007f/\\]/g, "").slice(0, 160) + `.${assetId[2]}`;
    const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(object.body, { headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "content-length": String(object.size),
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    console.error("MusicBat purchased download error", error);
    return Response.json({ error: "Your download is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
