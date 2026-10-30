import {evaluateUse,recordingUses,type RecordingUse,type UseDecision} from './recording-use';
import {verifyIngestion} from './ingestion-verification';

function required(value:unknown,name:string,max=4000):string {
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Required: '+name);
 return value.trim();
}
function recording(value:unknown):number {if(!Number.isSafeInteger(value)||Number(value)<1)throw Error('Invalid recording');return Number(value);}
function parseUse(value:unknown):RecordingUse {if(!recordingUses.includes(value as RecordingUse))throw Error('Invalid use');return value as RecordingUse;}
/** Called only after the route authenticates the configured operator. Never accepts client reviewer identity. */
export async function operateRights(db:D1Database,bucket:R2Bucket|undefined,actor:string,input:Record<string,unknown>,now=Date.now()) {
 required(actor,'operator');const trackId=recording(input.trackId);
 const track=await db.prepare('SELECT id,status,sale_price_cents FROM tracks WHERE id=?').bind(trackId).first<{id:number;status:string;sale_price_cents:number}>();
 if(!track)throw Error('Recording not found');
 if(input.action==='verify_ingestion') {if(!bucket)throw Error('Private storage unavailable');return verifyIngestion(db,bucket,trackId,actor,now);}
 if(input.action==='review_use') {
  const kind=parseUse(input.use),r=input.review as UseDecision;
  if(!r||typeof r!=='object'||Array.isArray(r)||!['hold','cleared'].includes(r.decision))throw Error('Invalid review');
  const acceptance=await db.prepare(`SELECT a.id,a.agreement_version,d.declaration_json FROM artist_license_acceptances a JOIN artist_rights_declarations d ON d.acceptance_id=a.id WHERE a.track_id=? ORDER BY a.accepted_at DESC LIMIT 1`).bind(trackId).first<{id:string;agreement_version:string;declaration_json:string}>();
  if(!acceptance)throw Error('Recording-specific accepted declaration required');
  for(const key of ['authority_reference','compensation_reference','recipient_reference','territory'] as const)required(r[key],key);
  if(!Number.isSafeInteger(r.starts_at)||!Number.isSafeInteger(r.expires_at)||r.expires_at<=r.starts_at)throw Error('Invalid review term');
  if(r.decision==='cleared') {
   if(track.status!=='active')throw Error('Recording is withdrawn');
   const ingestion=await db.prepare('SELECT state FROM recording_ingestion_current WHERE track_id=?').bind(trackId).first<{state:string}>();
   if(ingestion?.state!=='VERIFIED')throw Error('Media verification required');
   const declaration=JSON.parse(acceptance.declaration_json) as {proStatus:string;distributionStatus?:string;rightsBasis:string;restrictions:string};
   if(declaration.proStatus!=='none')required(input.proEvidenceReference,'PRO authority, restrictions and notice evaluation');
   if(['restricted','unknown'].includes(declaration.distributionStatus??'')||declaration.rightsBasis!=='sole'||declaration.restrictions.toLowerCase()!=='none')required(input.restrictionEvidenceReference,'reviewed co-owner/distribution/contract restrictions');
   const caseHold=await db.prepare(`SELECT 1 FROM rights_case_current WHERE track_id=? AND use=? AND state='hold' LIMIT 1`).bind(trackId,kind).first();
   if(caseHold)throw Error('Resolve the affected rights case before granting this use');
   const evaluated=evaluateUse(r,{now,territory:r.territory,basePriceCents:track.sale_price_cents});
   if(!evaluated.allowed)throw Error(evaluated.reason);
  }
  const keys=['decision','master_verified','composition_verified','authority_reference','compensation_reference','recipient_reference','territory','starts_at','expires_at','license_required','platform_cost_cents','payer','funding_source','ceiling_bps','ceiling_reference','counsel_required','counsel_reference'] as const;
  const evidence=JSON.stringify({acceptance:acceptance.id,proEvidenceReference:input.proEvidenceReference??null,restrictionEvidenceReference:input.restrictionEvidenceReference??null});
  await db.batch([
   db.prepare(`INSERT INTO recording_use_reviews(track_id,use,${keys.join(',')},reviewed_by,reviewed_at) VALUES (${Array(21).fill('?').join(',')})`).bind(trackId,kind,...keys.map(k=>r[k]??null),actor,now),
   db.prepare('INSERT INTO artist_track_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),trackId,actor,'rights_use_review',JSON.stringify({use:kind,decision:r.decision,evidence:JSON.parse(evidence)}),now)
  ]);
  return {recorded:true,use:kind,decision:r.decision,activated:false};
 }
 if(input.action==='record_complaint') {
  const kind=parseUse(input.use),reference=required(input.authorityReference,'private notice evidence'),reason=required(input.reason,'complaint reason'),caseId=crypto.randomUUID();
  // Intake is not a finding of infringement and does not itself disable music.
  await db.prepare('INSERT INTO rights_case_events(case_id,track_id,use,state,actor_id,reason,authority_reference,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(caseId,trackId,kind,'received',actor,reason,reference,now).run();
  return {caseId,state:'received',rightsChanged:false};
 }
 if(input.action==='delivery_restriction') {
  const caseId=required(input.caseId,'case identifier',100);
  const item=await db.prepare('SELECT * FROM rights_case_current WHERE case_id=? AND track_id=?').bind(caseId,trackId).first<{use:RecordingUse;state:string}>();
  if(!item||item.use!=='download-sale'||typeof input.restricted!=='boolean')throw Error('A download rights case and explicit delivery decision are required');
  if(!input.restricted&&item.state!=='resolved')throw Error('Resolve the case before releasing delivery');
  await db.prepare('INSERT INTO recording_delivery_restrictions(track_id,restricted,reason,authority_reference,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?)').bind(trackId,input.restricted?1:0,required(input.reason,'delivery decision reason'),required(input.authorityReference,'documented delivery authority'),actor,now).run();
  return {recorded:true,restricted:input.restricted,entitlementsPreserved:true};
 }
 if(input.action==='case_decision') {
  const caseId=required(input.caseId,'case identifier',100),state=input.state;
  if(!['hold','resolved','counter-notice'].includes(String(state)))throw Error('Invalid case decision');
  const previous=await db.prepare('SELECT * FROM rights_case_current WHERE case_id=? AND track_id=?').bind(caseId,trackId).first<{id:number;use:RecordingUse;state:string}>();
  if(!previous)throw Error('Case not found');
  if(state==='counter-notice'&&previous.state!=='hold'&&previous.state!=='counter-notice')throw Error('No affected hold to respond to');
  const reason=required(input.reason,'decision reason'),reference=required(input.authorityReference,'reviewed notice/resolution evidence');
  const effective=state==='counter-notice'?'hold':state;
  const result=await db.prepare(`INSERT INTO rights_case_events(case_id,track_id,use,state,actor_id,reason,authority_reference,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT MAX(id) FROM rights_case_events WHERE case_id=?)=?`).bind(caseId,trackId,previous.use,effective,actor,(state==='counter-notice'?'Counter-notice received; no automatic restoration. ':'')+reason,reference,now,caseId,previous.id).run();
  if(result.meta.changes!==1)throw Error('Case changed; refresh before review');
  return {caseId,state:effective,rightsGranted:false};
 }
 throw Error('Unsupported rights action');
}
