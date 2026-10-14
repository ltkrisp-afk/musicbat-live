import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {fixture,upload,post} from './website-fixture.mjs';
import {readStripeWebhookBody,StripeWebhookBodyTooLarge,verifyStripeWebhook} from '../app/api/musicbat/stripe/stripe.ts';
import {buyerIdentity} from '../app/api/musicbat/purchase/buyer.ts';

test('webhook raw body bounds ignore forged length, cancel streams, and retain signed Unicode bytes',async()=>{
 const raw=JSON.stringify({id:'evt_security',type:'fixture',livemode:false,data:{object:{livemode:false,title:'Música 🎸'}}});
 const timestamp=Math.floor(Date.now()/1000), secret='whsec_security_fixture';
 const signature=`t=${timestamp},v1=${createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex')}`;
 const read=await readStripeWebhookBody(new Request('https://local.test',{method:'POST',body:raw}));
 assert.equal(read,raw);assert.equal((await verifyStripeWebhook(read,signature,secret)).id,'evt_security');
 await assert.rejects(()=>verifyStripeWebhook(read+' ',signature,secret));
 await assert.rejects(()=>verifyStripeWebhook(read,signature,'whsec_wrong'));
 await assert.rejects(()=>verifyStripeWebhook(read,signature,secret,timestamp+301));
 for(const length of [undefined,'1','1048577']) {
  let cancelled=false;
  const request=new Request('https://local.test',{method:'POST',duplex:'half',headers:length?{'content-length':length}:{},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(1048577));},cancel(){cancelled=true;}})});
  await assert.rejects(()=>readStripeWebhookBody(request),StripeWebhookBodyTooLarge);assert.equal(cancelled,true);
 }
 assert.equal((await readStripeWebhookBody(new Request('https://local.test',{method:'POST',body:'a'.repeat(1048576)}))).length,1048576);
});

test('foreign-origin uploads and forged owner fields cannot write another artist catalog',async()=>{
 const f=await fixture();try {
  await upload(f.route);const before=f.sqlite.prepare('SELECT * FROM tracks').get();
  f.state.user={userId:'attacker'};
  for(const action of ['withdraw_track','delete_track','grant_representative','set_sale_settings']) {
   assert.equal((await f.route.POST(post({action,trackId:1,artistId:'owner',representativeId:'attacker',saleEnabled:false}))).status,403);
  }
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM tracks').get(),before);
  const foreign=post({action:'set_artist_identity',artistName:'Unauthorized'});foreign.headers.set('origin','https://evil.test');
  assert.equal((await f.route.POST(foreign)).status,403);
  // Artist-provided strings are stored as data through bound SQL parameters.
  f.state.user={userId:'owner'};const name="Band'); DROP TABLE purchases; --";
  assert.equal((await upload(f.route,{artistName:name,title:'<script>alert(1)</script>'})).status,201);
  assert.equal(f.sqlite.prepare('SELECT artist_name FROM tracks ORDER BY id DESC').get().artist_name,name);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM purchases').get().n,0);
 }finally{f.sqlite.close();}
});

test('buyer capability cookies have security flags, independent randomness, and hashed storage identities',async()=>{
 const request=new Request('https://local.test/api/musicbat/purchase');
 const a=await buyerIdentity(request,true),b=await buyerIdentity(request,true);
 assert.notEqual(a.hash,b.hash);assert.match(a.cookie,/HttpOnly; Secure; SameSite=Lax; Path=\/api\/musicbat\/purchase/);
 const token=a.cookie.split(';')[0];assert.notEqual(a.hash,token.split('=')[1]);
 assert.equal((await buyerIdentity(new Request(request,{headers:{cookie:token}}))).hash,a.hash);
 assert.equal(await buyerIdentity(new Request(request,{headers:{cookie:'musicbat_buyer=forged'}})),null);
});

test('Connect requires identity and same origin; client body cannot replace account owner or destination',async()=>{
 const f=await fixture(),originalFetch=globalThis.fetch;
 const key='connectSecurity'+crypto.randomUUID().replaceAll('-','');globalThis[key]=f.state;
 try {
  let source=await readFile('app/api/musicbat/stripe/connect/route.ts','utf8');
  source=source.replace('import { env } from "cloudflare:workers";',`const env=globalThis.${key}.env;`)
   .replace(/import \{ getChatGPTUser \} from [^;]+;/,`const getChatGPTUser=async()=>globalThis.${key}.user;`)
   .replace(/import \{[^;]+\} from "\.\.\/stripe";/,await readFile('app/api/musicbat/stripe/stripe.ts','utf8'));
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const route=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const calls=[];globalThis.fetch=async(url,init)=>{
   calls.push({url:String(url),body:init.body});
   return Response.json(String(url).endsWith('/account_links')?{url:'https://connect.stripe.com/test'}:{id:'acct_owner',charges_enabled:false,payouts_enabled:false,details_submitted:false});
  };
  f.state.user=null;assert.equal((await route.POST(post({}))).status,401);assert.equal(calls.length,0);
  f.state.user={userId:'owner',email:'owner@example.test'};
  const foreign=post({});foreign.headers.set('origin','https://evil.test');assert.equal((await route.POST(foreign)).status,403);assert.equal(calls.length,0);
  assert.equal((await route.POST(post({artistId:'victim',stripe_account_id:'acct_attacker'}))).status,200);
  assert.equal(calls[0].body.get('metadata[musicbat_artist_id]'),'owner');
  assert.equal(calls.at(-1).body.get('account'),'acct_owner');
  assert.equal(f.sqlite.prepare('SELECT artist_id,stripe_account_id FROM artist_accounts').get().artist_id,'owner');
 }finally{globalThis.fetch=originalFetch;delete globalThis[key];f.sqlite.close();}
});
