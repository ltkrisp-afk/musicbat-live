import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {fixture,post} from './website-fixture.mjs';
import {stripeSandboxPost} from '../app/api/musicbat/stripe/stripe.ts';

async function setup(){
 const f=await fixture(),oldFetch=globalThis.fetch,oldError=console.error;
 f.state.user={userId:'owner',email:'owner@example.test'};
 f.state.env.STRIPE_SECRET_KEY='rk_test_v2fixture';
 await f.route.POST(post({action:'set_artist_identity',artistName:'Fixture Band'}));
 const key='connectV2'+crypto.randomUUID().replaceAll('-','');globalThis[key]=f.state;
 let source=await readFile('app/api/musicbat/stripe/connect/route.ts','utf8');
 source=source.replace('import { env } from "cloudflare:workers";',`const env=globalThis.${key}.env;`)
  .replace(/import \{ getChatGPTUser \} from [^;]+;/,`const getChatGPTUser=async()=>globalThis.${key}.user;`)
  .replace(/import \{[^;]+\} from "\.\.\/stripe";/,await readFile('app/api/musicbat/stripe/stripe.ts','utf8'));
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const route=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const calls=[];
 const response=(url)=>{
  if(url.endsWith('/v1/account'))return Response.json({country:'US'});
  if(url.endsWith('/v2/core/accounts'))return Response.json({id:'acct_v2fixture',livemode:false});
  if(url.endsWith('/v1/accounts/acct_v2fixture'))return Response.json({id:'acct_v2fixture',charges_enabled:false,payouts_enabled:false,details_submitted:false});
  if(url.endsWith('/v2/core/account_links'))return Response.json({account:'acct_v2fixture',livemode:false,url:'https://accounts.stripe.com/r/fixture'});
  throw new Error('Unexpected endpoint '+url);
 };
 const processor={respond:response};
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return processor.respond(String(url),init);};
 console.error=()=>{};
 return {...f,route,calls,processor,response,close(){globalThis.fetch=oldFetch;console.error=oldError;delete globalThis[key];f.sqlite.close();}};
}

test('sandbox creates Express merchant/recipient through v2 JSON and reuses stored account on retries',async()=>{
 const f=await setup();try{
  f.sqlite.exec("INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents) VALUES ('retained','hash',42,'Old song','Artist','old.wav','paid',200,170,30)");
  const before=f.sqlite.prepare('SELECT * FROM purchases').all();
  const result=await f.route.POST(post({artistId:'forged',stripe_account_id:'acct_forged'}));
  assert.equal(result.status,200);assert.equal((await result.json()).onboardingUrl,'https://accounts.stripe.com/r/fixture');
  const create=f.calls.find(c=>c.url.endsWith('/v2/core/accounts')),body=JSON.parse(create.init.body);
  assert.equal(create.init.headers.authorization,'Bearer rk_test_v2fixture');
  assert.equal(create.init.headers['content-type'],'application/json');assert.equal(create.init.headers['Stripe-Version'],'2026-09-30.endive');
  assert.match(create.init.headers['idempotency-key'],/^musicbat-connect-v2-test-/);
  assert.equal(body.dashboard,'express');assert.equal(body.identity.country,'US');assert.equal(body.contact_email,'owner@example.test');
  assert.deepEqual(body.metadata,{musicbat_artist_id:'owner'});
  assert.deepEqual(body.defaults.responsibilities,{fees_collector:'application',losses_collector:'application'});
  assert.equal(body.configuration.merchant.capabilities.card_payments.requested,true);
  assert.equal(body.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested,true);
  const link=JSON.parse(f.calls.at(-1).init.body);
  assert.deepEqual(link.use_case.account_onboarding.configurations,['merchant','recipient']);assert.equal(link.account,'acct_v2fixture');
  assert.equal(new URL(link.use_case.account_onboarding.return_url).origin,'https://musicbat.audio');
  assert.equal((await f.route.POST(post({}))).status,200);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/v2/core/accounts')).length,1);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/v1/accounts')).length,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_accounts').get().n,1);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM purchases').all(),before);
 }finally{f.close();}
});

test('v2 permission refusal and invalid account responses never fall back to v1 or create local account rows',async()=>{
 for(const invalid of [new Response(JSON.stringify({error:{message:'Permission denied'}}),{status:403}),Response.json({id:'acct_v2fixture',livemode:true}),Response.json({id:'acct_forged!',livemode:false})]){
  const f=await setup();try{
   f.processor.respond=(url)=>url.endsWith('/v2/core/accounts')?invalid:f.response(url);
   assert.equal((await f.route.POST(post({}))).status,503);
   assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_accounts').get().n,0);
   assert.equal(f.calls.filter(c=>c.url.endsWith('/v1/accounts')).length,0);
   assert.equal(f.calls.filter(c=>c.url.endsWith('/account_links')).length,0);
  }finally{f.close();}
 }
});

test('v2 onboarding rejects wrong modes, accounts and redirect origins while preserving the created account',async()=>{
 for(const change of [{livemode:true},{account:'acct_wrong'},{url:'https://accounts.stripe.com.evil.test/redirect'},{url:'https://attacker@accounts.stripe.com/r/test'}]){
  const f=await setup();try{
   f.processor.respond=(url)=>url.endsWith('/v2/core/account_links')?Response.json({account:'acct_v2fixture',livemode:false,url:'https://accounts.stripe.com/r/fixture',...change}):f.response(url);
   assert.equal((await f.route.POST(post({}))).status,503);
   assert.equal(f.sqlite.prepare('SELECT stripe_account_id FROM artist_accounts').get().stripe_account_id,'acct_v2fixture');
   f.processor.respond=f.response;assert.equal((await f.route.POST(post({}))).status,200);
   assert.equal(f.calls.filter(c=>c.url.endsWith('/v2/core/accounts')).length,1);
  }finally{f.close();}
 }
});

test('sandbox v2 helper refuses live configuration before network; existing live route remains on v1',async()=>{
 let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected network');};
 try{assert.throws(()=>stripeSandboxPost({MUSICBAT_STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture'},'/v2/core/accounts',{}),/sandbox only/);assert.equal(calls,0);}finally{globalThis.fetch=old;}
 const f=await setup();try{
  f.state.env.MUSICBAT_STRIPE_MODE='live';f.state.env.STRIPE_SECRET_KEY='sk_live_fixture';
  f.processor.respond=(url)=>url.endsWith('/v1/account_links')?Response.json({url:'https://connect.stripe.com/live-fixture'}):Response.json({id:'acct_livefixture',charges_enabled:false,payouts_enabled:false,details_submitted:false});
  assert.equal((await f.route.POST(post({}))).status,200);
  assert.ok(f.calls.some(c=>c.url.endsWith('/v1/accounts')));assert.ok(f.calls.every(c=>!c.url.includes('/v2/')));
 }finally{f.close();}
});
