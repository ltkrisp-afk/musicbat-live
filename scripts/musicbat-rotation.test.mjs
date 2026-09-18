import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { selectNextTrack } = await import(`data:text/javascript;base64,${Buffer.from(transpile(readFileSync('app/rotation.ts', 'utf8'))).toString('base64')}`);
const songs = ["It's A lie", "Surfin' Baghdad", 'New Way Down', 'Punk Rock Blues', 'Unity'];
// Use actual generated migrations, seeded with the existing five song names.
import { readdirSync } from 'node:fs';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  songs.forEach((title, i) => sqlite.prepare("INSERT INTO tracks(artist_id, artist_name, title, audio_url) VALUES ('artist-1', 'The Enucleators', ?, ?)").run(title, `/api/musicbat/audio/existing-${i}.mp3`));
  return sqlite;
}
async function handlers(sqlite) {
  globalThis.musicbatRotationState = {
    user: { userId: 'artist-1', displayName: 'The Enucleators' },
    env: { DB: { prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const bound = (...args) => ({ async first() { return stmt.get(...args) ?? null; }, async all() { return { results: stmt.all(...args) }; }, async run() { return stmt.run(...args); } });
      return { ...bound(), bind: bound };
    } }, BUCKET: { put() { assert.fail('Toggle must not write an audio asset'); }, delete() { assert.fail('Toggle must not remove audio'); } } },
  };
  const source = readFileSync('app/api/musicbat/route.ts', 'utf8')
    .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.musicbatRotationState.env;')
    .replace('import { getChatGPTUser } from "../../chatgpt-auth";', 'const getChatGPTUser = async () => globalThis.musicbatRotationState.user;');
  return import(`data:text/javascript;base64,${Buffer.from(transpile(source) + '\n//' + Math.random()).toString('base64')}`);
}
const post = (body) => new Request('https://musicbat.audio/api/musicbat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = () => new Request('https://musicbat.audio/api/musicbat?view=tracks');

test('existing uploads toggle ON/OFF persistently without changing eligibility, IDs or audio', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  const before = sqlite.prepare('SELECT id, audio_url, status, rights_attested FROM tracks').all();
  for (const enabled of [true, false, true, true, false]) {
    assert.equal((await route.POST(post({ action: 'set_rotation_priority', trackId: 3, enabled }))).status, 200);
    const { tracks } = await (await route.GET(get())).json();
    assert.equal(tracks.length, 5);
    assert.equal(tracks.find((t) => t.id === 3).keep_in_rotation, Number(enabled));
    assert.ok(tracks.every((t) => t.rotation_eligible));
    assert.deepEqual(sqlite.prepare('SELECT id, audio_url, status, rights_attested FROM tracks').all(), before);
  }
  globalThis.musicbatRotationState.user = { userId: 'another-artist' };
  assert.equal((await route.POST(post({ action: 'set_rotation_priority', trackId: 3, enabled: true }))).status, 403);
  globalThis.musicbatRotationState.user = null;
  assert.equal((await route.POST(post({ action: 'set_rotation_priority', trackId: 3, enabled: true }))).status, 401);
});

test('qualified listener priority is reversible and preserves unrelated Hangers', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  globalThis.musicbatRotationState.user = { userId: 'listener-1' };
  const toggle = (enabled) => route.POST(post({ action: 'toggle_rotation_hanger', trackId: 1, enabled }));
  assert.equal((await toggle(true)).status, 409);
  sqlite.prepare("INSERT INTO listens(id, track_id, listener_id, qualified) VALUES ('listen-1', 1, 'listener-1', 1)").run();
  for (const enabled of [true, true, false, false, true]) {
    assert.equal((await toggle(enabled)).status, 200);
    const { tracks } = await (await route.GET(get())).json();
    const track = tracks.find((t) => t.id === 1);
    assert.equal(track.viewer_keep_in_rotation, Number(enabled));
    assert.equal(track.keep_count, Number(enabled));
    assert.equal(track.viewer_qualified, 1);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM hangers').get().n, Number(enabled));
  }
  await route.POST(post({ action: 'hanger', trackId: 1, kind: 'standout' }));
  await toggle(false);
  assert.equal(sqlite.prepare('SELECT kind FROM hangers').get().kind, 'standout');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM tracks').get().n, 5);
});

