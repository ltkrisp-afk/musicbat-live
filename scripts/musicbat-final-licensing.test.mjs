import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture,upload,load} from './website-fixture.mjs';
import {directLicenseFinal} from '../lib/direct-license-final.ts';
import {verifiedCurrentAgreement} from '../lib/agreement-integrity.ts';
import {evaluateUse,authorizeRecordingUse,authorizeChannelUse} from '../lib/recording-use.ts';
import {verifyIngestion} from '../lib/ingestion-verification.ts';
import {membershipStatement,largestRemainder} from '../lib/membership-accounting.ts';
import {closeMembershipMonth} from '../lib/membership-ledger.ts';
const final=directLicenseFinal;
function activateFixture(f){
 // Isolated in-memory test approval only; never a production activation script.
 f.sqlite.prepare('INSERT INTO direct_license_versions VALUES (?,?,?,?,?)').run(final.version,final.body,final.acceptance_text,'SYNTHETIC LOCAL APPROVAL',1);
 f.sqlite.prepare('INSERT INTO agreement_integrity VALUES (?,?,1,?)').run(final.version,final.sha256,'SYNTHETIC TEST APPROVAL; no attorney evidence implied');
 f.sqlite.prepare('UPDATE direct_license_current SET version=?').run(final.version);
 f.sqlite.prepare('INSERT INTO agreement_review_receipts VALUES (?,?,?,?,?)').run('test-review','owner',final.version,final.sha256,Date.now()-1);
}
const consent=()=>({agreementVersion:final.version,reviewReceiptId:'test-review',agreementDigest:final.sha256,agreementReviewedAt:String(Date.now()-1),electronicConsent:'true',retainableCopyConfirmed:'true',completedSchedules:JSON.stringify({noticeContact:'synthetic@example.test',scope:'worldwide; free and member streaming; download; bounded fixture term',beneficiaryInstructions:'One verified synthetic recipient; 10000 bps; 25% QCMR and zero-unit discovery approved'})});
const decisionRow=(now=Date.now())=>({decision:'cleared',master_verified:1,composition_verified:1,authority_reference:'test-only signed full rights',compensation_reference:'test-only signed 25% QCMR / 85-15 / discovery instructions',recipient_reference:'test-only verified designated recipient',territory:'worldwide',starts_at:now-1000,expires_at:now+100000,license_required:0,platform_cost_cents:null,payer:null,funding_source:null,ceiling_bps:null,ceiling_reference:null,counsel_required:0,counsel_reference:null});
function review(f,trackId,use,extra={}){
 const row={track_id:trackId,use,...decisionRow(),reviewed_by:'synthetic operator',reviewed_at:Date.now(),...extra};
 const keys=Object.keys(row);f.sqlite.prepare('INSERT INTO recording_use_reviews('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));
}
async function uploaded(){const f=await fixture();activateFixture(f);const r=await upload(f.route,consent());assert.equal(r.status,201);const {track}=await r.json();return {f,track};}
async function verified(f,track){
 const get=f.state.env.BUCKET.get;f.state.env.BUCKET.get=async key=>{const o=await get(key);return o?{...o,arrayBuffer:async()=>o.body.buffer.slice(o.body.byteOffset,o.body.byteOffset+o.body.byteLength)}:null;};
 const result=await verifyIngestion(f.state.env.DB,f.state.env.BUCKET,track.id,'synthetic-file-worker');assert.equal(result.state,'VERIFIED');
}

