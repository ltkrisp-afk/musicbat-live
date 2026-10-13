import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAcceptance,acceptancePlugin} from './local-acceptance.mjs';
const origin='http://localhost:5173';
test('offline identities, catalog Radio, settlement, history and withdrawal use existing handlers',async()=>{
 process.env.NODE_ENV='development';const app=await createAcceptance();
 try {
  const call=(path,cookie='',body=null)=>app.handle(new Request(origin+path,{method:body?'POST':'GET',headers:{cookie,...(body?{'content-type':'application/json',origin}: {})},body:body?JSON.stringify(body):undefined}));
  async function login(role){const r=await app.handle(new Request(origin+'/__local/login',{method:'POST',headers:{origin},body:new URLSearchParams({role})}));assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
  const musician=await login('musician'),patron=await login('patron');assert.notEqual(musician,patron);
  assert.equal((await (await call('/api/musicbat?view=artists',patron)).json()).canManage,false);
  assert.equal((await (await call('/api/musicbat?view=artists',musician)).json()).canManage,true);
  assert.equal((await (await call('/api/musicbat?view=rotunda',patron)).json()).tracks.length,0);
  for(const action of ['withdraw_track','delete_track','edit_metadata','set_sale_settings','set_radio'])assert.equal((await call('/api/musicbat',patron,{action,trackId:1,enabled:false,title:'forged'})).status,403);
  assert.equal((await call('/api/musicbat',musician,{action:'edit_metadata',trackId:1,title:'Corrected title',primaryGenre:'Rock',subgenre:'Punk',style:'Hardcore',energyLane:'hard'})).status,200);
  const free=await call('/api/musicbat/channel',patron);assert.equal(free.status,200);assert.equal((await free.json()).snapshot.category,null);
  assert.equal((await call('/api/musicbat/channel',patron,{category:{genre:'Rock'}})).status,403);
  const membership=await call('/api/musicbat/subscription',patron,{action:'join',recurringConsent:true,confirmedPriceCents:300});assert.equal(membership.status,200);
  const membershipUrl=(await membership.json()).checkoutUrl;
  assert.equal((await app.handle(new Request(origin+membershipUrl,{method:'POST',headers:{cookie:patron,origin},body:new URLSearchParams({action:'pay'})}))).status,303);
  const tuned=await call('/api/musicbat/channel',patron,{category:{genre:'Rock'}});assert.equal(tuned.status,200);const radio=await tuned.json();assert.equal(radio.snapshot.category.genre,'Rock');
  assert.equal((await call(radio.mediaUrl,patron)).status,200);
  const quote=await call('/api/musicbat/purchase',patron,{trackId:1});assert.equal(quote.status,409);const buyer=quote.headers.get('set-cookie').split(';')[0];const q=(await quote.json()).quote;assert.equal(q.artistShareCents,170);
  const purchaser=patron+'; '+buyer;
  const checkout=await call('/api/musicbat/purchase',purchaser,{trackId:1,confirmedTotalCents:q.totalCents});assert.equal(checkout.status,201);const data=await checkout.json();
  const download='/api/musicbat/purchase/'+data.purchase.id+'/download';assert.equal((await call(download,purchaser)).status,402);
  assert.equal((await call(data.checkoutUrl,musician)).status,404);
  const pay=()=>app.handle(new Request(origin+data.checkoutUrl,{method:'POST',headers:{cookie:purchaser,origin},body:new URLSearchParams({action:'pay'})}));
  assert.equal((await pay()).status,303);assert.equal((await pay()).status,303);
  const row=app.sqlite.prepare('SELECT * FROM purchases').get();assert.equal(row.status,'paid');assert.equal(row.artist_share_cents,170);assert.equal(row.platform_fee_cents,30);assert.equal(app.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,1);
  assert.equal((await call(download,musician)).status,404);assert.equal((await call(download,purchaser)).status,200);
  assert.equal((await call('/api/musicbat',musician,{action:'withdraw_track',trackId:1})).status,200);
  assert.equal((await call('/api/musicbat/purchase',purchaser,{trackId:1,confirmedTotalCents:q.totalCents})).status,404);
  assert.equal((await call(download,purchaser)).status,200);
  assert.equal((await (await call('/api/musicbat/purchase?id='+row.id,purchaser)).json()).purchase.status,'paid');
  assert.equal(app.sqlite.prepare('SELECT count(*) n FROM purchases').get().n,1);
  assert.equal((await app.handle(new Request(origin+'/__local/login',{method:'POST',headers:{origin:'https://forged.invalid'},body:new URLSearchParams({role:'musician'})}))).status,403);
 }finally{await app.close();}
});
test('offline adapter refuses nondevelopment use and real credentials',async()=>{
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';await assert.rejects(createAcceptance,/development/);process.env.NODE_ENV='development';process.env.STRIPE_SECRET_KEY='sk_live_forbidden';try{await assert.rejects(createAcceptance,/credentials/);}finally{delete process.env.STRIPE_SECRET_KEY;process.env.NODE_ENV=old;}
});

test('development plugin supplies the existing artist page with isolated catalog existence checks',async()=>{
 process.env.NODE_ENV='development';const plugin=await acceptancePlugin();
 try{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile('app/[artistSlug]/page.tsx','utf8');
  const transformed=plugin.transform(source,'/checkout/app/[artistSlug]/page.tsx');
  assert.ok(transformed);assert.ok(!transformed.includes("from 'cloudflare:workers'"));assert.match(transformed,/artist-6c6f63616c5f6d7573696369616e/);assert.match(transformed,/notFound/);assert.match(transformed,/artistSlug=\{artistSlug\}/);
  assert.equal(plugin.transform(source,'/checkout/app/page.tsx'),undefined);
 }finally{await plugin.api.close();}
});