const pool = () => songs.map((title, i) => ({ id: i + 1, title, rotation_eligible: true, keep_in_rotation: 0, keep_count: 0, signal_count: 0 }));
function spins(tracks, n = 1000, failed = new Set()) {
  const credits = new Map(), counts = new Map(); let current;
  for (let i = 0; i < n; i++) {
    const next = selectNextTrack(tracks, current, credits, failed);
    if (!next) return counts;
    if (tracks.filter((t) => t.rotation_eligible && !failed.has(t.id)).length > 1) assert.notEqual(next.id, current);
    current = next.id; counts.set(current, (counts.get(current) ?? 0) + 1);
  }
  return counts;
}
test('all-OFF catalog continues cycling; owner and listener ON signals increase frequency', () => {
  const tracks = pool();
  const baseline = spins(tracks); assert.equal(baseline.size, 5); assert.equal([...baseline.values()].reduce((a,b) => a+b), 1000);
  tracks[0].keep_in_rotation = 1;
  const priority = spins(tracks); assert.ok(priority.get(1) > priority.get(2)); assert.equal(priority.size, 5);
  tracks[1].keep_count = 1; tracks[1].signal_count = 1;
  const listeners = spins(tracks); assert.ok(listeners.get(2) > listeners.get(3));
});
test('insufficient/broken preferred tracks fall back; ineligible tracks never play; one track repeats', () => {
  const tracks = pool(); tracks[0].keep_in_rotation = 1; tracks[1].rotation_eligible = false;
  const fallback = spins(tracks, 1000, new Set([1])); assert.equal(fallback.size, 3); assert.ok(!fallback.has(1)); assert.ok(!fallback.has(2));
  const single = spins([tracks[0]], 10); assert.equal(single.get(1), 10);
  assert.equal(selectNextTrack([], undefined, new Map(), new Set()), null);
  assert.equal(selectNextTrack([tracks[0]], 1, new Map(), new Set([1])), null);
});
test('MusicBat player omits native controls and Next; Buy and essential playback controls remain', () => {
  const player = readFileSync('app/musicbat-loop.tsx', 'utf8');
  const controls = readFileSync('components/musicbat-player.tsx', 'utf8');
  assert.match(player, /<MusicBatPlayer/);
  assert.match(controls, /controlsList="nodownload noremoteplayback"/);
  assert.doesNotMatch(controls, /\bcontrols(?:\s|=)/);
  assert.match(controls, /"Pause Radio" : "Play Radio"/);
  assert.match(controls, /aria-label="Playback position"/);
  assert.match(controls, /aria-label="Volume"/);
  assert.match(controls, /onEnded\(\); \}, 500\)/);
  assert.match(player, /aria-label=\{`Buy \$\{current.title\}`\}/);
  assert.match(player, /aria-pressed=\{kind === "keep_in_rotation" \? keepActive/);
  assert.match(player, /onEnded=\{\(\) => nextTrack\(true\)\}/);
  assert.doesNotMatch(player, /downloadMedia|href=.*audio_url|SkipForward|> Next</);
});


test('migration preserves prior artist ON choices and OFF clears only their legacy keep signal', async () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((name) => name.endsWith('.sql') && !name.startsWith('0002')).sort()) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  sqlite.exec("INSERT INTO tracks(artist_id,artist_name,title,audio_url) VALUES ('artist-1','The Enucleators','Unity','/api/musicbat/audio/existing.mp3')");
  sqlite.exec("INSERT INTO hangers(track_id,listener_id,kind) VALUES (1,'artist-1','keep_in_rotation'), (1,'listener-2','keep_in_rotation')");
  sqlite.exec(readFileSync('drizzle/0002_third_elektra.sql','utf8'));
  assert.equal(sqlite.prepare('SELECT keep_in_rotation FROM tracks').get().keep_in_rotation,1);
  const route = await handlers(sqlite);
  assert.equal((await route.POST(post({action:'set_rotation_priority',trackId:1,enabled:false}))).status,200);
  assert.equal(sqlite.prepare('SELECT keep_in_rotation FROM tracks').get().keep_in_rotation,0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM hangers').get().n,1);
  assert.equal(sqlite.prepare('SELECT listener_id FROM hangers').get().listener_id,'listener-2');
});
test('eligibility queries exclude moderated, removed, unpublished and unattested songs', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  sqlite.exec("UPDATE tracks SET status='removed' WHERE id=1; UPDATE tracks SET status='unpublished' WHERE id=2; UPDATE tracks SET status='moderated' WHERE id=3; UPDATE tracks SET rights_attested=0 WHERE id=4;");
  const {tracks} = await (await route.GET(get())).json();
  assert.deepEqual(tracks.map(t=>t.id),[5]);
});
