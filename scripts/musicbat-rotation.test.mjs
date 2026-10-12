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

test('qualified listener keeps are reversible and independent from catalog eligibility', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  globalThis.musicbatRotationState.user = { userId: 'listener-1' };
  const toggle = (enabled) => route.POST(post({ action: 'toggle_keep', trackId: 1, enabled }));
  assert.equal((await toggle(true)).status, 409);
  sqlite.prepare("INSERT INTO listens(id, track_id, listener_id, qualified) VALUES ('listen-1', 1, 'listener-1', 1)").run();
  for (const enabled of [true, true, false, false, true]) {
    assert.equal((await toggle(enabled)).status, 200);
    const { tracks } = await (await route.GET(get())).json();
    const track = tracks.find((t) => t.id === 1);
    assert.equal(track.viewer_keep_in_rotation, Number(enabled));
    assert.equal(track.keep_count, Number(enabled));
    assert.equal(track.viewer_qualified, 1);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM track_keeps').get().n, Number(enabled));
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM tracks').get().n, 5);
});

const pool = () => songs.map((title, i) => ({ id: i + 1, title, rotation_eligible: true }));
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
test('eligible tracks cycle fairly; listener choices do not change exposure frequency', () => {
  const tracks = pool();
  const baseline = spins(tracks); assert.equal(baseline.size, 5); assert.equal([...baseline.values()].reduce((a,b) => a+b), 1000);
  assert.deepEqual([...baseline.values()], [200, 200, 200, 200, 200]);
  tracks[0].shock_score = 1000;
  tracks[1].keep_count = 10;
  const choices = spins(tracks); assert.deepEqual([...choices.values()], [200, 200, 200, 200, 200]);
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
  assert.match(player, /aria-pressed=\{keepActive\}/);
  assert.match(player, /onEnded=\{\(\) => void completeListen\(\)\}/);
  assert.doesNotMatch(player, /downloadMedia|href=.*audio_url|SkipForward|> Next</);
});


test('migration carries artist rotation preference and listener keeps, then removes Hangers', async () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0000_wild_vapor.sql', '0001_quick_blizzard.sql']) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  sqlite.exec("INSERT INTO tracks(artist_id,artist_name,title,audio_url) VALUES ('artist-1','The Enucleators','Unity','/api/musicbat/audio/existing.mp3')");
  sqlite.exec("INSERT INTO hangers(track_id,listener_id,kind) VALUES (1,'artist-1','keep_in_rotation'), (1,'listener-2','keep_in_rotation')");
  sqlite.exec(readFileSync('drizzle/0002_third_elektra.sql','utf8'));
  for (const name of ['0003_oval_dark_phoenix.sql', '0004_bat_radio_energy_feedback.sql']) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  sqlite.exec("INSERT INTO listens(id,track_id,listener_id,qualified,qualified_at) VALUES ('legacy-listen',1,'listener-3',1,CURRENT_TIMESTAMP); INSERT INTO hangers(track_id,listener_id,kind) VALUES (1,'listener-3','standout');");
  sqlite.exec(readFileSync('drizzle/0005_wandering_enchantress.sql', 'utf8'));
  assert.equal(sqlite.prepare('SELECT keep_in_rotation FROM tracks').get().keep_in_rotation,1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM track_keeps').get().n,1);
  assert.equal(sqlite.prepare('SELECT listener_id FROM track_keeps').get().listener_id,'listener-2');
  const migratedSignal = sqlite.prepare("SELECT listener_id,listen_id,signal FROM radio_feedback").get();
  assert.deepEqual({ ...migratedSignal }, { listener_id: 'listener-3', listen_id: 'legacy-listen', signal: 'up' });
  assert.throws(() => sqlite.prepare('SELECT * FROM hangers').all(), /no such table/);
});
test('eligibility queries exclude moderated, removed, unpublished and unattested songs', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  sqlite.exec("UPDATE tracks SET status='removed' WHERE id=1; UPDATE tracks SET status='unpublished' WHERE id=2; UPDATE tracks SET status='moderated' WHERE id=3; UPDATE tracks SET rights_attested=0 WHERE id=4;");
  const {tracks} = await (await route.GET(get())).json();
  assert.deepEqual(tracks.map(t=>t.id),[5]);
});

