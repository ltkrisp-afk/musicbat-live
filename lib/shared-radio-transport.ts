import type { ListenerAuthority, SharedRadioEngine } from './shared-radio-engine';

/** Private service handler. Identity, entitlement and territory come from a trusted
 * gateway, never request JSON. Resolver must recheck current source rights/status,
 * audited asset mapping and lawful-copy provenance before returning bytes.
 * This direct-license transport is not a statutory transmitter. */
export function createRadioTransport(engine: SharedRadioEngine, dependencies: {
  authority: (request: Request) => Promise<(ListenerAuthority & { territory: string }) | null>;
  territory: (channelId: string) => string;
  sourceEligible: (trackId: string, listener: ListenerAuthority) => Promise<boolean>;
  media: (trackId: string, request: Request) => Promise<Response>;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'cache-control': 'private, no-store' };
    try {
      const listener = await dependencies.authority(request);
      if (!listener) return Response.json({error:'Sign in to use MusicBat.'},{status:401,headers});
      const url = new URL(request.url);
      if (!['/channel','/channel/audio'].includes(url.pathname)) return new Response(null,{status:404,headers});
      if (url.pathname === '/channel' && url.searchParams.size !== 0)
        return Response.json({error:'Category commands only.'},{status:400,headers});
      if (!['GET','POST','HEAD'].includes(request.method) || (url.pathname.endsWith('/audio') && request.method === 'POST'))
        return new Response(null,{status:405,headers});
      let snapshot;
      if (request.method === 'POST') {
        const body = await request.json();
        if (!body || Array.isArray(body) || Object.keys(body).some(k=>k !== 'category') || !Object.hasOwn(body,'category'))
          return Response.json({error:'Category command required.'},{status:400,headers});
        snapshot = engine.tune(listener,(body as {category: unknown}).category);
      } else snapshot = engine.connect(listener);
      const territory = dependencies.territory(snapshot.channelId);
      if (territory !== 'worldwide' && territory !== listener.territory)
        return Response.json({error:'Channel territory not covered.'},{status:403,headers});
      if (snapshot.simulation) return Response.json({error:'Simulation cannot deliver audio.'},{status:503,headers});
      if (url.pathname.endsWith('/audio')) {
        const p = snapshot.performance;
        // Client may identify only the assigned performance, never select a track.
        if (url.searchParams.size !== 2 || !p || url.searchParams.get('channel') !== snapshot.channelId ||
            url.searchParams.get('sequence') !== p.authorityId) return new Response(null,{status:409,headers});
        if (!await dependencies.sourceEligible(p.trackId,listener)) return new Response(null,{status:403,headers});
        const media = await dependencies.media(p.trackId,request);
        // Recheck after asynchronous storage access. A withdrawal/switch/expiry
        // while fetching cannot deliver the old result.
        const sourceStillEligible = await dependencies.sourceEligible(p.trackId,listener);
        const currentAuthority = await dependencies.authority(request);
        if (!currentAuthority || currentAuthority.id !== listener.id || currentAuthority.territory !== listener.territory) {
          await media.body?.cancel(); return new Response(null,{status:403,headers});
        }
        const latest = engine.reconnect(currentAuthority);
        if (!sourceStillEligible || latest.status !== 'playing' || latest.channelId !== snapshot.channelId ||
            latest.performance?.authorityId !== p.authorityId) {
          await media.body?.cancel(); return new Response(null,{status:409,headers});
        }
        const output = new Headers(media.headers); output.set('cache-control','private, no-store');
        return new Response(request.method === 'HEAD' ? null : media.body,{status:media.status,headers:output});
      }
      const navigation = engine.navigation(listener);
      return Response.json({snapshot,navigation,mediaUrl:snapshot.performance ?
        `/api/musicbat/channel/audio?channel=${encodeURIComponent(snapshot.channelId)}&sequence=${encodeURIComponent(snapshot.performance.authorityId)}` : null},{headers});
    } catch {
      return Response.json({error:'Radio is temporarily unavailable.'},{status:503,headers});
    }
  };
}
