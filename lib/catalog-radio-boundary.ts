import {recordAudioDelivery} from './streaming-evidence';
import {authorizeChannelUse} from './recording-use';
import { currentRadioSource, readPrivateRadioObject, privateObjectKey } from './cloudflare-radio-source';
import { authorizePlayback, type Permission } from './playback-authorization';
/** The upload catalog remains authoritative for owner consent. A private runtime
 * import cannot bypass a later withdrawal or classification correction. */
export function catalogBoundRadio(service: Pick<Fetcher,'fetch'> | undefined, db: D1Database, bucket?: R2Bucket,evidenceMode:'test'|'live'|null=null): Pick<Fetcher,'fetch'> | undefined {
  if (!service) return undefined;
  return { async fetch(input: RequestInfo | URL, init?: RequestInit) {
    const request = new Request(input,init), url = new URL(request.url);
    const audio = url.pathname.endsWith('/audio');
    const snapshotRequest = new Request(new URL('/channel',url),{headers:request.headers});
    async function check(response: Response) {
      if (!response.ok) return false;
      const data = await response.clone().json() as {snapshot:{channelId:string;category: {genre:string;subgenre?:string;style?:string}|null;performance:{trackId:string;authorityId:string}|null}};
      const id = data.snapshot.performance?.trackId;
      if (!id) return !audio;
      if (audio && (url.searchParams.get('channel')!==data.snapshot.channelId || url.searchParams.get('sequence')!==data.snapshot.performance!.authorityId)) return false;
      const row = await db.prepare('SELECT t.*, p.recording_basis,p.recording_evidence,p.composition_evidence,p.reviewed_by,p.reviewed_at,p.artist_authorized,p.free_allowed,p.plus_allowed,p.starts_at,p.expires_at,p.withdrawn_at,p.territory FROM tracks t LEFT JOIN playback_permissions p ON p.track_id=t.id WHERE t.id=?').bind(id).first<Permission & {status:string;radio_enabled:number;primary_genre:string;subgenre:string|null;style:string|null}>();
      const category=data.snapshot.category;
      const cleared=await authorizeChannelUse(db,Number(id),!!category,request.headers.get('x-musicbat-territory') ?? 'unknown');
      const allowed=cleared.allowed && !!row && row.status==='active' && row.radio_enabled===1 && authorizePlayback(row,category?'radio-plus':'free-radio',Date.now(),request.headers.get('x-musicbat-territory') ?? 'unknown').allowed;
      if (!allowed && (!row || row.status!=='active' || row.radio_enabled!==1 || row.withdrawn_at!==null)) {
        // Best effort removal from persistent scheduling; delivery still fails
        // closed here if this sidecar does not yet implement controls.
        await service!.fetch(new Request(new URL('/catalog/control',url),{method:'POST',headers:request.headers,body:JSON.stringify({trackId:id,action:'withdraw',reference:'catalog-authority-recheck'})})).catch(()=>undefined);
      }
      if (allowed && row) {
        const synced=await service!.fetch(new Request(new URL('/catalog/control',url),{method:'POST',headers:request.headers,body:JSON.stringify({trackId:id,action:'classify',reference:'catalog-classification-recheck',category:{genre:row.primary_genre,...(row.subgenre?{subgenre:row.subgenre}:{}),...(row.style?{style:row.style}:{})}})}));
        if (!synced.ok || (await synced.json() as {changed?:boolean}).changed) return false;
      }
      return allowed && (!category || (!!row && category.genre===row.primary_genre && (!category.subgenre || category.subgenre===row.subgenre) && (!category.style || category.style===row.style)));
    }
    if (audio && !await check(await service.fetch(snapshotRequest))) return new Response(null,{status:403});
    // R2 is the authoritative private audio store when bound. Never fall back
    // to the sidecar filesystem if the R2 key or object is unavailable.
    if (audio) {
      if (!bucket) return new Response(null,{status:503,headers:{'cache-control':'no-store'}});
      const before = await service.fetch(snapshotRequest);
      if (!await check(before)) return new Response(null,{status:403});
      const snap = (await before.json() as {snapshot:{channelId:string;performance:{trackId:string;authorityId:string}|null}}).snapshot;
      const id = Number(snap.performance?.trackId);
      if (!Number.isSafeInteger(id) || id < 1 || !snap.performance ||
          url.searchParams.get('channel') !== snap.channelId ||
          url.searchParams.get('sequence') !== snap.performance.authorityId)
        return new Response(null,{status:409});
      const source = await currentRadioSource(db,id);
      const key = source && privateObjectKey(source.audio_url);
      if (!key || source?.status !== 'active' || source.radio_enabled !== 1)
        return new Response(null,{status:403});
      const response = await readPrivateRadioObject(bucket,key,request);
      if (!response.ok) return response;
      const after = await service.fetch(snapshotRequest);
      const fresh = await currentRadioSource(db,id);
      if (!await check(after) || !fresh || fresh.status !== 'active' ||
          fresh.radio_enabled !== 1 || fresh.audio_url !== source!.audio_url) {
        await response.body?.cancel();
        return new Response(null,{status:409,headers:{'cache-control':'no-store'}});
      }
      if(evidenceMode && request.method==='GET' && response.body){
        const original=response.body.getReader();let bytes=0;
        const metadata=await db.prepare('SELECT technical_metadata FROM tracks WHERE id=?').bind(id).first<{technical_metadata:string}>();
        const technical=metadata?JSON.parse(metadata.technical_metadata) as {durationMs?:number}:{};
        const range=response.headers.get('content-range');const total=range?Number(range.split('/').at(-1)):Number(response.headers.get('content-length'));
        const listener=request.headers.get('x-musicbat-listener');
        const category=(await after.clone().json() as {snapshot:{category:unknown}}).snapshot.category;
        return new Response(new ReadableStream({async pull(controller){try{const part=await original.read();if(part.done){
          if(listener)await recordAudioDelivery(db,{listenerId:listener,mode:evidenceMode,trackId:id,performanceId:snap.channelId+':'+snap.performance!.authorityId,durationMs:technical.durationMs??0,territory:request.headers.get('x-musicbat-territory')??'unknown',memberChannel:!!category,bytes,totalBytes:total,sourceReference:key});
          controller.close();return;}bytes+=part.value.byteLength;controller.enqueue(part.value);}catch(error){controller.error(error);}},cancel:reason=>original.cancel(reason)}),{status:response.status,headers:response.headers});
      }
      return response;
    }
    const response=await service.fetch(request);
    if (!response.ok) return response;
    if (!await check(audio ? await service.fetch(snapshotRequest) : response)) {
      await response.body?.cancel();
      return Response.json({error:'This recording is no longer eligible for Radio.'},{status:409,headers:{'cache-control':'no-store'}});
    }
    return Response.json({...await response.json() as Record<string,unknown>,streamingEvidenceEnabled:!!evidenceMode},{status:response.status,headers:response.headers});
  }};
}
