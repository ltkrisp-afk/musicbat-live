import { env } from "cloudflare:workers";

async function serve(request: Request, headOnly = false) {
  try {
    if (!env.BUCKET || !env.DB) return Response.json({ error: "Audio is temporarily unavailable." }, { status: 503 });
    const pathname = new URL(request.url).pathname;
    const assetId = pathname.split("/").pop() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|flac)$/.test(assetId)) return new Response(null, { status: 404 });
    const track = await env.DB.prepare("SELECT id FROM tracks WHERE audio_url = ? AND status = 'active' AND rights_attested = 1").bind(`/api/musicbat/audio/${assetId}`).first();
    if (!track) return new Response(null, { status: 404 });
    const key = `tracks/${assetId}`;
    const metadata = await env.BUCKET.head(key);
    if (!metadata) return new Response(null, { status: 404 });
    const headers = new Headers({
      "content-type": metadata.httpMetadata?.contentType ?? "audio/mpeg",
      "content-length": String(metadata.size),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
      "etag": metadata.httpEtag,
    });
    // HEAD describes the whole object. Single byte ranges let mobile players seek.
    if (headOnly) return new Response(null, { headers });
    let range: { offset: number; length: number } | undefined;
    const requested = request.headers.get("range");
    const ifRange = request.headers.get("if-range");
    if (requested && (!ifRange || ifRange === metadata.httpEtag)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(requested);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${metadata.size}` } });
      const start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= metadata.size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${metadata.size}` } });
      range = { offset: start, length: end - start + 1 };
      headers.set("content-length", String(range.length));
      headers.set("content-range", `bytes ${start}-${end}/${metadata.size}`);
    }
    const object = await env.BUCKET.get(key, range ? { range } : undefined);
    if (!object) return new Response(null, { status: 404 });
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    console.error("MusicBat audio error", error);
    return Response.json({ error: "Audio is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}

export async function GET(request: Request) { return serve(request); }
export async function HEAD(request: Request) { return serve(request, true); }
