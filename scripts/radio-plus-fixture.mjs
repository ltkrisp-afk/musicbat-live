// Isolated processor fixture. All identifiers/evidence are test-only; no network.
import {randomBytes,createHmac} from 'node:crypto';
import {plusWebhook} from '../lib/radio-plus.ts';
export function plusFixture(env,session=()=>null,{mode='test'}={}) {
 const sessions=new Map(),subscriptions=new Map(),invoices=new Map(),keys=new Map();
 function invoice(sub,start,end,paid=true) {
  const id='in_test_'+randomBytes(12).toString('hex');
  const value={id,livemode:mode==='live',status:paid?'paid':'open',amount_paid:paid?500:0,amount_due:500,currency:'usd',paid_out_of_band:false,parent:{subscription_details:{subscription:sub.id}},lines:{has_more:false,data:[{amount:500,currency:'usd',period:{start,end}}]}};
  invoices.set(id,value);sub.latest_invoice=id;return value;
 }
 async function fetch(request) {
  const url=new URL(request.url),path=url.pathname;if(url.origin!=='https://api.stripe.com')throw new Error('Outbound processor request blocked.');
  if(path==='/v1/checkout/sessions'&&request.method==='POST') {
   const key=request.headers.get('idempotency-key');if(keys.has(key))return Response.json(sessions.get(keys.get(key)).value);
   const p=new URLSearchParams(await request.text());if(keys.has(key))return Response.json(sessions.get(keys.get(key)).value);
   const id='cs_test_plus_'+randomBytes(12).toString('hex');
   const value={id,url:'/__local/plus-checkout/'+id,livemode:mode==='live',mode:'subscription',status:'open',subscription:null,metadata:{musicbat_plus_id:p.get('metadata[musicbat_plus_id]')}};
   sessions.set(id,{value,user:p.get('subscription_data[metadata][musicbat_user_id]'),attempt:p.get('subscription_data[metadata][musicbat_plus_attempt]'),owner:session(),success:p.get('success_url'),cancel:p.get('cancel_url')});keys.set(key,id);return Response.json(value);
  }
  const id=path.split('/').at(-1);
  if(path.startsWith('/v1/checkout/sessions/'))return sessions.has(id)?Response.json(sessions.get(id).value):new Response(null,{status:404});
  if(path.startsWith('/v1/subscriptions/')) {
   const sub=subscriptions.get(id);if(!sub)return new Response(null,{status:404});
   if(request.method==='POST'){const p=new URLSearchParams(await request.text());if(p.get('cancel_at_period_end')==='true')sub.cancel_at_period_end=true;}
   return Response.json(sub);
  }
  if(path.startsWith('/v1/invoices/'))return invoices.has(id)?Response.json(invoices.get(id)):new Response(null,{status:404});
  throw new Error('Unknown fixture processor operation.');
 }
 env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET='whsec_plus_isolated_fixture';
 env.RADIO_PLUS_PROCESSOR={fetch};env.MUSICBAT_RADIO_PLUS_ENABLED=mode;env.MUSICBAT_STRIPE_MODE=mode;if(mode==='live')env.STRIPE_SECRET_KEY='sk_live_SYNTHETIC_FIXTURE_ONLY';
 async function event(type,object,id='evt_test_plus_'+randomBytes(12).toString('hex')) {
  const raw=JSON.stringify({id,type,livemode:mode==='live',data:{object:{id:object.id,livemode:mode==='live'}}}),stamp=Math.floor(Date.now()/1000),sig=createHmac('sha256',env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET).update(stamp+'.'+raw).digest('hex');
  return plusWebhook(env,new Request('http://localhost:5173/api/musicbat/subscription/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${sig}`},body:raw}));
 }
 async function pay(id) {
  const entry=sessions.get(id);if(!entry)throw new Error('Unknown checkout.');
  if(!entry.value.subscription) {
   const start=Math.floor(Date.now()/1000)-1,end=start+30*86400,sub={id:'sub_test_'+randomBytes(12).toString('hex'),livemode:mode==='live',status:'active',cancel_at_period_end:false,metadata:{musicbat_plus_id:entry.value.metadata.musicbat_plus_id,musicbat_user_id:entry.user,musicbat_plus_attempt:entry.attempt},latest_invoice:null,items:{data:[{quantity:1,current_period_start:start,current_period_end:end,price:{currency:'usd',unit_amount:500,recurring:{interval:'month',interval_count:1}}}]}};
   subscriptions.set(sub.id,sub);entry.value.subscription=sub.id;entry.value.status='complete';invoice(sub,start,end);
  }
  const sub=subscriptions.get(entry.value.subscription);await event('invoice.paid',invoices.get(sub.latest_invoice),'evt_test_plus_paid_'+id);return entry.success;
 }
 async function lifecycle(user,action) {
  const sub=[...subscriptions.values()].find(s=>s.metadata.musicbat_user_id===user && s.status!=='canceled');if(!sub)throw new Error('No subscription fixture.');
  const item=sub.items.data[0];
  if(action==='renew') {if(sub.cancel_at_period_end)throw new Error('Renewal has been cancelled.');item.current_period_start=item.current_period_end;item.current_period_end+=30*86400;sub.status='active';const inv=invoice(sub,item.current_period_start,item.current_period_end);return event('invoice.paid',inv);}
  if(action==='fail') {item.current_period_start=item.current_period_end;item.current_period_end+=30*86400;sub.status='past_due';return event('invoice.payment_failed',invoice(sub,item.current_period_start,item.current_period_end,false));}
  if(action==='expire') {sub.status='canceled';return event('customer.subscription.deleted',sub);}
  throw new Error('Unknown lifecycle action.');
 }
 return {sessions,subscriptions,invoices,event,pay,lifecycle};
}
