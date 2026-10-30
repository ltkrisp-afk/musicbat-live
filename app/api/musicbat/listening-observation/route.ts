import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {configuredRadioService} from '../../../../lib/configured-radio-service';
import {forwardRadio} from '../../../../lib/radio-gateway';
import {beginObservation,observeListening,observationMode,type ObservedPerformance,type ObservationEvent} from '../../../../lib/listening-observation';
export async function POST(request:Request){
 const headers={'cache-control':'private, no-store'};
 if(!env.DB)return Response.json({error:'Listening observations unavailable.'},{status:503,headers});
 const user=await getChatGPTUser();if(!user)return new Response(null,{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 try{
  const text=await request.text();if(text.length>1000)return new Response(null,{status:413});
  const body=JSON.parse(text) as {event:ObservationEvent;performanceKey:string;positionMs:number;reason?:string};
  if(Object.keys(body).some(k=>!['event','performanceKey','positionMs','reason'].includes(k))||typeof body.performanceKey!=='string'||body.performanceKey.length>300||!Number.isFinite(body.positionMs)||!['start','progress','pause','resume','exit','ended'].includes(body.event))return new Response(null,{status:400});
  const response=await forwardRadio(new Request(new URL('/api/musicbat/channel',request.url)),configuredRadioService(env),user.userId);
  let current:ObservedPerformance|null=null;
  if(response.ok){const {snapshot}=await response.json() as {snapshot:{simulation?:boolean;status:string;channelId:string;performance:{trackId:string;authorityId:string;startedAt:number;endsAt:number;offsetMs:number}|null}};const p=snapshot.performance;
   if(!snapshot.simulation&&snapshot.status==='playing'&&p)current={trackId:p.trackId,key:snapshot.channelId+':'+p.authorityId,startedAt:p.startedAt,endsAt:p.endsAt,offsetMs:p.offsetMs};}
  const db=env.DB,mode=observationMode(env);
  if(body.event==='start'&&current?.key===body.performanceKey){
   await db.prepare(`INSERT INTO listens(id,track_id,listener_id,qualified,radio_performance) SELECT ?,?,?,0,? WHERE NOT EXISTS(SELECT 1 FROM listens WHERE track_id=? AND listener_id=? AND radio_performance=?)`).bind(crypto.randomUUID(),Number(current.trackId),user.userId,current.key,Number(current.trackId),user.userId,current.key).run();
   const listen=await db.prepare('SELECT id FROM listens WHERE track_id=? AND listener_id=? AND radio_performance=?').bind(Number(current.trackId),user.userId,current.key).first<{id:string}>();
   if(listen)await beginObservation(db,user.userId,listen.id,current,mode);
  }
  return Response.json(await observeListening(db,{listenerId:user.userId,mode,performanceId:body.performanceKey,event:body.event,positionMs:body.positionMs,reason:body.reason,current}),{headers});
 }catch{return Response.json({accepted:false,reason:'observation-unavailable'},{status:503,headers});}
}