test('energy lanes are manually assigned per track and only the owning artist may change them', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  assert.equal(sqlite.prepare('SELECT energy_lane FROM tracks WHERE id = 1').get().energy_lane, 'medium');
  assert.equal((await route.POST(post({ action: 'set_energy_lane', trackId: 1, energyLane: 'hard' }))).status, 200);
  const { tracks } = await (await route.GET(get())).json();
  assert.equal(tracks.find((track) => track.id === 1).energy_lane, 'hard');
  globalThis.musicbatRotationState.user = { userId: 'another-artist' };
  assert.equal((await route.POST(post({ action: 'set_energy_lane', trackId: 1, energyLane: 'turbo' }))).status, 403);
  globalThis.musicbatRotationState.user = { userId: 'artist-1' };
  assert.equal((await route.POST(post({ action: 'set_energy_lane', trackId: 1, energyLane: 'ambient' }))).status, 400);
  assert.equal(sqlite.prepare('SELECT energy_lane FROM tracks WHERE id = 1').get().energy_lane, 'hard');
});

test('artists can correct a legacy track genre; other accounts and invalid categories are rejected', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  assert.equal((await route.POST(post({ action: 'set_primary_genre', trackId: 1, primaryGenre: 'Punk' }))).status, 200);
  assert.equal(sqlite.prepare('SELECT primary_genre FROM tracks WHERE id = 1').get().primary_genre, 'Punk');
  globalThis.musicbatRotationState.user = { userId: 'another-artist' };
  assert.equal((await route.POST(post({ action: 'set_primary_genre', trackId: 1, primaryGenre: 'Rock' }))).status, 403);
  globalThis.musicbatRotationState.user = { userId: 'artist-1' };
  assert.equal((await route.POST(post({ action: 'set_primary_genre', trackId: 1, primaryGenre: 'unclassified' }))).status, 400);
  assert.equal(sqlite.prepare('SELECT primary_genre FROM tracks WHERE id = 1').get().primary_genre, 'Punk');
});

test('triangle feedback is append-only and records listener, session, artist, category lane, signal, and timestamp', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  globalThis.musicbatRotationState.user = { userId: 'listener-1' };
  sqlite.prepare("INSERT INTO listens(id, track_id, listener_id, qualified) VALUES ('radio-session-1', 2, 'listener-1', 1)").run();
  for (const signal of ['up', 'down']) {
    assert.equal((await route.POST(post({ action: 'radio_feedback', trackId: 2, listenId: 'radio-session-1', energyLane: 'hard', signal }))).status, 200);
  }
  const rows = sqlite.prepare('SELECT track_id, artist_id, listener_id, listen_id, energy_lane, signal, created_at FROM radio_feedback ORDER BY rowid').all();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ track_id, artist_id, listener_id, listen_id, energy_lane, signal }) => ({ track_id, artist_id, listener_id, listen_id, energy_lane, signal })), [
    { track_id: 2, artist_id: 'artist-1', listener_id: 'listener-1', listen_id: 'radio-session-1', energy_lane: 'medium', signal: 'up' },
    { track_id: 2, artist_id: 'artist-1', listener_id: 'listener-1', listen_id: 'radio-session-1', energy_lane: 'medium', signal: 'down' },
  ]);
  assert.ok(rows.every((row) => row.created_at));
  assert.equal((await route.POST(post({ action: 'radio_feedback', trackId: 3, listenId: 'radio-session-1', energyLane: 'hard', signal: 'up' }))).status, 409);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM radio_feedback').get().n, 2);
  const catalog = await (await route.GET(new Request('https://musicbat.audio/api/musicbat'))).json();
  const track = catalog.tracks.find(t => t.id === 2);
  assert.equal(track.up_count, 0);
  assert.equal(track.down_count, 1);
});

