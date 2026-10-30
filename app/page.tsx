import { getChatGPTUser } from "./chatgpt-auth";
import {redirect} from "next/navigation";
import MusicBatLoop from "./musicbat-loop";

export const dynamic = "force-dynamic";

export default async function Home({searchParams}:{searchParams:Promise<{view?:string;stripe?:string}>}) {
  const {view,stripe}=await searchParams;
  const user = await getChatGPTUser();
  if(user&&!view&&!stripe)redirect('/account');
  const artistReturn = stripe === 'return' || stripe === 'refresh';
  return <MusicBatLoop initialTab={artistReturn || view==='artist'?'catalog':view==='discover'?'discover':'radio'} displayName={user?.displayName ?? "MusicBat listener"} />;
}
