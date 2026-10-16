"use client";
import Link from "next/link";
import { Input } from "@/components/ui/input";
export type Artist={artist_id:string;slug:string;artist_name:string;track_count:number;following:number;is_owner?:number};
type Release={id:number;artist_id:string;title:string;primary_genre:string;subgenre:string|null;sale_enabled:number;sale_price_cents:number|null;seller_ready:number};
export function ArtistDiscovery({artists,tracks,artistSlug,search,onSearch,followingOnly,onFollowingOnly,loading,error,onRetry,followBusy,onFollow,purchaseBusy,onBuy,onRadio,message}:{
 artists:Artist[];tracks:Release[];artistSlug?:string;search:string;onSearch:(value:string)=>void;
 followingOnly:boolean;onFollowingOnly:(value:boolean)=>void;loading:boolean;error:string;onRetry:()=>void;
 followBusy:boolean;onFollow:(artist:Artist)=>void;purchaseBusy:boolean;onBuy:(track:Release)=>void;onRadio:()=>void;message:string;
}) {
 const visible=artists.filter(a=>(!artistSlug||a.slug===artistSlug)&&(!followingOnly||Boolean(a.following))&&a.artist_name.toLowerCase().includes(search.trim().toLowerCase()));
 const ownPage=Boolean(artistSlug&&artists.some(a=>a.slug===artistSlug&&Number(a.is_owner)===1));
 return <section className="space-y-5 rounded-[1.75rem] border border-white/10 bg-[#111018] p-6 sm:p-8" aria-busy={loading}>
  <div><p className="text-xs uppercase tracking-widest text-[#ff3ea5]">{ownPage?'Your artist page':'The patron follows the music'}</p><h1 className="mt-2 text-3xl font-bold">{artistSlug?artists.find(a=>a.slug===artistSlug)?.artist_name??'Artist':'Discover Artists'}</h1><p className="mt-2 text-sm text-white/60">{ownPage?'This is your public artist page. Open your artist controls to manage your music and payout setup.':'Browse releases, follow artists, and buy authorized recordings. Bat Radio provides shared discovery; Radio Plus unlocks eligible tuning and listener feedback.'}</p></div>
  {artistSlug&&<Link href="/?view=discover" className="inline-block text-sm text-[#ff69bd] underline">Browse all artists</Link>}
  {!artistSlug&&<div className="flex flex-wrap gap-3"><Input aria-label="Search artists" placeholder="Search artists" value={search} onChange={e=>onSearch(e.target.value)}/><button type="button" aria-pressed={followingOnly} onClick={()=>onFollowingOnly(!followingOnly)} className="rounded border border-white/20 p-2">{followingOnly?'Show all artists':'Following'}</button></div>}
  {error&&<p role="alert">{error} <button type="button" disabled={loading} onClick={onRetry} className="underline">Retry artists</button></p>}
  {loading&&!artists.length&&<p role="status">Loading artists…</p>}
  {visible.map(a=><article key={a.artist_id} className="space-y-3 rounded-xl border border-white/10 p-4"><div className="flex flex-wrap justify-between gap-3"><Link href={'/'+a.slug} className="text-xl font-bold text-[#ff69bd]">{a.artist_name}</Link>{Number(a.is_owner)===1?<Link href="/?view=artist" className="rounded border border-[#ff3ea5]/40 px-3 py-2">Your artist controls</Link>:<button type="button" disabled={followBusy||loading||Boolean(error)} aria-pressed={Boolean(a.following)} onClick={()=>onFollow(a)} className="rounded border border-white/20 px-3 py-2">{a.following?'Unfollow artist':'Follow artist'}</button>}</div>
   {tracks.filter(t=>t.artist_id===a.artist_id).map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><div><h2 className="font-bold">{t.title}</h2><p className="text-xs text-white/60">{t.primary_genre}{t.subgenre?' / '+t.subgenre:''}</p></div>{Boolean(t.sale_enabled)&&t.sale_price_cents&&<button type="button" disabled={purchaseBusy||!t.seller_ready} onClick={()=>onBuy(t)} className="rounded border border-[#ff3ea5]/40 px-3 py-2">{t.seller_ready?`Buy $${(t.sale_price_cents/100).toFixed(2)} + processing`:'Sales awaiting payout setup'}</button>}</div>)}
   {!Number(a.track_count)&&<p className="text-sm text-white/60">{Number(a.is_owner)===1?'No active releases. Open your artist controls to manage your music.':'No active releases. Follow this artist and return for future music.'}</p>}
  </article>)}
  {!loading&&!error&&!visible.length&&<p>No artists found.</p>}
  <button type="button" onClick={onRadio} className="rounded border border-[#ff3ea5]/40 px-4 py-2">Listen through Bat Radio</button>
  <p role="status" className="text-sm text-white/60">{message}</p>
 </section>;
}
