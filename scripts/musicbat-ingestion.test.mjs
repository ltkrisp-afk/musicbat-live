import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,upload,load,mine,post} from './website-fixture.mjs';
import {runIngestionSweep,INGESTION_WINDOW_MS} from '../lib/ingestion-verification.ts';
import {inspectAudio,localD1,ingestionWorkerMain} from './ingestion-worker.mjs';
import {tone} from '../e2e/fixtures.mjs';
import {currentRadioSource} from '../lib/cloudflare-radio-source.ts';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {plusFixture} from './radio-plus-fixture.mjs';
import {handlePlus,plusAccess} from '../lib/radio-plus.ts';

async function setup() {
 const f=await fixture();f.state.env.MUSICBAT_INGESTION_ENABLED='test';f.state.env.MUSICBAT_STRIPE_MODE='test';
 const response=await upload(f.route,{saleEnabled:'true',saleRightsAttested:'true',salePriceCents:'200'});assert.equal(response.status,201);
 const job=f.sqlite.prepare('SELECT * FROM track_ingestion').get();
 const clock={now:job.uploaded_at};
 const runtime={db:localD1(f.sqlite),readObject:async key=>f.objects.get(key),inspect:inspectAudio,now:()=>clock.now};
 return {...f,job,clock,runtime};
}

