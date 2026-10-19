import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../../chatgpt-auth';
import {isStripeSandboxKey,stripeGet,runCheckoutRecovery} from '../../stripe/stripe';
import {privateObjectKey} from '../../../../../lib/cloudflare-radio-source';

const origin='https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site';
const account='acct_1UQrXtLKJHXYfqXB';
const originalHash='571c17392f99b183533d06ae6c324b21df37c5f4e678df36a77303f528812f0f';
const freshHash='19b7f96db5e0b45108662f034ed62218dedb1b7756c750d5eb3e99c94b42dfff';
async function authority(request:Request){
 if(new URL(request.url).origin!==origin||env.MUSICBAT_BASE_URL!==origin||env.MUSICBAT_STRIPE_MODE!=='test'||
    !isStripeSandboxKey(env.STRIPE_SECRET_KEY)||!env.MUSICBAT_ACCEPTANCE_OWNER_ID||!env.DB||!env.BUCKET)return null;
 const user=await getChatGPTUser();
 return user?.userId===env.MUSICBAT_ACCEPTANCE_OWNER_ID?user:null;
}
export async function GET(request:Request){
 if(!await authority(request))return new Response(null,{status:404});
 const row=await env.DB!.prepare("SELECT config_json FROM radio_engine_channels WHERE id='free'").first<{config_json:string}>();
 let reviewStatus='Station review missing';
 try{const expires=JSON.parse(row?.config_json??'{}').review?.expiresAt;if(Number.isSafeInteger(expires))reviewStatus=`Station review ${expires<=Date.now()?'expired':'valid until'} ${new Date(expires).toISOString()}`;}catch{}
 return new Response(`<!doctype html><title>MusicBat sandbox acceptance</title><h1>Sandbox acceptance controls</h1><p>Generated tone only. Existing test account only. No live payments.</p><p>${reviewStatus}</p><form method="post"><button name="operation" value="setup">Configure generated tone fixture</button><button name="operation" value="setup-radio">Review newly authorized Radio tone</button><button name="operation" value="renew-radio">Renew station review for the authorized Radio tone</button><button name="operation" value="recover">Run durable Checkout recovery</button></form>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
}
export async function POST(request:Request){
 const user=await authority(request);
 if(!user)return new Response(null,{status:404});
 if(request.headers.get('origin')!==origin)return new Response(null,{status:403});
 const db=env.DB!,bucket=env.BUCKET!,operation=(await request.formData()).get('operation');
 if(operation==='recover')return Response.json(await runCheckoutRecovery({...env,DB:db},{limit:10}));
 if(operation!=='setup'&&operation!=='setup-radio'&&operation!=='renew-radio')return new Response(null,{status:400});
 const radioOnly=operation==='setup-radio'||operation==='renew-radio';
 const hash=radioOnly?freshHash:originalHash;
 const title=radioOnly?'Sandbox authorized Radio tone — 2026-10-18 evening':'Stage 4 Acceptance Tone — 440 Hz';
 if(!radioOnly){
 const platform=await stripeGet<{id:string}>(env,'/v1/account');
 if(platform.id!=='acct_1UHA0OLKJHBmA7Jw')return new Response(null,{status:409});
 const fixture=await stripeGet<{id:string;charges_enabled:boolean;payouts_enabled:boolean;details_submitted:boolean;metadata?:Record<string,string>}>(env,`/v1/accounts/${account}`);
 if(fixture.id!==account||fixture.metadata?.musicbat_artist_id!=='local_seedy'||!fixture.charges_enabled||!fixture.payouts_enabled||!fixture.details_submitted)return Response.json({error:'Existing test account is not ready.'},{status:409});
 }
 const track=await db.prepare("SELECT id,audio_url FROM tracks WHERE artist_id=? AND title=? AND status='active' AND radio_enabled=1 AND rights_attested=1 AND (?=1 OR sale_rights_attested=1)").bind(user.userId,title,radioOnly?1:0).first<{id:number;audio_url:string}>();
 if(!track)return Response.json({error:'Upload the authorized tone first.'},{status:409});
 const key=privateObjectKey(track.audio_url),object=key?await bucket.get(key):null;
 if(!object||object.size!==(radioOnly?2880044:384044))return new Response(null,{status:409});
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await object.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==hash)return Response.json({error:'Only the verified generated tone is permitted.'},{status:409});
 if(!radioOnly){
 const prior=await db.prepare('SELECT artist_id,stripe_account_id FROM artist_accounts WHERE artist_id=? OR stripe_account_id=?').bind(user.userId,account).all<{artist_id:string;stripe_account_id:string}>();
 if(prior.results.some(row=>row.artist_id!==user.userId||row.stripe_account_id!==account))return Response.json({error:'Existing account association conflicts.'},{status:409});
 }
 const now=Date.now(),until=now+86400000,evidence=radioOnly?`Generated 440 Hz mono PCM, 16000 Hz, 90 seconds; SHA256 ${hash}; owner-authorized sandbox Radio test`:`Generated PCM fixture e2e/fixtures.mjs; SHA256 ${hash}; owner-authorized sandbox purchase-loop test`;
 const permission={recording_basis:'direct',recording_evidence:evidence,composition_evidence:evidence,reviewed_by:'MusicBat sandbox generated-fixture review',reviewed_at:now,artist_authorized:1,free_allowed:1,plus_allowed:0,starts_at:now,expires_at:until,withdrawn_at:null,territory:'worldwide'};
 const source={id:String(track.id),artistIds:[user.userId],albumId:'sandbox-generated-tone',compilationIds:[],metadataReviewed:true,eligible:true,statutoryEligibility:null,permission,category:radioOnly?{genre:'Experimental',subgenre:'Test tones',style:'Generated sine'}:{genre:'Experimental'},durationMs:radioOnly?90000:12000,directRestrictions:null};
 const config={category:null,mode:'free-radio',territory:'worldwide',minimumArtists:1,review:{reference:evidence,verifiedAt:now,expiresAt:until},gate:null};
 if(operation==='renew-radio'){
  const prior=await db.prepare("SELECT config_json FROM radio_engine_channels WHERE id='free'").first<{config_json:string}>();
  const permitted=await db.prepare('SELECT expires_at,withdrawn_at FROM playback_permissions WHERE track_id=? AND artist_authorized=1 AND free_allowed=1').bind(track.id).first<{expires_at:number;withdrawn_at:number|null}>();
  let current;try{current=JSON.parse(prior?.config_json??'null');}catch{return new Response(null,{status:409});}
  const originalEvidence=`Generated PCM fixture e2e/fixtures.mjs; SHA256 ${originalHash}; owner-authorized sandbox purchase-loop test`;
  if(!current||current.mode!=='free-radio'||current.category!==null||current.minimumArtists!==1||current.gate!==null||![originalEvidence,evidence].includes(current.review?.reference)||!permitted||permitted.withdrawn_at!==null||!Number.isSafeInteger(permitted.expires_at)||permitted.expires_at<=now+90000)return Response.json({error:'The fixed active fixture and a valid existing recording permission are required.'},{status:409});
  const expiresAt=Math.min(until,permitted.expires_at);
  const result=await db.prepare("UPDATE radio_engine_channels SET config_json=json_set(config_json,'$.review',json(?)) WHERE id='free' AND config_json=?").bind(JSON.stringify({reference:evidence,verifiedAt:now,expiresAt}),prior!.config_json).run();
  if(result.meta.changes!==1)return Response.json({error:'Station changed; review again before renewal.'},{status:409});
  return Response.json({renewed:true,track_id:track.id,review_expires_at:expiresAt});
 }
 await db.batch([
  ...(!radioOnly?[db.prepare('INSERT OR IGNORE INTO artist_accounts(artist_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted) VALUES(?,?,1,1,1)').bind(user.userId,account)]:[]),
  db.prepare('INSERT OR IGNORE INTO playback_permissions(track_id,recording_basis,recording_evidence,composition_evidence,reviewed_by,reviewed_at,artist_authorized,free_allowed,plus_allowed,starts_at,expires_at,territory) VALUES(?,?,?,?,?,?,1,1,0,?,?,?)').bind(track.id,'direct',evidence,evidence,permission.reviewed_by,now,now,until,'worldwide'),
  db.prepare('INSERT OR IGNORE INTO radio_engine_channels(id,config_json,created_at,last_clock,revision,ledger_sequence) VALUES(?,?,?, ?,0,0)').bind('free',JSON.stringify(config),now,now),
  db.prepare("UPDATE radio_engine_channels SET config_json=json_set(config_json,'$.territory','worldwide') WHERE id='free' AND json_extract(config_json,'$.review.reference')=?").bind(evidence),
  db.prepare('INSERT OR IGNORE INTO radio_engine_catalog(id,track_json) VALUES(?,?)').bind(String(track.id),JSON.stringify(source)),
 ]);
 return Response.json({configured:true,track_id:track.id,existing_test_account:radioOnly?null:account,sha256:digest,review_expires_at:until});
}
