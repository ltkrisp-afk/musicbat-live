import { env } from 'cloudflare:workers';
import { notFound } from 'next/navigation';
import { getChatGPTUser } from '../chatgpt-auth';
import MusicBatLoop from '../musicbat-loop';
export const dynamic='force-dynamic';
export default async function ArtistPage({params}:{params:Promise<{artistSlug:string}>}){
 const {artistSlug}=await params;
 if(!env.DB || !await env.DB.prepare('SELECT 1 FROM artist_pages WHERE slug=?').bind(artistSlug).first()) notFound();
 const user=await getChatGPTUser();
 return <MusicBatLoop displayName={user?.displayName ?? 'MusicBat listener'} artistSlug={artistSlug}/>;
}
