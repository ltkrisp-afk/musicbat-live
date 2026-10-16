import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {post,d1} from './website-fixture.mjs';
import {expireWithdrawnCheckouts} from '../app/api/musicbat/stripe/stripe.ts';

import {setup,order,paid,access} from './checkout-recovery-fixture.mjs';

for(const action of ['set_sale_settings','withdraw_track','delete_track'])test(action+' expires open sandbox sessions and prevents new Checkout',async()=>{
  const f=await setup();try{
    assert.equal((await f.buy()).status,201);
    assert.equal((await f.withdraw(action)).status,200);
    assert.equal(order(f).cleanup_state,'expired');assert.equal(order(f).status,'cancelled');
    const cutoff=order(f).sale_withdrawn_at;assert.ok(cutoff>0);
    assert.equal(f.calls.filter(x=>x.path.endsWith('/expire')).length,1);
    assert.ok([404,409].includes((await f.buy()).status));
    assert.equal(f.calls.filter(x=>x.path==='/v1/checkout/sessions').length,1);
    assert.equal((await f.withdraw(action)).status,200);assert.equal(order(f).sale_withdrawn_at,cutoff);
    assert.equal(f.calls.filter(x=>x.path.endsWith('/expire')).length,1);
  }finally{f.close()}
});

test('concurrent withdrawals and retries preserve one cutoff and never alter a paid ledger',async()=>{
  const f=await setup();try{
    await f.buy();paid(f);assert.equal((await f.send()).status,200);
    const before={...order(f)};assert.equal((await access(f)).status,200);
    assert.deepEqual((await Promise.all([f.withdraw(),f.withdraw('delete_track')])).map(r=>r.status),[200,200]);
    assert.deepEqual({...order(f)},before);assert.equal((await access(f)).status,200);
    assert.equal(f.calls.filter(x=>x.path.endsWith('/expire')).length,0);
  }finally{f.close()}
});

test('unpaid concurrent withdrawals tolerate another caller expiring the same Session',async()=>{
  const f=await setup();try{
    await f.buy();const saved=console.error;console.error=()=>{};
    try{assert.deepEqual((await Promise.all([f.withdraw(),f.withdraw()])).map(r=>r.status),[200,200])}finally{console.error=saved}
    assert.equal(order(f).cleanup_state,'expired');assert.equal(order(f).status,'cancelled');
  }finally{f.close()}
});

test('Stripe outage persists retry work across a real SQLite reopen; retry expires safely',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'musicbat-withdrawal-')),file=join(dir,'persist.sqlite'),f=await setup(file);let reopened;
  try{
    await f.buy();const processor=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline')};
    assert.equal((await f.withdraw()).status,200);assert.equal(order(f).cleanup_state,'retry');
    assert.equal(order(f).cleanup_error,'processor_temporarily_unavailable');
    f.sqlite.close();
    reopened=new DatabaseSync(file);f.state.env.DB=d1(reopened);globalThis.fetch=processor;
    assert.ok(reopened.prepare('SELECT sale_withdrawn_at FROM purchases').get().sale_withdrawn_at);
    reopened.prepare('UPDATE checkout_recovery_jobs SET next_attempt_at=0').run();
    await expireWithdrawnCheckouts(f.state.env,1);
    assert.equal(reopened.prepare('SELECT cleanup_state FROM purchases').get().cleanup_state,'expired');
    assert.equal(reopened.prepare('SELECT cleanup_attempts FROM purchases').get().cleanup_attempts,2);
  }finally{reopened?.close();await rm(dir,{recursive:true,force:true});f.close()}
});

test('expiration rejects a mismatched Stripe mode without making a mutation',async()=>{
  const f=await setup();try{
    await f.buy();[...f.sessions.values()][0].livemode=true;
    assert.equal((await f.withdraw()).status,200);assert.equal(order(f).cleanup_state,'retry');
    assert.equal(f.calls.filter(x=>x.path.endsWith('/expire')).length,0);
  }finally{f.close()}
});

