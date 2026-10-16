import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { RadioRuntime } from '../radio/runtime.ts';
import { publishCatalogRecording } from '../radio/catalog-import.ts';
import { catalogBoundRadio } from '../lib/catalog-radio-boundary.ts';
import { tone } from '../e2e/fixtures.mjs';
function d1(sqlite){return {prepare(sql){const statement=sqlite.prepare(sql);const bound=(...v)=>({async first(){return statement.get(...v)??null},async all(){return {results:statement.all(...v)}},async run(){return {meta:{changes:statement.run(...v).changes}}},execute(){const results=statement.columns().length?statement.all(...v):[];const meta=statement.columns().length?{changes:results.length}:{changes:statement.run(...v).changes};return {results,meta}}});return {...bound(),bind:bound}},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
async function fixture(){const sqlite=new DatabaseSync(':memory:');for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await readFile('drizzle/'+name,'utf8'));const objects=new Map();const state={user:{userId:'owner'},env:{DB:d1(sqlite),BUCKET:{async put(key,file,meta){objects.set(key,{bytes:new Uint8Array(await file.arrayBuffer()),...meta})},async delete(key){objects.delete(key)},async head(key){return objects.has(key)?{size:objects.get(key).bytes.length}:null},async get(key){const o=objects.get(key);return o?{body:o.bytes,size:o.bytes.length,httpMetadata:o.httpMetadata}:null}},STRIPE_SECRET_KEY:'sk_test_loop',STRIPE_WEBHOOK_SECRET:'whsec_loop',MUSICBAT_BASE_URL:'https://musicbat.audio',MUSICBAT_PROCESSING_BPS:'290',MUSICBAT_PROCESSING_FIXED_CENTS:'30'}};return {sqlite,objects,state,route:await load('app/api/musicbat/route.ts',state)}}
async function load(path,state){const key='artistLoop'+crypto.randomUUID().replaceAll('-','');globalThis[key]=state;let source=await readFile(path,'utf8');source=source.replace('import { env } from "cloudflare:workers";',`const env=globalThis.${key}.env;`).replace('import { getChatGPTUser } from "../../chatgpt-auth";',`const getChatGPTUser=async()=>globalThis.${key}.user;`);{source=source.replace(/import \{ buyerIdentity \} from "[^"]*buyer";/,await readFile('app/api/musicbat/purchase/buyer.ts','utf8')).replace(/import \{[^;]+\} from "[^"]*stripe";/s,await readFile('app/api/musicbat/stripe/stripe.ts','utf8'))}const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(out+'\n//# sourceURL=artist-loop-route.mjs').toString('base64'))}
const post=body=>new Request('https://musicbat.audio/api/musicbat',{method:'POST',headers:{'content-type':'application/json',origin:'https://musicbat.audio'},body:JSON.stringify(body)});
async function upload(route,extra={}){const f=new FormData();for(const [k,v]of Object.entries({title:'Generated recording',artistName:'Test artist',primaryGenre:'Rock',subgenre:'Punk',style:'Hardcore',rightsAttested:'true',energyLane:'hard',...extra}))f.set(k,v);f.set('audio',new File([tone(30000)],'test.wav',{type:'audio/wav'}));return route.POST(new Request('https://musicbat.audio/api/musicbat',{method:'POST',body:f}))}
const mine=route=>route.GET(new Request('https://musicbat.audio/api/musicbat?view=rotunda'));
test('authenticated unified identity owns upload, persists hierarchy, rejects strangers and retains withdrawn/deleted catalog',async()=>{const f=await fixture();try{
 assert.equal((await upload(f.route)).status,201);let row=f.sqlite.prepare('SELECT * FROM tracks').get();assert.equal(row.artist_id,'owner');assert.equal(row.style,'Hardcore');assert.equal((await (await mine(f.route)).json()).tracks.length,1);
 f.state.user={userId:'stranger'};assert.equal((await (await mine(f.route)).json()).tracks.length,0);
 for(const action of ['edit_metadata','set_radio','withdraw_track','delete_track','set_sale_settings'])assert.equal((await f.route.POST(post({action,trackId:row.id,enabled:false,saleEnabled:false}))).status,403);
 f.state.user={userId:'owner'};assert.equal((await f.route.POST(post({action:'edit_metadata',trackId:1,title:'Correction',primaryGenre:'Rock',subgenre:'Post-Punk',style:'Art Punk',energyLane:'medium'}))).status,200);assert.equal(f.sqlite.prepare('SELECT style FROM tracks').get().style,'Art Punk');
 assert.equal((await f.route.POST(post({action:'edit_metadata',trackId:1,title:'x',primaryGenre:'Rock',style:'unparented',energyLane:'medium'}))).status,400);
 assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,200);assert.equal((await (await mine(f.route)).json()).tracks[0].status,'withdrawn');
 assert.equal((await f.route.POST(post({action:'delete_track',trackId:1}))).status,200);assert.equal((await (await mine(f.route)).json()).tracks[0].status,'deleted');assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_track_audit').get().n,4);
 f.state.user=null;assert.equal((await mine(f.route)).status,401);
}finally{f.sqlite.close()}});
test('owner appointments authorize representatives; revocation and foreign origins block changes',async()=>{const f=await fixture();try{
 await upload(f.route);f.state.user={userId:'rep'};assert.equal((await f.route.POST(post({action:'set_artist_identity',artistName:'Representative'}))).status,200);
 f.state.user={userId:'owner'};assert.equal((await f.route.POST(post({action:'grant_representative',trackId:1,representativeId:'rep'}))).status,200);
 f.state.user={userId:'rep'};assert.equal((await (await mine(f.route)).json()).tracks.length,1);assert.equal((await f.route.POST(post({action:'set_radio',trackId:1,enabled:false}))).status,200);assert.equal((await f.route.POST(post({action:'grant_representative',trackId:1,representativeId:'owner'}))).status,403);
 f.state.user={userId:'owner'};assert.equal((await f.route.POST(post({action:'revoke_representative',trackId:1,representativeId:'rep'}))).status,200);
 f.state.user={userId:'rep'};assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,403);
 const forged=post({action:'delete_track',trackId:1});forged.headers.set('origin','https://foreign.test');f.state.user={userId:'owner'};assert.equal((await f.route.POST(forged)).status,403);
}finally{f.sqlite.close()}});
test('connected upload → review → concurrent shared playback → response → quoted 85/15 purchase → withdrawal preserves paid download',async()=>{
 const f=await fixture(),dir=await mkdtemp(join(tmpdir(),'bat-artist-loop-'));let runtime;const originalFetch=globalThis.fetch;
 try {
  assert.equal((await upload(f.route)).status,201);const row=f.sqlite.prepare('SELECT * FROM tracks').get(),now=Date.now(),token='isolated-loop-authority-token-1234567890';
  runtime=new RadioRuntime({databasePath:join(dir,'radio.sqlite'),assetRoot:dir,gatewayToken:token});
  const p={recording_basis:'direct',recording_evidence:'GENERATED TEST ONLY',composition_evidence:'GENERATED TEST ONLY',reviewed_by:'fixture',reviewed_at:now-1,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:now-1,expires_at:now+86400000,withdrawn_at:null,territory:'worldwide'};
  f.sqlite.prepare('INSERT INTO playback_permissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,...Object.values(p));
  const object=[...f.objects.values()][0];await writeFile(join(dir,'upload.wav'),object.bytes);
  const asset={path:'upload.wav',sha256:createHash('sha256').update(object.bytes).digest('hex'),size:object.bytes.length,mediaType:'audio/wav',lawfulCopyReference:'Generated fixture',reviewedBy:'fixture',reviewedAt:now-1,durationEvidence:'PCM byte count',contractReference:'Generated fixture unrestricted',restrictionsReviewed:true};
  publishCatalogRecording(runtime,row,p,{artistIds:['test-artist'],albumId:'test-album',compilationIds:[],durationMs:30000,directRestrictions:null,metadataReviewed:true},asset);
  const review={reference:'GENERATED TEST ONLY channel',verifiedAt:now-1,expiresAt:now+86400000};
  runtime.establishChannel('free',{category:null,mode:'free-radio',territory:'worldwide',minimumArtists:1,review,gate:null});
  runtime.establishChannel('rock',{category:{genre:'Rock'},mode:'radio-plus',territory:'worldwide',minimumArtists:1,review,gate:null});
  runtime.establishChannel('hardcore',{category:{genre:'Rock',subgenre:'Punk',style:'Hardcore'},mode:'radio-plus',territory:'worldwide',minimumArtists:1,review,gate:null});runtime.tick();
  f.state.env.RADIO_SERVICE={fetch:request=>{const h=new Headers(request.headers);h.set('authorization','Bearer '+token);return runtime.fetch(new Request(request,{headers:h}))}};
  const service=catalogBoundRadio(f.state.env.RADIO_SERVICE,f.state.env.DB);
  const channel=(id='patron')=>new Request('https://radio.internal/channel',{headers:{'x-musicbat-listener':id,'x-musicbat-territory':'US'}});
  const [one,two]=await Promise.all([service.fetch(channel()),service.fetch(channel('listener-two'))]);assert.equal(one.status,200);assert.equal(two.status,200);const a=await one.json(),b=await two.json();assert.equal(a.snapshot.performance.authorityId,b.snapshot.performance.authorityId);assert.equal(a.snapshot.performance.trackId,String(row.id));
  let audio=new Request(new URL(a.mediaUrl.replace('/api/musicbat',''),'https://radio.internal'),{headers:channel().headers});assert.equal((await service.fetch(audio)).status,200);
  assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:row.id,listenId:'forged',signal:'up'}))).status,403);
  assert.equal((await f.route.POST(post({action:'toggle_keep',trackId:row.id,enabled:true}))).status,403);
  f.state.env.MUSICBAT_RADIO_PLUS_ENABLED='test';runtime.setMembership('patron',now+86400000,'GENERATED TEST ONLY membership');
  f.sqlite.prepare("INSERT INTO radio_plus_enrollments(id,user_id,status,paid_until) VALUES ('test-member','patron','active',?)").run(now+86400000);
  const tuned=await service.fetch(new Request('https://radio.internal/channel',{method:'POST',headers:channel().headers,body:JSON.stringify({category:{genre:'Rock'}})}));assert.equal(tuned.status,200);const plus=await tuned.json();
  f.state.user={userId:'patron'};
  assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:true}))).status,200);
  const listenRequest=()=>post({action:'start_listen',trackId:row.id,performanceKey:plus.snapshot.channelId+':'+plus.snapshot.performance.authorityId});
  const starts=await Promise.all([f.route.POST(listenRequest()),f.route.POST(listenRequest()),f.route.POST(listenRequest())]);assert.ok(starts.every(r=>r.status===200));
  const startIds=await Promise.all(starts.map(r=>r.json()));assert.equal(new Set(startIds.map(r=>r.listenId)).size,1);
  assert.equal((await f.route.POST(listenRequest())).status,200);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM listens').get().n,1);
