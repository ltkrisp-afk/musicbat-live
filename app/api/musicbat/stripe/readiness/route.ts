import { env } from "cloudflare:workers";
import { isStripeSandboxKey, StripeRequestError, stripeGet } from "../stripe";

const sandboxOrigin = "https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site";
const sandboxAccount = "acct_1UHA0OLKJHBmA7Jw";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

// Read-only diagnostics behind the existing owner-private Sites boundary.
// No visitor identity is invented, no purchases are enabled, no secrets returned.
export async function GET(request: Request) {
  if (env.MUSICBAT_BASE_URL !== sandboxOrigin || new URL(request.url).origin !== sandboxOrigin || env.MUSICBAT_STRIPE_MODE !== "test")
    return json({ error: "Not available." }, 404);
  if (!isStripeSandboxKey(env.STRIPE_SECRET_KEY?.trim()))
    return json({ authenticated: false, error: "A valid test API credential is not configured." }, 503);
  try {
    const account = await stripeGet<{ id: string }>(env, "/v1/account");
    if (account.id !== sandboxAccount) return json({ authenticated: false, error: "Stripe account mismatch." }, 409);
    const balance = await stripeGet<{ livemode: boolean }>(env, "/v1/balance");
    if (balance.livemode !== false) return json({ authenticated: false, error: "Stripe mode mismatch." }, 409);
    return json({ authenticated: true, account_id: account.id, livemode: false,
      webhook_secret_configured: Boolean(env.STRIPE_WEBHOOK_SECRET), purchases_paused: env.MUSICBAT_RELEASE_PAUSED === "1" });
  } catch (error) {
    return json({ authenticated: false, error: "Stripe read-only authentication check failed.",
      stripe_status: error instanceof StripeRequestError ? error.status : undefined }, 502);
  }
}
