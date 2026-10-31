import {plusConfigured,plusMode,plusProcessorGet,type PlusRuntime} from './radio-plus';
import {stripeModeMatches} from '../app/api/musicbat/stripe/stripe';
const cents=(n:unknown):number=>{if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)throw new Error('Actual integer provider cents required');return n;};
type Invoice={id:string;livemode:boolean;status:string;amount_paid:number;currency:string;paid_out_of_band?:boolean;total_taxes?:{amount:number}[];total_tax_amounts?:{amount:number}[]};
/** Read-only provider traversal; writes only scoped accounting evidence to the
 * caller's database. Never creates a payment, payout or estimated fee. */
export async function reconcileMembershipInvoice(env:PlusRuntime,invoiceId:string,now=Date.now()) {
 if(!plusConfigured(env)||!/^in_[A-Za-z0-9_]+$/.test(invoiceId))throw new Error('Configured membership environment and invoice required');
 const db=env.DB!,mode=plusMode(env);
 const known=await db.prepare(`SELECT i.*,COALESCE(m.mode,'test') mode FROM radio_plus_invoices i
 LEFT JOIN radio_plus_enrollment_modes m ON m.enrollment_id=i.enrollment_id WHERE i.invoice_id=?`).bind(invoiceId).first<{mode:string;amount_cents:number}>();
 if(!known||known.mode!==mode)throw new Error('Invoice is not verified in this payment mode');
 const account=await plusProcessorGet<{id:string}>(env,'/v1/account');
 const invoice=await plusProcessorGet<Invoice>(env,'/v1/invoices/'+encodeURIComponent(invoiceId));
 if(!account.id?.startsWith('acct_')||invoice.id!==invoiceId||!stripeModeMatches(env,invoice.livemode)||invoice.status!=='paid'||invoice.currency!=='usd'||invoice.paid_out_of_band===true||cents(invoice.amount_paid)!==known.amount_cents)throw new Error('Membership invoice identity or payment mismatch');
 const taxes=invoice.total_taxes??invoice.total_tax_amounts;
 if(!Array.isArray(taxes))throw new Error('Actual invoice tax evidence is missing');
 const tax=taxes.reduce((n,r)=>n+cents(r.amount),0);if(tax>invoice.amount_paid)throw new Error('Invalid invoice tax total');
 const payments=await plusProcessorGet<{has_more:boolean;data:{invoice:string;livemode:boolean;status:string;amount_paid:number;payment:{type:string;payment_intent:string}}[]}>(env,'/v1/invoice_payments?invoice='+encodeURIComponent(invoiceId)+'&limit=100');
 if(payments.has_more!==false||payments.data.length!==1)throw new Error('Partial or multiple invoice payments require reconciliation review');
 const payment=payments.data[0];
 if(payment.invoice!==invoiceId||!stripeModeMatches(env,payment.livemode)||payment.status!=='paid'||payment.amount_paid!==invoice.amount_paid||payment.payment?.type!=='payment_intent')throw new Error('Invoice payment link mismatch');
 const pi=await plusProcessorGet<{id:string;livemode:boolean;status:string;amount_received:number;currency:string;latest_charge:string}>(env,'/v1/payment_intents/'+encodeURIComponent(payment.payment.payment_intent));
 if(pi.id!==payment.payment.payment_intent||!stripeModeMatches(env,pi.livemode)||pi.status!=='succeeded'||pi.amount_received!==invoice.amount_paid||pi.currency!=='usd'||!pi.latest_charge)throw new Error('Invoice payment intent mismatch');
 const charge=await plusProcessorGet<{id:string;livemode:boolean;paid:boolean;captured:boolean;amount:number;currency:string;balance_transaction:string;payment_intent:string}>(env,'/v1/charges/'+encodeURIComponent(pi.latest_charge));
 if(charge.id!==pi.latest_charge||charge.payment_intent!==pi.id||!stripeModeMatches(env,charge.livemode)||!charge.paid||!charge.captured||charge.currency!=='usd'||charge.amount!==invoice.amount_paid||!charge.balance_transaction)throw new Error('Membership charge mismatch');
 const balance=await plusProcessorGet<{id:string;source:string;status:string;currency:string;amount:number;fee:number;net:number;available_on:number;fee_details:{amount:number;type:string}[]}>(env,'/v1/balance_transactions/'+encodeURIComponent(charge.balance_transaction));
 if(balance.id!==charge.balance_transaction||balance.source!==charge.id||balance.status!=='available'||balance.currency!=='usd'||balance.amount!==invoice.amount_paid||!Number.isSafeInteger(balance.available_on)||balance.available_on*1000>now||balance.net!==balance.amount-cents(balance.fee))throw new Error('Actual settled balance evidence is unavailable');
 // General overhead/dispute penalties must never be disguised as processing.
 if(!Array.isArray(balance.fee_details)||balance.fee_details.reduce((n,r)=>n+cents(r.amount),0)!==balance.fee||balance.fee_details.some(r=>!['stripe_fee','payment_method_passthrough_fee'].includes(r.type)))throw new Error('Fee classification requires review');
 const id=mode+':'+account.id+':'+balance.id;
 const previous=await db.prepare('SELECT evidence_json FROM membership_settlement_sources WHERE id=?').bind(id).first<{evidence_json:string}>();
 const evidence=JSON.stringify({invoice:invoice.id,charge:charge.id,paymentIntent:pi.id,balance:balance.id,gross:invoice.amount_paid,tax,fee:balance.fee,settledAt:balance.available_on*1000,account:account.id,mode});
 if(previous){if(previous.evidence_json!==evidence)throw new Error('Settlement evidence changed; append-only correction review required');return {duplicate:true,mode};}
 let month=new Date(balance.available_on*1000).toISOString().slice(0,7);
 const statements=mode==='live'?'membership_pool_statements':'membership_test_pool_statements';
 if(await db.prepare(`SELECT month FROM ${statements} WHERE month=?`).bind(month).first())month=new Date(now).toISOString().slice(0,7);
 const table=mode==='live'?'membership_revenue_events':'membership_test_revenue_events';
 const result=await db.batch([
  db.prepare('INSERT INTO membership_settlement_sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,invoice.id,mode,account.id,balance.id,balance.available_on*1000,invoice.amount_paid,tax,balance.fee,'usd',evidence,now),
  db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?,1,?,?)`).bind(id+':receipt',balance.id,month,'receipt',invoice.amount_paid-tax,null,mode==='live'?1:0,'verified-provider-chain',now),
  db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?,1,?,?)`).bind(id+':fee',balance.id,month,'processing-fee',balance.fee,null,mode==='live'?1:0,'verified-provider-chain',now)
 ]);
 return {duplicate:false,mode,month,grossCents:invoice.amount_paid,taxCents:tax,feeCents:balance.fee,written:result.length};
}

