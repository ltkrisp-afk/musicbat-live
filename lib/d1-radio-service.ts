import {authorizeChannelUse} from './recording-use';
import {D1SharedRadioEngine} from './d1-shared-radio-engine';
import {createRadioTransport} from './shared-radio-transport';
import {currentRadioSource,privateObjectKey,readPrivateRadioObject} from './cloudflare-radio-source';
import {authorizePlayback,type Permission} from './playback-authorization';
import {parseCategoryCommand} from './radio-category';
import type {ListenerAuthority,ScheduledTrack,SharedChannelConfig} from './shared-radio-engine';

export function sandboxD1Radio(env:{MUSICBAT_CLOUDFLARE_RADIO?:string;MUSICBAT_STRIPE_MODE?:string;DB?:D1Database;BUCKET?:R2Bucket}) {
 return env.MUSICBAT_CLOUDFLARE_RADIO==='test'&&env.MUSICBAT_STRIPE_MODE==='test'&&env.DB&&env.BUCKET?d1RadioService(env.DB,env.BUCKET):undefined;
}

/** Internal object service, called only behind forwardRadio's authenticated
 * identity and membership boundaries. It creates no resources, channels, rights
 * grants or catalog imports. Existing reviewed D1 records remain required.
 */
export function d1RadioService(db:D1Database,bucket:R2Bucket):Pick<Fetcher,'fetch'> {
 const engine=new D1SharedRadioEngine(db);
 const primary=()=>db.withSession('first-primary');
 async function config(channelId:string) {
  const row=await primary().prepare('SELECT config_json FROM radio_engine_channels WHERE id=?').bind(channelId).first<{config_json:string}>();
  if(!row)throw new Error('unknown-shared-channel');
  return JSON.parse(row.config_json) as SharedChannelConfig;
 }
 const transport=createRadioTransport(engine,{
  authority:async request=>{
   const id=request.headers.get('x-musicbat-listener'),territory=request.headers.get('x-musicbat-territory');
   const until=request.headers.get('x-musicbat-plus-until');
   if(!id?.trim()||id.length>200||!territory||!/^([A-Z]{2}|unknown)$/.test(territory)||!until||!/^\d{1,16}$/.test(until)||!Number.isSafeInteger(Number(until)))return null;
   return {id,territory,plusUntil:Number(until)>Date.now()?Number(until):null};
  },
  territory:async id=>(await config(id)).territory,
  sourceEligible:async(id:string,listener:ListenerAuthority)=>{
   const session=primary();
   const row=await session.prepare('SELECT t.status,t.radio_enabled,p.* FROM tracks t LEFT JOIN playback_permissions p ON p.track_id=t.id WHERE t.id=?').bind(id).first<Permission&{status:string;radio_enabled:number}>();
   const assignment=await session.prepare('SELECT channel_id FROM radio_engine_sessions WHERE listener_id=?').bind(listener.id).first<{channel_id:string}>();
   if(!row||row.status!=='active'||row.radio_enabled!==1||!assignment)return false;
   const c=await config(assignment.channel_id);
   return (await authorizeChannelUse(session,Number(id),c.mode==='radio-plus',c.territory)).allowed && authorizePlayback(row,c.mode,Date.now(),c.territory).allowed;
  },
  media:async(id,request)=>{
   const source=await currentRadioSource(primary(),Number(id));
   const key=source&&privateObjectKey(source.audio_url);
   if(!key||source?.status!=='active'||source.radio_enabled!==1)return new Response(null,{status:403});
   return readPrivateRadioObject(bucket,key,request);
  },
 });
 return {async fetch(input:RequestInfo|URL,init?:RequestInit){
  const request=new Request(input,init),url=new URL(request.url);
  if(url.pathname==='/catalog/status'){
   if(request.method!=='GET')return new Response(null,{status:405});
   const row=await primary().prepare('SELECT track_json FROM radio_engine_catalog WHERE id=?').bind(url.searchParams.get('trackId')??'').first<{track_json:string}>();
   const track=row?JSON.parse(row.track_json) as ScheduledTrack:null;
   return Response.json({registered:!!track,category:track?.category??null});
  }
  if(url.pathname==='/catalog/control'){
   if(request.method!=='POST')return new Response(null,{status:405});
   const body=await request.json() as {trackId?:string;action?:string;reference?:string;category?:unknown};
   if(!body.trackId||!body.reference?.trim())return new Response(null,{status:400});
   const session=primary();
   if(body.action==='withdraw'){
    await session.prepare('DELETE FROM radio_engine_catalog WHERE id=?').bind(body.trackId).run();
    return Response.json({withdrawn:true});
   }
   if(body.action==='classify'){
    const category=parseCategoryCommand(body.category);
    if(!category)return new Response(null,{status:400});
    const row=await session.prepare('SELECT track_json FROM radio_engine_catalog WHERE id=?').bind(body.trackId).first<{track_json:string}>();
    if(!row)return Response.json({changed:false});
    const track=JSON.parse(row.track_json) as ScheduledTrack;
    if(JSON.stringify(track.category)===JSON.stringify(category))return Response.json({changed:false});
    const next={...track,category,sourceRevision:crypto.randomUUID()};
    await session.prepare('UPDATE radio_engine_catalog SET track_json=? WHERE id=? AND track_json=?').bind(JSON.stringify(next),body.trackId,row.track_json).run();
    // A concurrent correction also forces the caller to discard its old bytes.
    return Response.json({changed:true});
   }
   return new Response(null,{status:400});
  }
  return transport(request);
 }};
}
