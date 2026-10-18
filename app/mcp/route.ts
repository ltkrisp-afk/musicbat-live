import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../chatgpt-auth';
import {checkoutRecoveryStatus,isStripeSandboxKey,runCheckoutRecovery} from '../api/musicbat/stripe/stripe';
import {queueUnattendedProbe,unattendedProbeStatus} from '../../lib/sandbox-recovery-probe';

const sandbox='https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site';
const tools=[
 {name:'musicbat_recovery_status',description:'Read durable Checkout recovery counts in MusicBat Stage 4 Sandbox. Owner only; no buyer details or credentials.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}},
 {name:'musicbat_run_checkout_recovery',description:'Run one bounded durable recovery pass in MusicBat Stage 4 Sandbox and read back job counts. Test mode only. Expires withdrawn unpaid Checkouts; preserves paid purchases. Does not create a charge or change production.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'musicbat_queue_unattended_probe',description:'Queue one fixed zero-value synthetic retry fixture for the existing scheduled sandbox maintenance. Does not run recovery, create a Stripe Session, charge, refund, or download entitlement. Idempotent; cannot reset or retarget an existing fixture.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
];
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
export async function POST(request:Request){
 if(new URL(request.url).origin!==sandbox||env.MUSICBAT_BASE_URL!==sandbox||env.MUSICBAT_STRIPE_MODE!=='test'||
    !isStripeSandboxKey(env.STRIPE_SECRET_KEY)||!env.DB||!env.MUSICBAT_ACCEPTANCE_OWNER_ID)return json({error:'Not available.'},404);
 const user=await getChatGPTUser();
 if(user?.userId!==env.MUSICBAT_ACCEPTANCE_OWNER_ID)return json({error:'Owner authentication required.'},403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==sandbox)return json({error:'Origin rejected.'},403);
 // MCP is network-facing: bound chunked bodies before parsing as well as declared sizes.
 const reader=request.body?.getReader();
 if(!reader)return json({error:'Request body required.'},400);
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'Request too large.'},413);}chunks.push(value);}
 let message:{jsonrpc?:string;id?:string|number|null;method?:string;params?:{name?:string;arguments?:unknown}};
 try{message=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},400);}
 if(!message||typeof message!=='object'||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
 const reply=(result:unknown)=>json({jsonrpc:'2.0',id:message.id??null,result});
 const error=(code:number,text:string)=>json({jsonrpc:'2.0',id:message.id??null,error:{code,message:text}});
 if(message.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(message.method==='initialize')return reply({protocolVersion:'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'musicbat-sandbox-recovery',version:'1.0.0'}});
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 if(message.method==='ping')return reply({});
 if(message.method==='tools/list')return reply({tools});
 if(message.method!=='tools/call')return error(-32601,'Method not found');
 const name=message.params?.name,args=message.params?.arguments??{};
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)return error(-32602,'This tool accepts no arguments');
 if(!tools.some(tool=>tool.name===name))return error(-32602,'Unknown tool');
 try{
  if(name==='musicbat_queue_unattended_probe')return reply({content:[{type:'text',text:JSON.stringify({sandbox:true,queued:await queueUnattendedProbe({...env,DB:env.DB}),recovery_invoked:false})}],isError:false});
  const pass=name==='musicbat_run_checkout_recovery'?await runCheckoutRecovery({...env,DB:env.DB},{limit:10}):null;
  const status=await checkoutRecoveryStatus({DB:env.DB});
  const unattended_probe=await unattendedProbeStatus({...env,DB:env.DB});
  return reply({content:[{type:'text',text:JSON.stringify({sandbox:true,...pass,status,unattended_probe})}],isError:false});
 }catch{return reply({content:[{type:'text',text:'Sandbox recovery could not complete. Durable jobs are retained for retry.'}],isError:true});}
}
