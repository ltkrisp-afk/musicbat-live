import {membershipStatement,type RevenueEvent,type Beneficiary} from './membership-accounting';
import {sha256Text} from './agreement-integrity';
/** Reconciliation entrypoint for a trusted operator/job, not a public endpoint.
 * Receipt amount is settled membership principal AFTER separately identified tax.
 * Actual provider fee/credit/reversal evidence is required before close. */
export async function closeMembershipMonth(db:D1Database,month:string,closedBy:string,now=Date.now(),mode:'test'|'live'='live') {
 const revenueTable=mode==='live'?'membership_revenue_events':'membership_test_revenue_events';
 const statementTable=mode==='live'?'membership_pool_statements':'membership_test_pool_statements';
 const playTable=mode==='live'?'streaming_eligible_plays':'streaming_test_eligible_plays';
 if(!closedBy.trim()||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>=new Date(now).toISOString().slice(0,7))throw new Error('Only a completed UTC month may close');
 const previous=await db.prepare(`SELECT month,statement_json FROM ${statementTable} ORDER BY month DESC LIMIT 1`).first<{month:string;statement_json:string}>();
 if(previous && month<=previous.month)throw new Error('Closed months cannot be rewritten');
 const prior=previous?JSON.parse(previous.statement_json) as {deficitCents:number;unallocatedCents:number}:null;
 const events=(await db.prepare(`SELECT * FROM ${revenueTable} WHERE month=? ORDER BY source_id`).bind(month).all<RevenueEvent>()).results;
 const principals=(await db.prepare(`SELECT source_reference,amount_cents FROM ${revenueTable} WHERE kind='receipt'`).all<{source_reference:string;amount_cents:number}>()).results;
 const reversals=(await db.prepare(`SELECT principal_reference,SUM(amount_cents) amount_cents FROM ${revenueTable} WHERE kind='principal-reversal' AND month<? GROUP BY principal_reference`).bind(month).all<{principal_reference:string;amount_cents:number}>()).results;
 const eligible=(await db.prepare(`SELECT CAST(p.track_id AS TEXT) id,COUNT(*) count,p.beneficiary_reference FROM ${playTable} p
 JOIN recording_use_reviews r ON r.id=p.rights_review_id WHERE p.month=? AND r.master_verified=1 AND r.composition_verified=1
 GROUP BY p.track_id,p.beneficiary_reference ORDER BY p.track_id`).bind(month).all<{id:string;count:number;beneficiary_reference:string}>()).results;
 const plays:{id:string;count:number;beneficiaries:Beneficiary[]}[]=[];
 for(const row of eligible){
  if(plays.some(p=>p.id===row.id))throw new Error('Changed instructions require operator reconciliation before close');
  const instruction=await db.prepare('SELECT * FROM streaming_beneficiary_instructions WHERE id=? AND track_id=?').bind(row.beneficiary_reference,Number(row.id)).first<{beneficiaries_json:string;designated_recipient:string;collection_authority_reference:string;payout_verified_reference:string;signed_model_reference:string}>();
  if(!instruction?.designated_recipient?.trim()||!instruction.collection_authority_reference?.trim()||!instruction.payout_verified_reference?.trim()||!instruction.signed_model_reference?.trim())throw new Error('Verified recipient and signed instructions required');
  plays.push({id:row.id,count:row.count,beneficiaries:JSON.parse(instruction.beneficiaries_json) as Beneficiary[]});
 }
 const statement=membershipStatement(events,{month,mode,deficitCents:prior?.deficitCents??0,unallocatedCents:prior?.unallocatedCents??0,plays,receiptPrincipals:Object.fromEntries(principals.map(r=>[r.source_reference,r.amount_cents])),priorReversed:Object.fromEntries(reversals.map(r=>[r.principal_reference,r.amount_cents]))});
 const sources=JSON.stringify({events,eligible,principals,reversals,plays,previous:previous?.month??null});
 const sourceDigest=await sha256Text(sources);
 // INSERT-select concurrency guards: a concurrent prior close or changed event
 // set cannot silently produce two independently spendable carryforward pools.
 const result=await db.prepare(`INSERT INTO ${statementTable}(month,source_digest,statement_json,closed_by,closed_at,previous_month)
 SELECT ?,?,?,?,?,? WHERE (SELECT MAX(month) FROM ${statementTable}) IS ?
 AND (SELECT COUNT(*) FROM ${revenueTable} WHERE month=?)=?
 AND (SELECT COUNT(*) FROM ${playTable} WHERE month=?)=?`)
 .bind(month,sourceDigest,JSON.stringify(statement),closedBy,now,previous?.month??null,previous?.month??null,month,events.length,month,eligible.reduce((n,r)=>n+r.count,0)).run();
 if(result.meta.changes!==1)throw new Error('Concurrent statement change; reconciliation required');
 return statement;
}