/** Lease-bounded job: safe after signed webhook retries or process interruption.
 * Hosting/scheduling this worker remains a separate deployment operation. */
export async function runMembershipReconciliation(env:PlusRuntime,limit=10,now=Date.now()) {
 if(!plusConfigured(env)||!Number.isSafeInteger(limit)||limit<1||limit>25)throw new Error('Configured mode and bounded worker pass required');
 const db=env.DB!,mode=plusMode(env);
 const jobs=(await db.prepare("SELECT invoice_id,attempts FROM membership_reconciliation_jobs WHERE mode=? AND ((state='pending' AND next_attempt<=?) OR (state='claimed' AND lease_until<=?)) AND attempts<10 ORDER BY next_attempt,invoice_id LIMIT ?").bind(mode,now,now,limit).all<{invoice_id:string;attempts:number}>()).results;
 const results=[];
 for(const job of jobs){
  const token=crypto.randomUUID();
  const claim=await db.prepare("UPDATE membership_reconciliation_jobs SET state='claimed',lease_token=?,lease_until=?,attempts=attempts+1 WHERE invoice_id=? AND attempts=? AND ((state='pending' AND next_attempt<=?) OR (state='claimed' AND lease_until<=?))").bind(token,now+60000,job.invoice_id,job.attempts,now,now).run();
  if(claim.meta.changes!==1)continue;
  try{await reconcileMembershipInvoice(env,job.invoice_id,now);await db.prepare("UPDATE membership_reconciliation_jobs SET state='completed',lease_token=NULL,lease_until=NULL,last_error=NULL WHERE invoice_id=? AND lease_token=?").bind(job.invoice_id,token).run();results.push({invoice:job.invoice_id,state:'completed'});}
  catch{const state=job.attempts+1>=10?'review':'pending';await db.prepare('UPDATE membership_reconciliation_jobs SET state=?,lease_token=NULL,lease_until=NULL,next_attempt=?,last_error=? WHERE invoice_id=? AND lease_token=?').bind(state,now+Math.min(86400000,1000*2**(job.attempts+1)),'Provider settlement evidence unavailable or requires review',job.invoice_id,token).run();results.push({invoice:job.invoice_id,state});}
 }
 return {mode,results};
}

