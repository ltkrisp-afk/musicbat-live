import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setup,order,paid,access} from './checkout-recovery-fixture.mjs';
import {d1} from './website-fixture.mjs';
import {runCheckoutRecovery,checkoutRetryDelay,checkoutRecoveryStatus,expireWithdrawnCheckouts} from '../app/api/musicbat/stripe/stripe.ts';
const job=f=>f.sqlite.prepare('SELECT * FROM checkout_recovery_jobs WHERE purchase_id=?').get(order(f).id);
const withdraw=f=>f.sqlite.exec('UPDATE tracks SET sale_enabled=0 WHERE id=1');
const run=(f,options={})=>runCheckoutRecovery(f.state.env,options);
const evidence=(f,second,id='evt_evidence')=>f.events.push({id,type:'checkout.session.completed',created:second,livemode:false,data:{object:{id:[...f.sessions.keys()][0],livemode:false,payment_status:'paid'}}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};

test('exponential backoff is bounded, deterministic and survives a closed file-backed DB',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bat-recovery-')),path=join(dir,'state.sqlite'),f=await setup(path);let reopened;
  try{
    await f.buy();withdraw(f);const processor=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline')};
    const before=Date.now();await run(f);const first=job(f);
    assert.equal(first.state,'retrying');assert.equal(first.attempts,1);
    assert.ok(first.next_attempt_at>=before+5000);assert.equal((await run(f)).processed,0);
    f.sqlite.close();reopened=new DatabaseSync(path);f.state.env.DB=d1(reopened);globalThis.fetch=processor;
    const result=await run(f,{now:first.next_attempt_at+1});assert.equal(result.processed,1);
    assert.equal(reopened.prepare('SELECT state FROM checkout_recovery_jobs').get().state,'completed');
    assert.equal(reopened.prepare('SELECT status FROM purchases').get().status,'cancelled');
    assert.ok(checkoutRetryDelay(2,'x')>checkoutRetryDelay(1,'x'));
    assert.equal(checkoutRetryDelay(100,'x'),3600000);
  }finally{reopened?.close();f.close();await rm(dir,{recursive:true,force:true})}
});

test('two independent SQLite worker connections claim one job and send one expiration',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bat-two-workers-')),path=join(dir,'state.sqlite'),f=await setup(path);let other;
  try{
    await f.buy();withdraw(f);other=new DatabaseSync(path);const gate=deferred(),entered=deferred();const processor=globalThis.fetch;
    globalThis.fetch=async(url,init)=>{if(init.method==='GET'&&String(url).includes('/checkout/sessions/')){entered.resolve();await gate.promise}return processor(url,init)};
    const a=run(f);await entered.promise;
    const b=await runCheckoutRecovery({...f.state.env,DB:d1(other)});assert.equal(b.processed,0);
    gate.resolve();assert.equal((await a).processed,1);assert.equal(job(f).state,'completed');
    assert.equal(f.calls.filter(c=>c.path.endsWith('/expire')).length,1);
  }finally{other?.close();f.close();await rm(dir,{recursive:true,force:true})}
});

test('abandoned lease is reclaimed after restart and stale worker cannot overwrite new owner',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);const gate=deferred(),entered=deferred(),processor=globalThis.fetch;let once=true;
    globalThis.fetch=async(url,init)=>{const response=await processor(url,init);if(once&&init.method==='GET'){once=false;entered.resolve();await gate.promise}return response};
    const stale=run(f);await entered.promise;
    const lease=job(f).lease_until;
    assert.equal((await run(f,{now:lease+1})).processed,1);assert.equal(job(f).state,'completed');
    gate.resolve();await stale;
    assert.equal(job(f).state,'completed');assert.equal(order(f).status,'cancelled');
    assert.equal(f.calls.filter(c=>c.path.endsWith('/expire')).length,1);
  }finally{f.close()}
});

