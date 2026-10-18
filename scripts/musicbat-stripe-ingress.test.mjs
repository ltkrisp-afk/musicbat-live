import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { receiveStripeEvent } from '../workers/stripe-sandbox-ingress.ts';
const secret='whsec_ingress_fixture';
const env={MUSICBAT_STRIPE_MODE:'test',STRIPE_WEBHOOK_SECRET:secret,MUSICBAT_PRIVATE_SITE_TOKEN:'fixture-private-token'};
const origin='https://ingress.example.invalid';
function request({live=false,time=Math.floor(Date.now()/1000),type='checkout.session.completed',signature,body,path='/api/musicbat/stripe/webhook',method='POST',headers={}}={}) {
 const raw=body??JSON.stringify({id:'evt_fixture',type,livemode:live,data:{object:{id:'cs_test_fixture',livemode:live}},note:'unchanged ♫'});
 const sig=signature??`t=${time},v1=${createHmac('sha256',secret).update(`${time}.${raw}`).digest('hex')}`;
 return {raw,sig,req:new Request(origin+path,{method,body:method==='POST'?raw:undefined,headers:{'stripe-signature':sig,...headers}})};
}
test('test-signature fixture forwards exact raw payload only to fixed private handler',async()=>{
 const r=request({headers:{cookie:'private-cookie','oai-authenticated-user-id':'forged','authorization':'forged'}});let count=0;
 const response=await receiveStripeEvent(r.req,env,async(url,init)=>{count++;assert.equal(url,'https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/api/musicbat/stripe/webhook');assert.equal(init.body,r.raw);assert.equal(init.redirect,'manual');assert.equal(init.headers['stripe-signature'],r.sig);assert.equal(init.headers['OAI-Sites-Authorization'],'Bearer fixture-private-token');assert.equal(Object.keys(init.headers).length,3);return Response.json({received:true});});
 assert.equal(response.status,200);assert.equal(count,1);
});
test('invalid, stale, live, malformed or unsupported events never reach handler',async()=>{
 for(const options of [{signature:'invalid'},{time:1},{live:true},{body:'{'},{type:'customer.created'},{body:'x'.repeat(1024*1024+1)}]){
  let called=false;const r=await receiveStripeEvent(request(options).req,env,async()=>{called=true;return new Response()});assert(r.status>=400);assert.equal(called,false);
 }
});
test('non-webhook paths, query strings, GET and missing/test-mode configuration fail closed',async()=>{
 for(const options of [{path:'/api/musicbat'},{path:'/api/musicbat/stripe/webhook?target=https://evil.invalid'},{method:'GET'}])assert.equal((await receiveStripeEvent(request(options).req,env)).status,404);
 for(const configuration of [{...env,MUSICBAT_STRIPE_MODE:'live'},{...env,MUSICBAT_PRIVATE_SITE_TOKEN:''},{...env,STRIPE_WEBHOOK_SECRET:''}])assert.equal((await receiveStripeEvent(request().req,configuration)).status,503);
});
test('outages, redirects and paused/rejected handler responses remain retryable',async()=>{
 for(const status of [302,400,401,403,409,429,500,503])assert.equal((await receiveStripeEvent(request().req,env,async()=>new Response('do not leak',{status}))).status,503);
 assert.equal((await receiveStripeEvent(request().req,env,async()=>new Response('<html>Sign in</html>'))).status,503);
 const response=await receiveStripeEvent(request().req,env,async()=>{throw Error('private error')});assert.equal(response.status,503);assert.equal(await response.text(),'unavailable');
});
test('restart and concurrent duplicate forwarding retain acknowledgement responsibility in existing handler',async()=>{
 const committed=new Set();let effects=0;
 const handler=async(_url,init)=>{const id=JSON.parse(init.body).id;if(!committed.has(id)){committed.add(id);effects++;}return Response.json({received:true});};
 // This mocks the existing handler's durable deduplication; it is not D1 proof.
 assert.deepEqual((await Promise.all([receiveStripeEvent(request().req,env,handler),receiveStripeEvent(request().req,env,handler)])).map(r=>r.status),[200,200]);
 assert.equal((await receiveStripeEvent(request().req,{...env},handler)).status,200);assert.equal(effects,1);
});