/** Automatically handles full confirmed refunds only. Partial refund/tax splits,
 * disputes and fee credits require separately verified source evidence rather
 * than estimating a tax or processing component. */
export async function reconcileMembershipFullRefund(env:PlusRuntime,refundId:string,now=Date.now()) {
 if(!plusConfigured(env)||!/^re_[A-Za-z0-9_]+$/.test(refundId))throw new Error('Configured refund source required');
 const mode=plusMode(env),db=env.DB!;
 const refund=await plusProcessorGet<{id:string;status:string;amount:number;currency:string;charge:string;balance_transaction:string}>(env,'/v1/refunds/'+encodeURIComponent(refundId));
 if(refund.id!==refundId||refund.status!=='succeeded'||refund.currency!=='usd'||!refund.charge||!refund.balance_transaction)throw new Error('Successful settled refund evidence required');
 const charge=await plusProcessorGet<{id:string;livemode:boolean;balance_transaction:string;amount:number}>(env,'/v1/charges/'+encodeURIComponent(refund.charge));
 const account=await plusProcessorGet<{id:string}>(env,'/v1/account');
 if(charge.id!==refund.charge||!stripeModeMatches(env,charge.livemode)||refund.amount!==charge.amount)throw new Error('Partial refund or payment mode requires review');
 const source=await db.prepare('SELECT * FROM membership_settlement_sources WHERE mode=? AND provider_account=? AND provider_balance_reference=?').bind(mode,account.id,charge.balance_transaction).first<{gross_cents:number;tax_cents:number}>();
 if(!source||source.gross_cents!==refund.amount)throw new Error('Original settled membership receipt missing');
 const balance=await plusProcessorGet<{id:string;source:string;status:string;amount:number;currency:string;available_on:number}>(env,'/v1/balance_transactions/'+encodeURIComponent(refund.balance_transaction));
 if(balance.id!==refund.balance_transaction||balance.source!==refundId||balance.status!=='available'||balance.currency!=='usd'||balance.amount!==-refund.amount||!Number.isSafeInteger(balance.available_on)||balance.available_on*1000>now)throw new Error('Actual refund settlement unavailable');
 const table=mode==='live'?'membership_revenue_events':'membership_test_revenue_events',statements=mode==='live'?'membership_pool_statements':'membership_test_pool_statements';
 let month=new Date(balance.available_on*1000).toISOString().slice(0,7);if(await db.prepare(`SELECT month FROM ${statements} WHERE month=?`).bind(month).first())month=new Date(now).toISOString().slice(0,7);
 await db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?,1,?,?) ON CONFLICT(source_id) DO NOTHING`).bind(mode+':'+account.id+':'+balance.id,balance.id,month,'principal-reversal',source.gross_cents-source.tax_cents,charge.balance_transaction,mode==='live'?1:0,'verified-provider-full-refund-chain',now).run();
 return {mode,month,principalCents:source.gross_cents-source.tax_cents};
}
