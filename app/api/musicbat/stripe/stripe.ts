export type StripeRuntime = {
  MUSICBAT_STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  MUSICBAT_BASE_URL?: string;
  CHECKOUT_RECOVERY_SIGNAL?: AbortSignal;
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
    latest_charge?: string | { id: string; livemode: boolean; payment_intent: string; amount: number; amount_refunded: number; refunded: boolean; currency: string } | null;
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
export class StripeRequestError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

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
    signal: runtime.CHECKOUT_RECOVERY_SIGNAL ?? AbortSignal.timeout(15000),
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    console.error("Stripe API request failed", response.status);
    throw new StripeRequestError(data.error?.message ?? "Stripe could not complete that request.", response.status);
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


type RecoveryRuntime = StripeRuntime & { DB: D1Database };
type RecoveryPurchase = {
  id: string; track_id: number; status: string; processor_session_id: string | null;
  sale_withdrawn_at: number | null; created_at: string; amount_cents: number;
  processing_cents: number; platform_fee_cents: number; processor_account_id: string;
};
type RecoveryJob = { purchase_id: string; attempts: number; lease_token: string; scan_cursor: string | null };
const recoveryMaxAttempts = 10;
const recoveryLeaseMs = 120000;

/** Bounded exponential delay plus stable per-job jitter (never an in-memory queue). */
export function checkoutRetryDelay(attempt: number, id: string) {
  const base = Math.min(3600000, 5000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
  const jitter = Array.from(id).reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 1000, 0);
  return Math.min(3600000, base + Math.floor(base * jitter / 5000));
}

function recoverySandbox(runtime: StripeRuntime) {
  if (stripeMode(runtime) !== 'test' || !isStripeSandboxKey(runtime.STRIPE_SECRET_KEY?.trim()))
    throw new StripeConfigurationError('Checkout recovery requires sandbox credentials.');
}

function recoverySession(session: StripeCheckoutSession, purchase: RecoveryPurchase, expectedId?: string) {
  if (!session.id || expectedId && session.id !== expectedId || session.livemode !== false)
    throw new StripeConfigurationError('recovery_session_identity_or_mode_mismatch');
  // Older known Sessions are still verifiable through their local association;
  // discovering an unknown Session additionally requires server metadata.
  if (session.metadata?.musicbat_purchase_id !== purchase.id || session.currency !== 'usd' ||
      session.amount_total !== purchase.amount_cents + purchase.processing_cents)
    throw new StripeConfigurationError('recovery_session_purchase_mismatch');
}

async function recoveryEvidence(runtime: RecoveryRuntime, p: RecoveryPurchase, session: StripeCheckoutSession) {
  const stored = await runtime.DB.prepare(`SELECT stripe_created FROM checkout_payment_evidence
    WHERE purchase_id=? AND session_id=? AND paid_snapshot=1 AND stripe_created>0 ORDER BY stripe_created LIMIT 1`)
    .bind(p.id, session.id).first<{ stripe_created: number }>();
  if (stored) return stored.stripe_created;
  // Retrieve missed processor events. An event page is bounded; incomplete
  // history never proves an ordering. A later signed webhook can supply evidence.
  for (const type of ['checkout.session.completed','checkout.session.async_payment_succeeded']) {
    const events = await stripeGet<{ data: StripeEvent[]; has_more: boolean }>(runtime, '/v1/events', { type, limit: '100', 'created[gte]': String(Math.max(0, Math.floor(Date.parse(p.created_at.replace(' ', 'T') + 'Z') / 1000) - 60)) });
    if (!Array.isArray(events.data)) throw new StripeConfigurationError('recovery_event_response_invalid');
    const match = events.data.filter(e => e.type === type && e.livemode === false && e.data?.object?.id === session.id &&
      e.data.object.livemode === false && e.data.object.payment_status === 'paid' && Number.isSafeInteger(e.created) && e.created! > 0)
      .sort((a,b) => a.created! - b.created!)[0];
    if (match) {
      await runtime.DB.prepare(`INSERT OR IGNORE INTO checkout_payment_evidence(event_id,purchase_id,session_id,stripe_created,paid_snapshot) VALUES(?,?,?,?,1)`)
        .bind(match.id, p.id, session.id, match.created!).run();
      return match.created!;
    }
  }
  return 0;
}

/** A bounded pass used by both inline withdrawal and the automatic operator.
 * Claims and completion are fenced with a durable token and expiring lease.
 * Production scheduling is deliberately not installed by this development task. */
export async function runCheckoutRecovery(runtime: RecoveryRuntime, options: { trackId?: number; limit?: number; now?: number; inline?: boolean; signal?: AbortSignal } = {}) {
  const started = Date.now();
  const clock = () => options.now === undefined ? Date.now() : options.now + Date.now() - started;
  let now = clock();
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 10)));
  await runtime.DB.prepare(`UPDATE checkout_recovery_jobs SET state='exhausted',lease_token=NULL,lease_until=0,
    last_error='retry_exhausted:abandoned_lease',updated_at=? WHERE attempts>=? AND lease_until<=? AND state IN ('running','retrying')`)
    .bind(now,recoveryMaxAttempts,now).run();
  const jobs = await runtime.DB.prepare(`SELECT j.purchase_id FROM checkout_recovery_jobs j JOIN purchases p ON p.id=j.purchase_id
    WHERE j.state IN ('pending','retrying','running') AND j.next_attempt_at<=? AND j.lease_until<=?
    AND (? IS NULL OR p.track_id=?) ORDER BY j.next_attempt_at,j.purchase_id LIMIT ?`)
    .bind(now, now, options.trackId ?? null, options.trackId ?? null, limit).all<{purchase_id: string}>();
  let processed = 0;
  for (const candidate of jobs.results) {
    if (options.signal?.aborted) break;
    now = clock();
    const token = crypto.randomUUID();
    const job = await runtime.DB.prepare(`UPDATE checkout_recovery_jobs SET state='running',lease_token=?,lease_until=?,
      attempts=attempts+1,updated_at=? WHERE purchase_id=? AND state IN ('pending','retrying','running')
      AND next_attempt_at<=? AND lease_until<=? RETURNING *`)
      .bind(token, now + recoveryLeaseMs, now, candidate.purchase_id, now, now).first<RecoveryJob>();
    if (!job) continue;
    processed++;
    // One job's network work cannot exceed its lease; a stalled request aborts.
    const networkRuntime = { ...runtime, CHECKOUT_RECOVERY_SIGNAL: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(options.inline ? 5000 : 45000)]) : AbortSignal.timeout(options.inline ? 5000 : 45000) };
    const fence = `EXISTS(SELECT 1 FROM checkout_recovery_jobs j WHERE j.purchase_id=purchases.id AND j.lease_token=? AND j.lease_until>?)`;
    const finish = async (state: string, error: string | null = null, session?: StripeCheckoutSession, cursor?: string | null) => {
      const exhausted = state === 'retrying' && job.attempts >= recoveryMaxAttempts;
      await runtime.DB.prepare(`UPDATE checkout_recovery_jobs SET state=CASE WHEN EXISTS(
        SELECT 1 FROM purchases p WHERE p.id=purchase_id AND (p.status IN ('paid','refunded') OR (p.cleanup_state='expired' AND p.status!='payment_review'))) THEN 'completed' ELSE ? END,
        next_attempt_at=?,lease_token=NULL,lease_until=0,updated_at=?,last_error=?,scan_cursor=?,
        observed_session_status=COALESCE(?,observed_session_status),observed_payment_status=COALESCE(?,observed_payment_status)
        WHERE purchase_id=? AND lease_token=? AND lease_until>?`)
        .bind(exhausted ? 'exhausted' : state, clock() + checkoutRetryDelay(job.attempts,job.purchase_id), clock(),
          exhausted ? 'retry_exhausted:' + (error ?? 'unresolved') : error, cursor ?? null, session?.status ?? null,
          session?.payment_status ?? null, job.purchase_id, token, clock()).run();
    };
    try {
      const p = await runtime.DB.prepare('SELECT * FROM purchases WHERE id=?').bind(job.purchase_id).first<RecoveryPurchase>();
      if (!p || p.status === 'paid' || p.status === 'refunded') { await finish('completed'); continue; }
      await runtime.DB.prepare(`UPDATE purchases SET cleanup_attempts=cleanup_attempts+1 WHERE id=? AND ${fence}`)
        .bind(p.id,token,clock()).run();
      recoverySandbox(runtime);
      let session: StripeCheckoutSession;
      if (!p.processor_session_id) {
        if (options.inline) { await runtime.DB.prepare(`UPDATE purchases SET cleanup_state='awaiting_session' WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`).bind(p.id,token,clock()).run(); await finish('retrying','session_association_missing'); continue; }
        // Discover, never recreate: a lost response may already represent an
        // open or paid Checkout. Persist pagination progress between attempts.
        const created = Math.floor(Date.parse(p.created_at.replace(' ', 'T') + 'Z') / 1000);
        if (!Number.isSafeInteger(created)) throw new StripeConfigurationError('recovery_creation_time_invalid');
        const list = await stripeGet<{data: StripeCheckoutSession[]; has_more: boolean}>(networkRuntime, '/v1/checkout/sessions', {
          limit:'100', 'created[gte]':String(Math.max(0, created-60)), 'created[lte]':String(created+86400),
          ...(job.scan_cursor ? {starting_after:job.scan_cursor} : {}),
        });
        if (!Array.isArray(list.data) || typeof list.has_more !== 'boolean') throw new StripeConfigurationError('recovery_session_list_invalid');
        const found = list.data.filter(s=>s.metadata?.musicbat_purchase_id===p.id);
        if (found.length>1) { await finish('review','multiple_sessions_for_purchase'); continue; }
        if (!found.length) { await finish('retrying',list.has_more?'session_scan_incomplete':'session_not_found',undefined,list.has_more?list.data.at(-1)?.id:null); continue; }
        recoverySession(found[0],p);
        const linked = await runtime.DB.prepare(`UPDATE purchases SET processor_session_id=? WHERE id=? AND processor_session_id IS NULL AND ${fence} AND status NOT IN ('paid','refunded') RETURNING id`)
          .bind(found[0].id,p.id,token,clock()).first();
        if (!linked) { await finish('retrying','session_association_changed'); continue; }
        p.processor_session_id=found[0].id;
      }
      const path = `/v1/checkout/sessions/${encodeURIComponent(p.processor_session_id)}`;
      session = await stripeGet<StripeCheckoutSession>(networkRuntime,path,{'expand[]':'payment_intent.latest_charge'});
      // Inline legacy expiration keeps Phase 1's identity checks. Financial
      // checks are mandatory before recovery can grant any new entitlement.
      if (session.id!==p.processor_session_id || session.livemode!==false) throw new StripeConfigurationError('recovery_session_identity_or_mode_mismatch');
      await runtime.DB.prepare(`UPDATE checkout_recovery_jobs SET observed_session_status=?,observed_payment_status=?,updated_at=?
        WHERE purchase_id=? AND lease_token=? AND lease_until>?`).bind(session.status??null,session.payment_status??null,clock(),p.id,token,clock()).run();
      if (session.status==='open' && session.payment_status!=='paid' && p.sale_withdrawn_at!==null) {
        const owned=await runtime.DB.prepare('SELECT purchase_id FROM checkout_recovery_jobs WHERE purchase_id=? AND lease_token=? AND lease_until>?').bind(p.id,token,clock()).first();
        if (!owned) continue;
        try { session=await stripePost<StripeCheckoutSession>(networkRuntime,path+'/expire',{},`musicbat-expire-${p.id}-${job.attempts}`); }
        catch { session=await stripeGet<StripeCheckoutSession>(networkRuntime,path,{'expand[]':'payment_intent.latest_charge'}); }
        if (session.id!==p.processor_session_id || session.livemode!==false) throw new StripeConfigurationError('recovery_session_identity_or_mode_mismatch');
      }
      if (session.status==='expired' && session.payment_status==='unpaid') {
        if (p.status==='payment_review') { await finish('review','processor_status_conflicts_with_recorded_payment',session); continue; }
        await runtime.DB.prepare(`UPDATE purchases SET cleanup_state='expired',cleanup_error=NULL,
          status=CASE WHEN status='payment_review' THEN status ELSE 'cancelled' END WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`)
          .bind(p.id,token,clock()).run();
        await finish(p.status==='payment_review'?'review':'completed',null,session); continue;
      }
      if (session.payment_status==='paid') {
        if (options.inline) {
          await runtime.DB.prepare(`UPDATE purchases SET cleanup_state='payment_observed' WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`).bind(p.id,token,clock()).run();
          await finish('retrying','payment_reconciliation_pending',session); continue;
        }
        recoverySession(session,p,p.processor_session_id);
        const pi=typeof session.payment_intent==='object'?session.payment_intent:null;
        const destination=pi?.transfer_data?.destination;
        if (!pi?.id || pi.application_fee_amount!==p.platform_fee_cents+p.processing_cents ||
          (typeof destination==='string'?destination:destination?.id)!==p.processor_account_id ||
          Number(session.metadata?.musicbat_processing_cents ?? 0)!==p.processing_cents)
          throw new StripeConfigurationError('recovery_payment_allocation_mismatch');
        const charge=typeof pi.latest_charge==='object'?pi.latest_charge:null;
        if (!charge?.id || charge.livemode!==false || charge.payment_intent!==pi.id || charge.currency!=='usd' ||
          charge.amount!==p.amount_cents+p.processing_cents || !Number.isSafeInteger(charge.amount_refunded) ||
          charge.amount_refunded<0 || charge.amount_refunded>charge.amount || charge.refunded!==(charge.amount_refunded===charge.amount))
          throw new StripeConfigurationError('recovery_refund_status_unverified');
        if (charge.refunded) {
          await runtime.DB.prepare(`UPDATE purchases SET status='refunded',payment_intent_id=? WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`).bind(pi.id,p.id,token,clock()).run();
          await finish('completed',null,session); continue;
        }
        const second=p.sale_withdrawn_at===null?0:await recoveryEvidence(networkRuntime,p,session);
        await runtime.DB.prepare(`UPDATE purchases SET processor_session_id=COALESCE(processor_session_id,?),payment_intent_id=?,
          status=CASE WHEN (sale_withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=purchases.track_id AND t.status='active' AND t.rights_attested=1 AND t.sale_enabled=1 AND t.sale_rights_attested=1))
            OR (sale_withdrawn_at>0 AND ?>0 AND (?+1)*1000<=sale_withdrawn_at) THEN 'paid' ELSE 'payment_review' END,
          paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),payment_review_reason=CASE WHEN
            (sale_withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=purchases.track_id AND t.status='active' AND t.rights_attested=1 AND t.sale_enabled=1 AND t.sale_rights_attested=1))
            OR (sale_withdrawn_at>0 AND ?>0 AND (?+1)*1000<=sale_withdrawn_at) THEN NULL ELSE 'recovery_payment_order_review' END,
          cleanup_state='payment_review'
          WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`)
          .bind(session.id,pi.id,second,second,second,second,p.id,token,clock()).run();
        const result=await runtime.DB.prepare('SELECT status FROM purchases WHERE id=?').bind(p.id).first<{status:string}>();
        await finish(result?.status==='paid'||result?.status==='refunded'?'completed':'review',result?.status==='payment_review'?'payment_order_unresolved':null,session); continue;
      }
      if (session.status==='open' && p.sale_withdrawn_at===null) {
        await runtime.DB.prepare(`UPDATE purchases SET status='pending',cleanup_state=NULL,cleanup_error=NULL WHERE id=? AND ${fence} AND sale_withdrawn_at IS NULL AND status NOT IN ('paid','refunded','payment_review')`).bind(p.id,token,clock()).run();
        await finish('completed',null,session); continue;
      }
      await runtime.DB.prepare(`UPDATE purchases SET cleanup_state=? WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`)
        .bind(session.status==='complete'?'awaiting_payment':'retry',p.id,token,clock()).run();
      await finish('retrying',session.status==='complete'?'payment_pending':'processor_state_unresolved',session);
    } catch (error) {
      const permanent=error instanceof StripeConfigurationError || error instanceof StripeRequestError &&
        error.status!==undefined && ![408,409,429].includes(error.status) && error.status<500;
      await runtime.DB.prepare(`UPDATE purchases SET cleanup_state='retry',cleanup_error=? WHERE id=? AND ${fence} AND status NOT IN ('paid','refunded')`)
        .bind(permanent?'processor_review_required':'processor_temporarily_unavailable',job.purchase_id,token,clock()).run();
      await finish(permanent?'review':'retrying',permanent?'processor_review_required':'processor_temporarily_unavailable');
    }
  }
  return {processed};
}

