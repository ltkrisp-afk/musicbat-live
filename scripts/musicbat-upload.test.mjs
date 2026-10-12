import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the real handlers with platform boundaries replaced by test doubles.
async function loadRoute(path, state) {
  globalThis.musicbatTestState = state;
  const policy = await readFile(new URL('../lib/playback-authorization.ts', import.meta.url), 'utf8');
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/import \{ authorizePlayback, type Permission \} from [^;]+;/, policy)
    .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.musicbatTestState.env;')
    .replace('import { getChatGPTUser } from "../../chatgpt-auth";', 'const getChatGPTUser = async () => globalThis.musicbatTestState.user;');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText + '\n//' + Math.random()).toString('base64')}`);
}
function fixture() {
  const objects = new Map();
  const tracks = [];
  const grant = {recording_basis:'direct', recording_evidence:'test-recording-contract', composition_evidence:'test-composition-contract', reviewed_by:'test-reviewer', reviewed_at:0, artist_authorized:1, free_allowed:1, plus_allowed:1, starts_at:0, expires_at:9999999999999, withdrawn_at:null, territory:'worldwide'};
  const state = { user: { userId: 'artist-1', displayName: 'Account name' }, failInsert: false, env: {
    DB: { prepare(sql) { return { bind(...values) { return { async run() { return {}; }, async first() {
      if (sql.includes('playback_permissions')) return grant;
      if (sql.includes('INSERT INTO tracks')) {
        if (state.failInsert) throw new Error('simulated catalog failure');
        const track = { id: tracks.length + 1, artist_name: values[1], title: values[2], audio_url: values[3], energy_lane: values[4], primary_genre: values[5], subgenre: values[6], mood_tags: values[7] };
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
  form.set('primaryGenre', overrides.primaryGenre ?? 'Alternative');
  form.set('energyLane', overrides.energyLane ?? 'medium');
  form.set('subgenre', overrides.subgenre ?? '');
  form.set('moodTags', overrides.moodTags ?? '');
  form.set('rightsAttested', overrides.rightsAttested ?? 'true');
  form.set('audio', new File([overrides.bytes ?? wav], overrides.filename ?? 'track.wav', { type: 'audio/wav' }));
  return new Request('https://musicbat.audio/api/musicbat', { method: 'POST', body: form });
}

test('uploaded bytes remain intact while standalone radio playback is closed', async () => {
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
  const object = [...objects.values()][0];
  assert.deepEqual(new Uint8Array(object.bytes), wav);
  const url = 'https://musicbat.audio' + track.audio_url;
  for (const range of [null,'bytes=8-11','bytes=-10']) {
    assert.equal((await audio.GET(new Request(url,range?{headers:{range}}:{}))).status,410);
  }
  assert.equal((await audio.HEAD(new Request(url,{method:'HEAD'}))).status,410);
});

test('uploads store required genre and energy plus optional subgenre and mood tags', async () => {
  const { state } = fixture();
  const api = await loadRoute('../app/api/musicbat/route.ts', state);
  const response = await api.POST(upload({ primaryGenre: 'Punk', energyLane: 'hard', subgenre: 'post-punk', moodTags: 'urgent, hazy' }));
  assert.equal(response.status, 201);
  const { track } = await response.json();
  assert.equal(track.primary_genre, 'Punk');
  assert.equal(track.energy_lane, 'hard');
  assert.equal(track.subgenre, 'post-punk');
  assert.equal(track.mood_tags, '["urgent","hazy"]');
});

test('uploads require identity, artist name, rights, supported bytes, and bounded size', async () => {
  const { state, objects } = fixture();
  const api = await loadRoute('../app/api/musicbat/route.ts', state);
  state.user = null; assert.equal((await api.POST(upload())).status, 401);
  state.user = { userId: 'artist-1', displayName: 'Account name' };
  for (const values of [{ artistName: '' }, { title: '' }, { rightsAttested: 'false' }, { primaryGenre: 'Not a genre' }, { bytes: '<html>bad file</html>' }, { filename: 'song.exe' }, { filename: 'song.mp3' }]) {
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
