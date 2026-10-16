import {createHmac} from 'node:crypto';
import {fixture,upload,post,load} from './website-fixture.mjs';
export async function setup(databasePath) {
  const f=await fixture(databasePath);
  await upload(f.route);
  await f.route.POST(post({action:'set_sale_settings',trackId:1,saleEnabled:true,saleRightsAttested:true,salePriceCents:200}));
  f.sqlite.exec("INSERT INTO artist_accounts(artist_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted) VALUES ('owner','acct_test_owner',1,1,1)");
  const sessions=new Map(), calls=[], events=[];
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
    const path=new URL(url).pathname;calls.push({path,init});
    if(path.startsWith('/v1/accounts/'))return Response.json({id:'acct_test_owner',charges_enabled:true,payouts_enabled:true,details_submitted:true});
    if(path==='/v1/checkout/sessions'&&init.method==='POST'){
      const id='cs_test_'+sessions.size;
      const session={id,status:'open',payment_status:'unpaid',livemode:false,url:'https://checkout.stripe.com/'+id,amount_total:237,currency:'usd',metadata:{musicbat_purchase_id:init.body.get('metadata[musicbat_purchase_id]'),musicbat_processing_cents:'37'},payment_intent:{id:'pi_'+id,application_fee_amount:67,latest_charge:{id:'ch_'+id,livemode:false,payment_intent:'pi_'+id,amount:237,amount_refunded:0,refunded:false,currency:'usd'},transfer_data:{destination:'acct_test_owner'}}};
      sessions.set(id,session);return Response.json(session);
    }
    if(path==='/v1/checkout/sessions'&&init.method==='GET')return Response.json({data:[...sessions.values()],has_more:false});
    if(path==='/v1/events')return Response.json({data:events.filter(e=>e.type===new URL(url).searchParams.get('type')),has_more:false});
    const id=path.split('/')[4],session=sessions.get(id);
    if(session&&path.endsWith('/expire')){
      if(session.status!=='open')return Response.json({error:{message:'not open'}},{status:400});
      session.status='expired';session.url=null;
    }
    if(session)return Response.json(session);
    throw new Error('Unexpected request '+path);
  };
  const purchase=await load('app/api/musicbat/purchase/route.ts',f.state);
  const webhook=await load('app/api/musicbat/stripe/webhook/route.ts',f.state);
  const download=await load('app/api/musicbat/purchase/[purchaseId]/download/route.ts',f.state);
  const cookie='musicbat_buyer='+'ab'.repeat(32);
  const buy=()=>purchase.POST(new Request('https://musicbat.audio/api/musicbat/purchase',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({trackId:1,confirmedTotalCents:237})}));
  const withdraw=(action='set_sale_settings')=>f.route.POST(post({action,trackId:1,saleEnabled:false}));
  const send=async({id='evt_paid',type='checkout.session.completed',created,paid=true,sessionId=[...sessions.keys()][0]}={})=>{
    const raw=JSON.stringify({id,type,created,livemode:false,data:{object:{id:sessionId,livemode:false,payment_status:paid?'paid':'unpaid'}}});
    const t=Math.floor(Date.now()/1000),sig=createHmac('sha256',f.state.env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
    return webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${sig}`},body:raw}));
  };
  return {...f,sessions,events,calls,buy,withdraw,send,cookie,download,close(){globalThis.fetch=original;if(f.sqlite.isOpen)f.sqlite.close()}};
}
export const order=f=>f.sqlite.prepare('SELECT * FROM purchases').get();
export const paid=f=>{const s=[...f.sessions.values()][0];s.status='complete';s.payment_status='paid';return s};
export const access=f=>f.download.GET(new Request('https://musicbat.audio/api/musicbat/purchase/'+order(f).id+'/download',{headers:{cookie:f.cookie}}));