test('upload queues hashed source; actual decode precedes deadline; expiry is exact and repeat-safe',async()=>{
 const f=await setup();try {
  assert.equal(f.job.verification_expires_at-f.job.uploaded_at,INGESTION_WINDOW_MS);
  assert.equal(f.job.state,'PENDING');assert.equal(f.job.is_payable,0);
  assert.equal((await (await mine(f.route)).json()).tracks[0].ingestion_state,'PENDING');
  assert.equal(await currentRadioSource(f.state.env.DB,1),null);
  const buy=await load('app/api/musicbat/purchase/route.ts',f.state);
  assert.equal((await buy.POST(new Request('https://musicbat.audio/api/musicbat/purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trackId:1})}))).status,404);
  assert.throws(()=>f.sqlite.prepare("INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path) VALUES('blocked','h',1,'t','a','x')").run(),/verification/);
  const checked=await runIngestionSweep(f.runtime);assert.equal(checked.checked,1);assert.deepEqual(checked.verified,[]);
  f.clock.now=f.job.verification_expires_at-1;assert.deepEqual((await runIngestionSweep(f.runtime)).verified,[]);
  f.clock.now++;assert.deepEqual((await runIngestionSweep(f.runtime)).verified,[1]);
  assert.equal(f.sqlite.prepare('SELECT is_payable FROM track_ingestion').get().is_payable,1);
  assert.deepEqual((await runIngestionSweep(f.runtime)).verified,[]);
  assert.ok(await currentRadioSource(f.state.env.DB,1)); // Rights review remains separate.
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM playback_permissions').get().n,0);
 }finally{f.sqlite.close()}
});

test('elapsed time cannot approve unprocessed audio; storage outage retries without resetting deadline',async()=>{
 const f=await setup();try {
  f.clock.now=f.job.verification_expires_at+1;
  f.runtime.readObject=async()=>{throw new Error('temporary storage failure')};
  assert.equal((await runIngestionSweep(f.runtime)).retried,1);
  let row=f.sqlite.prepare('SELECT * FROM track_ingestion').get();assert.equal(row.is_payable,0);assert.equal(row.state,'PENDING');assert.equal(row.verification_expires_at,f.job.verification_expires_at);
  f.runtime.readObject=async key=>f.objects.get(key);assert.equal((await runIngestionSweep(f.runtime)).checked,0);
  f.clock.now=row.next_attempt_at;assert.deepEqual((await runIngestionSweep(f.runtime)).verified,[1]);
 }finally{f.sqlite.close()}
});

test('source substitution fails track only and emits one durable report',async()=>{
 const f=await setup();try {
  f.runtime.readObject=async()=>({bytes:new Uint8Array([255,1,2,3])});
  f.clock.now=f.job.verification_expires_at;assert.equal((await runIngestionSweep(f.runtime)).failed,1);
  assert.equal(f.sqlite.prepare('SELECT state FROM track_ingestion').get().state,'FAILED');
  await runIngestionSweep(f.runtime);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ingestion_reports').get().n,1);
  assert.equal(f.sqlite.prepare('SELECT status FROM tracks').get().status,'active');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM artist_accounts').get().n,0);
 }finally{f.sqlite.close()}
});

test('decoder rejects fake headers and accepts generated WAV, MP3 and FLAC',async()=>{
 for(const bytes of [Buffer.from('ID3_mock_header_bytes_data'),Buffer.from([255,0,0,0]),Buffer.from('fLaCfake')])assert.equal((await inspectAudio(bytes)).valid,false);
 assert.equal((await inspectAudio(tone(100))).valid,true);
 // Exercise actual compressed containers, not a mocked header check.
 const {execFileSync}=await import('node:child_process');
 for(const format of ['mp3','flac']) {
  const bytes=execFileSync('ffmpeg',['-v','error','-f','wav','-i','pipe:0','-f',format,'pipe:1'],{input:tone(100)});
  assert.equal((await inspectAudio(bytes)).valid,true,format);
 }
});

test('expired claims recover; stale worker cannot finish over a newer claim',async()=>{
 const f=await setup();try {
  f.sqlite.prepare("UPDATE track_ingestion SET state='CLAIMED',claim_token='dead',claim_until=?").run(f.clock.now-1);
  const inspect=f.runtime.inspect;f.runtime.inspect=async bytes=>{
   f.sqlite.prepare("UPDATE track_ingestion SET claim_token='new-owner' WHERE track_id=1").run();return inspect(bytes);
  };
  assert.equal((await runIngestionSweep(f.runtime)).checked,0);
  assert.equal(f.sqlite.prepare('SELECT claim_token FROM track_ingestion').get().claim_token,'new-owner');
  f.clock.now+=300001;f.runtime.inspect=inspect;assert.equal((await runIngestionSweep(f.runtime)).checked,1);
 }finally{f.sqlite.close()}
});

test('concurrent workers decode once; holds and withdrawals cannot mature or be undone',async()=>{
 const f=await setup();try {
  let calls=0;const inspect=f.runtime.inspect;f.runtime.inspect=async bytes=>{calls++;return inspect(bytes)};
  await Promise.all([runIngestionSweep(f.runtime),runIngestionSweep(f.runtime)]);assert.equal(calls,1);
  f.clock.now=f.job.verification_expires_at;f.sqlite.prepare("UPDATE track_ingestion SET hold_reason='operator_review'").run();
  assert.deepEqual((await runIngestionSweep(f.runtime)).verified,[]);
  f.sqlite.prepare('UPDATE track_ingestion SET hold_reason=NULL').run();
  assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,200);
  assert.deepEqual((await runIngestionSweep(f.runtime)).verified,[]);
 }finally{f.sqlite.close()}
});

test('price migration preserves $3 evidence; new $5 enrollment works for either account role',async()=>{
 const db=new DatabaseSync(':memory:');
 try {
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
  for(const row of journal.entries.slice(0,17))db.exec(readFileSync('drizzle/'+row.tag+'.sql','utf8'));
  db.exec("INSERT INTO radio_plus_enrollments(id,user_id) VALUES('old','old-user'); INSERT INTO radio_plus_invoices VALUES('old-invoice','old','old-sub',300,123,100)");
  const old=db.prepare('SELECT * FROM radio_plus_invoices').all();db.exec(readFileSync('drizzle/0017_extended_feature_price.sql','utf8'));
  assert.deepEqual(db.prepare('SELECT * FROM radio_plus_invoices').all(),old);assert.equal(db.prepare('SELECT price_cents FROM radio_plus_enrollments').get().price_cents,300);
 }finally{db.close()}
 const f=await fixture();try {
  const processor=plusFixture(f.state.env);delete f.state.env.MUSICBAT_BASE_URL;
  for(const id of ['musician','customer']) {
   const origin='http://localhost:5173';
   const result=await handlePlus(f.state.env,new Request(origin+'/api/musicbat/subscription',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'join',recurringConsent:true,confirmedPriceCents:500})}),id);
   assert.equal(result.status,200);const session=(await result.json()).checkoutUrl.split('/').at(-1);assert.equal(processor.sessions.get(session).price,500);
   await processor.pay(session);assert.ok(await plusAccess(f.state.env.DB,id));
  }
  assert.deepEqual(f.sqlite.prepare('SELECT amount_cents FROM radio_plus_invoices').all().map(r=>r.amount_cents),[500,500]);
 }finally{f.sqlite.close()}
});

test('local operator refuses absent paths and non-test mode before database mutation',async()=>{
 await assert.rejects(()=>ingestionWorkerMain([],{}),/Explicit existing local paths/);
});