const listen=f.sqlite.prepare('SELECT id FROM listens').get().id;f.sqlite.prepare("UPDATE listens SET started_at=datetime('now','-13 seconds') WHERE id=?").run(listen);assert.equal((await f.route.POST(post({action:'qualify_listen',trackId:row.id,listenId:listen}))).status,200);assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:row.id,listenId:listen,signal:'up'}))).status,200);
  assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:row.id,listenId:listen,signal:'up'}))).status,200);
  assert.equal((await f.route.POST(post({action:'toggle_keep',trackId:row.id,enabled:true}))).status,200);assert.equal((await f.route.POST(post({action:'toggle_keep',trackId:row.id,enabled:true}))).status,200);
  const shock=await (await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=shock-room'))).json();assert.equal(shock.rows[0].up_count,1);assert.equal(shock.rows[0].keep_count,1);assert.equal(shock.rows[0].shock_score,3);
  runtime.setMembership('patron',null,'GENERATED TEST ONLY expired');f.sqlite.prepare("UPDATE radio_plus_enrollments SET paid_until=0 WHERE user_id='patron'").run();assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:row.id,listenId:listen,signal:'down'}))).status,403);runtime.setMembership('patron',now+86400000,'GENERATED TEST ONLY renewed');f.sqlite.prepare("UPDATE radio_plus_enrollments SET paid_until=? WHERE user_id='patron'").run(now+86400000);
  f.state.user={userId:'owner'};
  assert.equal((await f.route.POST(post({action:'edit_metadata',trackId:row.id,title:'Generated correction',primaryGenre:'Rock',subgenre:'Punk',style:'Art Punk',energyLane:'hard'}))).status,200);
  assert.equal(JSON.parse(runtime.db.prepare('SELECT track_json FROM radio_sources').get().track_json).category.style,'Art Punk');
  assert.notEqual((await service.fetch(audio)).status,200);
  const next=await (await service.fetch(channel())).json();assert.equal(next.navigation.find(n=>n.category?.style==='Hardcore').dormant,true);
  audio=new Request(new URL(next.mediaUrl.replace('/api/musicbat',''),'https://radio.internal'),{headers:channel().headers});assert.equal((await service.fetch(audio)).status,200);
  assert.equal((await f.route.POST(post({action:'set_sale_settings',trackId:row.id,saleEnabled:true,saleRightsAttested:true,salePriceCents:200}))).status,200);
  f.sqlite.prepare("INSERT INTO artist_accounts(artist_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted) VALUES ('owner','acct_test_loop',1,1,1)").run();
  let session={id:'cs_test_loop',url:'https://checkout.stripe.com/test',livemode:false,status:'open'};
  globalThis.fetch=async url=>Response.json(String(url).includes('/accounts/')?{id:'acct_test_loop',charges_enabled:true,payouts_enabled:true,details_submitted:true}:session);
  const purchase=await load('app/api/musicbat/purchase/route.ts',f.state);const request=body=>new Request('https://musicbat.audio/api/musicbat/purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  f.state.user={userId:'patron'};
  const quote=await purchase.POST(request({trackId:row.id}));assert.equal(quote.status,409);const q=(await quote.json()).quote;assert.equal(q.artistShareCents,170);const checkout=await purchase.POST(request({trackId:row.id,confirmedTotalCents:q.totalCents}));assert.equal(checkout.status,201);const cookie=checkout.headers.get('set-cookie').split(';')[0],draft=(await checkout.json()).purchase;
  const saved=f.sqlite.prepare('SELECT * FROM purchases').get();assert.equal(saved.artist_share_cents,170);assert.equal(saved.platform_fee_cents,30);
  session={...session,status:'complete',payment_status:'paid',amount_total:q.totalCents,currency:'usd',metadata:{musicbat_purchase_id:draft.id,musicbat_processing_cents:String(q.processingCents)},payment_intent:{id:'pi_test_loop',application_fee_amount:30+q.processingCents,transfer_data:{destination:'acct_test_loop'}}};
  const event=JSON.stringify({id:'evt_test_loop',type:'checkout.session.completed',livemode:false,data:{object:{id:session.id,livemode:false}}}),stamp=Math.floor(Date.now()/1000);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.state.env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+event))).toString('hex');
  const webhook=await load('app/api/musicbat/stripe/webhook/route.ts',f.state);assert.equal((await webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${sig}`},body:event}))).status,200);
  f.state.user={userId:'owner'};
  const outcomes=(await (await mine(f.route)).json()).tracks[0];
  assert.equal(outcomes.discovery_listener_count,1);assert.equal(outcomes.follower_count,1);assert.equal(outcomes.checkout_count,1);assert.equal(outcomes.purchase_count,1);
  assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:row.id}))).status,200);assert.notEqual((await service.fetch(audio)).status,200);assert.notEqual((await service.fetch(new Request(audio,{headers:channel('listener-two').headers}))).status,200);assert.equal(runtime.db.prepare('SELECT count(*) n FROM radio_engine_catalog').get().n,0);assert.equal((await purchase.POST(request({trackId:row.id,confirmedTotalCents:q.totalCents}))).status,404);
  const download=await load('app/api/musicbat/purchase/[purchaseId]/download/route.ts',f.state);const delivered=await download.GET(new Request(`https://musicbat.audio/api/musicbat/purchase/${draft.id}/download`,{headers:{cookie}}));assert.equal(delivered.status,200);assert.deepEqual(new Uint8Array(await delivered.arrayBuffer()),object.bytes);assert.equal(f.sqlite.prepare('SELECT status FROM purchases').get().status,'paid');
 } finally {globalThis.fetch=originalFetch;runtime?.close();f.sqlite.close();await rm(dir,{recursive:true,force:true})}
});

