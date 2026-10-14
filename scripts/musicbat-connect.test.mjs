import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAcceptance} from './local-acceptance.mjs';

test('isolated artist Connect onboarding, link refresh and 85/15 purchase preserve paid history after withdrawal',async()=>{
 const old=process.env.NODE_ENV;process.env.NODE_ENV='development';const app=await createAcceptance({payoutsReady:false});const origin='http://localhost:5173';
 const call=(path,cookie='',body)=>app.handle(new Request(origin+path,{method:body?'POST':'GET',headers:{cookie,...(body?{origin,'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));
 const login=async role=>(await app.handle(new Request(origin+'/__local/login',{method:'POST',headers:{origin},body:new URLSearchParams({role})}))).headers.get('set-cookie').split(';')[0];
 try{
  const artist=await login('musician'),patron=await login('patron'),path='/api/musicbat/stripe/connect';
  assert.equal((await call(path,'',{})).status,401);assert.equal((await call(path,patron,{})).status,403);assert.equal((await call(path,patron)).status,403);
  assert.equal(app.sqlite.prepare('SELECT count(*) n FROM artist_accounts').get().n,0);
  assert.equal((await (await call(path,artist)).json()).connected,false);
  const opened=await Promise.all([call(path,artist,{}),call(path,artist,{})]);assert.ok(opened.every(r=>r.status===200));
  const first=(await opened[0].json()).onboardingUrl;assert.match(first,/^\/__local\/connect\//);
  assert.equal(app.sqlite.prepare('SELECT count(*) n FROM artist_accounts').get().n,1);
  assert.equal((await call(first,patron)).status,404);
  const simulate=(url,action)=>app.handle(new Request(origin+url,{method:'POST',headers:{cookie:artist,origin},body:new URLSearchParams({action})}));
  const refreshed=await simulate(first,'refresh');assert.equal(refreshed.status,303);assert.match(refreshed.headers.get('location'),/stripe=refresh/);
  assert.equal((await call(first,artist)).status,404);
  const next=(await (await call(path,artist,{})).json()).onboardingUrl;assert.notEqual(next,first);
  assert.equal((await (await call(path,artist)).json()).ready,false);
  assert.equal((await simulate(next,'complete')).status,303);
  const ready=await (await call(path,artist)).json();assert.equal(ready.ready,true);assert.equal((await (await call(path,artist,{})).json()).onboardingUrl,null);
  const quoteResponse=await call('/api/musicbat/purchase',patron,{trackId:1});assert.equal(quoteResponse.status,409);
  const quote=(await quoteResponse.json()).quote;assert.deepEqual([quote.artistShareCents,200-quote.artistShareCents,quote.processingCents,quote.totalCents],[170,30,37,237]);
  const created=await call('/api/musicbat/purchase',patron,{trackId:1,confirmedTotalCents:237});assert.equal(created.status,201);const purchase=await created.json();
  const paid=await app.handle(new Request(origin+purchase.checkoutUrl,{method:'POST',headers:{cookie:patron,origin},body:new URLSearchParams({action:'pay'})}));assert.equal(paid.status,303);
  const before=app.sqlite.prepare('SELECT * FROM purchases').get();assert.equal(before.status,'paid');assert.deepEqual([before.artist_share_cents,before.platform_fee_cents,before.processing_cents],[170,30,37]);
  assert.equal((await call('/api/musicbat',artist,{action:'withdraw_track',trackId:1})).status,200);
  assert.equal((await call('/api/musicbat/purchase',patron,{trackId:1,confirmedTotalCents:237})).status,404);
  assert.equal((await call('/api/musicbat/purchase/'+before.id+'/download',patron)).status,200);
  assert.deepEqual(app.sqlite.prepare('SELECT * FROM purchases').get(),before);
 }finally{await app.close();process.env.NODE_ENV=old;}
});
