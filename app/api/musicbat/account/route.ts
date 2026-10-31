import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {accountPeriod,accountPreferences,accountSnapshot} from '../../../../lib/personal-account';
const headers={'cache-control':'private, no-store','vary':'Cookie'};
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to open your account.'},{status:401,headers});if(!env.DB)return Response.json({error:'Account storage unavailable.'},{status:503,headers});
 try{const url=new URL(request.url);if(url.searchParams.get('section')==='preferences')return Response.json({preferences:await accountPreferences(env.DB,user.userId)},{headers});
 const period=accountPeriod(url.searchParams.get('from'),url.searchParams.get('to')),page=Number(url.searchParams.get('page')??0);if(!Number.isSafeInteger(page)||page<0||page>10000)return new Response(null,{status:400});
 return Response.json(await accountSnapshot(env.DB,user.userId,env,period.start,period.end,page),{headers});}catch{return Response.json({error:'Account data unavailable or invalid reporting period.'},{status:400,headers});}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return new Response(null,{status:401});if(!env.DB)return new Response(null,{status:503});if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 try{const text=await request.text();if(text.length>2000)return new Response(null,{status:413});const body=JSON.parse(text);
 if(body.action==='preferences'){
  if(Object.keys(body).some(k=>!['action','volume','muted','followingOnly'].includes(k))||typeof body.volume!=='number'||!Number.isFinite(body.volume)||body.volume<0||body.volume>1||typeof body.muted!=='boolean'||typeof body.followingOnly!=='boolean')return new Response(null,{status:400});
  await env.DB.prepare('INSERT INTO account_preferences VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET volume=excluded.volume,muted=excluded.muted,following_only=excluded.following_only,updated_at=excluded.updated_at').bind(user.userId,body.volume,body.muted?1:0,body.followingOnly?1:0,Date.now()).run();return Response.json({saved:true},{headers});
 }
 if(body.action==='save_recording'){
  if(!Number.isSafeInteger(body.trackId)||body.trackId<1||typeof body.saved!=='boolean'||Object.keys(body).some(k=>!['action','trackId','saved'].includes(k)))return new Response(null,{status:400});
  if(body.saved){await env.DB.prepare(`INSERT INTO saved_recordings SELECT ?,id,? FROM tracks WHERE id=? AND status='active' AND rights_attested=1 ON CONFLICT(account_id,track_id) DO NOTHING`).bind(user.userId,Date.now(),body.trackId).run();const saved=await env.DB.prepare('SELECT 1 AS saved FROM saved_recordings WHERE account_id=? AND track_id=?').bind(user.userId,body.trackId).first();return Response.json({saved:!!saved},{headers});}
  await env.DB.prepare('DELETE FROM saved_recordings WHERE account_id=? AND track_id=?').bind(user.userId,body.trackId).run();return Response.json({saved:false},{headers});
 }
 return new Response(null,{status:400});}catch{return Response.json({error:'Could not save account change.'},{status:400,headers});}
}
