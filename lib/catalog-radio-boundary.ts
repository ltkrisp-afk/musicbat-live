import { authorizePlayback, type Permission } from './playback-authorization';
/** The upload catalog remains authoritative for owner consent. A private runtime
 * import cannot bypass a later withdrawal or classification correction. */
export function catalogBoundRadio(service: Pick<Fetcher,'fetch'> | undefined, db: D1Database): Pick<Fetcher,'fetch'> | undefined {
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
      const allowed=!!row && row.status==='active' && row.radio_enabled===1 && authorizePlayback(row,category?'radio-plus':'free-radio',Date.now(),request.headers.get('x-musicbat-territory') ?? 'unknown').allowed;
      if (!allowed) {
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
    const response=await service.fetch(request);
    if (!response.ok) return response;
    if (!await check(audio ? await service.fetch(snapshotRequest) : response)) {
      await response.body?.cancel();
      return Response.json({error:'This recording is no longer eligible for Radio.'},{status:409,headers:{'cache-control':'no-store'}});
    }
    return response;
  }};
}
