"use client";
import { useCallback, useEffect, useState } from 'react';
type ArtistTrack={id:number;title:string;artist_name:string;primary_genre:string;subgenre:string|null;style:string|null;energy_lane:string;status:string;radio_enabled:number;radio_status:string;sale_enabled:number;sale_price_cents:number|null;artist_id:string};
const genres=['Alternative','Blues','Classical','Country','Electronic','Experimental','Folk','Hip-Hop','Jazz','Metal','Other','Punk','Pop','Rock'];
async function request(path:string,body?:unknown){const r=await fetch(path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json() as {error?:string;tracks:ArtistTrack[];accountId:string;profile?:{artist_name:string}};if(!r.ok)throw new Error(data.error ?? 'Could not save.');return data;}
export function ArtistRotunda({onChange}:{onChange:()=>Promise<void>}) {
 const [tracks,setTracks]=useState<ArtistTrack[]>([]),[account,setAccount]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const data=await request('/api/musicbat?view=rotunda');setTracks(data.tracks);setAccount(data.accountId);setName(data.profile?.artist_name ?? data.tracks[0]?.artist_name ?? 'Your artist identity');setError('');}catch(e){setError(e instanceof Error?e.message:'Sign in to manage your music.');}},[]);
 useEffect(()=>{const task=setTimeout(()=>void load(),0);return()=>clearTimeout(task)},[load]);
 async function save(body:unknown){setBusy(true);try{await request('/api/musicbat',body);await load();await onChange();}catch(e){setError(e instanceof Error?e.message:'Could not save.')}finally{setBusy(false)}}
 return <section className="space-y-5 rounded-[1.75rem] border border-white/10 bg-[#111018] p-6 sm:p-8">
  <div><p className="text-xs uppercase tracking-widest text-[#ff3ea5]">Minimal Rotunda</p><h1 className="mt-2 text-2xl font-bold">{name}</h1><p className="mt-2 text-sm text-white/60">One account for listening and your music. Manage your catalog here. Radio permission and sales permission are separate.</p></div>
  {account && <details className="text-xs text-white/50"><summary>Account identity for representative authorization</summary><code>{account}</code></details>}
  {error && <p role="alert" className="text-[#ff9dcc]">{error} <a href="/signin-with-chatgpt?return_to=%2F" className="underline">Sign in</a></p>}
  <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({action:"set_artist_identity",artistName:f.get("artistName")})}} className="flex flex-wrap gap-3"><label>Artist / band identity<input name="artistName" required maxLength={80} defaultValue={name==='Your artist identity'?'':name} key={name} className="block rounded border border-white/20 bg-black/30 p-2" /></label><button disabled={busy} className="rounded border border-[#ff3ea5]/40 p-2">Save identity</button></form>
  {!tracks.length && !error && <p>Your catalog is empty. Use Add Music to upload your first recording. Existing recordings appear only for their authenticated owner or appointed representative.</p>}
  {tracks.map(t=><article key={t.id} className="space-y-4 rounded-xl border border-white/10 p-4">
   <div><h2 className="text-lg font-bold">{t.title}</h2><p className="text-sm text-white/60">{t.artist_name} · {t.status} · Radio: {t.radio_status} · {t.sale_enabled?'Sales enabled':'Sales stopped'}</p></div>
   {t.status!=='deleted' && <>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({action:'edit_metadata',trackId:t.id,title:f.get('title'),primaryGenre:f.get('genre'),subgenre:f.get('subgenre'),style:f.get('style'),energyLane:f.get('energy')})}} className="grid gap-3 sm:grid-cols-2">
     <label>Track title<input name="title" defaultValue={t.title} required maxLength={120} className="block w-full rounded border border-white/20 bg-black/30 p-2" /></label>
     <label>Genre<select name="genre" defaultValue={t.primary_genre} className="block w-full rounded bg-[#17141d] p-2">{genres.map(g=><option key={g}>{g}</option>)}</select></label>
     <label>Subgenre<input name="subgenre" defaultValue={t.subgenre ?? ''} maxLength={80} className="block w-full rounded border border-white/20 bg-black/30 p-2" /></label>
     <label>Style<input name="style" defaultValue={t.style ?? ''} maxLength={80} className="block w-full rounded border border-white/20 bg-black/30 p-2" /></label>
     <label>Energy<select name="energy" defaultValue={t.energy_lane} className="block w-full rounded bg-[#17141d] p-2">{['soft','medium','hard','turbo'].map(g=><option key={g}>{g}</option>)}</select></label>
     <button disabled={busy} className="rounded border border-[#ff3ea5]/40 p-2">Save metadata</button>
    </form>
    <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void save({action:'set_radio',trackId:t.id,enabled:!t.radio_enabled})} className="rounded border border-white/20 p-2">{t.radio_enabled?'Remove from Radio':'Request return to Radio'}</button>
     <button disabled={busy} onClick={()=>{if(window.confirm('Withdraw this track from Radio and stop new sales? Completed purchases and audit records remain.'))void save({action:'withdraw_track',trackId:t.id})}} className="rounded border border-white/20 p-2">Withdraw track</button>
     <button disabled={busy} onClick={()=>{if(window.confirm('Delete this track from the catalog permanently? Radio and new sales stop. Purchase delivery files and necessary records are retained.'))void save({action:'delete_track',trackId:t.id})}} className="rounded border border-white/20 p-2">Delete track</button>
    </div>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({action:'set_sale_settings',trackId:t.id,saleEnabled:true,saleRightsAttested:f.get('consent')==='on',salePriceCents:Math.round(Number(f.get('price'))*100)})}} className="flex flex-wrap items-end gap-3">
     <label>Price USD<input name="price" type="number" step="0.01" min="0.50" max="1000" required defaultValue={((t.sale_price_cents ?? 200)/100).toFixed(2)} className="block rounded border border-white/20 bg-black/30 p-2" /></label>
     <label className="text-sm"><input name="consent" type="checkbox" required /> I authorize sales and delivery.</label>
     <button disabled={busy || t.status!=='active'} className="rounded border border-[#ff3ea5]/40 p-2">{t.sale_enabled?'Update sale':'Enable sale'}</button>
     <button type="button" disabled={busy} onClick={()=>void save({action:'set_sale_settings',trackId:t.id,saleEnabled:false})} className="rounded border border-white/20 p-2">Stop selling</button>
    </form><p className="text-xs text-white/60">Artist receives 85% of the base song price; MusicBat receives 15%. Buyer processing is shown separately before checkout. Return to Radio requires current reviewed permissions.</p>
    {account===t.artist_id && <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({action:f.get('action'),trackId:t.id,representativeId:f.get('representative')})}} className="flex flex-wrap gap-2"><label>Representative account ID<input name="representative" required className="block rounded border border-white/20 bg-black/30 p-2" /></label><select name="action" className="rounded bg-[#17141d] p-2"><option value="grant_representative">Authorize</option><option value="revoke_representative">Revoke</option></select><button disabled={busy} className="rounded border border-white/20 p-2">Save representative</button></form>}
   </>}
  </article>)}
 </section>;
}