test('revocation during management is rechecked inside atomic writes; rejected actions cannot revoke rights or forge audit',async()=>{
 const f=await fixture();try {
  await upload(f.route);f.state.user={userId:'rep'};await f.route.POST(post({action:'set_artist_identity',artistName:'Rep'}));f.state.user={userId:'owner'};await f.route.POST(post({action:'grant_representative',trackId:1,representativeId:'rep'}));
  const before=f.sqlite.prepare('SELECT count(*) n FROM artist_track_audit').get().n;
  const batch=f.state.env.DB.batch.bind(f.state.env.DB);f.state.env.DB.batch=async statements=>{f.sqlite.prepare('UPDATE track_authority SET revoked_at=1 WHERE account_id=?').run('rep');return batch(statements)};
  f.state.user={userId:'rep'};assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,403);assert.equal(f.sqlite.prepare('SELECT status FROM tracks').get().status,'active');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_track_audit').get().n,before);
 }finally{f.sqlite.close()}
});
test('failed atomic upload leaves neither orphan audio nor catalog; an invented performance cannot qualify responses',async()=>{
 const f=await fixture();try {
  const batch=f.state.env.DB.batch.bind(f.state.env.DB);f.state.env.DB.batch=async()=>{throw new Error('injected upload batch failure')};const original=console.error;console.error=()=>{};try{assert.equal((await upload(f.route)).status,500)}finally{console.error=original}
  assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tracks').get().n,0);f.state.env.DB.batch=batch;await upload(f.route);
  assert.equal((await f.route.POST(post({action:'start_listen',trackId:1,performanceKey:'invented'}))).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM listens').get().n,0);
 }finally{f.sqlite.close()}
});
test('sales withdrawal during asynchronous processor readiness cannot create a new purchase draft',async()=>{
 const f=await fixture(),originalFetch=globalThis.fetch;try{
  await upload(f.route);await f.route.POST(post({action:'set_sale_settings',trackId:1,saleEnabled:true,saleRightsAttested:true,salePriceCents:200}));f.sqlite.prepare("INSERT INTO artist_accounts(artist_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted) VALUES ('owner','acct_test_loop',1,1,1)").run();
  const route=await load('app/api/musicbat/purchase/route.ts',f.state);
  globalThis.fetch=async()=>{f.sqlite.prepare('UPDATE tracks SET sale_enabled=0 WHERE id=1').run();return Response.json({id:'acct_test_loop',charges_enabled:true,payouts_enabled:true,details_submitted:true})};
  const response=await route.POST(new Request('https://musicbat.audio/api/musicbat/purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trackId:1,confirmedTotalCents:237})}));assert.equal(response.status,409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM purchases').get().n,0);
 }finally{globalThis.fetch=originalFetch;f.sqlite.close()}
});

test('Free Radio and incomplete authority cannot qualify or count signals; withdrawal denies retained qualified keeps',async()=>{
 const f=await fixture();try {
  await upload(f.route);
  let category=null;
  f.state.env.RADIO_SERVICE={async fetch(){return Response.json({snapshot:{simulation:false,status:'playing',channelId:'fixture',category,performance:{trackId:'1',authorityId:'one'}}})}};
  const start=await f.route.POST(post({action:'start_listen',trackId:1,performanceKey:'fixture:one'}));assert.equal(start.status,200);const {listenId}=await start.json();
  f.sqlite.prepare("UPDATE listens SET started_at=datetime('now','-13 seconds')").run();
  assert.equal((await f.route.POST(post({action:'qualify_listen',trackId:1,listenId}))).status,403);
  category=undefined;assert.equal((await f.route.POST(post({action:'qualify_listen',trackId:1,listenId}))).status,403);
  category={genre:'Rock'};assert.equal((await f.route.POST(post({action:'qualify_listen',trackId:1,listenId}))).status,200);
  f.sqlite.prepare("UPDATE tracks SET status='withdrawn',radio_enabled=0 WHERE id=1").run();
  assert.equal((await f.route.POST(post({action:'toggle_keep',trackId:1,enabled:true}))).status,409);
  assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:1,listenId,signal:'up'}))).status,409);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM track_keeps').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_feedback').get().n,0);
 }finally{f.sqlite.close()}
});
test('patron follows persist independently; stable artist URLs and genuine owner activity survive edit and withdrawal',async()=>{
 const f=await fixture();try{
  await upload(f.route);
  const directory=()=>f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=artists'));
  let d=await (await directory()).json();assert.equal(d.canManage,true);assert.equal(d.artists.length,1);const slug=d.artists[0].slug;
  const initial=await (await mine(f.route)).json();assert.equal(initial.tracks[0].listener_count,0);assert.equal(initial.tracks[0].artist_slug,slug);
  f.state.user={userId:'patron'};d=await (await directory()).json();assert.equal(d.canManage,false);assert.equal((await (await mine(f.route)).json()).tracks.length,0);
  for(let i=0;i<2;i++)assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:true}))).status,200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM artist_follows').get().n,1);assert.equal((await (await directory()).json()).artists[0].following,1);
  f.state.user={userId:'another-patron'};assert.equal((await (await directory()).json()).artists[0].following,0);
  assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:false}))).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM artist_follows').get().n,1);
  assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'unknown',enabled:true}))).status,404);
  f.sqlite.exec("INSERT INTO listens(id,track_id,listener_id,qualified) VALUES ('p1',1,'patron',1),('p2',1,'patron',1),('own',1,'owner',1),('unqualified',1,'other',0)");
  f.state.user={userId:'owner'};assert.equal((await (await mine(f.route)).json()).tracks[0].listener_count,1);
  assert.equal((await f.route.POST(post({action:'set_artist_identity',artistName:'Evolving name'}))).status,200);assert.equal((await (await directory()).json()).artists[0].slug,slug);
  await upload(f.route,{title:'Second release'});assert.equal((await (await directory()).json()).artists.length,1);
  assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,200);
  assert.equal((await (await directory()).json()).artists[0].track_count,1);
  assert.equal((await (await mine(f.route)).json()).tracks.length,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM listens').get().n,4);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM artist_follows').get().n,1);
  f.state.user={userId:'patron'};assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:false}))).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM artist_follows').get().n,0);
  f.state.user=null;assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:true}))).status,401);
 }finally{f.sqlite.close()}
});