export async function checkoutRecoveryStatus(runtime: { DB: D1Database }, trackId?: number) {
  const rows=await runtime.DB.prepare(`SELECT j.state,count(*) AS count FROM checkout_recovery_jobs j JOIN purchases p ON p.id=j.purchase_id
    WHERE (? IS NULL OR p.track_id=?) GROUP BY j.state ORDER BY j.state`).bind(trackId??null,trackId??null).all<{state:string;count:number}>();
  return Object.fromEntries(rows.results.map(r=>[r.state,r.count]));
}

export async function expireWithdrawnCheckouts(runtime: RecoveryRuntime, trackId: number) {
  await runCheckoutRecovery(runtime,{trackId,limit:3,inline:true});
  const outstanding=await runtime.DB.prepare(`SELECT count(*) AS n FROM purchases WHERE track_id=? AND sale_withdrawn_at IS NOT NULL
    AND status NOT IN ('paid','refunded') AND cleanup_state!='expired'`).bind(trackId).first<{n:number}>();
  return {pending:outstanding?.n??0};
}


/** Local operator diagnostics: bounded, with no buyer, credential or audio data. */
export async function checkoutRecoveryOperations(runtime: {DB:D1Database}) {
  return (await runtime.DB.prepare(`SELECT purchase_id,state,attempts,next_attempt_at,lease_until,updated_at,last_error,
    observed_session_status,observed_payment_status FROM checkout_recovery_jobs
    ORDER BY CASE WHEN state IN ('review','exhausted') THEN 0 WHEN state='completed' THEN 2 ELSE 1 END,updated_at DESC,purchase_id LIMIT 100`).all()).results;
}
