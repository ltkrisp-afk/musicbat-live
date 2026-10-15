import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { connectReady, musicBatOrigin, stableKey, StripeAccount, StripeConfigurationError, stripeGet, stripePost, stripeMode, stripeSandboxPost } from "../stripe";

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
  if (!env.DB) throw new Error("MusicBat storage is unavailable.");
  const artist = await env.DB.prepare('SELECT 1 FROM artist_accounts WHERE artist_id=? UNION SELECT 1 FROM tracks WHERE artist_id=? LIMIT 1').bind(user.userId,user.userId).first();
  if (!artist) throw new Error("ARTIST_REQUIRED");
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
  if (message === "ARTIST_REQUIRED") return json({ error: "Create your artist identity before connecting payouts." }, 403);
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
    if (origin !== new URL(request.url).origin) return json({ error: "Open MusicBat to connect payouts." }, 403);
    const user = await requireArtist();
    if (!env.DB) throw new Error("MusicBat storage is unavailable.");
    let row = await rowFor(user.userId);
    const sandbox = stripeMode(env) === "test";
    if (!row) {
      const key = await stableKey(user.userId);
      let account: StripeAccount;
      if (sandbox) {
        // Match the former v1 default country to the platform; never infer artist legal identity.
        const platform = await stripeGet<{ country?: string }>(env, "/v1/account");
        if (!/^[A-Z]{2}$/.test(platform.country ?? "")) throw new Error("Stripe platform country is unavailable.");
        const created = await stripeSandboxPost<{ id: string; livemode: boolean }>(env, "/v2/core/accounts", {
          contact_email: user.email,
          dashboard: "express",
          identity: { country: platform.country },
          configuration: {
            merchant: { capabilities: { card_payments: { requested: true } } },
            recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
          },
          defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
          metadata: { musicbat_artist_id: user.userId },
        }, `musicbat-connect-v2-test-${key}`);
        if (created.livemode !== false) throw new Error("Stripe account mode mismatch.");
        account = created;
      } else account = await stripePost<StripeAccount>(env, "/v1/accounts", {
        type: "express",
        email: user.email,
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[musicbat_artist_id]": user.userId,
      }, `musicbat-connect-${key}`);
      if (!/^acct_[A-Za-z0-9]+$/.test(account.id ?? '')) throw new Error('Invalid Stripe account response.');
      await env.DB.prepare(`INSERT OR IGNORE INTO artist_accounts (artist_id, stripe_account_id) VALUES (?, ?)`)
        .bind(user.userId, account.id).run();
      row = await rowFor(user.userId);
    }
    if (!row) throw new Error("Stripe account could not be saved.");
    const account = await refresh(user.userId, row);
    if (connectReady(account)) return json({ ...publicAccount(account), onboardingUrl: null });
    const base = musicBatOrigin(env, request);
    const link = sandbox ? await stripeSandboxPost<{ url: string; account: string; livemode: boolean }>(env, "/v2/core/account_links", {
      account: row.stripe_account_id,
      use_case: { type: "account_onboarding", account_onboarding: {
        return_url: `${base}/?view=artist&stripe=return`, refresh_url: `${base}/?view=artist&stripe=refresh`,
      } },
    }) : await stripePost<{ url: string }>(env, "/v1/account_links", {
      account: row.stripe_account_id,
      type: "account_onboarding",
      return_url: `${base}/?view=artist&stripe=return`,
      refresh_url: `${base}/?view=artist&stripe=refresh`,
    });
    if (sandbox && (!("livemode" in link) || link.livemode !== false || !("account" in link) || link.account !== row.stripe_account_id)) throw new Error("Stripe onboarding mode or account mismatch.");
    const onboarding = new URL(link.url);
    const allowedOrigins = sandbox ? ['https://connect.stripe.com', 'https://accounts.stripe.com'] : ['https://connect.stripe.com'];
    if (!allowedOrigins.includes(onboarding.origin) || onboarding.username || onboarding.password) throw new Error('Invalid Stripe onboarding response.');
    return json({ ...publicAccount(account), onboardingUrl: link.url });
  } catch (error) { return failure(error); }
}
