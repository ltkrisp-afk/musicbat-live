import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {runMembershipReconciliation} from '../../../../lib/membership-settlement';
import {closeMembershipMonth} from '../../../../lib/membership-ledger';
export async function POST(request:Request) {
 const headers={'cache-control':'private, no-store'},mode=env.MUSICBAT_STRIPE_MODE;
 if(env.MUSICBAT_RELEASE_PAUSED==='1'||!env.DB||(mode!=='test'&&mode!=='live')||env.MUSICBAT_ACCOUNTING_ENABLED!==mode)return new Response(null,{status:404,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403,headers});
 const operator=env.MUSICBAT_OPERATOR_ID??(mode==='test'?env.MUSICBAT_ACCEPTANCE_OWNER_ID:undefined),user=await getChatGPTUser();
 if(!operator||user?.userId!==operator)return new Response(null,{status:403,headers});
 try {
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400,headers});let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}
  const body=JSON.parse(await new Blob(chunks as BlobPart[]).text());
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','month'].includes(k)))return new Response(null,{status:400,headers});
  if(body.action==='reconcile'&&!body.month)return Response.json(await runMembershipReconciliation(env),{headers});
  if(body.action==='close'&&typeof body.month==='string')return Response.json(await closeMembershipMonth(env.DB,body.month,operator,Date.now(),mode),{headers});
  return new Response(null,{status:400,headers});
 }catch{return Response.json({error:'Accounting evidence is incomplete or requires review.'},{status:409,headers});}
}
