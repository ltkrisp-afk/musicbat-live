import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './website-fixture.mjs';
import {plusFixture} from './radio-plus-fixture.mjs';
import {handlePlus,plusAccess,plusStatus,plusWebhook} from '../lib/radio-plus.ts';
import {membershipBoundRadio} from '../lib/membership-radio-boundary.ts';
const origin='http://localhost:5173';
const request=body=>new Request(origin+'/api/musicbat/subscription',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
async function setup(){const f=await fixture(),env=f.state.env;delete env.MUSICBAT_BASE_URL;const processor=plusFixture(env);return {...f,env,processor};}
const join=env=>handlePlus(env,request({action:'join',recurringConsent:true,confirmedPriceCents:300}),'patron');
test('invalid modes and incomplete sandbox configuration deny enrollment before processor calls or ledger writes',async()=>{
 const f=await setup();try{
  const configured={...f.env};let calls=0;
  f.env.RADIO_PLUS_PROCESSOR={async fetch(){calls++;throw new Error('Unexpected processor call');}};
  const cases=[{MUSICBAT_STRIPE_MODE:'invalid'},{MUSICBAT_STRIPE_MODE:'TEST'},{MUSICBAT_STRIPE_MODE:'live'},{STRIPE_SECRET_KEY:undefined},{STRIPE_SECRET_KEY:'sk_live_forbidden'},{STRIPE_RADIO_PLUS_WEBHOOK_SECRET:undefined},{STRIPE_RADIO_PLUS_WEBHOOK_SECRET:'invalid'},{MUSICBAT_RADIO_PLUS_ENABLED:undefined},{DB:undefined},{MUSICBAT_RELEASE_PAUSED:'1'}];
  for(const change of cases){
   const env={...configured,...change,RADIO_PLUS_PROCESSOR:f.env.RADIO_PLUS_PROCESSOR};
   assert.equal((await plusStatus(env,'patron')).available,false,JSON.stringify(Object.keys(change)));
   assert.equal((await join(env)).status,503);
   await assert.rejects(()=>plusWebhook(env,new Request(origin,{method:'POST',body:'{}'})),/available|paused/);
  }
  assert.equal(calls,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_enrollments').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_events').get().n,0);
 }finally{f.sqlite.close();}
});
async function paid(f){const r=await join(f.env);assert.equal(r.status,200);const id=(await r.json()).checkoutUrl.split('/').at(-1);await f.processor.pay(id);return id;}
test('test subscription requires sign-in, origin, consent and test configuration; redirects never activate',async()=>{
 const f=await setup();try{
  assert.equal((await handlePlus(f.env,request({action:'join'}),null)).status,401);
  assert.equal((await handlePlus(f.env,new Request(origin+'/api/musicbat/subscription',{method:'POST',headers:{origin:'https://forged.invalid'},body:'{}'}),'patron')).status,403);
  assert.equal((await handlePlus(f.env,request({action:'join'}),'patron')).status,409);
  const checkout=await join(f.env);assert.equal(checkout.status,200);assert.equal(await plusAccess(f.env.DB,'patron'),0);
  const status=await handlePlus(f.env,new Request(origin+'/api/musicbat/subscription?plus=return&paid=true'),'patron');assert.equal((await status.json()).active,false);
  f.env.MUSICBAT_STRIPE_MODE='live';assert.equal((await join(f.env)).status,503);assert.equal((await plusStatus(f.env,'patron')).available,false);
  delete f.env.MUSICBAT_STRIPE_MODE;delete f.env.MUSICBAT_RADIO_PLUS_ENABLED;assert.equal((await join(f.env)).status,503);
 }finally{f.sqlite.close();}
});
test('verified paid invoice grants one month; duplicate events and concurrent joins do not multiply subscriptions',async()=>{
 const f=await setup();try{
  const results=await Promise.all([join(f.env),join(f.env)]),urls=await Promise.all(results.map(r=>r.json()));assert.equal(urls[0].checkoutUrl,urls[1].checkoutUrl);assert.equal(f.processor.sessions.size,1);
  const id=urls[0].checkoutUrl.split('/').at(-1);await f.processor.pay(id);
  const before=await plusAccess(f.env.DB,'patron');assert.ok(before>Date.now());await f.processor.pay(id);assert.equal(await plusAccess(f.env.DB,'patron'),before);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_invoices').get().n,1);assert.equal((await join(f.env)).status,400);
  assert.equal(await plusAccess(f.env.DB,'stranger'),0);
 }finally{f.sqlite.close();}
});
test('renewal extends only from paid evidence; failed renewal does not extend; expiry fails closed',async()=>{
 const f=await setup();try{
  await paid(f);const first=await plusAccess(f.env.DB,'patron');await f.processor.lifecycle('patron','renew');const next=await plusAccess(f.env.DB,'patron');assert.ok(next>first);
  await f.processor.lifecycle('patron','fail');assert.equal(await plusAccess(f.env.DB,'patron'),next);assert.equal(await plusAccess(f.env.DB,'patron',next+1),0);
 }finally{f.sqlite.close();}
});
test('owner cancellation preserves paid access, blocks stranger cancellation and ends without stale-event resurrection',async()=>{
 const f=await setup();try{
  const id=await paid(f),until=await plusAccess(f.env.DB,'patron');
  assert.equal((await handlePlus(f.env,request({action:'cancel'}),'stranger')).status,400);
  assert.equal((await handlePlus(f.env,request({action:'cancel'}),'patron')).status,200);assert.equal(await plusAccess(f.env.DB,'patron'),until);
  assert.equal((await plusStatus(f.env,'patron')).cancelAtPeriodEnd,true);
  await assert.rejects(()=>f.processor.lifecycle('patron','renew'),/cancelled/);await f.processor.lifecycle('patron','expire');assert.equal(await plusAccess(f.env.DB,'patron'),0);
  const sub=f.processor.subscriptions.get(f.processor.sessions.get(id).value.subscription);await f.processor.event('invoice.paid',f.processor.invoices.get(sub.latest_invoice));assert.equal(await plusAccess(f.env.DB,'patron'),0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_invoices').get().n,1);
 }finally{f.sqlite.close();}
});
test('forged/unsigned and mismatched evidence cannot grant access',async()=>{
 const f=await setup();try{
  await assert.rejects(()=>plusWebhook(f.env,new Request(origin,{method:'POST',body:'{}'})),/Signature/);
  const r=await join(f.env),id=(await r.json()).checkoutUrl.split('/').at(-1);await f.processor.pay(id);
  const sub=f.processor.subscriptions.get(f.processor.sessions.get(id).value.subscription),row=f.sqlite.prepare('SELECT * FROM radio_plus_enrollments').get();
  f.sqlite.prepare('UPDATE radio_plus_enrollments SET paid_until=0').run();f.processor.invoices.get(sub.latest_invoice).amount_paid=299;
  await assert.rejects(()=>f.processor.event('invoice.paid',f.processor.invoices.get(sub.latest_invoice)),/verification/);assert.equal(await plusAccess(f.env.DB,'patron'),0);
  f.processor.invoices.get(sub.latest_invoice).amount_paid=300;sub.metadata.musicbat_user_id='stranger';await assert.rejects(()=>f.processor.event('customer.subscription.updated',sub),/verification/);assert.equal(f.sqlite.prepare('SELECT paid_until FROM radio_plus_enrollments WHERE id=?').get(row.id).paid_until,0);
 }finally{f.sqlite.close();}
});
test('private gateway overwrites forged membership headers and storage failure denies delivery',async()=>{
 const f=await setup();try{
  let until;const service={async fetch(r){until=r.headers.get('x-musicbat-plus-until');return new Response('ok');}};
  const bound=membershipBoundRadio(service,f.env.DB,true),r=new Request('https://radio.internal/channel',{headers:{'x-musicbat-listener':'patron','x-musicbat-plus-until':'9999999999999'}});
  assert.equal((await bound.fetch(r)).status,200);assert.equal(until,'0');await paid(f);await bound.fetch(r);assert.equal(Number(until),await plusAccess(f.env.DB,'patron'));
  f.sqlite.exec('ALTER TABLE radio_plus_enrollments RENAME TO unavailable_enrollments');assert.equal((await bound.fetch(r)).status,503);
 }finally{f.sqlite.close();}
});
test('rejoining after cancellation uses a new attempt and ignores old subscription events',async()=>{
 const f=await setup();try{
  const id=await paid(f),oldSub=f.processor.subscriptions.get(f.processor.sessions.get(id).value.subscription);
  await f.processor.lifecycle('patron','expire');
  const next=await join(f.env);assert.equal(next.status,200);const nextId=(await next.json()).checkoutUrl.split('/').at(-1);assert.notEqual(nextId,id);
  assert.equal((await f.processor.event('customer.subscription.updated',oldSub)).ignored,true);assert.equal(await plusAccess(f.env.DB,'patron'),0);
  await f.processor.pay(nextId);assert.ok(await plusAccess(f.env.DB,'patron')>Date.now());
  await f.processor.event('invoice.paid',f.processor.invoices.get(oldSub.latest_invoice));assert.ok(await plusAccess(f.env.DB,'patron')>Date.now());
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_invoices').get().n,2);
 }finally{f.sqlite.close();}
});
