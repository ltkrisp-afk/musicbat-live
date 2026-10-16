/**
 * Cloudflare D1/R2 radio source adapter.
 * No Node runtime, filesystem, local SQLite, or Render dependency.
 * This module is intentionally not wired to the existing synchronous radio engine:
 * that engine requires an atomic asynchronous D1 state-machine migration first.
 */
export type RadioSourceRow = {
  track_id: number;
  audio_url: string;
  status: string;
  radio_enabled: number;
  recording_basis: string | null;
  recording_evidence: string | null;
  composition_evidence: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  artist_authorized: number | null;
  free_allowed: number | null;
  plus_allowed: number | null;
  starts_at: number | null;
  expires_at: number | null;
  withdrawn_at: number | null;
  territory: string | null;
};

export async function currentRadioSource(db: D1Database, trackId: number): Promise<RadioSourceRow | null> {
  if (!Number.isSafeInteger(trackId) || trackId < 1) return null;
  return db.prepare(`SELECT t.id AS track_id, t.audio_url, t.status, t.radio_enabled,
    p.recording_basis, p.recording_evidence, p.composition_evidence,
    p.reviewed_by, p.reviewed_at, p.artist_authorized, p.free_allowed,
    p.plus_allowed, p.starts_at, p.expires_at, p.withdrawn_at, p.territory
    FROM tracks t LEFT JOIN playback_permissions p ON p.track_id=t.id
    WHERE t.id=?`).bind(trackId).first<RadioSourceRow>();
}

/** Only opaque private object keys, never external URLs or filesystem paths. */
export function privateObjectKey(value: string): string | null {
  if (!value || value.length > 512 || value.startsWith('/') || value.includes('\\') ||
      value.includes('..') || /[?#\x00-\x1f]/.test(value) ||
      /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return null;
  return value;
}

/**
 * Fetch bytes only after the caller has validated a currently assigned radio
 * performance and the current permission snapshot. The caller MUST recheck
 * those authorities after this asynchronous R2 read, before returning bytes.
 * R2 never grants rights on its own.
 */
export async function readPrivateRadioObject(
  bucket: R2Bucket, key: string, request: Request,
): Promise<Response> {
  const safe = privateObjectKey(key);
  if (!safe) return new Response(null, { status: 403 });
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405 });
  let object: R2ObjectBody | null;
  try { object = await bucket.get(safe, { range: request.headers }); }
  catch { return new Response(null, { status: 416, headers: { 'content-range': 'bytes */*', 'cache-control': 'no-store' } }); }
  if (!object) return new Response(null, { status: 404 });
  const size = object.size;
  const range = object.range;
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    etag: object.httpEtag,
  });
  let status = 200;
  if (range && 'offset' in range) {
    const start = range.offset;
    const end = start + range.length - 1;
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
    headers.set('content-length', String(range.length));
    status = 206;
  } else {
    headers.set('content-length', String(size));
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
}
