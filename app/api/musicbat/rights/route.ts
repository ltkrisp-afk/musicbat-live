import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {operateRights} from '../../../../lib/rights-operations';
const headers={'cache-control':'private, no-store','vary':'Cookie'};
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return new Response(null,{status:401,headers});if(!env.DB)return new Response(null,{status:503,headers});
 const trackId=Number(new URL(request.url).searchParams.get('trackId'));if(!Number.isSafeInteger(trackId)||trackId<1)return new Response(null,{status:400,headers});
 const operator=env.MUSICBAT_OPERATOR_ID;
 const authorized=user.userId===operator||await env.DB.prepare('SELECT 1 FROM tracks t WHERE t.id=? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))').bind(trackId,user.userId,user.userId).first();
 if(!authorized)return new Response(null,{status:403,headers});
 const decisions=await env.DB.prepare('SELECT use,decision,territory,starts_at,expires_at,reviewed_at FROM recording_use_current WHERE track_id=?').bind(trackId).all();
 const cases=await env.DB.prepare('SELECT case_id,use,state,created_at FROM rights_case_current WHERE track_id=?').bind(trackId).all();
 const requests=await env.DB.prepare("SELECT detail,created_at FROM artist_track_audit WHERE track_id=? AND action='rights_review_request' ORDER BY created_at DESC LIMIT 50").bind(trackId).all();
 return Response.json({decisions:decisions.results,cases:cases.results,requests:requests.results,operator:user.userId===operator},{headers});
}
export async function POST(request:Request){
 if(env.MUSICBAT_RELEASE_PAUSED==='1')return new Response(null,{status:503,headers});
 if(!env.DB)return new Response(null,{status:503,headers});
 const user=await getChatGPTUser();if(!user)return new Response(null,{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403,headers});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400,headers});let size=0;const chunks:Uint8Array[]=[];
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(part.value);}
 try{const body=JSON.parse(await new Blob(chunks as BlobPart[]).text());if(!body||typeof body!=='object'||Array.isArray(body))return new Response(null,{status:400,headers});if(body.action==='withdraw_use') {
  if(!Number.isSafeInteger(body.trackId)||body.trackId<1||!['discovery-preview','noninteractive-radio','free-stream','member-stream','download-sale','other'].includes(body.use))return new Response(null,{status:400,headers});
  const caseId=crypto.randomUUID();
  const result=await env.DB.prepare("INSERT INTO rights_case_events(case_id,track_id,use,state,actor_id,reason,authority_reference,created_at) SELECT ?,id,?,'hold',?,'Artist withdrew this specific use',?,? FROM tracks t WHERE t.id=? AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))").bind(caseId,body.use,user.userId,'authenticated voluntary withdrawal '+caseId,Date.now(),body.trackId,user.userId,user.userId).run();
  return result.meta.changes===1?Response.json({withdrawn:true,caseId,use:body.use,otherUsesChanged:false,entitlementsPreserved:true},{headers}):new Response(null,{status:403,headers});
 }
 if(body.action==='request_review') {
  if(!Number.isSafeInteger(body.trackId)||body.trackId<1||!Array.isArray(body.uses)||!body.uses.length||body.uses.some((v:unknown)=>!['discovery-preview','noninteractive-radio','free-stream','member-stream','download-sale','other'].includes(String(v)))||typeof body.masterAuthority!=='string'||!body.masterAuthority.trim()||body.masterAuthority.length>4000||typeof body.compositionAuthority!=='string'||!body.compositionAuthority.trim()||body.compositionAuthority.length>4000||typeof body.restrictions!=='string'||!body.restrictions.trim()||body.restrictions.length>4000)return new Response(null,{status:400,headers});
  const result=await env.DB.prepare("INSERT INTO artist_track_audit SELECT ?,id,?,?,?,? FROM tracks t WHERE t.id=? AND t.status!='deleted' AND (t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))").bind(crypto.randomUUID(),user.userId,'rights_review_request',JSON.stringify({uses:[...new Set(body.uses)],masterAuthority:body.masterAuthority,compositionAuthority:body.compositionAuthority,restrictions:body.restrictions}),Date.now(),body.trackId,user.userId,user.userId).run();
  return result.meta.changes===1?Response.json({requested:true,rightsGranted:false},{headers}):new Response(null,{status:403,headers});
 }
 const mode=env.MUSICBAT_STRIPE_MODE;if(!['test','live'].includes(mode??'')||env.MUSICBAT_RIGHTS_REVIEW_ENABLED!==mode)return new Response(null,{status:404,headers});
 if(!env.MUSICBAT_OPERATOR_ID||user.userId!==env.MUSICBAT_OPERATOR_ID)return new Response(null,{status:403,headers});
 return Response.json(await operateRights(env.DB,env.BUCKET,user.userId,body),{headers});}catch{return Response.json({error:'Rights evidence is invalid, incomplete, or requires resolution.'},{status:409,headers});}
}
