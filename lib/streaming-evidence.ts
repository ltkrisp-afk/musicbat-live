import {authorizeChannelUse} from './recording-use';
import {plusAccess} from './radio-plus';
export type PerformanceEvidence={trackId:number;performanceId:string;durationMs:number;territory:string;memberChannel:boolean};
export async function recordAudioDelivery(db:D1Database,input:PerformanceEvidence&{listenerId:string;mode:'test'|'live';bytes:number;totalBytes:number;sourceReference:string},now=Date.now()) {
 if(!input.memberChannel||!Number.isSafeInteger(input.bytes)||input.bytes<1||!Number.isSafeInteger(input.totalBytes)||input.totalBytes<input.bytes||!Number.isSafeInteger(input.durationMs)||input.durationMs<1)return;
 const delivered=Math.floor(input.durationMs*input.bytes/input.totalBytes);
 await db.prepare('INSERT INTO streaming_delivery_evidence VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),input.listenerId,input.trackId,input.performanceId,input.mode,delivered,now,input.sourceReference).run();
}
/** Caller resolves performance, duration and identity server-side. Client
 * timeupdate is corroborating telemetry, never a source of track/time/rights. */
export async function observeMemberListening(db:D1Database,input:PerformanceEvidence&{listenerId:string;mode:'test'|'live'},now=Date.now()) {
 if(!input.memberChannel||!input.performanceId||!Number.isSafeInteger(input.durationMs)||input.durationMs<1)return {eligible:false,reason:'not-member-performance'};
 if(await plusAccess(db,input.listenerId,now,input.mode)<=now)return {eligible:false,reason:'membership-unverified'};
 if(!(await authorizeChannelUse(db,input.trackId,true,input.territory,now)).allowed)return {eligible:false,reason:'rights-not-cleared'};
 const track=await db.prepare('SELECT artist_id FROM tracks WHERE id=?').bind(input.trackId).first<{artist_id:string}>();
 if(!track||track.artist_id===input.listenerId)return {eligible:false,reason:'owner-or-missing-recording'};
 const rights=await db.prepare("SELECT id,recipient_reference FROM recording_use_current WHERE track_id=? AND use='member-stream' AND decision='cleared'").bind(input.trackId).first<{id:number;recipient_reference:string}>();
 if(!rights)return {eligible:false,reason:'member-instructions-missing'};
 const instructions=await db.prepare('SELECT id FROM streaming_beneficiary_instructions WHERE id=? AND track_id=?').bind(rights.recipient_reference,input.trackId).first();
 if(!instructions)return {eligible:false,reason:'signed-beneficiaries-missing'};
 const mode=input.mode,table=mode==='live'?'streaming_eligible_plays':'streaming_test_eligible_plays';
 if(await db.prepare(`SELECT id FROM ${table} WHERE listener_id=? AND performance_id=?`).bind(input.listenerId,input.performanceId).first())return {eligible:true,duplicate:true};
 const existing=await db.prepare('SELECT * FROM streaming_listening_sessions WHERE listener_id=? AND performance_id=? AND mode=?').bind(input.listenerId,input.performanceId,mode).first<{id:string;started_at:number;last_at:number;observed_ms:number;rights_review_id:number}>();
 if(!existing){await db.prepare('INSERT INTO streaming_listening_sessions VALUES (?,?,?,?,?,?,?,0,?,?,?) ON CONFLICT(listener_id,performance_id,mode) DO NOTHING').bind(crypto.randomUUID(),input.listenerId,input.trackId,input.performanceId,mode,now,now,input.durationMs,rights.id,rights.recipient_reference).run();return {eligible:false,reason:'observation-started'};}
 const gap=now-existing.last_at;
 if(gap<1000)return {eligible:false,reason:'heartbeat-too-fast'};
 if(gap>15000||existing.rights_review_id!==rights.id){await db.prepare('UPDATE streaming_listening_sessions SET started_at=?,last_at=?,observed_ms=0,rights_review_id=? WHERE id=? AND last_at=?').bind(now,now,rights.id,existing.id,existing.last_at).run();return {eligible:false,reason:'observation-reset'};}
 const observed=existing.observed_ms+gap,threshold=Math.min(30000,input.durationMs);
 const updated=await db.prepare('UPDATE streaming_listening_sessions SET last_at=?,observed_ms=? WHERE id=? AND last_at=?').bind(now,observed,existing.id,existing.last_at).run();
 if(updated.meta.changes!==1||observed<threshold)return {eligible:false,reason:'insufficient-elapsed-listening'};
 const delivery=await db.prepare('SELECT id,MAX(delivered_ms) delivered_ms FROM streaming_delivery_evidence WHERE listener_id=? AND track_id=? AND performance_id=? AND mode=? AND delivered_at BETWEEN ? AND ? GROUP BY listener_id').bind(input.listenerId,input.trackId,input.performanceId,mode,existing.started_at-60000,now).first<{id:string;delivered_ms:number}>();
 if(!delivery||delivery.delivered_ms<threshold)return {eligible:false,reason:'delivery-unverified'};
 if(new Date(existing.started_at).toISOString().slice(0,7)!==new Date(now-1).toISOString().slice(0,7))return {eligible:false,reason:'month-boundary-review'};
 if(await db.prepare(`SELECT id FROM ${table} WHERE listener_id=? AND started_at<? AND ended_at>?`).bind(input.listenerId,now,existing.started_at).first())return {eligible:false,reason:'overlapping-listening'};
 // Hold abnormal repeat listening for review; do not silently create pool units.
 const repeats=await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE listener_id=? AND track_id=? AND ended_at>?`).bind(input.listenerId,input.trackId,now-86400000).first<{n:number}>();
 if((repeats?.n??0)>=20)return {eligible:false,reason:'repeat-review-required'};
 await db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?) ON CONFLICT(listener_id,track_id,performance_id) DO NOTHING`).bind(crypto.randomUUID(),new Date(now).toISOString().slice(0,7),input.trackId,input.listenerId,input.performanceId,existing.started_at,now,input.durationMs,delivery.delivered_ms,rights.id,rights.recipient_reference,delivery.id,'server-membership-performance-delivery-and-elapsed-check').run();
 return {eligible:true,duplicate:false};
}