for(const status of [429,500,503])test('HTTP '+status+' schedules automatic retry without restoring sale permissions',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);globalThis.fetch=async()=>Response.json({error:{message:'fixture outage'}},{status});
    const saved=console.error;console.error=()=>{};try{await run(f)}finally{console.error=saved}
    assert.equal(job(f).state,'retrying');assert.equal(order(f).cleanup_state,'retry');
    assert.equal(f.sqlite.prepare('SELECT sale_enabled FROM tracks').get().sale_enabled,0);
    assert.equal((await f.buy()).status,409);
  }finally{f.close()}
});

test('retry exhaustion stays visible and repeated withdrawals cannot reset its budget',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);globalThis.fetch=async()=>{throw new Error('network unavailable')};
    let now=Date.now();for(let n=1;n<=10;n++){
      await run(f,{now});assert.equal(job(f).attempts,n);now=job(f).next_attempt_at+1;
    }
    assert.equal(job(f).state,'exhausted');assert.match(job(f).last_error,/retry_exhausted/);
    withdraw(f);assert.equal((await run(f,{now})).processed,0);assert.equal(job(f).attempts,10);
    assert.equal(order(f).status,'pending');assert.equal((await access(f)).status,402);
  }finally{f.close()}
});

test('a tenth crashed attempt expires into exhausted instead of an eleventh processor call',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);f.sqlite.exec("UPDATE checkout_recovery_jobs SET state='running',attempts=10,lease_until=1,lease_token='abandoned'");
    const calls=f.calls.length;assert.equal((await run(f)).processed,0);
    assert.equal(job(f).state,'exhausted');assert.equal(f.calls.length,calls);
  }finally{f.close()}
});

for(const timing of ['before','after','same-second','missing'])test('authoritative paid recovery '+timing+' cutoff grants only proven earlier purchases',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);paid(f);const second=Math.floor(order(f).sale_withdrawn_at/1000);
    if(timing!=='missing')evidence(f,timing==='before'?second-2:timing==='after'?second+2:second);
    await run(f);assert.equal(order(f).status,timing==='before'?'paid':'payment_review');
    assert.equal(job(f).state,timing==='before'?'completed':'review');assert.equal((await access(f)).status,timing==='before'?200:402);
    assert.deepEqual([order(f).amount_cents,order(f).artist_share_cents,order(f).platform_fee_cents,order(f).processing_cents],[200,170,30,37]);
    assert.equal(f.calls.filter(c=>c.path.endsWith('/expire')).length,0);
  }finally{f.close()}
});

test('late signed webhook resolves proven earlier payment after worker review; replay has one event ledger row',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);paid(f);await run(f);assert.equal(job(f).state,'review');
    const created=Math.floor(order(f).sale_withdrawn_at/1000)-2;
    assert.deepEqual((await Promise.all([f.send({created}),f.send({created})])).map(r=>r.status),[200,200]);
    assert.equal(order(f).status,'paid');assert.equal(job(f).state,'completed');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM checkout_payment_evidence').get().n,1);
    assert.equal((await access(f)).status,200);
  }finally{f.close()}
});

test('new withdrawal during recovery GET is revalidated before granting an active payment',async()=>{
  const f=await setup();try{
    await f.buy();paid(f);f.sqlite.exec("UPDATE purchases SET cleanup_state='retry'");
    // Existing successful draft job is complete; seed only this unresolved operation.
    f.sqlite.exec("UPDATE checkout_recovery_jobs SET state='pending',next_attempt_at=0");
    const processor=globalThis.fetch;globalThis.fetch=async(url,init)=>{const response=await processor(url,init);if(String(url).includes('/checkout/sessions/'))withdraw(f);return response};
    await run(f);assert.equal(order(f).status,'payment_review');assert.equal(job(f).state,'review');
    assert.equal((await access(f)).status,402);
  }finally{f.close()}
});

