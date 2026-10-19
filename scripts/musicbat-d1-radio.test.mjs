import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {D1SharedRadioEngine} from '../lib/d1-shared-radio-engine.ts';
import {SharedRadioEngine} from '../lib/shared-radio-engine.ts';
import {sandboxD1Radio} from '../lib/d1-radio-service.ts';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const {build}=wranglerRequire('esbuild');

// Real SQLite transactions behind the asynchronous D1 API shape. This is local
// adapter evidence; hosted Cloudflare execution is a separate acceptance gate.
export function d1(sqlite) {
 const db={prepare(sql){
  const bound=(...values)=>({
   bind:(...next)=>bound(...next),
   async all(){return {success:true,results:sqlite.prepare(sql).all(...values)};},
   async first(){return sqlite.prepare(sql).get(...values)??null;},
   async run(){return {success:true,meta:sqlite.prepare(sql).run(...values)};},
   execute(){const s=sqlite.prepare(sql);return {success:true,results:s.columns().length?s.all(...values):[],meta:s.columns().length?{}:s.run(...values)};},
  });return bound();
 },async batch(statements){
  sqlite.exec('BEGIN IMMEDIATE');
  try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
 }};
 db.withSession=constraint=>{assert.equal(constraint,'first-primary');return db;};
 return db;
}
const schema=await readFile('drizzle/0008_shared_radio_engine.sql','utf8');
const permission={recording_basis:'direct',recording_evidence:'GENERATED FIXTURE',composition_evidence:'GENERATED FIXTURE',reviewed_by:'fixture',reviewed_at:0,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:0,expires_at:999999999,withdrawn_at:null,territory:'US'};
const category={genre:'Rock',subgenre:'Punk',style:'Hardcore'};
const track=id=>({id,artistIds:['artist'+id],albumId:'album'+id,compilationIds:[],metadataReviewed:true,eligible:true,statutoryEligibility:null,permission,category,durationMs:1000,directRestrictions:null});
function seed(db){
 db.exec(schema);
 for(const [id,path]of [['free',null],['rock',{genre:'Rock'}],['punk',{genre:'Rock',subgenre:'Punk'}],['hardcore',category]]){
  db.prepare('INSERT INTO radio_engine_channels VALUES (?,?,0,0,0,0)').run(id,JSON.stringify({category:path,mode:path?'radio-plus':'free-radio',territory:'US',minimumArtists:1,review:{reference:'GENERATED FIXTURE',verifiedAt:0,expiresAt:999999999},gate:null}));
 }
 for(const id of ['a','b'])db.prepare('INSERT INTO radio_engine_catalog VALUES (?,?)').run(id,JSON.stringify(track(id)));
}
const listener={id:'listener',plusUntil:999999999};
function fixture(){const sqlite=new DatabaseSync(':memory:');seed(sqlite);let now=10000;const db=d1(sqlite);return {sqlite,db,engine:new D1SharedRadioEngine(db,()=>now),setNow:n=>{now=n;}};}