test('final UTF-8 agreement, six schedules and computed external digest match exact authoritative bytes',async()=>{
 const source=await readFile('legal/direct-licensing-agreement-2026-10-29.3.txt');assert.equal(source.length,48789);assert.equal(source.toString('utf8'),final.body);
 assert.equal(createHash('sha256').update(source).digest('hex'),final.sha256);
 for(const s of 'ABCDEF')assert.match(final.body,new RegExp('## Schedule '+s+' -'));
 assert.match(final.body,/The owner confirms attorney review/); // preserved discrepancy, never silently removed
 const phrase='For both digital purchases and streaming, MusicBat pays only one designated, verified recipient';assert.equal(final.body.split(phrase).length-1,3);
});
test('final candidate is readable and retainable while database activation remains absent',async()=>{
 const f=await fixture();try{f.sqlite.exec('DELETE FROM direct_license_current');const api=await load('app/api/musicbat/agreement/route.ts',f.state);
 const r=await api.GET();assert.equal(r.status,503);assert.equal((await r.json()).candidate.sha256,final.sha256);
 const copy=await api.GET(new Request('https://musicbat.audio/api/musicbat/agreement?format=text'));assert.equal(await copy.text(),final.body);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM direct_license_current').get().n,0);
 }finally{f.sqlite.close();}
});
test('activation cannot bypass integrity approval; body/digest mismatch is rejected without changing either',async()=>{
 const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO direct_license_versions VALUES (?,?,?,?,?)').run(final.version,final.body+'\n',final.acceptance_text,'synthetic',1);
 assert.throws(()=>f.sqlite.prepare('UPDATE direct_license_current SET version=?').run(final.version),/release approval/);
 f.sqlite.prepare('INSERT INTO agreement_integrity VALUES (?,?,1,?)').run(final.version,final.sha256,'synthetic');f.sqlite.prepare('UPDATE direct_license_current SET version=?').run(final.version);
 await assert.rejects(verifiedCurrentAgreement(f.state.env.DB),/integrity/);
 const api=await load('app/api/musicbat/agreement/route.ts',f.state);assert.equal((await api.GET()).status,503);
 assert.equal(f.sqlite.prepare('SELECT body FROM direct_license_versions WHERE version=?').get(final.version).body,final.body+'\n');
 }finally{f.sqlite.close();}
});
test('final upload requires digest, opening acknowledgement, electronic consent, retainable copy and completed particulars',async()=>{
 const f=await fixture();try{activateFixture(f);
 for(const values of [{agreementDigest:'0'.repeat(64)},{reviewReceiptId:'forged'},{electronicConsent:'false'},{retainableCopyConfirmed:'false'},{completedSchedules:'{}'}])assert.ok([409,422].includes((await upload(f.route,{...consent(),...values})).status));
 assert.equal(f.objects.size,0);
 }finally{f.sqlite.close();}
});
test('final consent and completed schedules are immutable, signer-linked and private; uploads start nonpayable and private',async()=>{
 const {f,track}=await uploaded();try{
 const row=f.sqlite.prepare('SELECT * FROM artist_acceptance_evidence').get();assert.equal(row.sha256,final.sha256);assert.equal(row.legal_name,'Synthetic test artist');assert.match(row.schedules_json,/synthetic@example.test/);
 assert.equal(track.sale_enabled,0);assert.equal(track.radio_enabled,0);assert.equal(f.sqlite.prepare('SELECT is_payable FROM recording_payment_eligibility').get().is_payable,0);
 assert.throws(()=>f.sqlite.exec("UPDATE artist_acceptance_evidence SET legal_name='forged'"),/append-only/);
 assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'free-stream','US')).reason,'ingestion-not-verified');
 assert.throws(()=>f.sqlite.exec('UPDATE tracks SET sale_enabled=1'),/Independent download/);
 f.state.user={userId:'other'};const records=await f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=license-records'));assert.equal((await records.json()).records.length,0);
 }finally{f.sqlite.close();}
});
test('verified media never grants rights; independent download clearance does not enable other uses',async()=>{
 const {f,track}=await uploaded();try{
 await verified(f,track);assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'download-sale','US')).allowed,false);
 review(f,track.id,'download-sale');assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'download-sale','US')).allowed,true);
 for(const use of ['discovery-preview','noninteractive-radio','free-stream','member-stream','other'])assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,use,'US')).allowed,false);
 f.sqlite.exec('UPDATE tracks SET sale_enabled=1');assert.equal(f.sqlite.prepare('SELECT is_payable FROM recording_payment_eligibility').get().is_payable,1);
 review(f,track.id,'member-stream',{decision:'hold'});assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'download-sale','US')).allowed,true);
 }finally{f.sqlite.close();}
});
test('self-controlled zero-extra-license use needs no platform expense; third-party cost stays held without payer, ceiling and funding',()=>{
 const now=Date.now(),row=decisionRow(now);assert.equal(evaluateUse(row,{now,territory:'US',basePriceCents:200}).allowed,true);
 const cost={...row,license_required:1,platform_cost_cents:15,payer:'MusicBat',funding_source:'separate platform budget'};
 assert.equal(evaluateUse(cost,{now,territory:'US',basePriceCents:200}).reason,'owner-license-ceiling-undecided');
 assert.equal(evaluateUse({...cost,ceiling_bps:5000,ceiling_reference:'synthetic owner choice'},{now,territory:'US',basePriceCents:200}).allowed,true);
 assert.equal(evaluateUse({...cost,platform_cost_cents:16,ceiling_bps:5000,ceiling_reference:'synthetic'},{now,territory:'US',basePriceCents:200}).reason,'license-cost-exceeds-ceiling');
 assert.equal(evaluateUse({...cost,payer:'Artist',ceiling_bps:10000,ceiling_reference:'synthetic'},{now,territory:'US',basePriceCents:200}).allowed,false);
});
test('territory, time and required counsel evidence independently deny an otherwise cleared use',()=>{
 const now=Date.now();for(const extra of [{territory:''},{territory:'GB'},{expires_at:now},{starts_at:now+1},{master_verified:0},{composition_verified:0},{counsel_required:1,counsel_reference:null}])assert.equal(evaluateUse({...decisionRow(now),...extra},{now,territory:'US'}).allowed,false);
});
test('72-hour worker rejects malformed media and expires pending ingestion without making it payable',async()=>{
 for(const expired of [false,true]){const {f,track}=await uploaded();try{
 const r=await verifyIngestion(f.state.env.DB,{get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})},track.id,'synthetic',expired?Date.now()+259200001:Date.now());assert.equal(r.state,'FAILED');
 assert.equal(f.sqlite.prepare('SELECT is_payable FROM recording_payment_eligibility').get().is_payable,0);
 }finally{f.sqlite.close();}}
});
test('ordinary withdrawal preserves purchase records; a specific rights delivery restriction preserves entitlement and blocks bytes',async()=>{
 const {f,track}=await uploaded();try{await verified(f,track);review(f,track.id,'download-sale');
 f.sqlite.prepare("INSERT INTO purchases(id,buyer_hash,buyer_account_id,track_id,title,artist_name,audio_path,status) VALUES ('retained','hash','owner',?,'Test','Band',?,'paid')").run(track.id,track.audio_url);
 f.sqlite.exec("UPDATE tracks SET status='withdrawn',sale_enabled=0,radio_enabled=0");
 const route=await load('app/api/musicbat/purchase/[purchaseId]/download/route.ts',f.state),request=new Request('https://musicbat.audio/api/musicbat/purchase/retained/download');assert.equal((await route.GET(request)).status,200);
 f.sqlite.prepare('INSERT INTO recording_delivery_restrictions(track_id,restricted,reason,authority_reference,reviewed_by,reviewed_at) VALUES (?,1,?,?,?,?)').run(track.id,'synthetic demonstrated lack of authority','synthetic claim','synthetic operator',Date.now());
 assert.equal((await route.GET(request)).status,451);assert.equal(f.sqlite.prepare('SELECT status FROM purchases').get().status,'paid');
 }finally{f.sqlite.close();}
});
const evt=(kind,amount,extra={})=>({source_id:crypto.randomUUID(),source_reference:crypto.randomUUID(),month:'2026-09',kind,amount_cents:amount,principal_reference:null,livemode:1,settled:1,...extra});
const accounting=(events,extra={})=>membershipStatement(events,{month:'2026-09',deficitCents:0,unallocatedCents:0,plays:[],receiptPrincipals:{},priorReversed:{},...extra});
test('QCMR uses actual settled receipts, actual fees and credits; pool is floored at 25% and independent of purchase revenue',()=>{
 const result=accounting([evt('receipt',10001),evt('processing-fee',301),evt('fee-credit',1)]);assert.equal(result.qcmrCents,9701);assert.equal(result.newPoolCents,2425);assert.equal(result.platformBeforeExpensesCents,7276);assert.equal(result.unallocatedCents,2425);
 for(const extra of [{livemode:0},{settled:0},{month:'2026-08'},{kind:'digital-purchase'}])assert.throws(()=>accounting([evt('receipt',500,extra)]));
});
test('refund and chargeback principal cannot double-deduct and negative adjustments carry forward without negative payout',()=>{
 assert.throws(()=>accounting([evt('principal-reversal',500,{principal_reference:'p'})],{receiptPrincipals:{p:500},priorReversed:{p:1}}),/twice/);
 const result=accounting([evt('principal-reversal',500,{principal_reference:'p'})],{receiptPrincipals:{p:500}});assert.equal(result.deficitCents,500);assert.equal(result.newPoolCents,0);
 const next=accounting([evt('receipt',1000)],{deficitCents:500});assert.equal(next.newPoolCents,125);
 const same=evt('receipt',500);assert.throws(()=>accounting([same,same]),/duplicate/);
});
test('largest remainder preserves cents and stable ties; eligible plays redistribute a fixed pool without enlarging it',()=>{
 assert.deepEqual(largestRemainder(2,[{id:'c',weight:1},{id:'b',weight:1},{id:'a',weight:1}]).allocations,[{id:'a',cents:1},{id:'b',cents:1},{id:'c',cents:0}]);
 const plays=[{id:'one',count:100,beneficiaries:[{id:'a',bps:3333},{id:'b',bps:6667}]}];
 const result=accounting([evt('receipt',501)],{plays,unallocatedCents:20});assert.equal(result.newPoolCents,125);assert.equal(result.recordings[0].cents,145);assert.equal(result.recordings[0].beneficiaries.reduce((n,b)=>n+b.cents,0),145);
 assert.throws(()=>accounting([],{plays:[{...plays[0],beneficiaries:[{id:'a',bps:5000}]}]}),/10000/);
});
test('durable membership statements reject duplicates/closed edits and carry unallocated liabilities separately',async()=>{
 const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO membership_revenue_events VALUES (?,?,?,?,?,?,1,1,?,?)').run('receipt1','provider-settlement1','2026-08','receipt',500,null,'operator',1);
 const first=await closeMembershipMonth(f.state.env.DB,'2026-08','synthetic closer',Date.UTC(2026,9,29));assert.equal(first.unallocatedCents,125);
 const second=await closeMembershipMonth(f.state.env.DB,'2026-09','synthetic closer',Date.UTC(2026,9,29));assert.equal(second.newPoolCents,0);assert.equal(second.carriedPoolCents,125);
 await assert.rejects(closeMembershipMonth(f.state.env.DB,'2026-09','synthetic',Date.UTC(2026,9,29)),/rewritten/);
 assert.throws(()=>f.sqlite.exec('DELETE FROM membership_pool_statements'),/append-only/);
 assert.throws(()=>f.sqlite.prepare('INSERT INTO membership_revenue_events VALUES (?,?,?,?,?,?,1,1,?,?)').run('late','provider-late','2026-08','receipt',500,null,'operator',1),/Closed month/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM platform_license_expenses').get().n,0);
 }finally{f.sqlite.close();}
});

test('shared noninteractive radio needs its own transmission grant in addition to the selected listening tier',async()=>{
 const {f,track}=await uploaded();try{await verified(f,track);review(f,track.id,'free-stream');
 assert.equal((await authorizeChannelUse(f.state.env.DB,track.id,false,'US')).allowed,false);
 review(f,track.id,'noninteractive-radio');assert.equal((await authorizeChannelUse(f.state.env.DB,track.id,false,'US')).allowed,true);
 assert.equal((await authorizeChannelUse(f.state.env.DB,track.id,true,'US')).allowed,false);
 review(f,track.id,'download-sale');review(f,track.id,'free-stream',{decision:'hold'});
 assert.equal((await authorizeChannelUse(f.state.env.DB,track.id,false,'US')).allowed,false);assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'download-sale','US')).allowed,true);
 }finally{f.sqlite.close();}
});
