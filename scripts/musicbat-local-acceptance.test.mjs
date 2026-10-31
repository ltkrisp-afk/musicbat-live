import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAcceptance,acceptancePlugin,managedFixtureRequest,managedFixtureResponse} from './local-acceptance.mjs';
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
  const membership=await call('/api/musicbat/subscription',patron,{action:'join',recurringConsent:true,confirmedPriceCents:500});assert.equal(membership.status,200);
  const membershipUrl=(await membership.json()).checkoutUrl;
  assert.equal((await app.handle(new Request(origin+membershipUrl,{method:'POST',headers:{cookie:patron,origin},body:new URLSearchParams({action:'pay'})}))).status,303);
  const paidStatus=await (await call('/api/musicbat/subscription',patron)).json();assert.equal(paidStatus.active,true);
  assert.equal((await call('/api/musicbat/subscription',patron,{action:'cancel'})).status,200);
  const otherMusician=await login('musician');assert.equal((await (await call('/api/musicbat/subscription',otherMusician)).json()).active,false);
  const returnedPatron=await login('patron');
  const restored=await (await call('/api/musicbat/subscription',returnedPatron)).json();
  assert.equal(restored.active,true);assert.equal(restored.cancelAtPeriodEnd,true);assert.equal(restored.paidUntil,paidStatus.paidUntil);
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
  assert.equal((await call('/api/musicbat',musician,{action:'withdraw_track',trackId:3})).status,200);
  const quiet=await (await call('/api/musicbat/channel',returnedPatron,{category:{genre:'Jazz'}})).json();
  assert.equal(quiet.snapshot.status,'silent');assert.equal(quiet.snapshot.reason,'category-dormant');assert.equal(quiet.mediaUrl,null);
  const remaining=await (await call('/api/musicbat/channel',returnedPatron,{category:{genre:'Rock'}})).json();
  assert.equal(remaining.snapshot.status,'playing');assert.equal(remaining.snapshot.performance.trackId,'2');
  assert.equal((await call(remaining.mediaUrl,returnedPatron)).status,200);
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

test('offline browser rights workflow reaches real private handler and preserves independently authorized sales',async()=>{
 process.env.NODE_ENV='development';const app=await createAcceptance();
 try {
  async function login(role){const r=await app.handle(new Request(origin+'/__local/login',{method:'POST',headers:{origin},body:new URLSearchParams({role})}));return r.headers.get('set-cookie').split(';')[0];}
  const owner=await login('musician'),other=await login('patron');
  const call=(cookie,body)=>app.handle(new Request(origin+'/api/musicbat/rights'+(body?'':'?trackId=1'),{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}));
  assert.equal((await call(owner)).status,200);assert.equal((await call(other)).status,403);
  const request={action:'request_review',trackId:1,uses:['member-stream'],masterAuthority:'Synthetic fixture authority',compositionAuthority:'Synthetic fixture authority',restrictions:'Generated fixture only'};
  assert.equal((await call(other,request)).status,403);assert.equal((await call(owner,request)).status,200);
  assert.equal((await call(owner,{action:'withdraw_use',trackId:1,use:'member-stream'})).status,200);
  const status=await (await call(owner)).json();assert.equal(status.cases[0].state,'hold');assert.equal(status.cases[0].use,'member-stream');assert.equal(status.requests.length,1);
  assert.equal(app.sqlite.prepare('SELECT sale_enabled FROM tracks WHERE id=1').get().sale_enabled,1);
 }finally{await app.close();}
});

test('managed fixture proxy preserves production origin policy and rejects foreign submissions',async()=>{
 const old=process.env.MUSICBAT_MANAGED_ACCEPTANCE;process.env.MUSICBAT_MANAGED_ACCEPTANCE='1';process.env.NODE_ENV='development';const app=await createAcceptance();
 try {
  const external='http://terminal.local:4173';
  const request=(path,body,cookie='')=>new Request(external+path,{method:'POST',headers:{origin:external,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
  const login=await app.handle(managedFixtureRequest(new Request(external+'/__local/login',{method:'POST',headers:{origin:external},body:new URLSearchParams({role:'patron'})})));
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const checkout=await app.handle(managedFixtureRequest(request('/api/musicbat/subscription',{action:'join',recurringConsent:true,confirmedPriceCents:500},cookie)));
  assert.equal(checkout.status,200);assert.match((await checkout.json()).checkoutUrl,/^\/__local\/plus-checkout\//);
  assert.throws(()=>managedFixtureRequest(new Request(external+'/api/musicbat/subscription',{method:'POST',headers:{origin:'https://foreign.invalid'},body:'{}'})),/Foreign/);
  const response=managedFixtureResponse(new Response(null,{status:303,headers:{location:'http://localhost:4173/?plus=return'}}),external);
  assert.equal(response.headers.get('location'),external+'/?plus=return');
  delete process.env.MUSICBAT_MANAGED_ACCEPTANCE;const untouched=request('/api/musicbat/subscription',{});assert.equal(managedFixtureRequest(untouched),untouched);
 }finally{await app.close();if(old===undefined)delete process.env.MUSICBAT_MANAGED_ACCEPTANCE;else process.env.MUSICBAT_MANAGED_ACCEPTANCE=old;}
});
