import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the real handlers with platform boundaries replaced by test doubles.
async function loadRoute(path, state) {
  globalThis.musicbatTestState = state;
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.musicbatTestState.env;')
    .replace('import { getChatGPTUser } from "../../chatgpt-auth";', 'const getChatGPTUser = async () => globalThis.musicbatTestState.user;');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText + '\n//' + Math.random()).toString('base64')}`);
}
function fixture() {
  const objects = new Map();
  const tracks = [];
  const state = { user: { userId: 'artist-1', displayName: 'Account name' }, failInsert: false, env: {
    DB: { prepare(sql) { return { bind(...values) { return { async first() {
      if (sql.includes('INSERT INTO tracks')) {
        if (state.failInsert) throw new Error('simulated catalog failure');
        const track = { id: tracks.length + 1, artist_name: values[1], title: values[2], audio_url: values[3] };
        tracks.push(track); return track;
      }
      return tracks.find(track => track.audio_url === values[0]) ?? null;
    } }; } }; } },
    BUCKET: {
      async put(key, stream, options) { const bytes = new Uint8Array(await new Response(stream).arrayBuffer()); objects.set(key, { bytes, ...options }); },
      async delete(key) { objects.delete(key); },
      async head(key) { const object = objects.get(key); return object ? { size: object.bytes.length, httpMetadata: object.httpMetadata, httpEtag: '"test-etag"' } : null; },
      async get(key, options) { const object = objects.get(key); if (!object) return null; const range = options?.range; return { body: range ? object.bytes.slice(range.offset, range.offset + range.length) : object.bytes }; },
    },
  } };
  return { state, objects, tracks };
}
const wav = new Uint8Array(44 + 8000 * 2);
const view = new DataView(wav.buffer);
wav.set(new TextEncoder().encode('RIFF'), 0); view.setUint32(4, wav.length - 8, true);
wav.set(new TextEncoder().encode('WAVEfmt '), 8); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); wav.set(new TextEncoder().encode('data'), 36); view.setUint32(40, wav.length - 44, true);
function upload(overrides = {}) {
  const form = new FormData();
  form.set('title', overrides.title ?? 'Test song');
  form.set('artistName', overrides.artistName ?? 'Test band');
  form.set('rightsAttested', overrides.rightsAttested ?? 'true');
  form.set('audio', new File([overrides.bytes ?? wav], overrides.filename ?? 'track.wav', { type: 'audio/wav' }));
  return new Request('https://musicbat.audio/api/musicbat', { method: 'POST', body: form });
}

test('uploaded bytes play intact and support mobile seeking, suffix ranges, and HEAD', async () => {
  const { state, objects } = fixture();
  const api = await loadRoute('../app/api/musicbat/route.ts', state);
  const audio = await loadRoute('../app/api/musicbat/audio/[assetId]/route.ts', state);
  const response = await api.POST(upload());
  assert.equal(response.status, 201);
  const { track } = await response.json();
  assert.equal(track.artist_name, 'Test band');
  assert.equal(track.title, 'Test song');
  assert.match(track.audio_url, /^\/api\/musicbat\/audio\/[0-9a-f-]+\.wav$/);
  assert.equal(objects.size, 1);
  const url = 'https://musicbat.audio' + track.audio_url;
  const full = await audio.GET(new Request(url));
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), wav);
  const partial = await audio.GET(new Request(url, { headers: { range: 'bytes=8-11' } }));
  assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-range'), `bytes 8-11/${wav.length}`);
  assert.equal(await partial.text(), 'WAVE');
  const suffix = await audio.GET(new Request(url, { headers: { range: 'bytes=-10' } }));
  assert.equal(suffix.status, 206); assert.equal((await suffix.arrayBuffer()).byteLength, 10);
  assert.equal((await audio.GET(new Request(url, { headers: { range: `bytes=${wav.length}-` } }))).status, 416);
  assert.equal((await audio.GET(new Request(url, { headers: { range: 'bytes=-0' } }))).status, 416);
  const head = await audio.HEAD(new Request(url, { method: 'HEAD' }));
  assert.equal(head.headers.get('content-length'), String(wav.length)); assert.equal(await head.text(), '');
  assert.equal((await audio.GET(new Request(url.replace(/[^/]+$/, 'unknown.wav')))).status, 404);
});

test('uploads require identity, artist name, rights, supported bytes, and bounded size', async () => {
  const { state, objects } = fixture();
  const api = await loadRoute('../app/api/musicbat/route.ts', state);
  state.user = null; assert.equal((await api.POST(upload())).status, 401);
  state.user = { userId: 'artist-1', displayName: 'Account name' };
  for (const values of [{ artistName: '' }, { title: '' }, { rightsAttested: 'false' }, { bytes: '<html>bad file</html>' }, { filename: 'song.exe' }, { filename: 'song.mp3' }]) {
    assert.equal((await api.POST(upload(values))).status, 400);
  }
  const large = upload(); large.headers.set('content-length', String(26 * 1024 * 1024));
  assert.equal((await api.POST(large)).status, 413);
  const chunked = new Request('https://musicbat.audio/api/musicbat', { method: 'POST', duplex: 'half', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(26 * 1024 * 1024)); controller.close(); } }) });
  assert.equal((await api.POST(chunked)).status, 413);
  assert.equal(objects.size, 0);
  assert.equal((await api.POST(new Request('https://musicbat.audio/api/musicbat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add_track', audioUrl: 'https://other.site/song.mp3' }) }))).status, 400);
});

test('failed catalog writes clean up audio and missing storage has a recoverable error', async () => {
  const { state, objects } = fixture();
  const api = await loadRoute('../app/api/musicbat/route.ts', state);
  state.failInsert = true;
  const original = console.error; console.error = () => {};
  try { assert.equal((await api.POST(upload())).status, 500); } finally { console.error = original; }
  assert.equal(objects.size, 0);
  state.env.BUCKET = null;
  assert.equal((await api.POST(upload())).status, 503);
});
