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
  created?: number;
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

/** One bounded inline attempt. The DB trigger is the durable outbox; Phase 2
 * supplies unattended retries/reconciliation. Never erase a paid entitlement. */
export async function expireWithdrawnCheckouts(runtime: StripeRuntime & { DB: D1Database }, trackId: number) {
  const rows = await runtime.DB.prepare(`SELECT id, processor_session_id FROM purchases
    WHERE track_id=? AND sale_withdrawn_at IS NOT NULL AND status NOT IN ('paid','refunded')
    AND cleanup_state IN ('pending','retry','awaiting_session') ORDER BY id LIMIT 50`)
    .bind(trackId).all<{ id: string; processor_session_id: string | null }>();
  for (const row of rows.results) {
    if (!row.processor_session_id) {
      await runtime.DB.prepare("UPDATE purchases SET cleanup_state='awaiting_session' WHERE id=? AND status NOT IN ('paid','refunded')") .bind(row.id).run();
      continue;
    }
    try {
      // This Phase 1 operator path is sandbox-only until hosted acceptance.
      if (!stripeModeMatches(runtime, false)) throw new StripeConfigurationError('Sandbox required for withdrawal expiration.');
      await runtime.DB.prepare('UPDATE purchases SET cleanup_attempts=cleanup_attempts+1 WHERE id=?').bind(row.id).run();
      const path = `/v1/checkout/sessions/${encodeURIComponent(row.processor_session_id)}`;
      let session = await stripeGet<StripeCheckoutSession>(runtime, path);
      const verify = () => {
        if (session.id !== row.processor_session_id || !stripeModeMatches(runtime, session.livemode)) throw new StripeConfigurationError('Session identity/mode mismatch.');
      };
      verify();
      if (session.status === 'open' && session.payment_status !== 'paid') {
        try { session = await stripePost<StripeCheckoutSession>(runtime, path + '/expire', {}, `musicbat-expire-${row.id}`); }
        catch { session = await stripeGet<StripeCheckoutSession>(runtime, path); }
        verify();
      }
      const state = session.status === 'expired' && session.payment_status !== 'paid' ? 'expired'
        : session.payment_status === 'paid' ? 'payment_observed'
        : session.status === 'complete' ? 'awaiting_payment' : 'retry';
      await runtime.DB.prepare(`UPDATE purchases SET cleanup_state=?, cleanup_error=NULL,
        status=CASE WHEN ?='expired' AND status!='payment_review' THEN 'cancelled' ELSE status END
        WHERE id=? AND status NOT IN ('paid','refunded')`)
        .bind(state, state, row.id).run();
    } catch {
      // No raw Stripe error/customer detail/secrets in durable operational state.
      await runtime.DB.prepare("UPDATE purchases SET cleanup_state='retry', cleanup_error='processor_verification_or_expiration_failed' WHERE id=? AND status NOT IN ('paid','refunded')")
        .bind(row.id).run();
    }
  }
  const outstanding = await runtime.DB.prepare(`SELECT count(*) AS n FROM purchases WHERE track_id=?
    AND sale_withdrawn_at IS NOT NULL AND status NOT IN ('paid','refunded') AND cleanup_state!='expired'`).bind(trackId).first<{ n: number }>();
  return { pending: outstanding?.n ?? 0 };
}