test('living metadata persists independently of permissions and account authority',async()=>{
 const f=await fixture();try{
  const r=await upload(f.route,{metadata:JSON.stringify({album:'First record',isrc:'US-ABC-26-00001',iswc:'T-123.456.789-0',songwriters:['Writer'],recordingRightsHolders:['Band'],compositionRightsHolders:['Writer']})});
  assert.equal(r.status,201);let row=f.sqlite.prepare('SELECT * FROM tracks').get();const id=row.id;
  assert.equal(JSON.parse(row.recording_metadata).isrc,'USABC2600001');assert.equal(JSON.parse(row.recording_metadata).iswc,'T1234567890');
  const tech=JSON.parse(row.technical_metadata);assert.equal(tech.format,'wav');assert.equal(tech.durationMs,30000);assert.ok(tech.sampleRate>0);
  assert.equal(row.compilation_allowed,0);assert.equal(row.licensing_allowed,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM playback_permissions').get().n,0);
  f.state.user={userId:'stranger'};assert.equal((await f.route.POST(post({action:'set_recording_metadata',trackId:id,metadata:{album:'Forged'}}))).status,403);
  f.state.user={userId:'owner'};
  assert.equal((await f.route.POST(post({action:'set_recording_metadata',trackId:id,metadata:{album:'Corrected',songwriters:['Two']}}))).status,200);
  row=f.sqlite.prepare('SELECT * FROM tracks').get();assert.equal(row.id,id);assert.equal(JSON.parse(row.recording_metadata).album,'Corrected');assert.equal(JSON.parse(row.technical_metadata).durationMs,30000);
  assert.equal((await f.route.POST(post({action:'set_recording_metadata',trackId:id,metadata:{isrc:'not-valid'}}))).status,400);
  for(const permission of ['compilation','licensing'])assert.equal((await f.route.POST(post({action:'set_catalog_permission',trackId:id,permission,enabled:true}))).status,200);
  assert.equal(f.sqlite.prepare('SELECT compilation_allowed FROM tracks').get().compilation_allowed,1);
  assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:id}))).status,200);
  row=f.sqlite.prepare('SELECT * FROM tracks').get();assert.equal(row.compilation_allowed,0);assert.equal(row.licensing_allowed,0);assert.equal(row.radio_enabled,0);assert.equal(row.sale_enabled,0);
  assert.equal((await f.route.POST(post({action:'set_catalog_permission',trackId:id,permission:'licensing',enabled:true}))).status,403);
 }finally{f.sqlite.close()}
});