test('Radio UI exposes compact energy lanes and triangle responses, and advances only in the selected lane', () => {
  const player = readFileSync('app/musicbat-loop.tsx', 'utf8');
  assert.match(player, /track\.energy_lane === energyLane/);
  assert.match(player, /selectNextTrack\(rotationTracks/);
  assert.match(player, /More like this/);
  assert.match(player, /Less like this/);
  assert.match(player, /signal: \"up\" \| \"down\"/);
  assert.match(player, /action: \"radio_feedback\"/);
  assert.match(player, /action: \"set_energy_lane\"/);
  assert.match(player, /track\.primary_genre === primaryGenre/);
  assert.match(player, /Shock Room/);
  assert.doesNotMatch(player, /Weight Room|Hanger/);
});

test('Shock Room ranks listener behavior within genre and energy; exposure alone adds no points', async () => {
  const sqlite = database(), route = await handlers(sqlite);
  sqlite.exec("UPDATE tracks SET primary_genre='Punk', energy_lane='hard' WHERE id IN (1,2); UPDATE tracks SET primary_genre='Rock', energy_lane='hard' WHERE id=3; UPDATE tracks SET primary_genre='Punk', energy_lane='soft' WHERE id=4;");
  sqlite.exec(`
    INSERT INTO listens(id,track_id,listener_id,qualified,completed_at) VALUES
      ('a1',1,'listener-a',1,CURRENT_TIMESTAMP), ('a2',1,'listener-a',1,CURRENT_TIMESTAMP),
      ('b1',2,'listener-b',1,NULL), ('exposure-1',2,'listener-c',0,NULL), ('exposure-2',2,'listener-d',0,NULL);
    INSERT INTO radio_feedback(id,track_id,artist_id,listener_id,listen_id,energy_lane,signal)
      VALUES ('up1',1,'artist-1','listener-a','a1','hard','up'),
             ('up2',1,'artist-1','listener-a','a2','hard','up'),
             ('down1',2,'artist-1','listener-b','b1','hard','down');
    INSERT INTO track_keeps(track_id,listener_id) VALUES (1,'listener-a');
  `);
  const getShockRoom = () => route.GET(new Request('https://musicbat.audio/api/musicbat?view=shock-room'));
  const first = await (await getShockRoom()).json();
  const punk = first.rows.filter(row => row.primary_genre === 'Punk');
  assert.equal(punk.find(row => row.track_id === 1).shock_score, 7); // 1 up + 2 keep + 2 completions + 2 repeat
  assert.equal(punk.find(row => row.track_id === 1).up_count, 1); // repeated vote by one listener counts once
  assert.equal(punk.find(row => row.track_id === 1).position, 1);
  assert.equal(punk.find(row => row.track_id === 2).shock_score, -1);
  assert.equal(punk.find(row => row.track_id === 2).position, 2); // two extra plays have no effect
  assert.equal(first.rows.find(row => row.track_id === 3).position, 1); // different genre, own position
  assert.equal(first.rows.find(row => row.track_id === 4).position, 1); // different energy, own position
  sqlite.prepare(`INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_id,artist_share_cents,platform_fee_cents)
    VALUES ('paid-1','buyer-1',2,'Surfin Baghdad','The Enucleators','/file','paid',100,'artist-1',85,15)`).run();
  const afterPurchase = await (await getShockRoom()).json();
  assert.equal(afterPurchase.rows.find(row => row.track_id === 2).purchase_count, 1);
  assert.equal(afterPurchase.rows.find(row => row.track_id === 2).shock_score, 2); // -1 down + 3 purchase

  globalThis.musicbatRotationState.user = { userId: 'listener-a' };
  assert.equal((await route.POST(post({ action: 'radio_feedback', trackId: 1, listenId: 'a1', signal: 'down' }))).status, 200);
  assert.equal((await route.POST(post({ action: 'complete_listen', trackId: 1, listenId: 'a2' }))).status, 200);
  const afterSignals = await (await getShockRoom()).json();
  const rankedOne = afterSignals.rows.find(row => row.track_id === 1);
  assert.equal(rankedOne.up_count, 0);
  assert.equal(rankedOne.down_count, 1);
  assert.equal(rankedOne.completion_count, 2);
  assert.equal(rankedOne.shock_score, 5);
});
