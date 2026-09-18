import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

async function loadRoute(path, state) {
  globalThis.musicbatPurchaseState = state;
  const buyer = await readFile(new URL('../app/api/musicbat/purchase/buyer.ts', import.meta.url), 'utf8');
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.musicbatPurchaseState.env;')
    .replace(/import \{ buyerIdentity \} from "[^"]*buyer";/, buyer);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText + '\n//' + Math.random()).toString('base64')}`);
}
const asset = '550e8400-e29b-41d4-a716-446655440000.wav';
const secondAsset = '550e8400-e29b-41d4-a716-446655440001.mp3';
const bytes = new TextEncoder().encode('RIFF-original-audio-bytes');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const filename of ['0000_wild_vapor.sql', '0001_quick_blizzard.sql']) sqlite.exec(await readFile(new URL('../drizzle/' + filename, import.meta.url), 'utf8'));
  sqlite.prepare('INSERT INTO tracks (artist_id, artist_name, title, audio_url) VALUES (?, ?, ?, ?)').run('artist', 'The Band', 'Original Song', `/api/musicbat/audio/${asset}`);
  const state = { reads: 0, env: {
    DB: { prepare(sql) { return { bind(...values) { return { async first() { return sqlite.prepare(sql).get(...values) ?? null; } }; } }; } },
    BUCKET: { async head(key) { return key === `tracks/${asset}` || key === `tracks/${secondAsset}` ? { size: bytes.length } : null; }, async get(key) { state.reads++; return key === `tracks/${asset}` ? { body: bytes, size: bytes.length, httpMetadata: { contentType: 'audio/wav' } } : null; } },
  } };
  const purchase = await loadRoute('../app/api/musicbat/purchase/route.ts', state);
  const download = await loadRoute('../app/api/musicbat/purchase/[purchaseId]/download/route.ts', state);
  return { sqlite, state, purchase, download };
}
function post(body, cookie, origin) {
  return new Request('https://musicbat.audio/api/musicbat/purchase', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
}
function get(id, cookie, download = false) {
  return new Request(`https://musicbat.audio/api/musicbat/purchase${download ? `/${id}/download` : `?id=${id}`}`, { headers: cookie ? { cookie } : {} });
}

test('Buy snapshots the selected song, reuses its draft, and never accepts client payment claims', async () => {
  const { sqlite, state, purchase, download } = await fixture();
  const response = await purchase.POST(post({ trackId: 1, paid: true, status: 'paid', amountCents: 1 }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const data = await response.json();
  assert.equal(data.checkoutAvailable, false); assert.equal(data.status, 'awaiting_checkout');
  assert.match(data.message, /You have not been charged/);
  assert.equal(data.purchase.title, 'Original Song');
  const id = data.purchase.id;
  assert.equal(sqlite.prepare('SELECT amount_cents FROM purchases WHERE id = ?').get(id).amount_cents, null);
  const repeated = await (await purchase.POST(post({ trackId: 1 }, cookie))).json();
  assert.equal(repeated.purchase.id, id);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM purchases').get().count, 1);
  assert.equal((await download.GET(get(id, cookie, true))).status, 402);
  assert.equal(state.reads, 0);
  assert.equal((await purchase.GET(get(id))).status, 404);
  assert.equal((await download.GET(get(id, `musicbat_buyer=${'a'.repeat(64)}`, true))).status, 404);
  sqlite.prepare('UPDATE tracks SET title = ?, audio_url = ? WHERE id = 1').run('Next Song', `/api/musicbat/audio/${secondAsset}`);
  const status = await (await purchase.GET(get(id, cookie))).json();
  assert.equal(status.purchase.title, 'Original Song'); assert.equal(status.downloadUrl, null);
  assert.equal(sqlite.prepare('SELECT audio_path FROM purchases WHERE id = ?').get(id).audio_path, `/api/musicbat/audio/${asset}`);
  sqlite.close();
});

test('only a server-confirmed paid record serves an attachment to its buyer, using the captured asset', async () => {
  const { sqlite, purchase, download } = await fixture();
  const response = await purchase.POST(post({ trackId: 1 }));
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const { purchase: { id } } = await response.json();
  // Represents a future processor integration's VERIFIED server-side receipt.
  // There is deliberately no public endpoint that allows a client to set this status.
  sqlite.prepare("UPDATE purchases SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  sqlite.prepare('UPDATE tracks SET title = ?, audio_url = ? WHERE id = 1').run('New Title', `/api/musicbat/audio/${secondAsset}`);
  const receipt = await (await purchase.GET(get(id, cookie))).json();
  assert.equal(receipt.downloadUrl, `/api/musicbat/purchase/${id}/download`);
  const file = await download.GET(get(id, cookie, true));
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'audio/wav');
  assert.match(file.headers.get('content-disposition'), /attachment; filename="The Band - Original Song.wav"/);
  assert.equal(file.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  for (const status of ['awaiting_checkout', 'failed', 'refunded']) {
    sqlite.prepare('UPDATE purchases SET status = ? WHERE id = ?').run(status, id);
    assert.equal((await download.GET(get(id, cookie, true))).status, 402);
  }
  sqlite.close();
});

test('missing, inactive, external-link and invalid selections cannot prepare a purchase', async () => {
  const { sqlite, purchase } = await fixture();
  assert.equal((await purchase.POST(post({ trackId: 1 }, null, 'https://another.site'))).status, 403);
  assert.equal((await purchase.POST(post({ trackId: -1 }))).status, 400);
  assert.equal((await purchase.POST(post({ trackId: 999 }))).status, 404);
  sqlite.prepare("UPDATE tracks SET status = 'inactive' WHERE id = 1").run();
  assert.equal((await purchase.POST(post({ trackId: 1 }))).status, 404);
  sqlite.prepare("UPDATE tracks SET status = 'active', audio_url = 'https://other.site/song.mp3' WHERE id = 1").run();
  assert.equal((await purchase.POST(post({ trackId: 1 }))).status, 409);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM purchases').get().count, 0);
  sqlite.close();
});
