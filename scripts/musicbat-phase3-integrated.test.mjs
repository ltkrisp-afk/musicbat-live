import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setup} from './checkout-recovery-fixture.mjs';
import {d1,post,load,upload} from './website-fixture.mjs';
import {RadioRuntime} from '../radio/runtime.ts';
import {publishCatalogRecording} from '../radio/catalog-import.ts';
import {catalogBoundRadio} from '../lib/catalog-radio-boundary.ts';
import {membershipBoundRadio} from '../lib/membership-radio-boundary.ts';
import {forwardRadio} from '../lib/radio-gateway.ts';
import {runCheckoutRecovery} from '../app/api/musicbat/stripe/stripe.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('Phase 3: reviewed upload → Free Radio bytes → signed purchase/download → withdrawal outage → DB reopen/concurrent recovery → durable race review',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'musicbat-phase3-')),databasePath=join(dir,'app.sqlite');
  const f=await setup(databasePath);let runtime,reopened,secondWorker;
  try {
    // setup uploads actual generated WAV bytes with explicit rights through POST.
    assert.equal((await upload(f.route,{rightsAttested:'false'})).status,400);
    const track=f.sqlite.prepare('SELECT * FROM tracks').get();assert.equal(track.rights_attested,1);
    const bytes=[...f.objects.values()][0].bytes,now=Date.now(),token='phase3-fixture-private-radio-authority';
    runtime=new RadioRuntime({databasePath:join(dir,'radio.sqlite'),assetRoot:dir,gatewayToken:token});
    const permission={recording_basis:'direct',recording_evidence:'Generated Phase 3 fixture only',composition_evidence:'Generated Phase 3 fixture only',reviewed_by:'isolated fixture reviewer',reviewed_at:now-1,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:now-1,expires_at:now+86400000,withdrawn_at:null,territory:'worldwide'};
    f.sqlite.prepare('INSERT INTO playback_permissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(track.id,...Object.values(permission));
    await writeFile(join(dir,'recording.wav'),bytes);
    publishCatalogRecording(runtime,track,permission,{artistIds:['phase3-artist'],albumId:'phase3-album',compilationIds:[],durationMs:30000,directRestrictions:null,metadataReviewed:true},{path:'recording.wav',sha256:hash(bytes),size:bytes.length,mediaType:'audio/wav',lawfulCopyReference:'Generated fixture',reviewedBy:'fixture',reviewedAt:now-1,durationEvidence:'PCM byte count',contractReference:'Generated fixture authorization',restrictionsReviewed:true});
    runtime.establishChannel('free',{category:null,mode:'free-radio',territory:'worldwide',minimumArtists:1,review:{reference:'Generated test channel',verifiedAt:now-1,expiresAt:now+86400000},gate:null});runtime.tick();
    f.state.env.RADIO_SERVICE={fetch:request=>{const headers=new Headers(request.headers);headers.set('authorization','Bearer '+token);return runtime.fetch(new Request(request,{headers}))}};
    const radio=()=>catalogBoundRadio(membershipBoundRadio(f.state.env.RADIO_SERVICE,f.state.env.DB,false),f.state.env.DB,f.state.env.BUCKET);
    const radioRequest=new Request('https://musicbat.audio/api/musicbat/channel');
    const beforeCalls=f.calls.length;
    const channel=await forwardRadio(radioRequest,radio(),'patron');assert.equal(channel.status,200);
    const station=await channel.json();assert.equal(station.snapshot.category,null);assert.equal(station.snapshot.performance.trackId,String(track.id));
    const media=new Request(new URL(station.mediaUrl,'https://musicbat.audio'));
    const audio=await forwardRadio(media,radio(),'patron');assert.equal(audio.status,200);
    assert.equal(hash(new Uint8Array(await audio.arrayBuffer())),hash(bytes));
    assert.equal(f.calls.length,beforeCalls,'Free Radio must not call Stripe');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM radio_plus_enrollments').get().n,0);
    f.state.user={userId:'patron'};
    assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:track.id}))).status,403);
    assert.equal((await f.route.POST(post({action:'set_sale_settings',trackId:track.id,saleEnabled:false}))).status,403);
    assert.deepEqual((await (await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=rotunda'))).json()).tracks,[]);

    const purchase=await load('app/api/musicbat/purchase/route.ts',f.state);
    const buy=buyer=>purchase.POST(new Request('https://musicbat.audio/api/musicbat/purchase',{method:'POST',headers:{'content-type':'application/json',cookie:'musicbat_buyer='+buyer.repeat(64)},body:JSON.stringify({trackId:track.id,confirmedTotalCents:237})}));
    const orders=[];
    for(const buyer of ['a','b','c']){const result=await buy(buyer);assert.equal(result.status,201);orders.push((await result.json()).purchase)}
    const sessions=[...f.sessions.values()];sessions[0].status='complete';sessions[0].payment_status='paid';
    const webhook=await load('app/api/musicbat/stripe/webhook/route.ts',f.state);
    const oldError=console.error;console.error=()=>{};
    try{assert.equal((await webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',body:'{}'}))).status,400)}finally{console.error=oldError}
    const successful={id:'evt_phase3_success',sessionId:sessions[0].id,created:Math.floor(now/1000)-2};
    assert.equal((await f.send(successful)).status,200);assert.equal((await f.send(successful)).status,200);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM stripe_events WHERE event_id=?').get(successful.id).n,1);
    const download=await load('app/api/musicbat/purchase/[purchaseId]/download/route.ts',f.state);
    const get=(id,buyer)=>download.GET(new Request('https://musicbat.audio/api/musicbat/purchase/'+id+'/download',{headers:{cookie:'musicbat_buyer='+buyer.repeat(64)}}));
    assert.equal((await get(orders[0].id,'b')).status,404);
    assert.equal((await get(orders[1].id,'b')).status,402);
    assert.equal(hash(new Uint8Array(await (await get(orders[0].id,'a')).arrayBuffer())),hash(bytes));
    const ledger=f.sqlite.prepare('SELECT amount_cents,artist_share_cents,platform_fee_cents,processing_cents FROM purchases WHERE id=?').get(orders[0].id);
    assert.deepEqual({...ledger},{amount_cents:200,artist_share_cents:170,platform_fee_cents:30,processing_cents:37});

    f.state.user={userId:'owner'};const processor=globalThis.fetch;
    globalThis.fetch=async()=>{throw new Error('Phase 3 processor outage')};
    const withdrawn=await f.route.POST(post({action:'withdraw_track',trackId:track.id}));assert.equal(withdrawn.status,200);assert.equal((await withdrawn.json()).checkoutCleanup.pending,2);
    assert.equal((await buy('d')).status,404);
    assert.notEqual((await forwardRadio(media,radio(),'patron')).status,200);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM checkout_recovery_jobs WHERE state='retrying'").get().n,2);
    const cutoff=f.sqlite.prepare('SELECT sale_withdrawn_at FROM purchases WHERE id=?').get(orders[2].id).sale_withdrawn_at;
    sessions[2].status='complete';sessions[2].payment_status='paid';
    const errorLog=console.error;console.error=()=>{};
    try{assert.equal((await f.send({id:'evt_cannot_fetch',sessionId:sessions[2].id,created:Math.floor(cutoff/1000)})).status,400)}finally{console.error=errorLog}
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM stripe_events WHERE event_id=?').get('evt_cannot_fetch').n,0);

    f.sqlite.close();reopened=new DatabaseSync(databasePath);secondWorker=new DatabaseSync(databasePath);f.state.env.DB=d1(reopened);globalThis.fetch=processor;
    const due=reopened.prepare('SELECT max(next_attempt_at) due FROM checkout_recovery_jobs').get().due+1;
    const attempts=await Promise.all([runCheckoutRecovery(f.state.env,{now:due}),runCheckoutRecovery({...f.state.env,DB:d1(secondWorker)},{now:due})]);
    assert.equal(attempts.reduce((sum,r)=>sum+r.processed,0),2);
    assert.equal(reopened.prepare('SELECT status FROM purchases WHERE id=?').get(orders[1].id).status,'cancelled');
    assert.equal(reopened.prepare('SELECT status FROM purchases WHERE id=?').get(orders[2].id).status,'payment_review');
    assert.equal(reopened.prepare('SELECT state FROM checkout_recovery_jobs WHERE purchase_id=?').get(orders[2].id).state,'review');
    assert.equal(f.calls.filter(c=>c.path.endsWith('/expire')).length,1);
    const ambiguous={id:'evt_phase3_same_second',sessionId:sessions[2].id,created:Math.floor(cutoff/1000)};
    assert.equal((await f.send(ambiguous)).status,200);assert.equal((await f.send(ambiguous)).status,200);
    assert.equal((await f.send({id:'evt_phase3_stale_expired',sessionId:sessions[2].id,type:'checkout.session.expired'})).status,200);
    assert.equal(reopened.prepare('SELECT status FROM purchases WHERE id=?').get(orders[2].id).status,'payment_review');
    assert.equal((await get(orders[2].id,'c')).status,402);
    assert.equal(hash(new Uint8Array(await (await get(orders[0].id,'a')).arrayBuffer())),hash(bytes));
    assert.deepEqual(reopened.prepare('SELECT amount_cents,artist_share_cents,platform_fee_cents,processing_cents FROM purchases WHERE id=?').get(orders[0].id),ledger);
    assert.equal((await f.route.POST(post({action:'delete_track',trackId:track.id}))).status,200);
    assert.equal(hash(new Uint8Array(await (await get(orders[0].id,'a')).arrayBuffer())),hash(bytes));
  }finally{secondWorker?.close();reopened?.close();runtime?.close();f.close();await rm(dir,{recursive:true,force:true})}
});

test('Phase 3: absent hosted storage/radio and unavailable Stripe fail closed without a purchase or media fallback',async()=>{
  const f=await setup();try{
    const purchase=await load('app/api/musicbat/purchase/route.ts',f.state);
    const request=()=>new Request('https://musicbat.audio/api/musicbat/purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trackId:1,confirmedTotalCents:237})});
    const bucket=f.state.env.BUCKET;f.state.env.BUCKET=undefined;assert.equal((await purchase.POST(request())).status,503);f.state.env.BUCKET=bucket;
    const db=f.state.env.DB;f.state.env.DB=undefined;assert.equal((await purchase.POST(request())).status,503);f.state.env.DB=db;
    const saved=console.error;console.error=()=>{};globalThis.fetch=async()=>{throw new Error('Stripe unavailable')};
    try{assert.equal((await purchase.POST(request())).status,503)}finally{console.error=saved}
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM purchases').get().n,0);
    assert.equal((await forwardRadio(new Request('https://musicbat.audio/api/musicbat/channel'),undefined,'patron')).status,503);
  }finally{f.close()}
});
