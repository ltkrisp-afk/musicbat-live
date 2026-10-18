import {runCheckoutRecovery,StripeRequestError,isStripeSandboxKey,type StripeRuntime,type stripeGet} from '../app/api/musicbat/stripe/stripe';

// Deliberately labeled unpaid fixture. Never creates a Stripe Session or entitlement.
export const recoveryProbeId='acceptance-recovery-probe-2026-10-18';
const session='cs_test_musicbat_recovery_probe_20261018';
const sourcePurchase='c985ed12-4f04-41cc-80cb-961830651251';
type Runtime=StripeRuntime&{DB:D1Database};
export const unattendedProbeId='acceptance-unattended-recovery-2026-10-18';
function sandbox(runtime:Runtime){
 if(runtime.MUSICBAT_BASE_URL!=='https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site'||runtime.MUSICBAT_STRIPE_MODE!=='test'||!isStripeSandboxKey(runtime.STRIPE_SECRET_KEY))throw new Error('Sandbox probe only');
}
export async function unattendedProbeStatus(runtime:Runtime){
 sandbox(runtime);
 return runtime.DB.prepare(`SELECT j.purchase_id,j.state,j.attempts,j.next_attempt_at,j.lease_until,j.updated_at,j.last_error,
   p.status AS purchase_status FROM checkout_recovery_jobs j JOIN purchases p ON p.id=j.purchase_id WHERE p.id=?`)
   .bind(unattendedProbeId).first();
}
/** Queue only. A future maintenance wake must call the unchanged recovery worker.
 * Refunded, zero-value synthetic order cannot grant access or reach Stripe.
 * It exercises resuming cleanup after a terminal entitlement state was persisted.
 */
export async function queueUnattendedProbe(runtime:Runtime){
 sandbox(runtime);
 const existing=await unattendedProbeStatus(runtime);if(existing)return existing;
 const now=Date.now(),due=now+60000;
 await runtime.DB.batch([
  runtime.DB.prepare(`INSERT OR IGNORE INTO purchases(id,buyer_hash,track_id,title,artist_name,artist_id,audio_path,status,
    amount_cents,artist_share_cents,platform_fee_cents,processing_cents,currency,sale_withdrawn_at)
    SELECT ?,?,track_id,'[UNATTENDED RETRY FIXTURE: no payment]','Synthetic fixture',artist_id,'','refunded',0,0,0,0,'usd',?
    FROM purchases WHERE id=? AND status='paid'`)
    .bind(unattendedProbeId,crypto.randomUUID(),now,sourcePurchase),
  runtime.DB.prepare(`INSERT OR IGNORE INTO checkout_recovery_jobs(purchase_id,state,attempts,next_attempt_at,lease_until,updated_at,last_error)
    SELECT id,'retrying',1,?,0,?,'synthetic_terminal_order_retry' FROM purchases WHERE id=?`)
    .bind(due,now,unattendedProbeId),
 ]);
 return unattendedProbeStatus(runtime);
}
export async function recoveryProbeStatus(runtime:Runtime){
 sandbox(runtime);
 return runtime.DB.prepare(`SELECT j.state,j.attempts,j.next_attempt_at,j.lease_until,j.last_error,
   p.status,p.cleanup_state FROM checkout_recovery_jobs j JOIN purchases p ON p.id=j.purchase_id WHERE p.id=?`)
   .bind(recoveryProbeId).first();
}
export async function startRecoveryProbe(runtime:Runtime,now=Date.now()){
 sandbox(runtime);
 if(await recoveryProbeStatus(runtime))return recoveryProbeStatus(runtime);
 await runtime.DB.batch([
  runtime.DB.prepare(`INSERT OR IGNORE INTO purchases(id,buyer_hash,track_id,title,artist_name,artist_id,audio_path,status,
    amount_cents,artist_share_cents,platform_fee_cents,processing_cents,currency,processor_account_id,processor_session_id,sale_withdrawn_at,cleanup_state)
    SELECT ?,?,track_id,'[RECOVERY FAULT FIXTURE: no Stripe payment]',artist_name,artist_id,audio_path,'awaiting_checkout',
    amount_cents,artist_share_cents,platform_fee_cents,processing_cents,currency,processor_account_id,?,?,'pending'
    FROM purchases WHERE id=? AND status='paid'`)
    .bind(recoveryProbeId,crypto.randomUUID(),session,now,sourcePurchase),
  runtime.DB.prepare(`UPDATE checkout_recovery_jobs SET state='running',lease_token='acceptance-abandoned-worker',
    lease_until=?,next_attempt_at=?,updated_at=? WHERE purchase_id=? AND attempts=0`)
    .bind(now+15000,now,now,recoveryProbeId),
 ]);
 return recoveryProbeStatus(runtime);
}
export async function stepRecoveryProbe(runtime:Runtime){
 sandbox(runtime);
 const processorGet:typeof stripeGet=async<T>(_runtime:StripeRuntime,path:string)=>{
  if(path!==`/v1/checkout/sessions/${session}`)throw new Error('Probe must never access a real processor object');
  const job=await runtime.DB.prepare('SELECT attempts FROM checkout_recovery_jobs WHERE purchase_id=?').bind(recoveryProbeId).first<{attempts:number}>();
  if(job?.attempts===1)throw new StripeRequestError('Injected sandbox probe temporary failure',503);
  return {id:session,livemode:false,status:'expired',payment_status:'unpaid'} as T;
 };
 const pass=await runCheckoutRecovery(runtime,{purchaseId:recoveryProbeId,limit:1,processorGet});
 return {probe:true,processor:'injected fixture; no Stripe request or charge',...pass,job:await recoveryProbeStatus(runtime)};
}