test('withdrawal during create persists late Session, expires it, and withholds Checkout URL',async()=>{
  const f=await setup();try{
    const processor=globalThis.fetch;let response;
    globalThis.fetch=async(url,init)=>{
      if(new URL(url).pathname==='/v1/checkout/sessions'){
        response=await processor(url,init);assert.equal((await f.withdraw()).status,200);
        assert.equal(order(f).cleanup_state,'awaiting_session');return response;
      }
      return processor(url,init);
    };
    const r=await f.buy();assert.equal(r.status,409);assert.equal((await r.json()).checkoutUrl,undefined);
    assert.ok(order(f).processor_session_id);assert.ok(order(f).checkout_request_json);
    assert.equal(order(f).cleanup_state,'expired');
  }finally{f.close()}
});

test('withdrawal during reused Session GET cannot return an open Checkout URL',async()=>{
  const f=await setup();try{
    await f.buy();const processor=globalThis.fetch;let once=true;
    globalThis.fetch=async(url,init)=>{
      const response=await processor(url,init);
      if(once&&init.method==='GET'&&String(url).includes('/checkout/sessions/')){once=false;await f.withdraw()}
      return response;
    };
    const r=await f.buy();assert.equal(r.status,409);assert.equal((await r.json()).checkoutUrl,undefined);
    assert.equal(order(f).cleanup_state,'expired');
  }finally{f.close()}
});

for(const timing of ['before','after','same-second','missing','unpaid-snapshot'])test('verified paid webhook '+timing+' withdrawal uses durable payment ordering',async()=>{
  const f=await setup();try{
    await f.buy();paid(f);await f.withdraw();const cutoff=order(f).sale_withdrawn_at;
    const second=Math.floor(cutoff/1000);
    const created=timing==='before'?second-2:timing==='after'?second+2:timing==='missing'?undefined:second;
    assert.equal((await f.send({created,paid:timing!=='unpaid-snapshot'})).status,200);
    assert.equal(order(f).status,timing==='before'?'paid':'payment_review');
    assert.equal((await access(f)).status,timing==='before'?200:402);
    assert.equal((await f.send({created})).status,200);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,1);
    assert.deepEqual([order(f).artist_share_cents,order(f).platform_fee_cents,order(f).processing_cents],[170,30,37]);
    assert.equal((await f.send({id:'evt_expired_late',type:'checkout.session.expired'})).status,200);
    assert.equal(order(f).status,timing==='before'?'paid':'payment_review');
  }finally{f.close()}
});

test('withdrawal committing between paid verification and ledger batch is revalidated atomically',async()=>{
  const f=await setup();try{
    await f.buy();paid(f);const batch=f.state.env.DB.batch;let once=true;
    f.state.env.DB.batch=async statements=>{if(once){once=false;f.sqlite.exec('UPDATE tracks SET sale_enabled=0 WHERE id=1')}return batch(statements)};
    assert.equal((await f.send({created:Math.floor(Date.now()/1000)+2})).status,200);
    assert.equal(order(f).status,'payment_review');assert.equal((await access(f)).status,402);
  }finally{f.close()}
});

test('payment wins expiration race: paid Session is never labelled expired, earlier payment retains access',async()=>{
  const f=await setup();try{
    await f.buy();const processor=globalThis.fetch;
    globalThis.fetch=async(url,init)=>{
      if(String(url).endsWith('/expire')){paid(f);return Response.json({error:{message:'already completed'}},{status:400})}
      return processor(url,init);
    };
    const saved=console.error;console.error=()=>{};try{await f.withdraw()}finally{console.error=saved}
    assert.equal(order(f).cleanup_state,'payment_observed');
    assert.equal((await f.send({created:Math.floor(order(f).sale_withdrawn_at/1000)-2})).status,200);
    assert.equal(order(f).status,'paid');assert.equal((await access(f)).status,200);
  }finally{f.close()}
});

test('unknown create outcome keeps exact replay data, blocks replacement, and webhook recovers missing session association',async()=>{
  const f=await setup();try{
    const processor=globalThis.fetch;
    globalThis.fetch=async(url,init)=>{const response=await processor(url,init);if(new URL(url).pathname==='/v1/checkout/sessions')throw new Error('connection lost after create');return response};
    const saved=console.error;console.error=()=>{};try{assert.equal((await f.buy()).status,503)}finally{console.error=saved}
    assert.equal(order(f).status,'awaiting_checkout');assert.equal(order(f).processor_session_id,null);
    assert.equal(order(f).cleanup_error,'checkout_creation_outcome_unknown');
    assert.equal(JSON.parse(order(f).checkout_request_json)['metadata[musicbat_purchase_id]'],order(f).id);
    globalThis.fetch=processor;assert.equal((await f.buy()).status,503);assert.equal(f.sessions.size,1);
    paid(f);assert.equal((await f.send()).status,200);assert.equal(order(f).status,'paid');assert.equal(order(f).processor_session_id,'cs_test_0');
  }finally{f.close()}
});

