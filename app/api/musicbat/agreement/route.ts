import { getChatGPTUser } from "../../../chatgpt-auth";
import { directLicenseFinal } from "../../../../lib/direct-license-final";
import { verifiedCurrentAgreement } from "../../../../lib/agreement-integrity";
import { env } from "cloudflare:workers";

export async function GET(request?: Request) {
  const headers = { "cache-control": "no-store" };
  if (request && new URL(request.url).searchParams.get('format')==='text')
    return new Response(directLicenseFinal.body,{headers:{...headers,'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="MusicBat_Direct_Licensing_Agreement_2026-10-29.3.txt"'}});
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const agreement = await verifiedCurrentAgreement(env.DB);
    if (!agreement) return Response.json({ candidate: directLicenseFinal, error: "Artist uploads are unavailable until the complete Direct Licensing Agreement is approved." }, { status: 503, headers });
    return Response.json({ agreement }, { headers });
  } catch {
    return Response.json({ candidate: directLicenseFinal, error: "The Direct Licensing Agreement integrity or approval could not be verified. Uploads remain unavailable." }, { status: 503, headers });
  }
}

// Record delivery of the exact terms to this authenticated signer. This is
// review evidence only; opening never creates acceptance or public rights.
export async function POST(request:Request) {
  const headers={'cache-control':'private, no-store'};
  if (env.MUSICBAT_RELEASE_PAUSED==='1') return Response.json({error:'Maintenance in progress.'},{status:503,headers});
  if (request.headers.get('origin')!==new URL(request.url).origin) return new Response(null,{status:403,headers});
  const user=await getChatGPTUser();
  if (!user || !env.DB) return Response.json({error:'Sign in to review the active agreement.'},{status:401,headers});
  try {
    const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if (!reader)return new Response(null,{status:400,headers});
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}
    const body=JSON.parse(await new Blob(chunks as BlobPart[]).text());
    const agreement=await verifiedCurrentAgreement(env.DB);
    if(!agreement || body.version!==agreement.version || body.sha256!==agreement.sha256)return Response.json({error:'The agreement changed or is not activated.'},{status:409,headers});
    const id=crypto.randomUUID(),reviewedAt=Date.now();
    await env.DB.prepare('INSERT INTO agreement_review_receipts VALUES (?,?,?,?,?)').bind(id,user.userId,agreement.version,agreement.sha256,reviewedAt).run();
    return Response.json({reviewReceiptId:id,reviewedAt,agreement},{headers});
  } catch {return Response.json({error:'Agreement review could not be recorded.'},{status:503,headers});}
}
