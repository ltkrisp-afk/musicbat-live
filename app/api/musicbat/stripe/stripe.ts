export type StripeRuntime = {
  MUSICBAT_STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  MUSICBAT_BASE_URL?: string;
};

export type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
};

export type StripeCheckoutSession = {
  id: string;
  url?: string | null;
  livemode?: boolean;
  status?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | {
    id: string;
    application_fee_amount?: number | null;
    transfer_data?: { destination?: string | { id?: string } } | null;
  } | null;
  metadata?: Record<string, string>;
};

export type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: StripeCheckoutSession };
};

export class StripeConfigurationError extends Error {}
export class StripeRequestError extends Error {}

export class StripeWebhookBodyTooLarge extends Error {}

/** Bound unauthenticated delivery before decoding; preserve the raw signed text. */
export async function readStripeWebhookBody(request: Request) {
  const limit = 1024 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(request.headers.get("content-length")) > limit) {
      await reader.cancel();
      throw new StripeWebhookBodyTooLarge("Webhook body exceeds 1 MiB.");
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new StripeWebhookBodyTooLarge("Webhook body exceeds 1 MiB.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function stripeMode(runtime: StripeRuntime): "test" | "live" {
  const mode = runtime.MUSICBAT_STRIPE_MODE ?? "test";
  if (mode !== "test" && mode !== "live") throw new StripeConfigurationError("Stripe mode must be test or live.");
  return mode;
}

export function stripeModeMatches(runtime: StripeRuntime, livemode: unknown) {
  return typeof livemode === "boolean" && livemode === (stripeMode(runtime) === "live");
}

// Restricted credentials are enabled for sandbox only; live acceptance is unchanged.
export function isStripeSandboxKey(value: string | undefined) {
  return Boolean(value && /^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(value));
}

function secret(runtime: StripeRuntime) {
  const value = runtime.STRIPE_SECRET_KEY?.trim();
  const mode = stripeMode(runtime);
  if (!value || !(mode === "test" ? isStripeSandboxKey(value) : value.startsWith("sk_live_"))) throw new StripeConfigurationError("Stripe credential does not match the configured mode.");
  return value;
}

export function musicBatOrigin(runtime: StripeRuntime, request: Request) {
  const configured = runtime.MUSICBAT_BASE_URL?.trim();
  const origin = configured || new URL(request.url).origin;
  let url: URL;
  try { url = new URL(origin); } catch { throw new StripeConfigurationError("MUSICBAT_BASE_URL is invalid."); }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new StripeConfigurationError("MUSICBAT_BASE_URL must use HTTPS.");
  }
  return url.origin;
}

