import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,upload,load} from './website-fixture.mjs';
const origin='https://musicbat.audio';
const request=(path,cookie)=>new Request(origin+path,{headers:cookie?{cookie}:{}});
test('purchased download belongs to stable account across cookie/session changes; logout and other accounts are rejected',async()=>{
 const f=await fixture();try{
 await upload(f.route);const asset=f.sqlite.prepare('SELECT audio_url FROM tracks').get().audio_url;
 f.sqlite.prepare("INSERT INTO purchases(id,buyer_hash,buyer_account_id,track_id,title,artist_name,audio_path,status) VALUES ('owned','legacy-cookie','buyer',1,'Tone','Artist',?,'paid')").run(asset);
 const download=await load('app/api/musicbat/purchase/[purchaseId]/download/route.ts',f.state), purchase=await load('app/api/musicbat/purchase/route.ts',f.state);
 f.state.user={userId:'buyer',email:'buyer@example.test'};
 for(const cookie of [null,'musicbat_buyer='+'a'.repeat(64),'musicbat_buyer='+'b'.repeat(64)])assert.equal((await download.GET(request('/api/musicbat/purchase/owned/download',cookie))).status,200);
 assert.equal((await (await purchase.GET(request('/api/musicbat/purchase'))).json()).purchases[0].id,'owned');
 f.state.user=null;assert.equal((await download.GET(request('/api/musicbat/purchase/owned/download'))).status,401);
 assert.equal((await purchase.POST(new Request(origin+'/api/musicbat/purchase',{method:'POST',body:'{"trackId":1}'}))).status,401);
 f.state.user={userId:'intruder'};assert.equal((await download.GET(request('/api/musicbat/purchase/owned/download'))).status,404);
 assert.equal((await purchase.GET(request('/api/musicbat/purchase?id=owned'))).status,404);
 f.state.user={userId:'buyer'};assert.equal((await download.GET(request('/api/musicbat/purchase/owned/download'))).status,200);
 }finally{f.sqlite.close()}
});
test('legacy ownership requires explicit recovery, original device, matching authenticated receipt and immutable audit',async()=>{
 const f=await fixture();const oldFetch=globalThis.fetch;try{
 await upload(f.route);const token='c'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 const asset=f.sqlite.prepare('SELECT audio_url FROM tracks').get().audio_url;
 f.sqlite.prepare("INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,processor_session_id) VALUES ('legacy',?,1,'Tone','Artist',?,'paid','cs_test_legacy')").run(hash,asset);
 const purchase=await load('app/api/musicbat/purchase/route.ts',f.state),download=await load('app/api/musicbat/purchase/[purchaseId]/download/route.ts',f.state);
 globalThis.fetch=async()=>Response.json({id:'cs_test_legacy',livemode:false,status:'complete',payment_status:'paid',metadata:{musicbat_purchase_id:'legacy'},customer_details:{email:'buyer@example.test'}});
 const recover=(cookie=true)=>purchase.POST(new Request(origin+'/api/musicbat/purchase',{method:'POST',headers:{origin,...(cookie?{cookie:'musicbat_buyer='+token}:{})},body:JSON.stringify({action:'recover_legacy_purchase',purchaseId:'legacy'})}));
 f.state.user={userId:'intruder',email:'intruder@example.test'};assert.equal((await recover()).status,403);assert.equal((await download.GET(request('/api/musicbat/purchase/legacy/download','musicbat_buyer='+token))).status,404);
 f.state.user={userId:'buyer',email:'buyer@example.test'};assert.equal((await recover(false)).status,403);
 assert.equal((await purchase.GET(request('/api/musicbat/purchase?id=legacy','musicbat_buyer='+token))).status,409);
 assert.equal(f.sqlite.prepare('SELECT buyer_account_id FROM purchases').get().buyer_account_id,null);
 assert.equal((await recover()).status,200);assert.equal((await recover()).status,409);
 assert.equal(f.sqlite.prepare('SELECT account_id FROM purchase_ownership_audit').get().account_id,'buyer');
 assert.equal((await download.GET(request('/api/musicbat/purchase/legacy/download'))).status,200);
 f.state.user={userId:'intruder',email:'buyer@example.test'};assert.equal((await recover()).status,409);assert.equal((await download.GET(request('/api/musicbat/purchase/legacy/download'))).status,404);
 }finally{globalThis.fetch=oldFetch;f.sqlite.close()}
});
test('Shock Room requires artist authority, isolates artists, rejects expired sessions and hides private public-catalog metrics',async()=>{
 const f=await fixture();try{
 await upload(f.route);f.state.user={userId:'other-artist'};await upload(f.route,{title:'Other artist tone'});
 const shock=()=>f.route.GET(request('/api/musicbat?view=shock-room'));
 let result=await (await shock()).json();assert.equal(result.rows.length,1);assert.equal(result.rows[0].title,'Other artist tone');
 f.state.user={userId:'owner'};result=await (await shock()).json();assert.equal(result.rows.length,1);assert.equal(result.rows[0].track_id,1);
 f.state.user={userId:'listener'};assert.equal((await shock()).status,403);
 const tracks=(await (await f.route.GET(request('/api/musicbat?view=tracks'))).json()).tracks;
 assert.ok(tracks.every(t=>!('purchase_count' in t)&&!('shock_score' in t)));
 f.state.user=null;assert.equal((await shock()).status,401);
 f.state.user={userId:'owner'};assert.equal((await shock()).status,200);
 }finally{f.sqlite.close()}
});

test('appointed representative receives only authorized Shock Room rows and their own saved status',async()=>{
 const f=await fixture();try{
  await upload(f.route,{title:'Represented recording'});f.state.user={userId:'other-artist'};await upload(f.route,{title:'Private other recording'});
  f.sqlite.prepare("INSERT INTO track_authority VALUES(1,'representative','owner',1,NULL)").run();
  f.sqlite.prepare("INSERT INTO saved_recordings VALUES('representative',1,1)").run();
  f.state.user={userId:'representative'};
  const response=await f.route.GET(request('/api/musicbat?view=shock-room'));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.rows.length,1);assert.equal(data.rows[0].title,'Represented recording');assert.equal(data.rows[0].viewer_saved,1);
  f.sqlite.prepare("UPDATE track_authority SET revoked_at=2 WHERE account_id='representative'").run();
  assert.equal((await f.route.GET(request('/api/musicbat?view=shock-room'))).status,403);
 }finally{f.sqlite.close();}
});
