// Explicit, in-memory, generated acceptance evidence only. Never imported by production.
import {beginObservation,recordObservedDelivery,observeListening} from '../lib/listening-observation.ts';
export async function seedAccountPreview(f){
 const now=Date.now()-90000,p={trackId:'1',key:'generated-account-demo:1',startedAt:now,endsAt:now+30000,offsetMs:0};
 f.sqlite.prepare("INSERT INTO listens(id,track_id,listener_id,qualified,radio_performance) VALUES('generated-account-demo',1,'local_patron',1,?)").run(p.key);
 await beginObservation(f.state.env.DB,'local_patron','generated-account-demo',p,'test',now);
 await recordObservedDelivery(f.state.env.DB,{listenerId:'local_patron',trackId:1,performanceId:p.key,mode:'test',start:0,bytes:10000,total:10000},now);
 for(let t=2000;t<=30000;t+=2000)await observeListening(f.state.env.DB,{listenerId:'local_patron',performanceId:p.key,mode:'test',event:'progress',positionMs:t,current:p},now+t);
 await observeListening(f.state.env.DB,{listenerId:'local_patron',performanceId:p.key,mode:'test',event:'ended',positionMs:30000,current:p},now+30000);
 const row=f.sqlite.prepare('SELECT * FROM tracks WHERE id=1').get();
 f.sqlite.prepare("INSERT INTO purchases(id,buyer_hash,buyer_account_id,track_id,title,artist_name,artist_id,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,processing_cents,processor_session_id,paid_at) VALUES('generated-account-purchase','generated','local_patron',1,?,?,?,?,'paid',200,170,30,37,'cs_test_generated_account_demo',CURRENT_TIMESTAMP)").run(row.title,row.artist_name,row.artist_id,row.audio_url);
 f.sqlite.prepare("INSERT INTO artist_follows(listener_id,artist_id) VALUES('local_patron','local_musician')").run();
 f.sqlite.prepare("INSERT INTO saved_recordings VALUES('local_patron',1,?)").run(Date.now());
}