test('lost creation response discovers existing Session by metadata without a second create',async()=>{
  const f=await setup();try{
    const processor=globalThis.fetch;globalThis.fetch=async(url,init)=>{const response=await processor(url,init);if(init.method==='POST'&&new URL(url).pathname==='/v1/checkout/sessions')throw new Error('lost creation response');return response};
    const saved=console.error;console.error=()=>{};try{assert.equal((await f.buy()).status,503)}finally{console.error=saved}
    globalThis.fetch=processor;withdraw(f);await run(f);
    assert.equal(order(f).processor_session_id,'cs_test_0');assert.equal(job(f).state,'completed');assert.equal(order(f).status,'cancelled');
    assert.equal(f.calls.filter(c=>c.path==='/v1/checkout/sessions'&&c.init.method==='POST').length,1);
  }finally{f.close()}
});

test('unidentified Session scan persists its cursor, never recreates, then discovers and expires the existing session',async()=>{
  const f=await setup();try{
    await f.buy();f.sqlite.exec("UPDATE purchases SET processor_session_id=NULL,cleanup_state='retry'");withdraw(f);
    const processor=globalThis.fetch;let pages=0;
    globalThis.fetch=async(url,init)=>{
      if(new URL(url).pathname==='/v1/checkout/sessions'&&init.method==='GET'){
        pages++;if(pages===1)return Response.json({data:[{id:'cs_other',livemode:false,metadata:{}}],has_more:true});
        assert.equal(new URL(url).searchParams.get('starting_after'),'cs_other');
      }
      return processor(url,init);
    };
    await run(f);assert.equal(job(f).scan_cursor,'cs_other');assert.equal(job(f).state,'retrying');
    await run(f,{now:job(f).next_attempt_at+1});assert.equal(job(f).state,'completed');assert.equal(f.sessions.size,1);
  }finally{f.close()}
});

for(const amount of [50,237])test('recovery verifies '+(amount===237?'full':'partial')+' refund before granting access',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);const session=paid(f);session.payment_intent.latest_charge.amount_refunded=amount;session.payment_intent.latest_charge.refunded=amount===237;
    evidence(f,Math.floor(order(f).sale_withdrawn_at/1000)-2);await run(f);
    assert.equal(order(f).status,amount===237?'refunded':'paid');assert.equal(job(f).state,'completed');assert.equal((await access(f)).status,amount===237?402:200);
  }finally{f.close()}
});

test('paid or refunded webhook while a worker waits fences the stale mutation and preserves historical ledger',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);const gate=deferred(),entered=deferred(),processor=globalThis.fetch;let once=true;
    globalThis.fetch=async(url,init)=>{const response=await processor(url,init);if(once&&init.method==='GET'){once=false;entered.resolve();await gate.promise}return response};
    const pending=run(f);await entered.promise;
    f.sqlite.exec("UPDATE purchases SET status='refunded',payment_intent_id='pi_historical'");
    gate.resolve();await pending;assert.equal(order(f).status,'refunded');assert.equal(job(f).state,'completed');
    assert.equal(f.calls.filter(c=>c.path.endsWith('/expire')).length,0);assert.equal(order(f).artist_share_cents,170);
  }finally{f.close()}
});

test('permanent processor authorization errors enter review and status stays private to track authority',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);globalThis.fetch=async()=>Response.json({error:{message:'denied'}},{status:403});
    const saved=console.error;console.error=()=>{};try{await run(f)}finally{console.error=saved}
    assert.equal(job(f).state,'review');assert.deepEqual(await checkoutRecoveryStatus(f.state.env),{review:1});
    let r=await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=checkout-cleanup'));
    assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal((await r.json()).operations[0].state,'review');
    f.state.user={userId:'stranger'};r=await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=checkout-cleanup'));assert.deepEqual((await r.json()).operations,[]);
    f.state.user=null;r=await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=checkout-cleanup'));assert.equal(r.status,401);
  }finally{f.close()}
});

