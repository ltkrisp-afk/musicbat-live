/** Corroborated playback telemetry, never a payment or acoustic-human-attention claim. */
export type ObservationMode='test'|'live'|'unconfigured';
export type ObservedPerformance={trackId:string;key:string;startedAt:number;endsAt:number;offsetMs:number};
export type ObservationEvent='start'|'progress'|'pause'|'resume'|'exit'|'ended';
type Row={listen_id:string;listener_id:string;track_id:number;performance_id:string;mode:ObservationMode;duration_ms:number;performance_start:number;performance_end:number;first_offset_ms:number;last_position_ms:number;max_position_ms:number;observed_ms:number;last_at:number;state:string;verified_completion_at:number|null};
export function observationMode(env:{MUSICBAT_STRIPE_MODE?:string}):ObservationMode{return env.MUSICBAT_STRIPE_MODE==='test'||env.MUSICBAT_STRIPE_MODE==='live'?env.MUSICBAT_STRIPE_MODE:'unconfigured';}
export async function recordObservedDelivery(db:D1Database,input:{listenerId:string;trackId:number;performanceId:string;mode:ObservationMode;start:number;bytes:number;total:number},now=Date.now()){
 if(!input.listenerId||!Number.isSafeInteger(input.start)||!Number.isSafeInteger(input.bytes)||!Number.isSafeInteger(input.total)||input.start<0||input.bytes<1||input.start+input.bytes>input.total)return;
 await db.prepare('INSERT INTO listening_delivery VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),input.listenerId,input.trackId,input.performanceId,input.mode,input.start,input.start+input.bytes,input.total,now).run();
}
async function deliveryCoverage(db:D1Database,row:Row){
 const rows=(await db.prepare('SELECT byte_start,byte_end,total_bytes FROM listening_delivery WHERE listener_id=? AND track_id=? AND performance_id=? AND mode=? AND delivered_at>=? ORDER BY byte_start,byte_end').bind(row.listener_id,row.track_id,row.performance_id,row.mode,row.performance_start-60000).all<{byte_start:number;byte_end:number;total_bytes:number}>()).results;
 if(!rows.length)return 0;const total=rows[0].total_bytes;if(total<1||rows.some(r=>r.total_bytes!==total))return 0;
 let end=0,bytes=0;for(const r of rows){if(r.byte_end>end){bytes+=r.byte_end-Math.max(end,r.byte_start);end=r.byte_end;}}
 return Math.min(row.duration_ms,Math.floor(row.duration_ms*bytes/total));
}
export async function beginObservation(db:D1Database,listenerId:string,listenId:string,p:ObservedPerformance,mode:ObservationMode,now=Date.now()){
 const duration=p.endsAt-p.startedAt;
 if(!Number.isSafeInteger(duration)||duration<1||!Number.isSafeInteger(p.offsetMs)||p.offsetMs<0||p.offsetMs>duration)return;
 await db.prepare(`INSERT INTO listening_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,'active',NULL,NULL,?,?) ON CONFLICT(listener_id,performance_id,mode) DO NOTHING`).bind(listenId,listenerId,Number(p.trackId),p.key,mode,duration,p.startedAt,p.endsAt,p.offsetMs,p.offsetMs,p.offsetMs,now,now,now).run();
}
const reasons=new Set(['pause','track-change','visibility-hidden','network-error','ended','page-exit','session-change']);
export async function observeListening(db:D1Database,input:{listenerId:string;performanceId:string;mode:ObservationMode;event:ObservationEvent;positionMs:number;reason?:string;current:ObservedPerformance|null},now=Date.now()){
 if(!Number.isFinite(input.positionMs)||input.positionMs<0||!['start','progress','pause','resume','exit','ended'].includes(input.event))return {accepted:false,reason:'invalid-observation'};
 const row=await db.prepare('SELECT * FROM listening_observations WHERE listener_id=? AND performance_id=? AND mode=?').bind(input.listenerId,input.performanceId,input.mode).first<Row>();
 if(!row)return {accepted:false,reason:'observation-not-started'};
 if(row.state==='completed'||row.state==='exited')return {accepted:true,duplicate:true,verifiedCompletion:row.state==='completed',observedMs:row.observed_ms};
 const active=input.current?.key===row.performance_id&&input.current.trackId===String(row.track_id);
 if(['start','progress','resume'].includes(input.event)&&!active)return {accepted:false,reason:'performance-changed'};
 const position=Math.min(row.duration_ms,Math.round(input.positionMs));
 const serverPosition=Math.max(0,Math.min(row.duration_ms,now-row.performance_start));
 if(position>serverPosition+1000)return {accepted:false,reason:'position-ahead-of-authority'};
 const gap=now-row.last_at;
 if(gap<0)return {accepted:false,reason:'clock-regressed'};
 if(gap<250&&(input.event==='progress'||input.event==='start'))return {accepted:true,duplicate:true,observedMs:row.observed_ms};
 // Resume never credits a pause, seek, missed heartbeat or hidden-tab gap.
 const delta=row.state==='active'&&input.event!=='resume'&&gap<=5000&&position>=row.last_position_ms?
 Math.max(0,Math.min(gap,position-row.last_position_ms,row.duration_ms-row.observed_ms)):0;
 const delivered=await deliveryCoverage(db,row),observed=Math.min(row.observed_ms+delta,delivered);
 const complete=now>=row.performance_end-250&&row.first_offset_ms<=250&&position>=row.duration_ms-250&&observed>=row.duration_ms-250&&delivered>=row.duration_ms-250;
 const terminal=input.event==='ended'||input.event==='exit';
 const state=complete&&terminal?'completed':terminal?'exited':input.event==='pause'?'paused':'active';
 const reason=state==='completed'?'ended':input.reason&&reasons.has(input.reason)?input.reason:input.event==='pause'?'pause':terminal?'session-change':null;
 const updates=await db.batch([
 db.prepare('UPDATE listening_observations SET observed_ms=?,last_position_ms=?,max_position_ms=MAX(max_position_ms,?),last_at=?,state=?,exit_reason=?,verified_completion_at=?,updated_at=? WHERE listen_id=? AND last_at=?').bind(observed,position,position,now,state,reason,state==='completed'?now:null,now,row.listen_id,row.last_at),
 db.prepare('INSERT INTO listening_observation_events SELECT ?,listen_id,?,?,?,?,? FROM listening_observations WHERE listen_id=? AND updated_at=? AND state=? AND observed_ms=? ON CONFLICT DO NOTHING').bind(crypto.randomUUID(),input.event,reason,now,position,delta,row.listen_id,now,state,observed),
 db.prepare(`UPDATE listens SET completed_at=CURRENT_TIMESTAMP WHERE id=? AND qualified=1 AND EXISTS(SELECT 1 FROM listening_observations o WHERE o.listen_id=listens.id AND o.state='completed')`).bind(row.listen_id)
 ]);
 if(updates[0].meta.changes!==1)return {accepted:true,duplicate:true};
 return {accepted:true,observedMs:observed,percentageHeard:Math.min(100,100*observed/row.duration_ms),verifiedCompletion:state==='completed',state};
}
