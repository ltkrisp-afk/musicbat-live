import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import ts from 'typescript';
async function moduleAt(path,replacements={}) {
 let s=await readFile(new URL(path,import.meta.url),'utf8');
 for(const [a,b] of Object.entries(replacements)) s=s.replaceAll(a,b);
 return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
}
const auth=await moduleAt('../lib/playback-authorization.ts');
const compliance=await moduleAt('../lib/radio-compliance.ts',{"'./playback-authorization'":JSON.stringify(auth)});
const category=await moduleAt('../lib/radio-category.ts',{"'./radio-compliance'":JSON.stringify(compliance)});
const engineURL=await moduleAt('../lib/shared-radio-engine.ts',{"'./radio-compliance'":JSON.stringify(compliance),"'./radio-category'":JSON.stringify(category)});
const {SharedRadioEngine}=await import(engineURL);
const schema=await readFile(new URL('../drizzle/0008_shared_radio_engine.sql',import.meta.url),'utf8');
const permission={recording_basis:'direct',recording_evidence:'fixture',composition_evidence:'fixture',reviewed_by:'fixture',reviewed_at:0,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:0,expires_at:999999999,withdrawn_at:null,territory:'US'};
const path={genre:'Rock',subgenre:'Punk',style:'Hardcore'};
const evidence={reference:'SYNTHETIC',verifiedBy:'fixture',verifiedAt:0,expiresAt:999999999};
const gate=Object.fromEntries(['serviceEligibility','noticeAndTiming','royaltiesAndReporting','compositionCoverage','applicableRequirements'].map(k=>[k,evidence]));
const track=(id,changes={})=>({id,artistIds:['artist'+id],albumId:'album'+id,compilationIds:[],metadataReviewed:true,eligible:true,statutoryEligibility:evidence,permission,category:path,durationMs:1000,...changes});
function seed(db,{minimumArtists=1,tracks=[track('a'),track('b')],review=true}={}) {
 db.exec(schema);
 for(const [id,category] of [['free',null],['rock',{genre:'Rock'}],['punk',{genre:'Rock',subgenre:'Punk'}],['hardcore',path]]) {
  const c={category,mode:category?'radio-plus':'free-radio',territory:'US',minimumArtists,review:review?{reference:'synthetic review',verifiedAt:0,expiresAt:999999999}:null,gate};
  db.prepare('INSERT INTO radio_engine_channels VALUES (?,?,0,0,0,0)').run(id,JSON.stringify(c));
 }
 for(const t of tracks) db.prepare('INSERT INTO radio_engine_catalog VALUES (?,?)').run(t.id,JSON.stringify(t));
}
function fixture(options={}) {const db=new DatabaseSync(':memory:');seed(db,options);let n=10000;const engine=new SharedRadioEngine(db,()=>n);return {db,engine,setNow(v){n=v},close(){db.close()}};}
const listener={id:'one',plusUntil:999999999};
test('all 3 category levels map to shared channels, command injection and unauthorized Plus are rejected',()=>{
 const f=fixture();try {
  for(const [p,id] of [[null,'free'],[{genre:'Rock'},'rock'],[{genre:'Rock',subgenre:'Punk'},'punk'],[path,'hardcore']]) assert.equal(f.engine.tune(listener,p).channelId,id);
  for(const c of [{...path,trackId:'a'},{...path,seek:1},{...path,now:0},{...path,mode:'free-radio'},{...path,replay:true},{}]) assert.throws(()=>f.engine.tune(listener,c));
  assert.throws(()=>f.engine.tune({id:'free',plusUntil:null},path),/entitlement/);
  assert.equal(f.engine.tune({id:'free',plusUntil:null},null).channelId,'free');
 }finally{f.close()}
});
test('simultaneous listeners and reconnects share one timeline without replay or history reset',()=>{
 const f=fixture();try {
  const a=f.engine.tune(listener,path);f.setNow(10250);
  const b=f.engine.tune({...listener,id:'two'},path);
  assert.equal(a.performance.sequence,b.performance.sequence);assert.equal(b.performance.offsetMs,250);
  assert.equal(b.performance.startedAt,a.performance.startedAt);
  assert.equal(f.db.prepare('SELECT count(*) n FROM radio_engine_events').get().n,1);
  f.setNow(11000);const next=f.engine.tick('hardcore');assert.equal(next.performance.trackId,'b');
  assert.equal(f.engine.reconnect(listener).performance.sequence,2);
 }finally{f.close()}
});
test('channel switching retains each channel history; client pauses never alter server clock',()=>{
 const f=fixture();try {
  f.engine.tune(listener,path);f.setNow(10300);f.engine.tune(listener,{genre:'Rock'});
  f.setNow(10600);assert.equal(f.engine.tune(listener,path).performance.offsetMs,600);
  f.setNow(12500);const s=f.engine.reconnect(listener);assert.equal(s.performance.startedAt,12500);
  const rows=f.db.prepare('SELECT * FROM radio_engine_events WHERE channel_id=? ORDER BY sequence').all('hardcore');
  assert.equal(rows[0].ended_at,11000);assert.equal(rows[1].started_at,12500);
 }finally{f.close()}
});
test('empty/dormant catalogs and missing rights or channel review fail closed',()=>{
 for(const options of [{tracks:[]},{minimumArtists:3},{review:false},{tracks:[track('a',{permission:null})]}]) {
  const f=fixture(options);try {assert.equal(f.engine.tune(listener,path).status,'silent');assert.equal(f.db.prepare('SELECT count(*) n FROM radio_engine_events').get().n,0)}finally{f.close()}
 }
});
test('withdrawal interrupts current performance and stores elapsed history before choosing another',()=>{
 const f=fixture();try {
  f.engine.tune(listener,path);f.setNow(10200);
  const revoked=track('a',{permission:{...permission,withdrawn_at:10100}});
  f.db.prepare('UPDATE radio_engine_catalog SET track_json=? WHERE id=?').run(JSON.stringify(revoked),'a');
  const s=f.engine.reconnect(listener);assert.equal(s.performance.trackId,'b');
  const old=f.db.prepare('SELECT * FROM radio_engine_events WHERE channel_id=? AND sequence=1').get('hardcore');
  assert.equal(old.closed,1);assert.equal(old.ended_at,10200);
 }finally{f.close()}
});
test('expiry covers the whole performance and current permission removal cannot borrow a snapshot grant',()=>{
 const f=fixture({tracks:[track('a')]});try {
  f.engine.tune(listener,path);f.setNow(10200);
  f.db.prepare('DELETE FROM radio_engine_catalog').run();assert.equal(f.engine.reconnect(listener).status,'silent');
 }finally{f.close()}
 const g=fixture({tracks:[track('a',{permission:{...permission,expires_at:10500}})]});try {assert.equal(g.engine.tune(listener,path).status,'silent')}finally{g.close()}
});
test('statutory simulation rolling limits survive tuning, reconnect and silence',()=>{
 const t=track('a',{permission:{...permission,recording_basis:'statutory'}});
 const f=fixture({tracks:[t]});try {
  assert.equal(f.engine.tune(listener,path).status,'playing');
  f.setNow(11000);assert.equal(f.engine.tick('hardcore').status,'playing');
  f.setNow(12000);assert.equal(f.engine.tick('hardcore').status,'silent');
  assert.equal(f.engine.tune({...listener,id:'two'},path).status,'silent');
  assert.equal(f.engine.reconnect(listener).status,'silent');
  assert.equal(f.db.prepare('SELECT count(*) n FROM radio_engine_events WHERE channel_id=?').get('hardcore').n,2);
 }finally{f.close()}
});
test('malformed ledger and regressing server clocks roll back instead of resetting history',()=>{
 const f=fixture();try {
  f.engine.tune(listener,path);f.setNow(9999);assert.throws(()=>f.engine.reconnect(listener),/clock-regressed/);
  f.setNow(12000);f.db.prepare('UPDATE radio_engine_events SET sequence=9').run();
  assert.throws(()=>f.engine.reconnect(listener),/ledger-invalid/);
  assert.equal(f.db.prepare('SELECT revision FROM radio_engine_channels WHERE id=?').get('hardcore').revision,1);
 }finally{f.close()}
});
test('audit write failures roll back scheduling and session updates atomically',()=>{
 const f=fixture();try {
  f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON radio_engine_decisions BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  assert.throws(()=>f.engine.tune(listener,path),/audit unavailable/);
  for(const table of ['radio_engine_events','radio_engine_sessions']) assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
  assert.equal(f.db.prepare('SELECT revision FROM radio_engine_channels WHERE id=?').get('hardcore').revision,0);
 }finally{f.close()}
});
test('restart restores channel and listener state from a real disk database',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bat-radio-'));const file=join(dir,'radio.sqlite');let db;
 try {
  db=new DatabaseSync(file);seed(db);new SharedRadioEngine(db,()=>10000).tune(listener,path);db.close();
  db=new DatabaseSync(file);const s=new SharedRadioEngine(db,()=>10400).reconnect(listener);
  assert.equal(s.performance.offsetMs,400);assert.equal(s.performance.sequence,1);
 }finally{db?.close();await rm(dir,{recursive:true,force:true})}
});
test('multiple independent SQLite writers serialize one performance under concurrency',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bat-radio-concurrent-'));const file=join(dir,'radio.sqlite');
 const db=new DatabaseSync(file);seed(db);db.close();
 try {
  const results=await Promise.all(Array.from({length:8},(_,i)=>new Promise((resolve,reject)=>{
   const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {DatabaseSync}=require('node:sqlite');const {SharedRadioEngine}=await import(workerData.url);const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=10000');const result=new SharedRadioEngine(db,()=>10000).tune({id:workerData.id,plusUntil:999999999},workerData.category);db.close();parentPort.postMessage(result)})().catch(e=>{throw e});`,{eval:true,workerData:{url:engineURL,file,id:'worker'+i,category:path}});
   worker.on('message',resolve);worker.on('error',reject);
  })));
  assert.ok(results.every(s=>s.performance.sequence===1&&s.performance.startedAt===10000));
  const check=new DatabaseSync(file);try {assert.equal(check.prepare('SELECT count(*) n FROM radio_engine_events').get().n,1);assert.equal(check.prepare('SELECT count(*) n FROM radio_engine_sessions').get().n,8)}finally{check.close()}
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('entitlement expires on reconnect and synthetic snapshots contain no media delivery capability',()=>{
 const f=fixture();try {
  const s=f.engine.tune({id:'one',plusUntil:10001},path);assert.equal(s.simulation,true);assert.ok(!JSON.stringify(s).includes('audio_url'));
  f.setNow(10001);assert.throws(()=>f.engine.reconnect({id:'one',plusUntil:10001}),/entitlement/);
 }finally{f.close()}
});

test('hierarchy availability awakens with reviewed artists and remains locked without Plus',()=>{
 const f=fixture({minimumArtists:3});try {
  assert.ok(f.engine.navigation(listener).every(o=>o.dormant));
  f.db.prepare('INSERT INTO radio_engine_catalog VALUES (?,?)').run('c',JSON.stringify(track('c')));
  assert.ok(f.engine.navigation(listener).every(o=>!o.dormant));
  const options=f.engine.navigation({id:'free',plusUntil:null});
  assert.ok(options.filter(o=>o.category).every(o=>o.locked));
  assert.equal(options.find(o=>!o.category).locked,false);
 }finally{f.close()}
});
test('future ledger timestamps and invalid reviewed metadata fail closed',()=>{
 const f=fixture();try {
  f.engine.tune(listener,path);f.db.prepare('UPDATE radio_engine_events SET started_at=20000,ended_at=21000').run();
  assert.throws(()=>f.engine.reconnect(listener),/ledger-invalid/);
 }finally{f.close()}
 const g=fixture({tracks:[track('a',{metadataReviewed:false})]});try {
  assert.throws(()=>g.engine.tune(listener,path),/metadata/);
  assert.equal(g.db.prepare('SELECT count(*) n FROM radio_engine_events').get().n,0);
 }finally{g.close()}
});
test('channel review expiry interrupts an active performance, storage failure has no fallback',()=>{
 const f=fixture();try {
  f.engine.tune(listener,path);f.setNow(10200);
  const row=f.db.prepare('SELECT config_json FROM radio_engine_channels WHERE id=?').get('hardcore');
  const c=JSON.parse(row.config_json);c.review.expiresAt=10100;
  f.db.prepare('UPDATE radio_engine_channels SET config_json=? WHERE id=?').run(JSON.stringify(c),'hardcore');
  assert.equal(f.engine.reconnect(listener).status,'silent');
  f.db.exec('DROP TABLE radio_engine_events');assert.throws(()=>f.engine.reconnect(listener),/no such table/);
 }finally{f.close()}
});
test('same-tick withdrawal cancels without inventing elapsed playback',()=>{
 const f=fixture({tracks:[track('a')]});try {
  f.engine.tune(listener,path);f.db.prepare('DELETE FROM radio_engine_catalog').run();
  assert.equal(f.engine.reconnect(listener).status,'silent');
  assert.equal(f.db.prepare('SELECT count(*) n FROM radio_engine_events').get().n,0);
 }finally{f.close()}
});
const dialURL=await moduleAt('../lib/radio-dial.ts');
const {dialChoices,rotateDial,exploreDial,backDial}=await import(dialURL);
test('engine options integrate with dial traversal, wraparound, and category-only commands',()=>{
 const f=fixture();try {
  const options=f.engine.navigation(listener);let state={parent:null,index:0};
  for(const expected of [{genre:'Rock'},{genre:'Rock',subgenre:'Punk'},path]) {
   const choices=dialChoices(options,state);assert.equal(choices.length,1);
   state=rotateDial(state,-1,choices.length);assert.equal(state.index,0);
   const command=choices[state.index].category;assert.deepEqual(command,expected);
   assert.equal(f.engine.tune(listener,command).status,'playing');state=exploreDial(command);
  }
  assert.equal(dialChoices(options,state).length,0);
  assert.deepEqual(backDial(state).parent,{genre:'Rock'});
  assert.equal(rotateDial({parent:null,index:0},-1,3).index,2);
 }finally{f.close()}
});
test('Retrofutura renders engine-provided hierarchy and authoritative snapshot without an audio transport',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const {renderToStaticMarkup}=require('react-dom/server');const React=require('react');
 let source=await readFile(new URL('../components/retrofutura-radio.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};new Function('require','exports',compiled)(name=>name==='../lib/radio-dial'?{backDial,dialChoices,exploreDial,rotateDial}:require(name),exports);
 const f=fixture();try {
  const snapshot=f.engine.tune(listener,path);
  const html=renderToStaticMarkup(React.createElement(exports.RetrofuturaRadio,{options:f.engine.navigation(listener),snapshot,onTune:async()=>{}}));
  for(const text of ['Rock','GENRE','SUBGENRE','STYLE','Push dial to tune category','optional $3/month','Offline engineering preview','SHARED SIGNAL']) assert.ok(html.includes(text),text);
  assert.ok(!html.includes('<audio'));assert.ok(!html.includes('audio_url'));
  assert.ok(html.includes('#ff3ea5'));assert.ok(html.includes('#b6ff32'));
 }finally{f.close()}
});
test('deleted ledger tails and missing decision history cannot reset rolling accounting',()=>{
 for(const table of ['radio_engine_events','radio_engine_decisions']) {
  const f=fixture();try {
   f.engine.tune(listener,path);f.setNow(12000);
   f.db.prepare('DELETE FROM '+table+' WHERE channel_id=?').run('hardcore');
   assert.throws(()=>f.engine.tune({...listener,id:'new'},path),/ledger-incomplete/);
  }finally{f.close()}
 }
});

const transportURL=await moduleAt('../lib/shared-radio-transport.ts');
const {createRadioTransport}=await import(transportURL);
const {forwardRadio}=await import(await moduleAt('../lib/radio-gateway.ts'));
function liveFixture(options={}) {
 const f=fixture(options);
 const engine=new SharedRadioEngine(f.db,()=>liveFixture.now,'live');
 liveFixture.now=10000;
 let authority={...listener,territory:'US'};
 const delivered=[];
 let media=async(id)=>{delivered.push(id);return new Response('fixture-bytes',{headers:{'content-type':'audio/mpeg'}})};
 const handler=createRadioTransport(engine,{authority:async()=>authority,territory:()=> 'US',sourceEligible:async()=>true,media:(...args)=>media(...args)});
 return {...f,engine,handler,delivered,setAuthority(v){authority=v},setMedia(v){media=v}};
}
const tuneRequest=(category=null)=>new Request('https://radio.internal/channel',{method:'POST',body:JSON.stringify({category})});
const audioRequest=s=>new Request(`https://radio.internal/channel/audio?channel=${s.channelId}&sequence=${encodeURIComponent(s.performance.authorityId)}`);
test('live transport returns shared decisions; assigned audio bytes pass live checks',async()=>{
 const f=liveFixture();try{
  const d=await(await f.handler(tuneRequest())).json();assert.equal(d.snapshot.simulation,false);
  assert.equal(d.snapshot.performance.trackId,'a');assert.match(d.mediaUrl,/channel\/audio/);
  const r=await f.handler(audioRequest(d.snapshot));assert.equal(r.status,200);assert.equal(await r.text(),'fixture-bytes');
  assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(f.delivered,['a']);
 }finally{f.close()}
});
test('live statutory-only catalog remains silent even with all synthetic gates',async()=>{
 const f=liveFixture({tracks:[track('a',{permission:{...permission,recording_basis:'statutory'}})]});try{
  const d=await(await f.handler(tuneRequest())).json();assert.equal(d.snapshot.status,'silent');assert.equal(d.mediaUrl,null);
  assert.equal(f.delivered.length,0);
 }finally{f.close()}
});
test('transport rejects individual songs, stale sequences, arbitrary URLs and extra media commands',async()=>{
 const f=liveFixture();try{
  const d=await(await f.handler(tuneRequest())).json();
  for(const path of ['/channel/audio?channel=free&sequence=0','/channel/audio?channel=free&sequence=1&trackId=b','/channel/audio?channel=rock&sequence=1'])
   assert.equal((await f.handler(new Request('https://radio.internal'+path))).status,409);
  assert.equal((await f.handler(tuneRequest({genre:'Rock',trackId:'b'}))).status,503);
  const bad=new Request('https://radio.internal/channel',{method:'POST',body:JSON.stringify({category:null,now:0})});
  assert.equal((await f.handler(bad)).status,400);assert.equal(f.delivered.length,0);
  assert.equal((await f.handler(audioRequest(d.snapshot))).status,200);
 }finally{f.close()}
});
test('withdrawals before media request deny old audio and select eligible replacement',async()=>{
 const f=liveFixture();try{
  const d=await(await f.handler(tuneRequest())).json();liveFixture.now=10200;
  f.db.prepare('UPDATE radio_engine_catalog SET track_json=? WHERE id=?').run(JSON.stringify(track('a',{permission:{...permission,withdrawn_at:10100}})),'a');
  assert.equal((await f.handler(audioRequest(d.snapshot))).status,409);assert.equal(f.delivered.length,0);
  const current=await(await f.handler(new Request('https://radio.internal/channel'))).json();assert.equal(current.snapshot.performance.trackId,'b');
 }finally{f.close()}
});
test('withdrawal during asynchronous media read cancels old delivery',async()=>{
 const f=liveFixture();try{
  const d=await(await f.handler(tuneRequest())).json();
  f.setMedia(async()=>{liveFixture.now=10200;f.db.prepare('DELETE FROM radio_engine_catalog WHERE id=?').run('a');return new Response('must-not-deliver')});
  const r=await f.handler(audioRequest(d.snapshot));assert.equal(r.status,409);assert.equal(await r.text(),'');
 }finally{f.close()}
});
test('live channel switches and reconnect retain server timeline for simultaneous listeners',async()=>{
 const f=liveFixture();try{
  const a=await(await f.handler(tuneRequest(path))).json();liveFixture.now=10200;
  f.setAuthority({...listener,id:'two',territory:'US'});const b=await(await f.handler(tuneRequest(path))).json();
  assert.equal(a.snapshot.performance.sequence,b.snapshot.performance.sequence);assert.equal(b.snapshot.performance.offsetMs,200);
  await f.handler(tuneRequest({genre:'Rock'}));
  assert.equal((await f.handler(audioRequest(a.snapshot))).status,409);
  const back=await(await f.handler(tuneRequest(path))).json();assert.equal(back.snapshot.performance.startedAt,10000);
 }finally{f.close()}
});
test('live authority, Plus entitlement, territory and storage failure never deliver bytes',async()=>{
 const f=liveFixture();try{
  f.setAuthority(null);assert.equal((await f.handler(tuneRequest())).status,401);
  f.setAuthority({id:'free',plusUntil:null,territory:'US'});assert.equal((await f.handler(tuneRequest(path))).status,503);
  f.setAuthority({...listener,territory:'CA'});assert.equal((await f.handler(tuneRequest())).status,403);
  f.setAuthority({...listener,territory:'US'});f.db.exec('DROP TABLE radio_engine_decisions');
  assert.equal((await f.handler(tuneRequest())).status,503);assert.equal(f.delivered.length,0);
 }finally{f.close()}
});
test('empty live catalog provides explicit silence without media fallback',async()=>{
 const f=liveFixture({tracks:[]});try{
  const d=await(await f.handler(tuneRequest())).json();assert.equal(d.snapshot.status,'silent');assert.equal(d.mediaUrl,null);
 }finally{f.close()}
});
test('simulation transport cannot hand out audio even for authorized fixtures',async()=>{
 const f=fixture();try{
  const handler=createRadioTransport(f.engine,{authority:async()=>({...listener,territory:'US'}),territory:()=> 'US',sourceEligible:async()=>true,media:async()=>{throw Error('must never run')}});
  assert.equal((await handler(tuneRequest())).status,503);
 }finally{f.close()}
});
test('gateway strips forged authority and never falls back on missing binding or failed service',async()=>{
 const request=new Request('https://musicbat.audio/api/musicbat/channel',{method:'POST',headers:{origin:'https://musicbat.audio','x-musicbat-listener':'forged'},body:JSON.stringify({category:null})});
 assert.equal((await forwardRadio(request.clone(),undefined,'real')).status,503);
 assert.equal((await forwardRadio(request.clone(),undefined,null)).status,401);
 const service={fetch:async r=>{assert.equal(r.headers.get('x-musicbat-listener'),'real');assert.equal(r.headers.get('x-musicbat-territory'),'unknown');assert.equal(new URL(r.url).pathname,'/channel');return Response.json({ok:true})}};
 assert.equal((await forwardRadio(request.clone(),service,'real')).status,200);
 const cross=new Request(request.clone(),{headers:{origin:'https://evil.example'}});
 assert.equal((await forwardRadio(cross,service,'real')).status,403);
 assert.equal((await forwardRadio(request.clone(),{fetch:async()=>{throw Error('offline')}},'real')).status,503);
});

 test('source-side withdrawal or stale rights deny media even if scheduler catalog still allows it',async()=>{
  const f=liveFixture();try {
   const handler=createRadioTransport(f.engine,{authority:async()=>({...listener,territory:'US'}),territory:()=> 'US',sourceEligible:async()=>false,media:async()=>{throw Error('must never deliver')}});
   const d=await(await handler(tuneRequest())).json();
   assert.equal((await handler(audioRequest(d.snapshot))).status,403);
  }finally{f.close()}
 });
test('private transport rechecks current membership after asynchronous media retrieval',async()=>{
 const f=liveFixture();try {
  let active=true;
  const handler=createRadioTransport(f.engine,{authority:async()=>({...listener,id:'member',territory:'US',plusUntil:active?999999999:null}),
    territory:()=> 'US',sourceEligible:async()=>true,media:async()=>{active=false;return new Response('fixture')}});
  const tuned=await(await handler(new Request('https://radio.internal/channel',{method:'POST',body:JSON.stringify({category:{genre:'Rock'}})}))).json();
  assert.equal((await handler(audioRequest(tuned.snapshot))).status,503);
 }finally{f.close()}
});
