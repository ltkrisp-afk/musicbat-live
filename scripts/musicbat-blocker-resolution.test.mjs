import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture,upload} from './website-fixture.mjs';
import {plusFixture} from './radio-plus-fixture.mjs';
import {handlePlus,plusStatus} from '../lib/radio-plus.ts';
import {reconcileMembershipInvoice,reconcileMembershipFullRefund,runMembershipReconciliation} from '../lib/membership-settlement.ts';
import {closeMembershipMonth} from '../lib/membership-ledger.ts';
import {recordAudioDelivery,observeMemberListening} from '../lib/streaming-evidence.ts';
import {directLicenseFinal} from '../lib/direct-license-final.ts';
import {authorizeRecordingUse} from '../lib/recording-use.ts';
const request=new Request('http://localhost:5173/api/musicbat/subscription',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({action:'join',confirmedPriceCents:500,recurringConsent:true})});
async function setup(mode='test'){
 const f=await fixture();delete f.state.env.MUSICBAT_BASE_URL;const p=plusFixture(f.state.env,()=>null,{mode});
 const checkout=await handlePlus(f.state.env,request.clone(),'patron');assert.equal(checkout.status,200);const id=(await checkout.json()).checkoutUrl.split('/').at(-1);await p.pay(id);
 const invoice=[...p.invoices.values()][0];invoice.total_taxes=[];
 const transaction={id:'txn_fixture_settled',source:'ch_fixture',status:'available',currency:'usd',amount:500,fee:45,net:455,available_on:Math.floor(Date.now()/1000)-60,fee_details:[{amount:45,type:'stripe_fee'}]};
 const provider=f.state.env.RADIO_PLUS_PROCESSOR,calls=[];
 f.state.env.RADIO_PLUS_PROCESSOR={async fetch(r){calls.push(r.method+' '+new URL(r.url).pathname);assert.equal(r.method,'GET','settlement must never initiate a payment');const u=new URL(r.url),path=u.pathname;const values={
 '/v1/account':{id:'acct_fixture'},
 '/v1/invoice_payments':{has_more:false,data:[{invoice:invoice.id,livemode:mode==='live',status:'paid',amount_paid:500,payment:{type:'payment_intent',payment_intent:'pi_fixture'}}]},
 '/v1/payment_intents/pi_fixture':{id:'pi_fixture',livemode:mode==='live',status:'succeeded',amount_received:500,currency:'usd',latest_charge:'ch_fixture'},
 '/v1/charges/ch_fixture':{id:'ch_fixture',livemode:mode==='live',paid:true,captured:true,amount:500,currency:'usd',balance_transaction:transaction.id,payment_intent:'pi_fixture'},
 '/v1/balance_transactions/txn_fixture_settled':transaction,
 '/v1/refunds/re_fixture':{id:'re_fixture',status:'succeeded',amount:500,currency:'usd',charge:'ch_fixture',balance_transaction:'txn_refund'},
 '/v1/balance_transactions/txn_refund':{id:'txn_refund',source:'re_fixture',status:'available',currency:'usd',amount:-500,available_on:transaction.available_on+1}
 };if(path in values)return Response.json(values[path]);return provider.fetch(r);}};
 return {f,p,invoice,transaction,calls};
}
async function recording(f){
 const a=directLicenseFinal;f.sqlite.prepare('INSERT INTO direct_license_versions VALUES (?,?,?,?,?)').run(a.version,a.body,a.acceptance_text,'SYNTHETIC APPROVAL',1);
 f.sqlite.prepare('INSERT INTO agreement_integrity VALUES (?,?,1,?)').run(a.version,a.sha256,'TEST ONLY');f.sqlite.prepare('UPDATE direct_license_current SET version=?').run(a.version);
 f.sqlite.prepare('INSERT INTO agreement_review_receipts VALUES (?,?,?,?,?)').run('review','owner',a.version,a.sha256,Date.now()-1);
 const response=await upload(f.route,{agreementVersion:a.version,reviewReceiptId:'review',agreementDigest:a.sha256,electronicConsent:'true',retainableCopyConfirmed:'true',completedSchedules:JSON.stringify({noticeContact:'synthetic@example.test',scope:'worldwide bounded term; member; noninteractive; download',beneficiaryInstructions:'Synthetic designated recipient; all signed units'})});assert.equal(response.status,201);const {track}=await response.json();
 const pending=f.sqlite.prepare('SELECT * FROM recording_ingestion_current WHERE track_id=?').get(track.id);
 f.sqlite.prepare('INSERT INTO recording_ingestion_events(track_id,state,uploaded_at,verification_expires_at,reviewed_at,reviewer,evidence_reference) VALUES (?,?,?,?,?,?,?)').run(track.id,'VERIFIED',pending.uploaded_at,pending.verification_expires_at,Date.now(),'synthetic-file-worker','generated fixture inspected');
 for(const use of ['member-stream','noninteractive-radio','download-sale'])f.sqlite.prepare('INSERT INTO recording_use_reviews(track_id,use,decision,master_verified,composition_verified,authority_reference,compensation_reference,recipient_reference,territory,starts_at,expires_at,license_required,reviewed_by,reviewed_at) VALUES (?,?,\'cleared\',1,1,?,?,?,\'worldwide\',?,?,0,?,?)').run(track.id,use,'SYNTHETIC authority','SYNTHETIC model approval','instructions',Date.now()-100000,Date.now()+86400000,'synthetic-reviewer',Date.now());
 f.sqlite.prepare('INSERT INTO streaming_beneficiary_instructions VALUES (?,?,?,?,?,?,?,?,?)').run('instructions',track.id,'synthetic designated recipient','synthetic signed collection authority','synthetic verified processor','synthetic signed 25% model',JSON.stringify([{id:'owner',bps:10000}]),'synthetic reviewer',Date.now());
 return track;
}

