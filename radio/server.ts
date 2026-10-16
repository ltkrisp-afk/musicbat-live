import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { RadioRuntime } from './runtime';

export async function readHttpRequest(req: IncomingMessage, origin: string, maxBytes = 16384) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request-too-large');
    chunks.push(Buffer.from(chunk));
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const part of value) headers.append(name, part);
    else if (value !== undefined) headers.set(name, value);
  }
  return new Request(new URL(req.url ?? '/', origin), { method: req.method, headers,
    body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks) });
}
export async function writeHttpResponse(response: Response, out: ServerResponse) {
  out.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) { out.end(); return; }
  const reader = response.body.getReader();
  try {
    while (!out.destroyed) {
      const { done, value } = await reader.read(); if (done) break;
      if (!out.write(value)) await new Promise<void>(resolve => {
        const ready = () => {
          out.off('drain', ready);
          out.off('close', ready);
          resolve();
        };
        out.once('drain', ready);
        out.once('close', ready);
        if (out.destroyed) ready();
      });
    }
  } finally { await reader.cancel(); if (!out.destroyed) out.end(); }
}
/** Private sidecar HTTP entrypoint. Loopback only; bearer authority still mandatory. */
export function createRadioServer(runtime: RadioRuntime) {
  return createServer(async (req, out) => {
    try {
      const request = await readHttpRequest(req, 'http://radio.internal');
      await writeHttpResponse(await runtime.fetch(request), out);
    } catch {
      out.writeHead(503, { 'cache-control': 'no-store' }); out.end('Radio unavailable.');
    }
  });
}
