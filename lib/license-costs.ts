import {evaluateUse,type UseDecision} from './recording-use';
/** Trusted operator entrypoint; no public uploader form may invoke this. Each
 * change appends a decision and preserves original permissions and cost history. */
export async function appendLicenseCostDecision(db:D1Database,reviewId:number,input:{ceilingBps:number|null;ownerReference:string|null;estimatedCents:number|null;payer:'MusicBat'|'external'|null;fundingSource:string|null;reviewedBy:string},now=Date.now()) {
 const previous=await db.prepare('SELECT * FROM recording_use_reviews WHERE id=?').bind(reviewId).first<Record<string,unknown>>();
 if(!previous||!input.reviewedBy.trim())throw new Error('Existing reviewed use and operator identity required');
 if(input.ceilingBps!==null&&(!Number.isSafeInteger(input.ceilingBps)||input.ceilingBps<0||input.ceilingBps>10000||!input.ownerReference?.trim()))throw new Error('Explicit owner ceiling decision required');
 if(input.estimatedCents!==null&&(!Number.isSafeInteger(input.estimatedCents)||input.estimatedCents<0))throw new Error('Invalid license estimate');
 const latest=await db.prepare('SELECT id FROM recording_use_current WHERE track_id=? AND use=?').bind(previous.track_id,previous.use).first<{id:number}>();
 if(latest?.id!==reviewId)throw new Error('Use review changed; inspect latest decision');
 const next:Record<string,unknown>={...previous,platform_cost_cents:input.estimatedCents,ceiling_bps:input.ceilingBps,ceiling_reference:input.ownerReference,payer:input.payer,funding_source:input.fundingSource,reviewed_by:input.reviewedBy,reviewed_at:now};delete next.id;
 const keys=Object.keys(next);
 const result=await db.prepare(`INSERT INTO recording_use_reviews(${keys.join(',')}) SELECT ${keys.map(()=>'?').join(',')} WHERE (SELECT id FROM recording_use_current WHERE track_id=? AND use=?)=?`).bind(...keys.map(k=>next[k]),previous.track_id,previous.use,reviewId).run();
 if(result.meta.changes!==1)throw new Error('Concurrent rights decision; nothing overwritten');
 return {ceilingBps:input.ceilingBps,ownerDecisionRequired:input.ceilingBps===null};
}
export function licenseCostHeadroom(row:UseDecision,basePriceCents:number,now=Date.now()) {
 if(!Number.isSafeInteger(basePriceCents)||basePriceCents<1)throw new Error('Valid recording price required');
 const artistCents=Math.floor((basePriceCents*85+50)/100),platformCents=basePriceCents-artistCents;
 return {basePriceCents,artistCents,platformCents,estimatedLicenseCents:row.platform_cost_cents,ceilingBps:row.ceiling_bps,ceilingCents:row.ceiling_bps===null?null:Math.floor(platformCents*row.ceiling_bps/10000),costAsPlatformPercent:platformCents&&row.platform_cost_cents!==null?row.platform_cost_cents/platformCents*100:null,authorization:evaluateUse(row,{now,territory:row.territory,basePriceCents})};
}
