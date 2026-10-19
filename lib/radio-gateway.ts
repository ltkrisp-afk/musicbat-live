import { recordRadioFailure } from './radio-failure';
/** A private service binding is the only channel transport. Never fall back to
 * legacy asset delivery or browser scheduling when the service is missing. */
export async function forwardRadio(request: Request, service: Pick<Fetcher, 'fetch'> | undefined, userId: string | null) {
  if (!userId) return Response.json({error:'Sign in to use MusicBat.'},{status:401});
  if (!service) return Response.json({error:'Shared Radio is temporarily unavailable.'},{status:503});
  if (request.method === 'POST' && request.headers.get('origin') !== new URL(request.url).origin)
    return new Response(null,{status:403});
  const url = new URL(request.url);
  url.hostname = 'radio.internal'; url.protocol = 'https:'; url.port = '';
  url.pathname = url.pathname.endsWith('/audio') ? '/channel/audio' : '/channel';
  const headers = new Headers();
  headers.set('x-musicbat-listener',userId);
  headers.set('x-musicbat-territory',(request as Request & {cf?:{country?:string}}).cf?.country ?? 'unknown');
  for (const name of ['range','if-range','content-type']) {
    const value=request.headers.get(name); if(value) headers.set(name,value);
  }
  try {
    const response = await service.fetch(new Request(url,{method:request.method,headers,
      body:request.method === 'POST' ? await request.text() : undefined}));
    const output = new Headers(response.headers); output.set('cache-control','private, no-store');
    return new Response(response.body,{status:response.status,headers:output});
  } catch (error) { recordRadioFailure('gateway.service-fetch',error);return Response.json({error:'Shared Radio is temporarily unavailable.'},{status:503}); }
}