test('D1 async scheduler matches existing live engine for category tuning, reconnect, rotation and navigation',async()=>{
 const f=fixture(),reference=new DatabaseSync(':memory:');seed(reference);let now=10000;const original=new SharedRadioEngine(reference,()=>now,'live');
 try{
  for(const path of [null,{genre:'Rock'},{genre:'Rock',subgenre:'Punk'},category]){
   assert.deepEqual(await f.engine.tune(listener,path),original.tune(listener,path));
   now+=100;f.setNow(now);
   assert.deepEqual(await f.engine.reconnect(listener),original.reconnect(listener));
  }
  now=12000;f.setNow(now);assert.deepEqual(await f.engine.tick('hardcore'),original.tick('hardcore'));
  assert.deepEqual(await f.engine.navigation(listener),original.navigation(listener));
  for(const table of ['radio_engine_channels','radio_engine_sessions','radio_engine_events','radio_engine_decisions'])assert.deepEqual(f.sqlite.prepare('SELECT * FROM '+table).all(),reference.prepare('SELECT * FROM '+table).all());
 }finally{f.sqlite.close();reference.close();}
});
test('D1 concurrent workers recompute stale reads and persist one shared performance without duplicate audit rows',async()=>{
 const f=fixture();try{
  const result=await Promise.all(Array.from({length:3},(_,i)=>new D1SharedRadioEngine(f.db,()=>10000).connect({...listener,id:'listener'+i})));
  assert.ok(result.every(s=>s.performance?.sequence===1&&s.performance?.startedAt===10000));
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_events').get().n,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_decisions').get().n,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_sessions').get().n,3);
 }finally{f.sqlite.close();}
});
test('D1 withdrawal between calculation and batch commit fences the stale performance and survives a fresh worker',async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db);let once=true;
  f.db.batch=async statements=>{if(once){once=false;f.sqlite.prepare('DELETE FROM radio_engine_catalog WHERE id=?').run('a');}return batch(statements);};
  const snapshot=await f.engine.connect(listener);assert.equal(snapshot.performance.trackId,'b');
  const fresh=new D1SharedRadioEngine(d1(f.sqlite),()=>10400);
  const resumed=await fresh.reconnect(listener);assert.equal(resumed.performance.trackId,'b');assert.equal(resumed.performance.offsetMs,400);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_events').get().n,1);
 }finally{f.sqlite.close();}
});
test('D1 failed audit commit rolls back all writes and missing review, Plus authority or storage fails closed',async()=>{
 const f=fixture();try{
  f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON radio_engine_decisions BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  await assert.rejects(f.engine.connect(listener),/audit unavailable/);
  for(const t of ['radio_engine_events','radio_engine_decisions','radio_engine_sessions'])assert.equal(f.sqlite.prepare('SELECT count(*) n FROM '+t).get().n,0);
  f.sqlite.exec('DROP TRIGGER fail_audit');
  await assert.rejects(f.engine.tune({id:'free',plusUntil:null},category),/entitlement/);
  f.sqlite.exec("UPDATE radio_engine_channels SET config_json=json_set(config_json,'$.review',null)");
  assert.equal((await f.engine.connect(listener)).status,'silent');
  f.db.batch=async()=>{throw new Error('network unavailable');};
  await assert.rejects(f.engine.reconnect(listener),/network unavailable/);
 }finally{f.sqlite.close();}
});
test('D1 repeated conflicts exhaust bounded retries without persisting a partial decision',async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db);let attempts=0;
  f.db.batch=async statements=>{attempts++;f.sqlite.exec('UPDATE radio_engine_channels SET last_clock=last_clock+1');return batch(statements);};
  await assert.rejects(f.engine.connect(listener),/malformed JSON/i);assert.equal(attempts,4);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_events').get().n,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_sessions').get().n,0);
 }finally{f.sqlite.close();}
});
test('D1 adapter restores its persisted timeline after a real disk close and reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'musicbat-d1-restart-')),file=join(dir,'state.sqlite');let sqlite;
 try{
  sqlite=new DatabaseSync(file);seed(sqlite);await new D1SharedRadioEngine(d1(sqlite),()=>10000).connect(listener);sqlite.close();
  sqlite=new DatabaseSync(file);const resumed=await new D1SharedRadioEngine(d1(sqlite),()=>10400).reconnect(listener);
  assert.equal(resumed.performance.sequence,1);assert.equal(resumed.performance.offsetMs,400);
 }finally{sqlite?.close();await rm(dir,{recursive:true,force:true});}
});

