import {observationMode,type ObservationMode} from './listening-observation';
const purchaseMode="CASE WHEN p.processor_session_id LIKE 'cs_test_%' THEN 'test' WHEN p.processor_session_id LIKE 'cs_live_%' THEN 'live' ELSE 'not-recorded' END";
const authority=`(t.artist_id=? OR EXISTS(SELECT 1 FROM track_authority a WHERE a.track_id=t.id AND a.account_id=? AND a.revoked_at IS NULL))`;
export function accountPeriod(from:string|null,to:string|null,now=Date.now()){
 for(const value of [from,to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw Error('Choose valid calendar dates.');
 const end=to?Date.parse(to+'T00:00:00Z')+86400000:now+1,start=from?Date.parse(from+'T00:00:00Z'):now-30*86400000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||end-start>366*86400000)throw Error('Choose a period of up to 366 days.');return {start,end};
}
export async function accountPreferences(db:D1Database,id:string){return await db.prepare('SELECT volume,muted,following_only FROM account_preferences WHERE account_id=?').bind(id).first()??{volume:1,muted:0,following_only:0};}
export async function privateTrackAnalytics(db:D1Database,id:string,mode:ObservationMode,start:number,end:number){
 return (await db.prepare(`SELECT t.id,t.title,
 COUNT(o.listen_id) AS observed_sessions,COALESCE(SUM(o.observed_ms),0) AS observed_ms,
 AVG(CASE WHEN o.listen_id IS NOT NULL THEN MIN(100,100.0*o.observed_ms/o.duration_ms) END) AS average_percent_heard,
 SUM(CASE WHEN o.state='completed' THEN 1 ELSE 0 END) AS verified_completions,
 SUM(CASE WHEN o.state!='completed' AND o.last_position_ms<o.duration_ms-250 AND (o.state='exited' OR o.performance_end<?) THEN 1 ELSE 0 END) AS early_exits,
 SUM(CASE WHEN o.observed_ms>=MIN(12000,o.duration_ms) THEN 1 ELSE 0 END) AS retained_sessions,
 (SELECT COUNT(*) FROM radio_feedback f WHERE f.track_id=t.id AND unixepoch(f.created_at)*1000>=? AND unixepoch(f.created_at)*1000<? AND f.signal='up' AND f.rowid=(SELECT MAX(v.rowid) FROM radio_feedback v WHERE v.track_id=f.track_id AND v.listener_id=f.listener_id AND unixepoch(v.created_at)*1000<?)) AS period_up,
 (SELECT COUNT(*) FROM radio_feedback f WHERE f.track_id=t.id AND unixepoch(f.created_at)*1000>=? AND unixepoch(f.created_at)*1000<? AND f.signal='down' AND f.rowid=(SELECT MAX(v.rowid) FROM radio_feedback v WHERE v.track_id=f.track_id AND v.listener_id=f.listener_id AND unixepoch(v.created_at)*1000<?)) AS period_down
 FROM tracks t LEFT JOIN listening_observations o ON o.track_id=t.id AND o.mode=? AND o.created_at>=? AND o.created_at<? AND o.listener_id!=t.artist_id
 WHERE ${authority} GROUP BY t.id ORDER BY t.id`).bind(Date.now(),start,end,end,start,end,end,mode,start,end,id,id).all()).results;
}
export async function accountSnapshot(db:D1Database,id:string,env:{MUSICBAT_STRIPE_MODE?:string},start:number,end:number,page=0){
 const mode=observationMode(env),limit=50,offset=page*limit;
 const [preferences,profile,managed,purchases,follows,saved,analytics,sales,payouts,exitReasons,salesSummary]=await Promise.all([
 accountPreferences(db,id),db.prepare('SELECT artist_name FROM artist_profiles WHERE account_id=?').bind(id).first(),
 db.prepare(`SELECT 1 FROM artist_profiles WHERE account_id=? UNION SELECT 1 FROM tracks WHERE artist_id=? UNION SELECT 1 FROM track_authority WHERE account_id=? AND revoked_at IS NULL LIMIT 1`).bind(id,id,id).first(),
 db.prepare(`SELECT id,title,artist_name,status,amount_cents,processing_cents,currency,created_at,paid_at,${purchaseMode} AS payment_mode FROM purchases p WHERE buyer_account_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(id,limit+1,offset).all(),
 db.prepare(`SELECT p.account_id AS artist_id,p.slug,COALESCE(a.artist_name,'Artist') AS artist_name FROM artist_follows f JOIN artist_pages p ON p.account_id=f.artist_id LEFT JOIN artist_profiles a ON a.account_id=f.artist_id WHERE f.listener_id=? ORDER BY f.created_at DESC`).bind(id).all(),
 db.prepare(`SELECT s.track_id,t.title,t.artist_name,t.status,s.saved_at FROM saved_recordings s JOIN tracks t ON t.id=s.track_id WHERE s.account_id=? ORDER BY s.saved_at DESC`).bind(id).all(),
 privateTrackAnalytics(db,id,mode,start,end),
 db.prepare(`SELECT p.id,p.track_id,p.title,p.artist_name,p.status,p.amount_cents,p.artist_share_cents,p.platform_fee_cents,p.processing_cents,p.currency,p.created_at,p.paid_at,${purchaseMode} AS payment_mode FROM purchases p JOIN tracks t ON t.id=p.track_id WHERE ${authority} AND unixepoch(COALESCE(p.paid_at,p.created_at))*1000>=? AND unixepoch(COALESCE(p.paid_at,p.created_at))*1000<? ORDER BY COALESCE(p.paid_at,p.created_at) DESC,p.id DESC LIMIT ? OFFSET ?`).bind(id,id,start,end,limit+1,offset).all(),
 db.prepare(`SELECT artist_id,charges_enabled,payouts_enabled,details_submitted FROM artist_accounts WHERE artist_id=?`).bind(id).all(),
 db.prepare(`SELECT o.track_id,o.exit_reason,COUNT(*) AS sessions FROM listening_observations o JOIN tracks t ON t.id=o.track_id WHERE ${authority} AND o.mode=? AND o.created_at>=? AND o.created_at<? AND o.state!='completed' AND o.exit_reason IS NOT NULL GROUP BY o.track_id,o.exit_reason`).bind(id,id,mode,start,end).all(),
 db.prepare(`SELECT p.status,p.currency,${purchaseMode} AS payment_mode,COUNT(*) AS transactions,SUM(p.amount_cents) AS amount_cents,SUM(p.artist_share_cents) AS artist_share_cents,SUM(p.platform_fee_cents) AS platform_fee_cents,SUM(p.processing_cents) AS processing_cents,COUNT(p.artist_share_cents) AS allocation_records FROM purchases p JOIN tracks t ON t.id=p.track_id WHERE ${authority} AND unixepoch(COALESCE(p.paid_at,p.created_at))*1000>=? AND unixepoch(COALESCE(p.paid_at,p.created_at))*1000<? GROUP BY p.status,p.currency,payment_mode`).bind(id,id,start,end).all()
 ]);
 return {preferences,artistName:profile?.artist_name??null,canManage:!!managed,mode,period:{start,end},purchases:purchases.results.slice(0,limit),purchaseHasMore:purchases.results.length>limit,follows:follows.results,saved:saved.results,analytics,sales:sales.results.slice(0,limit),salesHasMore:sales.results.length>limit,payouts:payouts.results,exitReasons:exitReasons.results,salesSummary:salesSummary.results,page,metricDefinitions:{observed:'Corroborated browser progress capped by server elapsed time and delivered audio; not proof of human attention.',completion:'Full-start coverage within 250 ms, server end time, continuous observations and delivered bytes; qualification alone is insufficient.',retention:'Observed at least 12 seconds, or the entire recording if shorter.',legacy:'Historic listens without delivery/observation evidence are not backfilled as verified.'},financialNote:'Stored purchase allocations only. Refunded status does not establish a retained refund amount. Payout readiness is not proof of a payout transfer. Membership compensation is separate.'};
}