async function stripeRequest<T>(runtime: StripeRuntime, method: "GET" | "POST", path: string, params?: URLSearchParams | string, idempotencyKey?: string, apiVersion?: string): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secret(runtime)}`,
      ...(params ? { "content-type": typeof params === "string" ? "application/json" : "application/x-www-form-urlencoded" } : {}),
      ...(apiVersion ? { "Stripe-Version": apiVersion } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: params,
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    console.error("Stripe API request failed", response.status, data.error?.message ?? "Unknown Stripe error");
    throw new StripeRequestError(data.error?.message ?? "Stripe could not complete that request.");
  }
  return data;
}

export function stripePost<T>(runtime: StripeRuntime, path: string, fields: Record<string, string>, idempotencyKey?: string) {
  return stripeRequest<T>(runtime, "POST", path, new URLSearchParams(fields), idempotencyKey);
}

export function stripeSandboxPost<T>(runtime: StripeRuntime, path: "/v2/core/accounts" | "/v2/core/account_links", fields: Record<string, unknown>, idempotencyKey?: string) {
  if (stripeMode(runtime) !== "test") throw new StripeConfigurationError("Accounts v2 onboarding is sandbox only.");
  if (path !== "/v2/core/accounts" && path !== "/v2/core/account_links") throw new StripeConfigurationError("Unsupported sandbox onboarding endpoint.");
  return stripeRequest<T>(runtime, "POST", path, JSON.stringify(fields), idempotencyKey, "2026-09-30.endive");
}

export function stripeGet<T>(runtime: StripeRuntime, path: string, fields?: Record<string, string>) {
  const query = fields ? `?${new URLSearchParams(fields)}` : "";
  return stripeRequest<T>(runtime, "GET", `${path}${query}`);
}

export function connectReady(account: StripeAccount) {
  return Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted);
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameSignature(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyStripeWebhook(rawBody: string, signatureHeader: string | null, webhookSecret: string | undefined, nowSeconds = Math.floor(Date.now() / 1000), runtime: StripeRuntime = {}) {
  const signingSecret = webhookSecret?.trim();
  if (!signingSecret?.startsWith("whsec_")) throw new StripeConfigurationError("Stripe webhook verification is not configured yet.");
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header.");
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !signatures.length) throw new Error("Stripe webhook signature is invalid or expired.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  if (!signatures.some((candidate) => sameSignature(candidate, expected))) throw new Error("Stripe webhook signature does not match.");
  const event = JSON.parse(rawBody) as StripeEvent;
  if (!event.id || !event.type || !event.data?.object) throw new Error("Stripe webhook payload is invalid.");
  if (!stripeModeMatches(runtime, event.livemode) || !stripeModeMatches(runtime, event.data.object.livemode)) throw new Error("Stripe event mode does not match the configured mode.");
  return event;
}

export async function stableKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(digest).slice(0, 48);
}

// Founder-authorized October 15 sandbox crosswalk. No account creation or arbitrary reassignment.
export async function ensureApprovedSandboxArtist(runtime: StripeRuntime & { DB?: D1Database; MUSICBAT_SANDBOX_LINK_APPROVED?: string }, artistId: string): Promise<string | null> {
  const owner = "yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil";
  const accountId = "acct_1UQrXtLKJHXYfqXB";
  const audio = "/api/musicbat/audio/048ea870-7924-40a2-9e18-c945a3a9b4b3.mp3";
  if (runtime.MUSICBAT_SANDBOX_LINK_APPROVED !== "1" || artistId !== owner) return null;
  if (stripeMode(runtime) !== "test" || !isStripeSandboxKey(runtime.STRIPE_SECRET_KEY?.trim())) throw new StripeConfigurationError("Approved artist linkage requires sandbox credentials.");
  if (!runtime.DB) throw new StripeConfigurationError("Artist storage is unavailable.");
  const original = await runtime.DB.prepare("SELECT artist_id, audio_url FROM tracks WHERE id=5").first<{artist_id:string;audio_url:string}>();
  if (!original || original.artist_id !== owner || original.audio_url !== audio) throw new StripeConfigurationError("Original artist recording does not match the approved sandbox linkage.");
  const associations = await runtime.DB.prepare("SELECT artist_id, stripe_account_id FROM artist_accounts WHERE artist_id=? OR stripe_account_id=?").bind(owner,accountId).all<{artist_id:string;stripe_account_id:string}>();
  if (associations.results.some(row => row.artist_id !== owner || row.stripe_account_id !== accountId)) throw new StripeConfigurationError("Existing artist association conflicts with the approved sandbox linkage.");
  const platform = await stripeGet<{id:string}>(runtime,"/v1/account");
  if (platform.id !== "acct_1UHA0OLKJHBmA7Jw") throw new StripeConfigurationError("Sandbox platform does not match the approved linkage.");
  const account = await stripeGet<StripeAccount & {metadata?:Record<string,string>}>(runtime,`/v1/accounts/${accountId}`);
  if (account.id !== accountId || !connectReady(account) || !["local_seedy",owner].includes(account.metadata?.musicbat_artist_id ?? "")) throw new StripeConfigurationError("Existing sandbox account could not be verified for the approved artist.");
  await runtime.DB.prepare(`INSERT INTO artist_accounts (artist_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted)
    SELECT ?,?,0,0,0 WHERE EXISTS (SELECT 1 FROM tracks WHERE id=5 AND artist_id=? AND audio_url=?)
    AND NOT EXISTS (SELECT 1 FROM artist_accounts WHERE artist_id=? AND stripe_account_id=?)`).bind(owner,accountId,owner,audio,owner,accountId).run();
  const saved = await runtime.DB.prepare("SELECT stripe_account_id FROM artist_accounts WHERE artist_id=?").bind(owner).first<{stripe_account_id:string}>();
  if (saved?.stripe_account_id !== accountId) throw new StripeConfigurationError("Approved sandbox artist association was not saved.");
  return accountId;
}
