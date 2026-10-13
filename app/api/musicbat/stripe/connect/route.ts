import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { connectReady, musicBatOrigin, stableKey, StripeAccount, StripeConfigurationError, stripeGet, stripePost } from "../stripe";

type AccountRow = {
  stripe_account_id: string;
  charges_enabled: number;
  payouts_enabled: number;
  details_submitted: number;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

async function requireArtist() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("SIGN_IN_REQUIRED");
  return user;
}

async function rowFor(artistId: string) {
  if (!env.DB) throw new Error("MusicBat storage is unavailable.");
  return env.DB.prepare("SELECT stripe_account_id, charges_enabled, payouts_enabled, details_submitted FROM artist_accounts WHERE artist_id = ?")
    .bind(artistId).first<AccountRow>();
}

async function refresh(artistId: string, row: AccountRow) {
  const account = await stripeGet<StripeAccount>(env, `/v1/accounts/${encodeURIComponent(row.stripe_account_id)}`);
  await env.DB!.prepare(`UPDATE artist_accounts SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?, updated_at = CURRENT_TIMESTAMP WHERE artist_id = ?`)
    .bind(account.charges_enabled ? 1 : 0, account.payouts_enabled ? 1 : 0, account.details_submitted ? 1 : 0, artistId).run();
  return account;
}

function publicAccount(account: StripeAccount | AccountRow | null) {
  if (!account) return { connected: false, ready: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
  const charges = "charges_enabled" in account ? Boolean(account.charges_enabled) : false;
  const payouts = "payouts_enabled" in account ? Boolean(account.payouts_enabled) : false;
  const details = "details_submitted" in account ? Boolean(account.details_submitted) : false;
  return { connected: true, ready: charges && payouts && details, chargesEnabled: charges, payoutsEnabled: payouts, detailsSubmitted: details };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message === "SIGN_IN_REQUIRED") return json({ error: "Sign in to connect artist payouts." }, 401);
  if (error instanceof StripeConfigurationError) return json({ error: error.message }, 503);
  console.error("MusicBat Stripe Connect error", error);
  return json({ error: "Stripe onboarding is temporarily unavailable." }, 503);
}

export async function GET() {
  if (env.MUSICBAT_RELEASE_PAUSED === "1") return Response.json({ error: "MusicBat is briefly paused for an update." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });
  try {
    const user = await requireArtist();
    const row = await rowFor(user.userId);
    if (!row) return json(publicAccount(null));
    return json(publicAccount(await refresh(user.userId, row)));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (env.MUSICBAT_RELEASE_PAUSED === "1") return Response.json({ error: "MusicBat is briefly paused for an update." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Open MusicBat to connect payouts." }, 403);
    const user = await requireArtist();
    if (!env.DB) throw new Error("MusicBat storage is unavailable.");
    let row = await rowFor(user.userId);
    if (!row) {
      const key = await stableKey(user.userId);
      const account = await stripePost<StripeAccount>(env, "/v1/accounts", {
        type: "express",
        email: user.email,
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[musicbat_artist_id]": user.userId,
      }, `musicbat-connect-${key}`);
      await env.DB.prepare(`INSERT OR IGNORE INTO artist_accounts (artist_id, stripe_account_id) VALUES (?, ?)`)
        .bind(user.userId, account.id).run();
      row = await rowFor(user.userId);
    }
    if (!row) throw new Error("Stripe account could not be saved.");
    const account = await refresh(user.userId, row);
    if (connectReady(account)) return json({ ...publicAccount(account), onboardingUrl: null });
    const base = musicBatOrigin(env, request);
    const link = await stripePost<{ url: string }>(env, "/v1/account_links", {
      account: row.stripe_account_id,
      type: "account_onboarding",
      return_url: `${base}/?stripe=return`,
      refresh_url: `${base}/?stripe=refresh`,
    });
    return json({ ...publicAccount(account), onboardingUrl: link.url });
  } catch (error) { return failure(error); }
}
