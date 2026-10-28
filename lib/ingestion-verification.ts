/** A lease is processing ownership, not a copyright claim. All times are UTC ms. */
export const INGESTION_WINDOW_MS = 72 * 60 * 60 * 1000;
export type IngestionObject = {bytes:Uint8Array};
export type Inspection = {valid:boolean;reason:string};
type Job = {track_id:number;source_key:string;source_sha256:string;source_size:number;attempts:number};
type Runtime = {
 db:D1Database;
 readObject:(key:string)=>Promise<IngestionObject>;
 inspect:(bytes:Uint8Array)=>Promise<Inspection>;
 now?:()=>number;
};

/** Durable queue; restart/retry never resets upload time or the 72-hour deadline.
 * Storage/decoder outages retry. Only a conclusive technical failure rejects.
 * No Stripe calls: admission controls do not revoke historical earnings.
 */
export async function runIngestionSweep(runtime:Runtime,limit=10) {
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid sweep limit.');
 const {db}=runtime,now=runtime.now??Date.now;
 const due=await db.prepare(`SELECT i.* FROM track_ingestion i JOIN tracks t ON t.id=i.track_id
  WHERE t.status='active' AND i.hold_reason IS NULL AND i.next_attempt_at<=?
  AND (i.state='PENDING' OR (i.state='CLAIMED' AND i.claim_until<=?))
  ORDER BY i.uploaded_at,i.track_id LIMIT ?`).bind(now(),now(),limit).all<Job>();
 let checked=0,failed=0,retried=0;
 for(const job of due.results) {
  const token=crypto.randomUUID(),at=now();
  const claim=await db.prepare(`UPDATE track_ingestion SET state='CLAIMED',claim_token=?,claim_until=?,attempts=attempts+1,updated_at=?
   WHERE track_id=? AND hold_reason IS NULL AND next_attempt_at<=? AND
   (state='PENDING' OR (state='CLAIMED' AND claim_until<=?))
   AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=track_id AND t.status='active') RETURNING track_id`).bind(token,at+300000,at,job.track_id,at,at).first();
  if(!claim)continue;
  try {
   const {bytes}=await runtime.readObject(job.source_key);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');
   const result=bytes.length!==job.source_size || hash!==job.source_sha256
    ? {valid:false,reason:'source_mismatch'} : await runtime.inspect(bytes);
   const finish=now(),state=result.valid?'CHECKED':'FAILED';
   // A stale worker cannot overwrite a recovered lease, operator hold or withdrawal.
   const writes=await db.batch([
    db.prepare(`UPDATE track_ingestion SET state=?,technical_passed_at=?,is_payable=0,last_error=?,updated_at=?
     WHERE track_id=? AND state='CLAIMED' AND claim_token=? AND claim_until>? AND hold_reason IS NULL
     AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=track_id AND t.status='active')`)
     .bind(state,result.valid?finish:null,result.valid?null:result.reason,finish,job.track_id,token,finish),
    db.prepare(`INSERT INTO ingestion_reports SELECT ?,track_id,?,?,? FROM track_ingestion
     WHERE track_id=? AND claim_token=? AND state=? AND updated_at=?`)
     .bind(crypto.randomUUID(),state,result.reason,finish,job.track_id,token,state,finish),
   ]);
   if(writes[0].meta.changes){if(result.valid)checked++;else failed++;}
  }catch {
   const retryAt=now();
   await db.prepare(`UPDATE track_ingestion SET state='PENDING',claim_token=NULL,claim_until=0,next_attempt_at=?,last_error='inspection_unavailable',updated_at=?
    WHERE track_id=? AND state='CLAIMED' AND claim_token=? AND claim_until>?`)
    .bind(retryAt+Math.min(3600000,60000*2**Math.min(job.attempts,6)),retryAt,job.track_id,token,retryAt).run();
   retried++;
  }
 }
 const finish=now();
 const verified=await db.prepare(`UPDATE track_ingestion SET state='VERIFIED',is_payable=1,claim_token=NULL,claim_until=0,updated_at=?
  WHERE state='CHECKED' AND technical_passed_at IS NOT NULL AND verification_expires_at<=? AND hold_reason IS NULL
  AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=track_id AND t.status='active') RETURNING track_id`).bind(finish,finish).all<{track_id:number}>();
 return {checked,failed,retried,verified:verified.results.map(r=>r.track_id)};
}