test('proposed legal correction changes only version/status labels and two unsupported assertions; protected agreement is unchanged',async()=>{
 const old=await readFile('legal/direct-licensing-agreement-2026-10-29.3.txt','utf8'),proposed=await readFile('legal/proposed/direct-licensing-agreement-proposed-2026-10-29.4.txt','utf8');
 assert.equal(createHash('sha256').update(old).digest('hex'),directLicenseFinal.sha256);
 assert.match(old,/Its release text follows the owner's confirmation of legal review for initial launch\./);assert.match(old,/The owner confirms attorney review for initial launch\./);
 assert.doesNotMatch(proposed,/The owner confirms attorney review|release text follows the owner's confirmation/);
 let normalized=proposed.replaceAll('proposed-2026-10-29.4','2026-10-29.3').replace('Status: PROPOSED CORRECTION — OWNER APPROVAL REQUIRED; NOT ACTIVE.','Status: FINAL RELEASE TEXT.');
 const truth='Informal business counsel feedback has been received; no formal attorney opinion, certification, or professional legal approval is established.';
 normalized=normalized.replace(truth,"Its release text follows the owner's confirmation of legal review for initial launch.").replace(truth,'The owner confirms attorney review for initial launch.');assert.equal(normalized,old);
});
test('membership live code runs only through explicitly matching configuration and never adopts a test enrollment',async()=>{
 const {f}=await setup();try{assert.equal((await plusStatus(f.state.env,'patron')).active,true);
 const live={...f.state.env,MUSICBAT_STRIPE_MODE:'live',MUSICBAT_RADIO_PLUS_ENABLED:'live',STRIPE_SECRET_KEY:'sk_live_SYNTHETIC_FIXTURE_ONLY'};let calls=0;live.RADIO_PLUS_PROCESSOR={fetch:async()=>{calls++;throw Error('must not run');}};
 await assert.rejects(plusStatus(live,'patron'),/mode mismatch/);assert.equal((await handlePlus(live,request.clone(),'patron')).status,503);assert.equal(calls,0);
 }finally{f.sqlite.close();}
});
for(const mode of ['test','live'])test(`${mode} fixture membership settles actual fees exactly once and isolates the pool ledger`,async()=>{
 const {f,invoice,calls}=await setup(mode);try{
 const result=await reconcileMembershipInvoice(f.state.env,invoice.id);assert.equal(result.feeCents,45);assert.equal(result.grossCents,500);
 assert.equal((await reconcileMembershipInvoice(f.state.env,invoice.id)).duplicate,true);
 const table=mode==='live'?'membership_revenue_events':'membership_test_revenue_events',other=mode==='live'?'membership_test_revenue_events':'membership_revenue_events';
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+other).get().n,0);
 const date=new Date();date.setUTCMonth(date.getUTCMonth()+1);const statement=await closeMembershipMonth(f.state.env.DB,result.month,'synthetic closer',date.getTime(),mode);assert.equal(statement.qcmrCents,455);assert.equal(statement.newPoolCents,113);assert.equal(statement.unallocatedCents,113);
 assert.ok(calls.every(c=>c.startsWith('GET ')));
 }finally{f.sqlite.close();}
});
test('missing tax, unavailable settlement and unexpected fees never enter QCMR',async()=>{
 for(const change of ['tax','pending','penalty']){const {f,invoice,transaction}=await setup();try{
 if(change==='tax')delete invoice.total_taxes;if(change==='pending')transaction.status='pending';if(change==='penalty')transaction.fee_details[0].type='dispute_fee';
 await assert.rejects(reconcileMembershipInvoice(f.state.env,invoice.id));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM membership_test_revenue_events').get().n,0);
 }finally{f.sqlite.close();}}
});
test('signed invoice queues bounded settlement recovery; retry survives missing data without fabricating fees',async()=>{
 const {f,invoice}=await setup();try{
 delete invoice.total_taxes;const before=f.sqlite.prepare('SELECT COUNT(*) n FROM membership_reconciliation_jobs').get().n;assert.equal(before,1);
 const first=await runMembershipReconciliation(f.state.env);assert.equal(first.results[0].state,'pending');assert.equal(f.sqlite.prepare('SELECT attempts FROM membership_reconciliation_jobs').get().attempts,1);
 invoice.total_taxes=[];const result=await runMembershipReconciliation(f.state.env,10,Date.now()+3000);assert.equal(result.results[0].state,'completed');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM membership_test_revenue_events').get().n,2);
 }finally{f.sqlite.close();}
});
test('full refund is linked once to original principal and preserves original settlement',async()=>{
 const {f,invoice}=await setup();try{
 await reconcileMembershipInvoice(f.state.env,invoice.id);await reconcileMembershipFullRefund(f.state.env,'re_fixture');await reconcileMembershipFullRefund(f.state.env,'re_fixture');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM membership_test_revenue_events WHERE kind='principal-reversal'").get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM membership_settlement_sources').get().n,1);
 }finally{f.sqlite.close();}
});
test('member play requires delivered audio plus server elapsed time and signed instructions; replay counts once',async()=>{
 const {f}=await setup();try{
 const track=await recording(f),now=Date.now(),input={listenerId:'patron',mode:'test',trackId:track.id,performanceId:'fixture-performance',durationMs:60000,memberChannel:true,territory:'US'};
 await recordAudioDelivery(f.state.env.DB,{...input,bytes:60000,totalBytes:60000,sourceReference:'generated fixture'},now);
 assert.equal((await observeMemberListening(f.state.env.DB,input,now)).eligible,false);
 for(const offset of [10000,20000])assert.equal((await observeMemberListening(f.state.env.DB,input,now+offset)).eligible,false);
 assert.equal((await observeMemberListening(f.state.env.DB,input,now+30000)).eligible,true);assert.equal((await observeMemberListening(f.state.env.DB,input,now+31000)).duplicate,true);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM streaming_test_eligible_plays').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM streaming_eligible_plays').get().n,0);
 }finally{f.sqlite.close();}
});
test('free discovery, self plays, missing delivery and gaps cannot create streaming units; download clearance remains independent',async()=>{
 const {f}=await setup();try{const track=await recording(f),now=Date.now(),input={listenerId:'patron',mode:'test',trackId:track.id,performanceId:'unverified',durationMs:60000,memberChannel:true,territory:'US'};
 assert.equal((await observeMemberListening(f.state.env.DB,{...input,memberChannel:false},now)).eligible,false);
 await observeMemberListening(f.state.env.DB,input,now);assert.equal((await observeMemberListening(f.state.env.DB,input,now+16000)).reason,'observation-reset');
 await observeMemberListening(f.state.env.DB,input,now+26000);await observeMemberListening(f.state.env.DB,input,now+36000);assert.equal((await observeMemberListening(f.state.env.DB,input,now+46000)).reason,'delivery-unverified');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM streaming_test_eligible_plays').get().n,0);
 assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'download-sale','US')).allowed,true);
 }finally{f.sqlite.close();}
});

