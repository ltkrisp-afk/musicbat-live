import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../../chatgpt-auth';
import {isStripeSandboxKey,readStripeWebhookBody} from '../../stripe/stripe';
import {recoveryProbeStatus,startRecoveryProbe,stepRecoveryProbe} from '../../../../../lib/sandbox-recovery-probe';
const origin='https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site';
async function authorized(request:Request){
 if(new URL(request.url).origin!==origin||env.MUSICBAT_BASE_URL!==origin||env.MUSICBAT_STRIPE_MODE!=='test'||!isStripeSandboxKey(env.STRIPE_SECRET_KEY)||!env.DB||!env.MUSICBAT_ACCEPTANCE_OWNER_ID)return false;
 return (await getChatGPTUser())?.userId===env.MUSICBAT_ACCEPTANCE_OWNER_ID;
}
export async function GET(request:Request){
 if(!await authorized(request))return new Response(null,{status:404});
 const status=await recoveryProbeStatus({...env,DB:env.DB!});
 const text=JSON.stringify(status,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 return new Response('<!doctype html><title>Sandbox recovery probe</title><h1>Sandbox recovery fault probe</h1><p>No Stripe Checkout, payment, or entitlement is created. The processor failure and expired response are injected fixtures. Existing purchases are untouched.</p><pre>'+text+'</pre><form method="post"><button name="operation" value="start">Start labeled fixture with 15-second lease</button><button name="operation" value="step">Run one bounded probe pass</button></form>',{headers:{'content-type':'text/html;charset=utf-8','cache-control':'private, no-store'}});
}
export async function POST(request:Request){
 if(!await authorized(request))return new Response(null,{status:404});
 if(request.headers.get('origin')!==origin)return new Response(null,{status:403});
 let operation:string|null;
 try{operation=new URLSearchParams(await readStripeWebhookBody(request,1024)).get('operation');}catch{return new Response(null,{status:413});}
 const runtime={...env,DB:env.DB!};
 if(operation==='start')return Response.json({probe:true,job:await startRecoveryProbe(runtime)});
 if(operation==='step')return Response.json(await stepRecoveryProbe(runtime));
 return new Response(null,{status:400});
}