test('local runner rejects live credentials before database mutation and status mode is read-only',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bat-runner-')),path=join(dir,'state.sqlite'),f=await setup(path);
  try{
    await f.buy();withdraw(f);const args=['--import','./scripts/register-typescript.mjs','scripts/checkout-recovery-worker.mjs','--db',path];
    const rejected=spawnSync(process.execPath,[...args,'--once'],{encoding:'utf8',env:{...process.env,MUSICBAT_STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture'}});
    assert.equal(rejected.status,1);assert.equal(job(f).attempts,0);assert.doesNotMatch(rejected.stderr,/sk_live_fixture/);
    const status=spawnSync(process.execPath,[...args,'--status'],{encoding:'utf8'});assert.equal(status.status,0);
    assert.deepEqual(JSON.parse(status.stdout).states,{pending:1});assert.equal(job(f).attempts,0);
  }finally{f.close();await rm(dir,{recursive:true,force:true})}
});


test('automatic runner executes a real local worker pass, reports completion and shuts down on SIGTERM',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bat-automatic-')),path=join(dir,'state.sqlite'),f=await setup(path);let child;
  try{
    await f.buy();withdraw(f);const preload=join(dir,'processor.mjs');
    await writeFile(preload,`globalThis.fetch=async(url,init)=>Response.json({id:'cs_test_0',livemode:false,status:String(url).endsWith('/expire')?'expired':'open',payment_status:'unpaid'});`);
    let output='',errors='';
    child=spawn(process.execPath,['--import','./scripts/register-typescript.mjs','--import',preload,'scripts/checkout-recovery-worker.mjs','--db',path],{env:{...process.env,MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_child_fixture'},stdio:['ignore','pipe','pipe']});
    const done=new Promise((resolve,reject)=>{
      const deadline=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('worker shutdown timed out'))},10000);
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('completed'))child.kill('SIGTERM')});
      child.stderr.on('data',chunk=>{errors+=chunk});
      child.on('error',reject);child.on('exit',(code,signal)=>{clearTimeout(deadline);resolve({code,signal})});
    });
    assert.deepEqual(await done,{code:0,signal:null});assert.doesNotMatch(errors,/sk_test_child_fixture/);
    assert.equal(JSON.parse(output.trim()).states.completed,1);assert.equal(job(f).state,'completed');assert.equal(order(f).status,'cancelled');
  }finally{if(child?.exitCode===null)child.kill('SIGKILL');f.close();await rm(dir,{recursive:true,force:true})}
});


test('inline withdrawal handles a bounded subset and automatic passes drain the durable remainder',async()=>{
  const f=await setup();try{
    await f.buy();const original=order(f);
    for(let i=1;i<6;i++)f.sqlite.prepare(`INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,processor_session_id)
      VALUES(?,?,1,'Song','Artist',?,'pending',?)`).run('queued-'+i,'buyer-'+i,original.audio_path,'cs_queued_'+i);
    withdraw(f);
    globalThis.fetch=async(url)=>{const path=new URL(url).pathname;return Response.json({id:path.split('/')[4],livemode:false,status:path.endsWith('/expire')?'expired':'open',payment_status:'unpaid'})};
    assert.equal((await expireWithdrawnCheckouts(f.state.env,1)).pending,3);
    assert.equal((await checkoutRecoveryStatus(f.state.env)).completed,3);
    assert.equal((await run(f)).processed,3);
    assert.deepEqual(await checkoutRecoveryStatus(f.state.env),{completed:6});
  }finally{f.close()}
});

test('missing verified refund evidence cannot grant a paid recovery even with earlier payment timing',async()=>{
  const f=await setup();try{
    await f.buy();withdraw(f);const s=paid(f);delete s.payment_intent.latest_charge;
    evidence(f,Math.floor(order(f).sale_withdrawn_at/1000)-2);await run(f);
    assert.equal(job(f).state,'review');assert.equal(order(f).status,'pending');assert.equal((await access(f)).status,402);
  }finally{f.close()}
});
