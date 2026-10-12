import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RadioRuntime } from '../radio/runtime.ts';
import { seedRuntime } from '../e2e/fixtures.mjs';
const token='test-private-gateway-'.repeat(3);
async function fixture() {
 const dir=await mkdtemp(join(tmpdir(),'musicbat-runtime-'));let now=Date.now();
 const options={databasePath:join(dir,'radio.sqlite'),assetRoot:dir,gatewayToken:token,clock:()=>now};
 const runtime=new RadioRuntime(options);await seedRuntime(runtime,dir,{now});
 return {dir,runtime,options,get now(){return now},advance(ms){now+=ms},async close(){this.runtime.close();await rm(dir,{recursive:true,force:true})}};
}
function request(path='/channel',opts={},id='listener-one') {
 return new Request('https://radio.internal'+path,{...opts,headers:{authorization:'Bearer '+token,'x-musicbat-listener':id,'x-musicbat-territory':'US',...opts.headers}});
}
async function current(f,id) {const r=await f.runtime.fetch(request('/channel',{},id));assert.equal(r.status,200);return r.json()}
function mediaPath(d){return d.mediaUrl.replace('/api/musicbat','')}
test('private runtime authenticates gateway, autojoins first Play, rejects listener entitlement/track injection',async()=>{
 const f=await fixture();try {
  assert.equal((await f.runtime.fetch(new Request('https://radio.internal/channel',{headers:{'x-musicbat-listener':'listener-one'}}))).status,401);
  const d=await current(f);assert.equal(d.snapshot.simulation,false);assert.equal(d.snapshot.status,'playing');
  for(const body of [{category:null,plusUntil:Number.MAX_SAFE_INTEGER},{category:{genre:'Rock',trackId:'a'}}]) {
   const r=await f.runtime.fetch(request('/channel',{method:'POST',body:JSON.stringify(body)}));assert.ok([400,503].includes(r.status));
  }
  const r=await f.runtime.fetch(request('/channel',{method:'POST',body:JSON.stringify({category:{genre:'Rock'}})},'free-user'));assert.equal(r.status,503);
 }finally{await f.close()}
});
test('real immutable audio, ranges, suffix, If-Range and HEAD verify bytes and current performance',async()=>{
 const f=await fixture();try {
  const d=await current(f);const p=mediaPath(d);
  const full=await f.runtime.fetch(request(p));assert.equal(full.status,200);const bytes=new Uint8Array(await full.arrayBuffer());assert.equal(Buffer.from(bytes.subarray(8,12)).toString(),'WAVE');
  const part=await f.runtime.fetch(request(p,{headers:{range:'bytes=8-11'}}));assert.equal(part.status,206);assert.equal(await part.text(),'WAVE');
  const suffix=await f.runtime.fetch(request(p,{headers:{range:'bytes=-10'}}));assert.equal(suffix.status,206);assert.equal((await suffix.arrayBuffer()).byteLength,10);
  const head=await f.runtime.fetch(request(p,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal(await head.text(),'');
  for(const range of ['bytes=-0','bytes=999999999-','bytes=4-1','bytes=1-2,4-5']) assert.equal((await f.runtime.fetch(request(p,{headers:{range}}))).status,416);
  assert.equal((await f.runtime.fetch(request(p,{headers:{range:'bytes=8-11','if-range':'wrong'}}))).status,200);
  assert.equal((await f.runtime.fetch(request(p+'&track=a'))).status,409);
  f.advance(12001);assert.equal((await f.runtime.fetch(request(p))).status,409);
 }finally{await f.close()}
});
test('withdrawals, missing grants, damaged assets, changed metadata and expired membership fail closed',async()=>{
 const f=await fixture();try {
  let d=await current(f);const old=mediaPath(d);f.advance(100);f.runtime.withdraw('a','test withdrawal');
  assert.equal((await f.runtime.fetch(request(old))).status,409);d=await current(f);assert.equal(d.snapshot.performance.trackId,'b');
  await writeFile(join(f.dir,'b.wav'),'corrupt');assert.equal((await f.runtime.fetch(request(mediaPath(d)))).status,403);
  f.runtime.db.prepare("UPDATE radio_sources SET status='withdrawn' WHERE id='b'").run();assert.equal((await f.runtime.fetch(request(mediaPath(d)))).status,403);
  f.runtime.setMembership('listener-one',f.now-1,'expired test');
  assert.equal((await f.runtime.fetch(request('/channel',{method:'POST',body:JSON.stringify({category:{genre:'Rock'}})}))).status,503);
 }finally{await f.close()}
});
test('runtime restart preserves ledger, shared listener assignment and server offset; silent catalog never bypasses rights',async()=>{
 const f=await fixture();try {
  const a=await current(f),b=await current(f,'listener-two');assert.equal(a.snapshot.performance.sequence,b.snapshot.performance.sequence);
  const before=f.runtime.db.prepare('SELECT count(*) n FROM radio_engine_events').get().n;
  f.runtime.close();f.advance(500);f.runtime=new RadioRuntime(f.options);
  const after=await current(f);assert.equal(after.snapshot.performance.sequence,a.snapshot.performance.sequence);assert.equal(after.snapshot.performance.offsetMs,500);
  assert.equal(f.runtime.db.prepare('SELECT count(*) n FROM radio_engine_events').get().n,before);
  for(const id of ['a','b','c'])f.runtime.withdraw(id,'empty test');
  assert.equal((await current(f)).snapshot.status,'silent');assert.equal((await f.runtime.fetch(request(mediaPath(a)))).status,409);
 }finally{await f.close()}
});
test('continuous timer advances without listeners and records silence gaps on downtime rather than invented transmissions',async()=>{
 const f=await fixture();try {
  f.runtime.start();const initial=f.runtime.db.prepare("SELECT * FROM radio_engine_events WHERE channel_id='free'").get();assert.ok(initial);
  f.advance(12001);await new Promise(r=>setTimeout(r,150));
  assert.equal(f.runtime.db.prepare("SELECT count(*) n FROM radio_engine_events WHERE channel_id='free'").get().n,2);
  const d=await current(f);assert.equal(d.snapshot.performance.trackId,'b');
 }finally{await f.close()}
});
test('ledger corruption halts authority and repair resumes without replacing the ledger',async()=>{
 const f=await fixture();try {
  f.runtime.tick();f.runtime.db.prepare("UPDATE radio_engine_channels SET ledger_sequence=100 WHERE id='free'").run();
  assert.throws(()=>f.runtime.tick(),/ledger-incomplete/);assert.equal((await f.runtime.fetch(request())).status,503);
  f.runtime.db.prepare("UPDATE radio_engine_channels SET ledger_sequence=1 WHERE id='free'").run();f.runtime.tick();assert.equal((await f.runtime.fetch(request())).status,200);
 }finally{await f.close()}
});
test('reviewed import rejects missing evidence, statutory sources, byte mismatch and false duration',async()=>{
 const f=await fixture();try {
  const source=f.runtime.db.prepare("SELECT * FROM radio_sources WHERE id='a'").get();const track=JSON.parse(source.track_json),asset=JSON.parse(source.asset_json);
  for(const changes of [{lawfulCopyReference:''},{restrictionsReviewed:false},{sha256:'0'.repeat(64)},{path:'../a.wav'}])assert.throws(()=>f.runtime.publishSource(track,{...asset,...changes}));
  assert.throws(()=>f.runtime.publishSource({...track,durationMs:13000},asset),/duration-mismatch/);
  assert.throws(()=>f.runtime.publishSource({...track,permission:{...track.permission,composition_evidence:''}},asset),/permissions-required/);
  assert.throws(()=>f.runtime.publishSource({...track,permission:{...track.permission,recording_basis:'statutory'}},asset),/direct-source-required/);
 }finally{await f.close()}
});
test('same-tick cancellation never reuses an old media authority despite a reused ledger sequence',async()=>{
 const f=await fixture();try {
  const before=await current(f);f.runtime.withdraw(before.snapshot.performance.trackId,'same instant withdrawal');
  const after=await current(f);assert.equal(before.snapshot.performance.sequence,after.snapshot.performance.sequence);
  assert.notEqual(before.snapshot.performance.authorityId,after.snapshot.performance.authorityId);
  assert.notEqual(before.mediaUrl,after.mediaUrl);
  assert.equal((await f.runtime.fetch(request(mediaPath(before)))).status,409);
  assert.equal((await f.runtime.fetch(request(mediaPath(after)))).status,200);
 }finally{await f.close()}
});
test('direct contract repetition limits stop a small catalog without statutory activation',async()=>{
 const f=await fixture();try {
  for(const id of ['b','c'])f.runtime.withdraw(id,'direct restriction fixture');
  const s=f.runtime.db.prepare("SELECT * FROM radio_sources WHERE id='a'").get();const track=JSON.parse(s.track_json);
  f.runtime.publishSource({...track,directRestrictions:{maxPlays:1,windowMs:60000,minRepeatGapMs:5000}},JSON.parse(s.asset_json));
  const first=await current(f);assert.equal(first.snapshot.status,'playing');f.advance(12000);
  assert.equal((await current(f)).snapshot.status,'silent');f.advance(61000);assert.equal((await current(f)).snapshot.status,'playing');
 }finally{await f.close()}
});
test('source asset replacement changes the performance authority rather than mutating current audio',async()=>{
 const f=await fixture();try {
  const before=await current(f);const a=f.runtime.db.prepare("SELECT * FROM radio_sources WHERE id='a'").get();const b=f.runtime.db.prepare("SELECT * FROM radio_sources WHERE id='b'").get();
  f.advance(100);f.runtime.publishSource(JSON.parse(a.track_json),JSON.parse(b.asset_json));
  const after=await current(f);assert.notEqual(before.snapshot.performance.authorityId,after.snapshot.performance.authorityId);
  assert.equal((await f.runtime.fetch(request(mediaPath(before)))).status,409);
 }finally{await f.close()}
});
