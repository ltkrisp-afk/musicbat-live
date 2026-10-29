import { directLicenseDraft } from "../../../../lib/direct-license-draft";
import { env } from "cloudflare:workers";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const agreement = await env.DB.prepare(`SELECT v.version,v.body,v.acceptance_text FROM direct_license_current c
      JOIN direct_license_versions v ON v.version=c.version WHERE c.id=1 AND lower(v.version) NOT LIKE 'draft-%'`).first();
    if (!agreement) return Response.json({ draft: directLicenseDraft, error: "Artist uploads are unavailable until the complete Direct Licensing Agreement is approved." }, { status: 503, headers });
    return Response.json({ agreement }, { headers });
  } catch {
    return Response.json({ draft: directLicenseDraft, error: "The Direct Licensing Agreement is temporarily unavailable. Please try again later." }, { status: 503, headers });
  }
}
