import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {fixture,upload} from './website-fixture.mjs';
import {recoveryProbeId,startRecoveryProbe,stepRecoveryProbe,queueUnattendedProbe,unattendedProbeId} from '../lib/sandbox-recovery-probe.ts';
import {runCheckoutRecovery} from '../app/api/musicbat/stripe/stripe.ts';
const origin='https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site';
test('sandbox D1 probe retains held lease, durable backoff, scoped completion and original paid evidence',async()=>{
 const f=await fixture();const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Probe must not call Stripe')};
 try{
  await upload(f.route);
  f.sqlite.prepare(`INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,artist_id,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,processing_cents,processor_account_id)
    VALUES('c985ed12-4f04-41cc-80cb-961830651251','original',1,'Original','Artist','owner','fixture','paid',200,170,30,37,'acct_fixture')`).run();
  const runtime={...f.state.env,MUSICBAT_BASE_URL:origin,MUSICBAT_STRIPE_MODE:'test'};
  const source=f.sqlite.prepare("SELECT * FROM purchases WHERE buyer_hash='original'").get();
  const started=await startRecoveryProbe(runtime);assert.equal(started.state,'running');
  assert.equal((await stepRecoveryProbe(runtime)).processed,0);
  f.sqlite.prepare('UPDATE checkout_recovery_jobs SET lease_until=0 WHERE purchase_id=?').run(recoveryProbeId);
  const failed=await stepRecoveryProbe(runtime);assert.equal(failed.processed,1);assert.equal(failed.job.state,'retrying');assert.equal(failed.job.last_error,'processor_temporarily_unavailable');
  assert.ok(failed.job.next_attempt_at>Date.now());assert.equal((await stepRecoveryProbe(runtime)).processed,0);
  assert.equal((await startRecoveryProbe(runtime)).attempts,1,'repeat start cannot reset retry budget');
  f.sqlite.prepare('UPDATE checkout_recovery_jobs SET next_attempt_at=0 WHERE purchase_id=?').run(recoveryProbeId);
  const recovered=await stepRecoveryProbe(runtime);assert.equal(recovered.job.state,'completed');assert.equal(recovered.job.status,'cancelled');assert.equal(recovered.job.attempts,2);
  assert.equal((await stepRecoveryProbe(runtime)).processed,0);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM purchases WHERE buyer_hash='original'").get(),source);
 }finally{globalThis.fetch=original;f.sqlite.close();}
});
test('probe helpers reject production before any database operation',async()=>{
 const runtime={MUSICBAT_BASE_URL:'https://musicbat.audio',MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',DB:{prepare(){throw new Error('DB touched')}}};
 await assert.rejects(startRecoveryProbe(runtime),/Sandbox probe only/);await assert.rejects(stepRecoveryProbe(runtime),/Sandbox probe only/);
 await assert.rejects(queueUnattendedProbe(runtime),/Sandbox probe only/);
});
test('unattended fixture queues a future retry without payment, entitlement, processor calls or resetting its budget',async()=>{
 const f=await fixture();const original=globalThis.fetch;let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw new Error('No processor call allowed')};
 try{
  await upload(f.route);
  f.sqlite.prepare(`INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,artist_id,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,processing_cents)
    VALUES('c985ed12-4f04-41cc-80cb-961830651251','original',1,'Original','Artist','owner','original-audio','paid',200,170,30,37)`).run();
  const runtime={...f.state.env,MUSICBAT_BASE_URL:origin,MUSICBAT_STRIPE_MODE:'test'};
  const queued=await queueUnattendedProbe(runtime);assert.equal(queued.state,'retrying');assert.equal(queued.attempts,1);assert.ok(queued.next_attempt_at>=Date.now()+59000);
  const order=f.sqlite.prepare('SELECT * FROM purchases WHERE id=?').get(unattendedProbeId);
  assert.equal(order.status,'refunded');assert.equal(order.amount_cents,0);assert.equal(order.processor_session_id,null);assert.equal(order.payment_intent_id,null);
  assert.equal((await runCheckoutRecovery(runtime,{purchaseId:unattendedProbeId})).processed,0);
  assert.deepEqual(await queueUnattendedProbe(runtime),queued);
  assert.equal((await runCheckoutRecovery(runtime,{purchaseId:unattendedProbeId,now:queued.next_attempt_at+1})).processed,1);
  const completed=await queueUnattendedProbe(runtime);assert.equal(completed.state,'completed');assert.equal(completed.attempts,2);assert.equal(completed.lease_until,0);assert.equal(completed.last_error,null);
  assert.equal(networkCalls,0);assert.equal(f.sqlite.prepare("SELECT status FROM purchases WHERE buyer_hash='original'").get().status,'paid');
 }finally{globalThis.fetch=original;f.sqlite.close();}
});
test('hosted probe requires sandbox owner, same origin, bounded body and fixed operation',async()=>{
 const raw=readFileSync('app/api/musicbat/sandbox/recovery-probe/route.ts','utf8')
  .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.probeTest.env;')
  .replace("import {getChatGPTUser} from '../../../../chatgpt-auth';",'const getChatGPTUser=async()=>globalThis.probeTest.user;')
  .replace(/import \{recoveryProbeStatus,startRecoveryProbe,stepRecoveryProbe\} from '[^']+';/,'const {recoveryProbeStatus,startRecoveryProbe,stepRecoveryProbe}=globalThis.probeTest;');
 let calls=0;globalThis.probeTest={env:{DB:{},MUSICBAT_BASE_URL:origin,MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',MUSICBAT_ACCEPTANCE_OWNER_ID:'owner'},user:null,recoveryProbeStatus:async()=>null,startRecoveryProbe:async()=>{calls++;},stepRecoveryProbe:async()=>{calls++;}};
 const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 // Resolve the unchanged relative Stripe import against this file's app module.
 const handler=await import('data:text/javascript;base64,'+Buffer.from(js.replace("from '../../stripe/stripe'",`from '${new URL('../app/api/musicbat/stripe/stripe.ts',import.meta.url).href}'`)).toString('base64'));
 const request=(body='operation=start',requestOrigin=origin)=>new Request(origin+'/api/musicbat/sandbox/recovery-probe',{method:'POST',headers:{origin:requestOrigin},body});
 assert.equal((await handler.POST(request())).status,404);globalThis.probeTest.user={userId:'other'};assert.equal((await handler.POST(request())).status,404);
 globalThis.probeTest.user={userId:'owner'};assert.equal((await handler.POST(request('operation=start','https://evil.invalid'))).status,403);
 assert.equal((await handler.POST(request('x'.repeat(1025)))).status,413);assert.equal((await handler.POST(request('operation=delete'))).status,400);assert.equal(calls,0);
 assert.equal((await handler.POST(request())).status,200);assert.equal(calls,1);
});