test('re-enabling sales does not revive an old withdrawn Checkout or permit its late payment',async()=>{
  const f=await setup();try{
    await f.buy();await f.withdraw();const cutoff=order(f).sale_withdrawn_at;
    await f.route.POST(post({action:'set_sale_settings',trackId:1,saleEnabled:true,saleRightsAttested:true,salePriceCents:200}));
    assert.equal(order(f).sale_withdrawn_at,cutoff);paid(f);
    assert.equal((await f.send({created:Math.floor(cutoff/1000)+2})).status,200);
    assert.equal(order(f).status,'payment_review');
  }finally{f.close()}
});

test('failed paid ledger batch rolls back its event so a retry can settle the purchase',async()=>{
  const f=await setup();try{
    await f.buy();paid(f);const batch=f.state.env.DB.batch;
    f.state.env.DB.batch=async statements=>batch([...statements,f.state.env.DB.prepare('INSERT INTO purchases(id) VALUES (?)').bind('injected-failure')]);
    const saved=console.error;console.error=()=>{};try{assert.equal((await f.send()).status,400)}finally{console.error=saved}
    assert.equal(order(f).status,'pending');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,0);
    f.state.env.DB.batch=batch;assert.equal((await f.send()).status,200);assert.equal(order(f).status,'paid');
  }finally{f.close()}
});

test('completed-but-unpaid sessions remain unresolved and do not permit a replacement Checkout',async()=>{
  const f=await setup();try{
    await f.buy();[...f.sessions.values()][0].status='complete';
    assert.equal((await f.buy()).status,409);assert.equal(f.sessions.size,1);
    await f.withdraw();assert.equal(order(f).cleanup_state,'awaiting_payment');
    assert.equal(f.calls.filter(x=>x.path.endsWith('/expire')).length,0);
    assert.equal((await access(f)).status,402);
  }finally{f.close()}
});

test('rights revocation writes a durable cleanup cutoff without changing purchase allocation',async()=>{
  const f=await setup();try{
    await f.buy();const before=order(f);
    // The trigger handles arbitrary eligibility writes, not only one endpoint.
    f.sqlite.exec('UPDATE tracks SET rights_attested=0 WHERE id=1');
    assert.ok(order(f).sale_withdrawn_at);assert.equal(order(f).cleanup_state,'pending');
    assert.deepEqual([order(f).amount_cents,order(f).artist_share_cents,order(f).platform_fee_cents],[before.amount_cents,before.artist_share_cents,before.platform_fee_cents]);
  }finally{f.close()}
});

test('upgrade preserves paid history and marks older withdrawn unresolved orders with an unknown cutoff',()=>{
  const db=new DatabaseSync(':memory:');try{
    const migrations=readMigrationFiles({migrationsFolder:'drizzle'}).slice(0,14);
    for(const m of migrations.slice(0,-1))for(const sql of m.sql)db.exec(sql);
    db.exec("INSERT INTO tracks(id,artist_id,artist_name,title,audio_url,status) VALUES(1,'owner','Artist','Song','original.wav','withdrawn')");
    for(const [id,status] of [['historical','paid'],['unresolved','pending']])db.prepare('INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents) VALUES(?,?,1,?,?,?, ?,200,170,30)').run(id,'buyer','Song','Artist','original.wav',status);
    for(const sql of migrations.at(-1).sql)db.exec(sql);
    const rows=db.prepare('SELECT * FROM purchases ORDER BY id').all();
    assert.equal(rows[0].status,'paid');assert.equal(rows[0].sale_withdrawn_at,null);assert.equal(rows[0].cleanup_state,null);
    assert.equal(rows[1].sale_withdrawn_at,0);assert.equal(rows[1].cleanup_state,'pending');
    assert.equal(rows[0].artist_share_cents,170);assert.equal(rows[1].artist_share_cents,170);
  }finally{db.close()}
});
