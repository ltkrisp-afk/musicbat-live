import { isStripeSandboxKey, stripeModeMatches, musicBatOrigin, StripeConfigurationError, readStripeWebhookBody, verifyStripeWebhook, type StripeRuntime } from '../app/api/musicbat/stripe/stripe';

export type PlusRuntime = StripeRuntime & {DB?: D1Database; MUSICBAT_RADIO_PLUS_ENABLED?: string; MUSICBAT_RELEASE_PAUSED?: string; STRIPE_RADIO_PLUS_WEBHOOK_SECRET?: string; RADIO_PLUS_PROCESSOR?: Pick<Fetcher,'fetch'>};
type Enrollment = {id:string;user_id:string;attempt:number;checkout_session_id:string|null;subscription_id:string|null;status:string;paid_until:number;cancel_at_period_end:number};
type Session = {id:string;url:string;livemode:boolean;mode:string;status:string;subscription:string|null;metadata:Record<string,string>};
type Subscription = {id:string;livemode:boolean;status:string;cancel_at_period_end:boolean;metadata:Record<string,string>;latest_invoice:string|null;items:{data:{quantity:number;current_period_start:number;current_period_end:number;price:{currency:string;unit_amount:number;recurring:{interval:string;interval_count:number}}}[]}};
type Invoice = {id:string;livemode:boolean;status:string;amount_paid:number;amount_due:number;currency:string;paid_out_of_band?:boolean;parent:{subscription_details:{subscription:string}};lines:{has_more:boolean;data:{amount:number;currency:string;period:{start:number;end:number}}[]}};
const headers={'cache-control':'private, no-store'};
export function plusMode(env:PlusRuntime):'test'|'live' {
 const mode=env.MUSICBAT_STRIPE_MODE??'test';
 if(mode!=='test'&&mode!=='live')throw new StripeConfigurationError('Radio Plus mode is unavailable.');
 return mode;
}
export function plusConfigured(env:PlusRuntime) {
 const mode=env.MUSICBAT_STRIPE_MODE??'test';
 return (mode==='test'||mode==='live') && env.MUSICBAT_RADIO_PLUS_ENABLED===mode &&
 (mode==='test'?isStripeSandboxKey(env.STRIPE_SECRET_KEY):/^sk_live_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY??'')) &&
 !!env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET?.startsWith('whsec_') && !!env.DB && env.MUSICBAT_RELEASE_PAUSED!=='1';
}
async function requireMode(db:D1Database,row:Enrollment,mode:'test'|'live') {
 const record=await db.prepare('SELECT mode FROM radio_plus_enrollment_modes WHERE enrollment_id=?').bind(row.id).first<{mode:string}>();
 if((record?.mode??'test')!==mode)throw new StripeConfigurationError('Radio Plus enrollment mode mismatch.');
}
function configured(env:PlusRuntime) {
  if(env.MUSICBAT_RELEASE_PAUSED==='1')throw new StripeConfigurationError('MusicBat is briefly paused for an update.');
  if(!plusConfigured(env))
    throw new StripeConfigurationError('Radio Plus enrollment is not available yet.');
}
async function stripe<T>(env:PlusRuntime,path:string,fields?:Record<string,string>,key?:string):Promise<T> {
  configured(env);
  const input=new Request('https://api.stripe.com'+path,{method:fields?'POST':'GET',headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2025-03-31.basil',...(fields?{'content-type':'application/x-www-form-urlencoded'}:{}),...(key?{'idempotency-key':key}:{})},body:fields?new URLSearchParams(fields):undefined,signal:AbortSignal.timeout(10000)});
  const response=await (env.RADIO_PLUS_PROCESSOR ? env.RADIO_PLUS_PROCESSOR.fetch(input) : fetch(input));
  if(!response.ok)throw new Error('Radio Plus payment service is unavailable.');
  return response.json() as Promise<T>;
}
function validSubscription(sub:Subscription,row:Enrollment,env:PlusRuntime) {
  const item=sub.items?.data?.[0];
  if(!stripeModeMatches(env,sub.livemode) || sub.metadata?.musicbat_plus_id!==row.id || sub.metadata?.musicbat_user_id!==row.user_id || sub.metadata?.musicbat_plus_attempt!==String(row.attempt) || sub.items?.data?.length!==1 ||
    item?.quantity!==1 || item.price?.currency!=='usd' || item.price.unit_amount!==500 || item.price.recurring?.interval!=='month' || item.price.recurring.interval_count!==1 ||
    !Number.isSafeInteger(item.current_period_start) || !Number.isSafeInteger(item.current_period_end) || item.current_period_end<=item.current_period_start)
    throw new Error('Radio Plus subscription verification failed.');
  if(row.subscription_id && row.subscription_id!==sub.id)throw new Error('Radio Plus subscription identity mismatch.');
  return item;
}
export async function plusAccess(db:D1Database,userId:string,now=Date.now(),mode:'test'|'live'='test') {
  const row=await db.prepare('SELECT id,paid_until,status FROM radio_plus_enrollments WHERE user_id=?').bind(userId).first<Enrollment>();
  if(row)await requireMode(db,row,mode);
  return row && ['active','past_due'].includes(row.status) && Number.isSafeInteger(row.paid_until) && row.paid_until>now ? row.paid_until : 0;
}
export async function plusStatus(env:PlusRuntime,userId:string,now=Date.now()) {
  const enabled=plusConfigured(env);
  if(!enabled)return {available:false,mode:env.MUSICBAT_STRIPE_MODE??'test',active:false,paidUntil:0,cancelAtPeriodEnd:false,status:'unavailable'};
  const row=await env.DB!.prepare('SELECT * FROM radio_plus_enrollments WHERE user_id=?').bind(userId).first<Enrollment>();
  if(row)await requireMode(env.DB!,row,plusMode(env));
  return {available:true,mode:env.MUSICBAT_STRIPE_MODE??'test',active:!!(row && ['active','past_due'].includes(row.status) && row.paid_until>now),paidUntil:row?.paid_until??0,cancelAtPeriodEnd:!!row?.cancel_at_period_end,status:row?.status??'none'};
}
export async function plusCheckout(env:PlusRuntime,request:Request,userId:string) {
  configured(env);const db=env.DB!,origin=musicBatOrigin(env,request);
  const enrollmentId=crypto.randomUUID();
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO radio_plus_enrollments(id,user_id) VALUES (?,?)').bind(enrollmentId,userId),
   db.prepare('INSERT OR IGNORE INTO radio_plus_enrollment_modes(enrollment_id,mode) SELECT id,? FROM radio_plus_enrollments WHERE id=?').bind(plusMode(env),enrollmentId)
  ]);
  let row=(await db.prepare('SELECT * FROM radio_plus_enrollments WHERE user_id=?').bind(userId).first<Enrollment>())!;
  await requireMode(db,row,plusMode(env));
  if(row.subscription_id && !['canceled','incomplete_expired'].includes(row.status))throw new Error('Manage the existing Radio Plus membership before starting another.');
  if(row.checkout_session_id) {
    const previous=await stripe<Session>(env,'/v1/checkout/sessions/'+encodeURIComponent(row.checkout_session_id));
    if(!stripeModeMatches(env,previous.livemode) || previous.mode!=='subscription' || previous.metadata?.musicbat_plus_id!==row.id)throw new Error('Checkout identity mismatch.');
    if(previous.status==='open')return {checkoutUrl:previous.url};
    if(previous.status==='complete' && !['canceled','incomplete_expired'].includes(row.status))throw new Error('Payment verification is pending.');
    await db.prepare('UPDATE radio_plus_enrollments SET checkout_session_id=NULL,subscription_id=NULL,attempt=attempt+1,status=\'pending\',paid_until=0 WHERE id=? AND checkout_session_id=?').bind(row.id,row.checkout_session_id).run();
    row=(await db.prepare('SELECT * FROM radio_plus_enrollments WHERE id=?').bind(row.id).first<Enrollment>())!;
  }
  const session=await stripe<Session>(env,'/v1/checkout/sessions',{
    mode:'subscription',success_url:origin+'/?plus=return',cancel_url:origin+'/?plus=cancelled',
    'payment_method_types[0]':'card','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':'500',
    'line_items[0][price_data][recurring][interval]':'month','line_items[0][price_data][product_data][name]':'MusicBat Radio Plus',
    'line_items[0][quantity]':'1','metadata[musicbat_plus_id]':row.id,
    'subscription_data[metadata][musicbat_plus_id]':row.id,'subscription_data[metadata][musicbat_user_id]':userId,'subscription_data[metadata][musicbat_plus_attempt]':String(row.attempt),
  },'musicbat-plus-'+row.id+'-'+row.attempt);
  if(!session.id || !session.url || !stripeModeMatches(env,session.livemode) || session.mode!=='subscription' || session.metadata?.musicbat_plus_id!==row.id)throw new Error('Checkout verification failed.');
  await db.prepare('UPDATE radio_plus_enrollments SET checkout_session_id=? WHERE id=? AND attempt=?').bind(session.id,row.id,row.attempt).run();
  return {checkoutUrl:session.url};
}
export async function plusCancel(env:PlusRuntime,userId:string) {
  configured(env);const row=await env.DB!.prepare('SELECT * FROM radio_plus_enrollments WHERE user_id=?').bind(userId).first<Enrollment>();
  if(!row?.subscription_id || !['active','past_due'].includes(row.status))throw new Error('No active Radio Plus subscription to cancel.');
  await requireMode(env.DB!,row,plusMode(env));
  const sub=await stripe<Subscription>(env,'/v1/subscriptions/'+encodeURIComponent(row.subscription_id),{cancel_at_period_end:'true'});
  validSubscription(sub,row,env);if(!sub.cancel_at_period_end)throw new Error('Cancellation was not confirmed.');
  await env.DB!.prepare('UPDATE radio_plus_enrollments SET cancel_at_period_end=1 WHERE id=? AND subscription_id=?').bind(row.id,sub.id).run();
  return {cancelAtPeriodEnd:true,paidUntil:row.paid_until};
}
export async function plusWebhook(env:PlusRuntime,request:Request) {
  configured(env);const db=env.DB!;
  const event=await verifyStripeWebhook(await readStripeWebhookBody(request),request.headers.get('stripe-signature'),env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET,undefined,env);
  const types=['invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','checkout.session.completed','checkout.session.expired'];
  if(!types.includes(event.type))return {received:true};
  if(await db.prepare('SELECT event_id FROM radio_plus_events WHERE event_id=?').bind(event.id).first())return {received:true,duplicate:true};
  let subId:string|null=null;
  if(event.type.startsWith('checkout.')) {
    const session=await stripe<Session>(env,'/v1/checkout/sessions/'+encodeURIComponent(event.data.object.id));
    if(!stripeModeMatches(env,session.livemode) || session.mode!=='subscription')return {received:true,ignored:true};
    const row=await db.prepare('SELECT * FROM radio_plus_enrollments WHERE checkout_session_id=?').bind(session.id).first<Enrollment>();
    if(!row || session.metadata?.musicbat_plus_id!==row.id)throw new Error('Unknown subscription checkout.');
    if(event.type==='checkout.session.expired' && session.status==='expired') {
      await db.batch([db.prepare('UPDATE radio_plus_enrollments SET status=\'incomplete_expired\' WHERE id=? AND subscription_id IS NULL').bind(row.id),db.prepare('INSERT OR IGNORE INTO radio_plus_events VALUES (?,?,?)').bind(event.id,event.type,Date.now())]);return {received:true};
    }
    subId=session.subscription;
    if(!subId)return {received:true,pending:true};
  } else if(event.type.startsWith('invoice.')) {
    const invoice=await stripe<Invoice>(env,'/v1/invoices/'+encodeURIComponent(event.data.object.id));
    if(!stripeModeMatches(env,invoice.livemode))throw new Error('Invoice mode mismatch.');
    subId=invoice.parent?.subscription_details?.subscription;
  } else subId=event.data.object.id;
  if(!subId)throw new Error('Subscription evidence is absent.');
  // Retrieve current state: old/reordered event payloads never restore an ended membership.
  const sub=await stripe<Subscription>(env,'/v1/subscriptions/'+encodeURIComponent(subId));
  const row=await db.prepare('SELECT * FROM radio_plus_enrollments WHERE id=?').bind(sub.metadata?.musicbat_plus_id??'').first<Enrollment>();
  if(!row || sub.metadata?.musicbat_plus_attempt!==String(row.attempt))return {received:true,ignored:true};
  await requireMode(db,row,plusMode(env));
  const item=validSubscription(sub,row,env);
  let paidUntil=row.paid_until, invoice:Invoice|null=null;
  if(['canceled','unpaid','paused','incomplete_expired'].includes(sub.status))paidUntil=0;
  if(sub.status==='active' && sub.latest_invoice) {
    invoice=await stripe<Invoice>(env,'/v1/invoices/'+encodeURIComponent(sub.latest_invoice));
    const line=invoice.lines?.data?.[0];
    if(!stripeModeMatches(env,invoice.livemode) || invoice.id!==sub.latest_invoice || invoice.parent?.subscription_details?.subscription!==sub.id || invoice.status!=='paid' || invoice.currency!=='usd' || invoice.amount_paid!==500 || invoice.amount_due!==500 || invoice.paid_out_of_band===true || invoice.lines?.has_more!==false || invoice.lines.data.length!==1 || line.amount!==500 || line.currency!=='usd' || line.period.start!==item.current_period_start || line.period.end!==item.current_period_end)throw new Error('Paid subscription invoice verification failed.');
    paidUntil=Math.max(paidUntil,item.current_period_end*1000);
  }
  const writes=[db.prepare('INSERT OR IGNORE INTO radio_plus_events VALUES (?,?,?)').bind(event.id,event.type,Date.now()),
    db.prepare('UPDATE radio_plus_enrollments SET subscription_id=?,status=?,paid_until=?,cancel_at_period_end=?,updated_at=? WHERE id=? AND (subscription_id IS NULL OR subscription_id=?) AND NOT (status=\'canceled\' AND ?<>\'canceled\')').bind(sub.id,sub.status,paidUntil,sub.cancel_at_period_end?1:0,Date.now(),row.id,sub.id,sub.status)];
  if(invoice)writes.push(db.prepare('INSERT INTO radio_plus_invoices VALUES (?,?,?,?,?,?) ON CONFLICT(invoice_id) DO NOTHING').bind(invoice.id,row.id,sub.id,500,item.current_period_end*1000,Date.now()));
  await db.batch(writes);return {received:true};
}
export async function handlePlus(env:PlusRuntime,request:Request,userId:string|null) {
  if(!userId)return Response.json({error:'Sign in to use Radio Plus.'},{status:401,headers});
  try {
    if(request.method==='GET')return Response.json(await plusStatus(env,userId),{headers});
    if(request.method!=='POST')return new Response(null,{status:405,headers});
    if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403,headers});
    const body=await request.json() as {action?:string;recurringConsent?:boolean;confirmedPriceCents?:number};
    if(body.action==='join' && (body.recurringConsent!==true || body.confirmedPriceCents!==500))return Response.json({error:'Confirm the $5 monthly recurring membership before checkout.'},{status:409,headers});
    const result=body.action==='join'?await plusCheckout(env,request,userId):body.action==='cancel'?await plusCancel(env,userId):null;
    if(!result)return Response.json({error:'Choose join or cancel.'},{status:400,headers});
    return Response.json(result,{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Radio Plus unavailable.'},{status:error instanceof StripeConfigurationError?503:400,headers});}
}

export async function plusProcessorGet<T>(env:PlusRuntime,path:string):Promise<T>{return stripe<T>(env,path);}
