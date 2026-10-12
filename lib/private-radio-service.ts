/** Explicit private runtime configuration only. A missing configuration never
 * enables local selection or legacy media. Keep the token in server secrets. */
export function privateRadioService(origin: string | undefined, token: string | undefined, allowLoopback = false): Pick<Fetcher, 'fetch'> | undefined {
  if (!origin || !token || token.length < 32) return undefined;
  const base = new URL(origin);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
      (base.protocol !== 'https:' && !(allowLoopback && base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname))))
    throw new Error('invalid-private-radio-origin');
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      const path = new URL(request.url);
      if (!['/channel','/channel/audio'].includes(path.pathname)) return new Response(null, { status: 404 });
      const url = new URL(path.pathname + path.search, base);
      const headers = new Headers(request.headers); headers.set('authorization', 'Bearer ' + token);
      return fetch(new Request(url, { method:request.method,headers,
        body:request.method === 'POST' ? await request.text() : undefined,
        redirect:'error',signal:AbortSignal.timeout(2000) }));
    },
  };
}