test('operator license ceiling decisions append without a default and retain both artist allocation and independent no-cost uses',async()=>{
 const {appendLicenseCostDecision,licenseCostHeadroom}=await import('../lib/license-costs.ts');const {f}=await setup();try{
 const track=await recording(f);f.sqlite.prepare('UPDATE tracks SET sale_price_cents=200 WHERE id=?').run(track.id);
 const old=f.sqlite.prepare("SELECT * FROM recording_use_current WHERE track_id=? AND use='download-sale'").get(track.id);
 // An additional license requirement is a separately reviewed fact, not inferred.
 const keys=Object.keys(old).filter(k=>k!=='id');const withLicense={...old,license_required:1};f.sqlite.prepare('INSERT INTO recording_use_reviews('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>withLicense[k]));
 let current=f.sqlite.prepare("SELECT * FROM recording_use_current WHERE track_id=? AND use='download-sale'").get(track.id);
 await appendLicenseCostDecision(f.state.env.DB,current.id,{ceilingBps:null,ownerReference:null,estimatedCents:15,payer:'MusicBat',fundingSource:'synthetic platform budget',reviewedBy:'synthetic operator'});
 assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'download-sale','US')).allowed,false);
 current=f.sqlite.prepare("SELECT * FROM recording_use_current WHERE track_id=? AND use='download-sale'").get(track.id);
 await appendLicenseCostDecision(f.state.env.DB,current.id,{ceilingBps:5000,ownerReference:'SYNTHETIC OWNER DECISION ONLY',estimatedCents:15,payer:'MusicBat',fundingSource:'synthetic platform budget',reviewedBy:'synthetic operator'});
 current=f.sqlite.prepare("SELECT * FROM recording_use_current WHERE track_id=? AND use='download-sale'").get(track.id);
 const report=licenseCostHeadroom(current,200);assert.equal(report.artistCents,170);assert.equal(report.platformCents,30);assert.equal(report.ceilingCents,15);assert.equal(report.costAsPlatformPercent,50);assert.equal(report.authorization.allowed,true);
 assert.equal(f.sqlite.prepare('SELECT * FROM recording_use_reviews WHERE id=?').get(old.id).license_required,0);
 assert.equal((await authorizeRecordingUse(f.state.env.DB,track.id,'member-stream','US')).allowed,true);
 }finally{f.sqlite.close();}
});
