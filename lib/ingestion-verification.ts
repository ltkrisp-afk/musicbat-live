import {sha256Text} from './agreement-integrity';
/** Bounded worker entrypoint. A verified file is not a cleared copyright grant. */
export async function verifyIngestion(db:D1Database,bucket:R2Bucket,trackId:number,worker:string,now=Date.now()) {
 if(!worker.trim()||!Number.isSafeInteger(now))throw new Error('Verified worker identity and clock required');
 const current=await db.prepare('SELECT * FROM recording_ingestion_current WHERE track_id=?').bind(trackId).first<{id:number;state:string;uploaded_at:number;verification_expires_at:number;reviewed_at:number}>();
 if(!current||current.state==='VERIFIED'||current.state==='FAILED')return {changed:false};
 if(current.state==='CLAIMED'&&current.reviewed_at>now-300000)return {changed:false};
 const expired=current.verification_expires_at<now;
 const claim=await db.prepare(`INSERT INTO recording_ingestion_events(track_id,state,uploaded_at,verification_expires_at,reviewed_at,reviewer,evidence_reference)
 SELECT ?,?,?,?,?,?,? WHERE (SELECT MAX(id) FROM recording_ingestion_events WHERE track_id=?)=?`)
 .bind(trackId,expired?'FAILED':'CLAIMED',current.uploaded_at,current.verification_expires_at,now,worker,expired?'72-hour verification window expired':'worker file inspection claim',trackId,current.id).run();
 if(claim.meta.changes!==1||expired)return {changed:claim.meta.changes===1,state:expired?'FAILED':'CLAIMED'};
 const owned=await db.prepare('SELECT id FROM recording_ingestion_current WHERE track_id=?').bind(trackId).first<{id:number}>();
 let valid=false,evidence='Missing or invalid private audio';
 try {
  const track=await db.prepare('SELECT audio_url FROM tracks WHERE id=?').bind(trackId).first<{audio_url:string}>();
  const asset=track?.audio_url.match(/^\/api\/musicbat\/audio\/([0-9a-f-]{36}\.(mp3|wav|flac))$/);
  if(asset){
   const object=await bucket.get('tracks/'+asset[1]);
   if(object){
    const bytes=new Uint8Array(await object.arrayBuffer()),prefix=new TextDecoder().decode(bytes.slice(0,12));
    valid=(asset[2]==='mp3'&&(prefix.startsWith('ID3')||(bytes[0]===255&&(bytes[1]&224)===224)))||(asset[2]==='wav'&&prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WAVE')||(asset[2]==='flac'&&prefix.startsWith('fLaC'));
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    evidence=JSON.stringify({magicBytesValid:valid,bytes:bytes.length,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),source:await sha256Text(track!.audio_url)});
   }
  }
 } catch { evidence='Private object inspection failed; no public permission granted'; }
 const finished=Math.max(now,Date.now());
 const state=valid&&finished<=current.verification_expires_at?'VERIFIED':'FAILED';
 const result=await db.prepare(`INSERT INTO recording_ingestion_events(track_id,state,uploaded_at,verification_expires_at,reviewed_at,reviewer,evidence_reference)
 SELECT ?,?,?,?,?,?,? WHERE (SELECT MAX(id) FROM recording_ingestion_events WHERE track_id=?)=?`)
 .bind(trackId,state,current.uploaded_at,current.verification_expires_at,finished,worker,evidence,trackId,owned!.id).run();
 return {changed:result.meta.changes===1,state};
}
