import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {configuredRadioService} from '../../../../lib/configured-radio-service';
import {forwardRadio} from '../../../../lib/radio-gateway';
import {observeMemberListening} from '../../../../lib/streaming-evidence';
export async function POST(request:Request) {
 const mode=env.MUSICBAT_STRIPE_MODE;
 if(env.MUSICBAT_RELEASE_PAUSED==='1'||!env.DB||(mode!=='test'&&mode!=='live')||env.MUSICBAT_STREAMING_EVIDENCE_ENABLED!==mode)return new Response(null,{status:404});
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 const user=await getChatGPTUser();if(!user)return new Response(null,{status:401});
 // No browser-supplied recording, duration, position, member or revenue fields.
 if(Number(request.headers.get('content-length'))>0 || request.body)return new Response(null,{status:400});
 try {
  const response=await forwardRadio(new Request(new URL('/api/musicbat/channel',request.url)),configuredRadioService(env),user.userId);
  if(!response.ok)return new Response(null,{status:409});
  const data=await response.json() as {snapshot:{channelId:string;category:unknown;performance:{trackId:string;authorityId:string;startedAt:number;endsAt:number}|null}};
  const p=data.snapshot.performance;if(!p)return new Response(null,{status:409});
  const result=await observeMemberListening(env.DB,{listenerId:user.userId,mode,trackId:Number(p.trackId),performanceId:data.snapshot.channelId+':'+p.authorityId,durationMs:p.endsAt-p.startedAt,memberChannel:!!data.snapshot.category,territory:(request as Request & {cf?:{country?:string}}).cf?.country??'unknown'});
  return Response.json(result,{headers:{'cache-control':'private, no-store'}});
 }catch{return Response.json({eligible:false,reason:'verification-unavailable'},{status:503,headers:{'cache-control':'private, no-store'}});}
}