test('metadata bounds reject malformed declarations without registering audio',async()=>{const f=await fixture();try{
 for(const metadata of ['[]','null',JSON.stringify({songwriters:['x'.repeat(201)]}),JSON.stringify({album:'a'.repeat(201)}),JSON.stringify({iswc:'wrong'})])assert.equal((await upload(f.route,{metadata})).status,400);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tracks').get().n,0);assert.equal(f.objects.size,0);
}finally{f.sqlite.close()}});

test('embedded ID3 and FLAC metadata are bounded suggestions; explicit album wins',async()=>{
 const f=await fixture();try{
  async function send(bytes,name,metadata={}) {const form=new FormData();for(const [k,v]of Object.entries({title:'Explicit title',artistName:'Artist',rightsAttested:'true',primaryGenre:'Rock',energyLane:'medium',metadata:JSON.stringify(metadata)}))form.set(k,v);form.set('audio',new File([bytes],name));return f.route.POST(new Request('https://musicbat.audio/api/musicbat',{method:'POST',body:form}));}
  const value=Buffer.from('\u0003Embedded album'),frame=Buffer.alloc(10+value.length);frame.write('TALB');frame.writeUInt32BE(value.length,4);value.copy(frame,10);const header=Buffer.from([73,68,51,3,0,0,0,0,0,frame.length]);
  assert.equal((await send(Buffer.concat([header,frame]),'tagged.mp3',{album:'Musician correction'})).status,201);
  let row=f.sqlite.prepare('SELECT * FROM tracks WHERE id=1').get();assert.equal(JSON.parse(row.recording_metadata).album,'Musician correction');assert.equal(JSON.parse(row.technical_metadata).embedded.album,'Embedded album');assert.equal(row.title,'Explicit title');assert.equal(JSON.parse(row.technical_metadata).durationMs,undefined);
  const info=Buffer.alloc(34);const rate=44100,samples=88200;info.writeUInt32BE((rate*4096)+(1<<9)+(15<<4),10);info.writeUInt32BE(samples,14);
  const entry=Buffer.from('ALBUM=FLAC record'),comments=Buffer.alloc(12+entry.length);comments.writeUInt32LE(0,0);comments.writeUInt32LE(1,4);comments.writeUInt32LE(entry.length,8);entry.copy(comments,12);
  const flac=Buffer.concat([Buffer.from('fLaC'),Buffer.from([0,0,0,34]),info,Buffer.from([132,0,0,comments.length]),comments]);
  assert.equal((await send(flac,'tagged.flac')).status,201);row=f.sqlite.prepare('SELECT * FROM tracks WHERE id=2').get();assert.equal(JSON.parse(row.recording_metadata).album,'FLAC record');assert.equal(JSON.parse(row.technical_metadata).durationMs,2000);
  const exported=await (await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=catalog-export'))).json();assert.equal(exported.schema,'musicbat.catalog.v1');assert.equal(exported.tracks.length,2);assert.equal(exported.tracks[0].recording_metadata.album,'Musician correction');assert.equal(exported.tracks[0].audio_url,undefined);
  f.state.user={userId:'stranger'};assert.equal((await (await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=catalog-export'))).json()).tracks.length,0);
 }finally{f.sqlite.close()}
});

test('deletion removes unneeded content, is retryable, and retains pending buyer assets',async()=>{
 const f=await fixture();try{
  await upload(f.route);let row=f.sqlite.prepare('SELECT * FROM tracks').get();
  f.sqlite.prepare("INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status) VALUES ('pending-buyer','buyer',?,'Captured title','Artist',?,'pending')").run(row.id,row.audio_url);
  assert.equal((await f.route.POST(post({action:'delete_track',trackId:row.id}))).status,200);assert.equal(f.objects.size,1);
  assert.equal((await f.route.POST(post({action:'set_radio',trackId:row.id,enabled:true}))).status,409);
  f.sqlite.prepare("UPDATE purchases SET status='cancelled', cleanup_state='expired' WHERE id='pending-buyer'").run();
  const retried=await f.route.POST(post({action:'delete_track',trackId:row.id}));assert.equal(retried.status,200);assert.equal((await retried.json()).contentRemoval,'removed');assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT title FROM purchases').get().title,'Captured title');
 }finally{f.sqlite.close()}
});
