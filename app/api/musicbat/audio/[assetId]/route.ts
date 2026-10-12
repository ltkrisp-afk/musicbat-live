/** Legacy track-addressable radio delivery is closed. Upload asset identifiers
 * remain stable in storage/catalog and paid purchase snapshots are untouched.
 * Listener playback must use the assigned /channel/audio performance. */
function closed() {
  return Response.json({ error: 'Use Bat Radio to listen to the current channel.' }, {
    status: 410, headers: { 'cache-control': 'private, no-store' },
  });
}
export async function GET() { return closed(); }
export async function HEAD() { return new Response(null, { status: 410, headers: { 'cache-control': 'private, no-store' } }); }
