import { getChatGPTUser } from "./chatgpt-auth";
import MusicBatLoop from "./musicbat-loop";

export const dynamic = "force-dynamic";

export default async function Home({searchParams}:{searchParams:Promise<{view?:string}>}) {
  const {view}=await searchParams;
  const user = await getChatGPTUser();
  return <MusicBatLoop initialTab={view==='discover'?'discover':'radio'} displayName={user?.displayName ?? "MusicBat listener"} />;
}
