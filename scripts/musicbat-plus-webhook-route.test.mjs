import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {createHmac} from 'node:crypto';
import {fixture} from './website-fixture.mjs';
import {plusFixture} from './radio-plus-fixture.mjs';
import {handlePlus,plusAccess} from '../lib/radio-plus.ts';

test('actual subscription webhook handler rejects invalid delivery and atomically accepts signed fixture retries',async()=>{
 const f=await fixture(),env=f.state.env;delete env.MUSICBAT_BASE_URL;
 const processor=plusFixture(env);globalThis.__musicbatPlusWebhookEnv=env;
 const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__musicbatPlusWebhookEnv',shortCircuit:true};
  return next(specifier,context);
 }});
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('External network forbidden in isolated verification');};
 try{
  const {POST}=await import('../app/api/musicbat/subscription/webhook/route.ts');
  const origin='http://localhost:5173';
  const checkout=await handlePlus(env,new Request(origin+'/api/musicbat/subscription',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'join',recurringConsent:true,confirmedPriceCents:500})}),'patron');
  assert.equal(checkout.status,200);await processor.pay((await checkout.json()).checkoutUrl.split('/').at(-1));
  const sub=[...processor.subscriptions.values()][0];
  f.sqlite.exec("UPDATE radio_plus_enrollments SET paid_until=0,status='pending'; DELETE FROM radio_plus_events; DELETE FROM radio_plus_invoices");
  const raw=JSON.stringify({id:'evt_route_invoice',type:'invoice.paid',livemode:false,data:{object:{id:sub.latest_invoice,livemode:false}}});
  const stamp=Math.floor(Date.now()/1000);
  const send=(body=raw,secret=env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET,time=stamp)=>POST(new Request(origin+'/api/musicbat/subscription/webhook',{method:'POST',headers:{'stripe-signature':`t=${time},v1=${createHmac('sha256',secret).update(time+'.'+body).digest('hex')}`},body}));
  let cancelled=false;
  const huge=new Request(origin+'/api/musicbat/subscription/webhook',{method:'POST',duplex:'half',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(1024*1024+1));},cancel(){cancelled=true;}})});
  assert.equal((await POST(huge)).status,413);assert.equal(cancelled,true);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_events').get().n,0);
  const unsigned=await POST(new Request(origin+'/api/musicbat/subscription/webhook',{method:'POST',body:raw}));
  assert.equal(unsigned.status,400);assert.equal(unsigned.headers.get('cache-control'),'no-store');
  assert.equal((await send(raw,'whsec_wrong')).status,400);
  assert.equal((await send(raw,env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET,stamp-600)).status,400);
  assert.equal((await send(raw.replace('"livemode":false','"livemode":true'))).status,400);
  const inv=processor.invoices.get(sub.latest_invoice);inv.amount_paid=299;assert.equal((await send()).status,400);inv.amount_paid=500;
  assert.equal(await plusAccess(env.DB,'patron'),0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_events').get().n,0);
  const results=await Promise.all([send(),send()]);assert.deepEqual(results.map(r=>r.status),[200,200]);
  assert.ok(await plusAccess(env.DB,'patron')>Date.now());
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_events').get().n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_invoices').get().n,1);
  const before=f.sqlite.prepare('SELECT * FROM radio_plus_enrollments').get();
  assert.equal((await (await send()).json()).duplicate,true);assert.deepEqual(f.sqlite.prepare('SELECT * FROM radio_plus_enrollments').get(),before);
  delete env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET;assert.equal((await send(raw,'whsec_fixture')).status,503);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM radio_plus_enrollments').get(),before);
 }finally{hook.deregister();delete globalThis.__musicbatPlusWebhookEnv;globalThis.fetch=originalFetch;f.sqlite.close();}
});