test('real local Cloudflare D1/R2 executes guarded concurrency and authenticated range delivery; withdrawal rejects stale bytes',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {configuredRadioService} from './lib/configured-radio-service.ts';
  import {forwardRadio} from './lib/radio-gateway.ts';
  export default {fetch(request,env){
   // Local test identity only; this entrypoint is never part of the Site build.
   const service=configuredRadioService({...env,MUSICBAT_CLOUDFLARE_RADIO:'test',MUSICBAT_STRIPE_MODE:'test',RADIO_SERVICE:{fetch(){throw Error('regular Radio must not run');}},RADIO_RUNTIME_ORIGIN:'invalid',RADIO_RUNTIME_TOKEN:'x'.repeat(32)});
   return forwardRadio(request,service,request.headers.get('x-fixture-listener'));
  }};
 `},bundle:true,platform:'browser',format:'esm',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  await db.prepare('CREATE TABLE tracks(id INTEGER PRIMARY KEY,audio_url TEXT,status TEXT,radio_enabled INTEGER,primary_genre TEXT,subgenre TEXT,style TEXT)').run();
  await db.prepare('CREATE TABLE playback_permissions(track_id INTEGER PRIMARY KEY,recording_basis TEXT,recording_evidence TEXT,composition_evidence TEXT,reviewed_by TEXT,reviewed_at INTEGER,artist_authorized INTEGER,free_allowed INTEGER,plus_allowed INTEGER,starts_at INTEGER,expires_at INTEGER,withdrawn_at INTEGER,territory TEXT)').run();
  const now=Date.now(),expires=now+86400000;
  const p={...permission,reviewed_at:now-1,starts_at:now-1,expires_at:expires,territory:'worldwide'};
  const reviewed={...track('1'),durationMs:30000,permission:p};
  const config={category:null,mode:'free-radio',territory:'worldwide',minimumArtists:1,review:{reference:'GENERATED LOCAL TEST ONLY',verifiedAt:now-1,expiresAt:expires},gate:null};
  await db.prepare('INSERT INTO radio_engine_channels VALUES (?,?,?,?,0,0)').bind('free',JSON.stringify(config),now-1,now-1).run();
  await db.prepare('INSERT INTO radio_engine_catalog VALUES (?,?)').bind('1',JSON.stringify(reviewed)).run();
  await db.prepare('INSERT INTO tracks VALUES (?,?,?,?,?,?,?)').bind(1,'tracks/generated.wav','active',1,'Rock','Punk','Hardcore').run();
  await db.prepare('INSERT INTO playback_permissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(1,...Object.values(p)).run();
  const bytes=new Uint8Array([82,73,70,70,1,2,3,4,87,65,86,69]);
  await bucket.put('tracks/generated.wav',bytes,{httpMetadata:{contentType:'audio/wav'}});
  const workers=await Promise.all(['one','two'].map(id=>new D1SharedRadioEngine(db).connect({id,plusUntil:null})));
  assert.equal(workers[0].performance.authorityId,workers[1].performance.authorityId);
  assert.equal((await db.prepare('SELECT count(*) n FROM radio_engine_events').first()).n,1);
  assert.equal((await mf.dispatchFetch('https://sandbox.test/api/musicbat/channel')).status,401);
  const channel=await mf.dispatchFetch('https://sandbox.test/api/musicbat/channel',{headers:{'x-fixture-listener':'one'}});assert.equal(channel.status,200);
  const data=await channel.json();assert.equal(data.snapshot.simulation,false);assert.equal(data.snapshot.performance.trackId,'1');
  const media=new URL(data.mediaUrl,'https://sandbox.test');
  const response=await mf.dispatchFetch(media,{headers:{range:'bytes=0-3','x-fixture-listener':'one'}});assert.equal(response.status,206);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes.slice(0,4));
  const head=await mf.dispatchFetch(media,{method:'HEAD',headers:{range:'bytes=0-3','x-fixture-listener':'one'}});assert.equal(head.status,206);assert.equal((await head.arrayBuffer()).byteLength,0);
  await db.prepare("UPDATE tracks SET status='withdrawn',radio_enabled=0 WHERE id=1").run();
  const denied=await mf.dispatchFetch(media,{headers:{range:'bytes=0-3','x-fixture-listener':'one'}});assert.ok([403,409].includes(denied.status));assert.equal((await denied.arrayBuffer()).byteLength,0);
  assert.equal((await db.prepare('SELECT count(*) n FROM radio_engine_catalog').first()).n,0);
  assert.equal(sandboxD1Radio({MUSICBAT_CLOUDFLARE_RADIO:'test',MUSICBAT_STRIPE_MODE:'live',DB:db,BUCKET:bucket}),undefined);
  assert.equal(sandboxD1Radio({MUSICBAT_STRIPE_MODE:'test',DB:db,BUCKET:bucket}),undefined);
 }finally{await mf.dispose();}
});

test('D1 listener retries when a newer commit overtakes its sampled clock',async()=>{
 const f=fixture();let clock=10001,once=true;
 try{
  await f.engine.connect(listener);
  const prepare=f.db.prepare.bind(f.db);
  f.db.prepare=sql=>{
   const wrap=statement=>({...statement,bind:(...values)=>wrap(statement.bind(...values)),all:async()=>{
    if(once&&sql==='SELECT * FROM radio_engine_channels WHERE id=?'){
     once=false;await new D1SharedRadioEngine(f.db,()=>10010).tick('free');clock=10020;
    }
    return statement.all();
   }});
   return wrap(prepare(sql));
  };
  const result=await new D1SharedRadioEngine(f.db,()=>clock).reconnect(listener);
  assert.equal(result.status,'playing');assert.equal(result.serverNow,10020);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_engine_events').get().n,1);
 }finally{f.sqlite.close();}
});

test('persistently regressed D1 server clock still fails closed without changing history',async()=>{
 const f=fixture();try{
  await f.engine.connect(listener);
  const before=f.sqlite.prepare('SELECT * FROM radio_engine_channels WHERE id=?').get('free');
  await assert.rejects(new D1SharedRadioEngine(f.db,()=>9999).reconnect(listener),/server-clock-regressed/);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM radio_engine_channels WHERE id=?').get('free'),before);
 }finally{f.sqlite.close();}
});
