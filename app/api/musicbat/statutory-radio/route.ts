/** Separate statutory delivery boundary. No media, asset requests, seeking or activation. */
function disabled() {
  return Response.json({error: 'Statutory playback is disabled pending independent legal and technical verification.'},
    {status: 503, headers: {'cache-control': 'no-store'}});
}
export async function GET() { return disabled(); }
export async function HEAD() { return disabled(); }
export async function POST() { return disabled(); }
