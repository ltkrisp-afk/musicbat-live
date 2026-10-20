import { getChatGPTUser } from "../../../chatgpt-auth";
import { env } from "cloudflare:workers";
import { buyerIdentity } from "./buyer";
import { connectReady, musicBatOrigin, StripeAccount, StripeCheckoutSession, StripeConfigurationError, StripeWebhookBodyTooLarge, readStripeWebhookBody, stripeGet, stripePost, stripeModeMatches, expireWithdrawnCheckouts } from "../stripe/stripe";

type TrackForSale = {
  id: number;
  artist_id: string;
  title: string;
  artist_name: string;
  audio_url: string;
  sale_enabled: number;
  sale_rights_attested: number;
  sale_price_cents: number | null;
  sale_currency: string;
  stripe_account_id: string | null;
  charges_enabled: number | null;
  payouts_enabled: number | null;
  details_submitted: number | null;
};

type PurchaseDraft = {
  id: string;
  title: string;
  artist_name: string;
  processor_session_id: string | null;
  artist_share_cents?: number;
  platform_fee_cents?: number;
};

function response(data: unknown, status = 200, cookie?: string | null) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
}

function processingSurcharge(amount: number) {
  // Explicitly configured checkout rate; fail closed rather than invent a processor rate.
  const bps = Number(env.MUSICBAT_PROCESSING_BPS);
  const fixed = Number(env.MUSICBAT_PROCESSING_FIXED_CENTS);
  if (!env.MUSICBAT_PROCESSING_BPS || !env.MUSICBAT_PROCESSING_FIXED_CENTS ||
      !Number.isInteger(bps) || bps < 0 || bps >= 10000 ||
      !Number.isInteger(fixed) || fixed < 0) {
    throw new StripeConfigurationError("Buyer processing fee schedule is not configured.");
  }
  const numerator = amount * bps + fixed * 10000;
  if (!Number.isSafeInteger(numerator)) throw new StripeConfigurationError("Processing fee exceeds the supported range.");
  return Math.ceil(numerator / (10000 - bps));
}

function split(amount: number) {
  const artistShare = Math.floor((amount * 85 + 50) / 100);
  return { artistShare, platformFee: amount - artistShare };
}

async function existingCheckout(purchase: PurchaseDraft) {
  if (!purchase.processor_session_id) return null;
  const session = await stripeGet<StripeCheckoutSession>(env, `/v1/checkout/sessions/${encodeURIComponent(purchase.processor_session_id)}`);
  if (!stripeModeMatches(env, session.livemode)) throw new StripeConfigurationError("Stored Checkout Session mode does not match the configured mode.");
  if (session.id !== purchase.processor_session_id) throw new StripeConfigurationError("Stored Checkout identity mismatch.");
  return session;
}

export async function POST(request: Request) {
  if (env.MUSICBAT_RELEASE_PAUSED === "1") return Response.json({ error: "MusicBat is briefly paused for an update." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });
  try {
    const user = await getChatGPTUser();
    if (!user) return response({ error: "Sign in to buy or recover purchases." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return response({ error: "Open MusicBat to buy this song." }, 403);
    if (!env.DB || !env.BUCKET) return response({ error: "Purchases are temporarily unavailable." }, 503);
    let body: { trackId?: unknown; confirmedTotalCents?: unknown; action?: unknown; purchaseId?: unknown };
    try { body = JSON.parse(await readStripeWebhookBody(request, 16384)); }
    catch (error) { return response({ error: error instanceof StripeWebhookBodyTooLarge ? "Purchase request is too large." : "Choose a valid song." }, error instanceof StripeWebhookBodyTooLarge ? 413 : 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: "Choose a valid song." }, 400);
    if (body.action === "recover_legacy_purchase") {
      // Explicit recovery requires BOTH the original device credential and the
      // provider receipt email matching the platform-authenticated identity.
      // Cookie alone, email supplied in the request, and order ID alone never grant access.
      const buyer = await buyerIdentity(request);
      if (!buyer || typeof body.purchaseId !== 'string') return response({ error: "Purchase recovery requires the original device and receipt." }, 403);
      const purchase = await env.DB.prepare("SELECT id, processor_session_id, buyer_account_id FROM purchases WHERE id=? AND buyer_hash=? AND status='paid'")
        .bind(body.purchaseId,buyer.hash).first<{id:string;processor_session_id:string|null;buyer_account_id:string|null}>();
      if (!purchase || !purchase.processor_session_id) return response({ error: "Purchase recovery requires review." }, 403);
      if (purchase.buyer_account_id) return response({ error: "This purchase already has an account owner." }, 409);
      const session = await stripeGet<StripeCheckoutSession & {customer_details?:{email?:string|null}}>(env, `/v1/checkout/sessions/${encodeURIComponent(purchase.processor_session_id)}`);
      if (!stripeModeMatches(env,session.livemode) || session.id !== purchase.processor_session_id || session.status !== 'complete' || session.payment_status !== 'paid' || session.metadata?.musicbat_purchase_id !== purchase.id || !user.email || session.customer_details?.email?.trim().toLowerCase() !== user.email.trim().toLowerCase())
        return response({ error: "The receipt does not establish ownership for this signed-in account. Purchase recovery requires review." }, 403);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO purchase_ownership_audit(purchase_id,account_id,evidence_type,processor_session_id) SELECT id,?,'original_device_and_authenticated_receipt',processor_session_id FROM purchases WHERE id=? AND buyer_account_id IS NULL ON CONFLICT(purchase_id) DO NOTHING").bind(user.userId,purchase.id),
        env.DB.prepare("UPDATE purchases SET buyer_account_id=? WHERE id=? AND buyer_account_id IS NULL AND EXISTS(SELECT 1 FROM purchase_ownership_audit a WHERE a.purchase_id=purchases.id AND a.account_id=?)").bind(user.userId,purchase.id,user.userId)
      ]);
      const owned = await env.DB.prepare('SELECT id FROM purchases WHERE id=? AND buyer_account_id=?').bind(purchase.id,user.userId).first();
      return owned ? response({ recovered:true, downloadUrl:`/api/musicbat/purchase/${purchase.id}/download` }) : response({error:"Purchase recovery requires review."},409);
    }
    const trackId = Number(body.trackId);
    if (!Number.isInteger(trackId) || trackId < 1) return response({ error: "Choose a valid song." }, 400);
    const track = await env.DB.prepare(`
      SELECT t.id, t.artist_id, t.title, t.artist_name, t.audio_url, t.sale_enabled, t.sale_rights_attested,
        t.sale_price_cents, t.sale_currency, a.stripe_account_id, a.charges_enabled, a.payouts_enabled, a.details_submitted
      FROM tracks t LEFT JOIN artist_accounts a ON a.artist_id = t.artist_id
      WHERE t.id = ? AND t.status = 'active' AND t.rights_attested = 1
    `).bind(trackId).first<TrackForSale>();
    if (!track) return response({ error: "That song is unavailable." }, 404);
    if (!track.sale_enabled || !track.sale_rights_attested || !track.sale_price_cents) return response({ error: "This artist has not offered the track for sale yet." }, 409);
    if (!Number.isSafeInteger(track.sale_price_cents) || track.sale_price_cents < 1 || track.sale_price_cents > 99999999) return response({ error: "This song has an invalid sale price." }, 409);
    if (track.sale_currency !== "usd") return response({ error: "This track's currency is not supported yet." }, 409);
    if (!track.stripe_account_id) {
      return response({ error: "This artist is still finishing Stripe payout setup." }, 409);
    }
    const liveAccount = await stripeGet<StripeAccount>(env, `/v1/accounts/${encodeURIComponent(track.stripe_account_id)}`);
    await env.DB.prepare(`UPDATE artist_accounts SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?, updated_at = CURRENT_TIMESTAMP WHERE artist_id = ?`)
      .bind(liveAccount.charges_enabled ? 1 : 0, liveAccount.payouts_enabled ? 1 : 0, liveAccount.details_submitted ? 1 : 0, track.artist_id).run();
    if (!connectReady(liveAccount)) return response({ error: "This artist is still finishing Stripe payout setup." }, 409);
    const assetId = /^\/api\/musicbat\/audio\/([0-9a-f-]{36}\.(?:mp3|wav|flac))$/.exec(track.audio_url)?.[1];
    if (!assetId || !(await env.BUCKET.head(`tracks/${assetId}`))) return response({ error: "This song needs its original music file before it can be sold." }, 409);
    const buyer = (await buyerIdentity(request, true))!;
    const surcharge = processingSurcharge(track.sale_price_cents);
    const total = track.sale_price_cents + surcharge;
    if (body.confirmedTotalCents !== total) {
      return response({ confirmationRequired: true, quote: {
        trackId, title: track.title, baseCents: track.sale_price_cents,
        processingCents: surcharge, totalCents: total, currency: "usd",
        artistShareCents: split(track.sale_price_cents).artistShare,
      } }, 409, buyer.cookie);
    }
    const legacyPending = await env.DB.prepare("SELECT id FROM purchases WHERE buyer_hash=? AND buyer_account_id IS NULL AND track_id=? AND status IN ('awaiting_checkout','pending','payment_review') LIMIT 1").bind(buyer.hash,trackId).first();
    if (legacyPending) return response({error:"An older Checkout needs ownership review before another payment can be started."},409,buyer.cookie);
    let purchase = await env.DB.prepare(`SELECT id, title, artist_name, processor_session_id, artist_share_cents, platform_fee_cents FROM purchases
      WHERE buyer_account_id = ? AND track_id = ? AND audio_path = ? AND amount_cents = ? AND processing_cents = ? AND status IN ('awaiting_checkout', 'pending')
      AND sale_withdrawn_at IS NULL ORDER BY created_at DESC LIMIT 1`)
      .bind(user.userId, trackId, track.audio_url, track.sale_price_cents, surcharge).first<PurchaseDraft>();
    if (purchase) {
      const allocation = split(track.sale_price_cents);
      // Never reopen an old Checkout with superseded terms. Keep its immutable
      // snapshot for signed settlement/recovery; do not create a second payment.
      if (purchase.artist_share_cents !== allocation.artistShare || purchase.platform_fee_cents !== allocation.platformFee)
        return response({ error: "This earlier Checkout uses superseded payment terms and must be reconciled before another purchase." }, 409, buyer.cookie);
      if (!purchase.processor_session_id) return response({ error: "An earlier Checkout request is still being reconciled. Please try again later." }, 503, buyer.cookie);
      const existingSession = await existingCheckout(purchase);
      const reusable = await env.DB.prepare(`SELECT p.id FROM purchases p JOIN tracks t ON t.id=p.track_id
        WHERE p.id=? AND p.sale_withdrawn_at IS NULL AND p.status='pending'
        AND t.status='active' AND t.rights_attested=1 AND t.sale_enabled=1 AND t.sale_rights_attested=1`)
        .bind(purchase.id).first();
      if (!reusable) {
        await expireWithdrawnCheckouts({ ...env, DB: env.DB }, trackId);
        return response({ error: "This Checkout is no longer available." }, 409, buyer.cookie);
      }
      if (existingSession?.status === 'open' && existingSession.url && existingSession.payment_status !== 'paid')
        return response({ purchase: { ...purchase, trackId }, checkoutAvailable: true, checkoutUrl: existingSession.url }, 200, buyer.cookie);
      if (existingSession?.status !== 'expired' || existingSession.payment_status === 'paid')
        return response({ error: "The earlier payment is awaiting verification." }, 409, buyer.cookie);
      await env.DB.prepare("UPDATE purchases SET status = 'cancelled' WHERE id = ? AND status NOT IN ('paid','refunded')").bind(purchase.id).run();
      purchase = null;
    }
    const id = crypto.randomUUID();
    const { artistShare, platformFee } = split(track.sale_price_cents);
    purchase = await env.DB.prepare(`INSERT INTO purchases
      (id, buyer_hash, buyer_account_id, track_id, title, artist_name, artist_id, audio_path, status, amount_cents, artist_share_cents, platform_fee_cents, currency, processor_account_id, processing_cents)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_checkout', ?, ?, ?, 'usd', ?, ? FROM tracks
      WHERE id=? AND status='active' AND sale_enabled=1 AND sale_rights_attested=1 AND rights_attested=1 AND artist_id=? AND audio_url=? AND sale_price_cents=?
      RETURNING id, title, artist_name, processor_session_id`)
      .bind(id, buyer.hash, user.userId, trackId, track.title, track.artist_name, track.artist_id, track.audio_url, track.sale_price_cents, artistShare, platformFee, track.stripe_account_id, surcharge,trackId,track.artist_id,track.audio_url,track.sale_price_cents).first<PurchaseDraft>();
    if (!purchase) return response({error:"The artist changed this song’s sale permissions or price. Refresh the catalog."},409,buyer.cookie);
    const base = musicBatOrigin(env, request);
    let checkout: StripeCheckoutSession;
    const checkoutFields = {
        mode: "payment",
        // Sandbox accounts can default to merchant-of-record Managed Payments,
        // which does not support Connect destination charges or application fees.
        ...(stripeModeMatches(env, false) ? { "managed_payments[enabled]": "false" } : {}),
        success_url: `${base}/?purchase=success&order=${id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?purchase=cancelled&order=${id}`,
        client_reference_id: id,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(track.sale_price_cents),
        "line_items[0][price_data][product_data][name]": track.title,
        "line_items[0][price_data][product_data][description]": `Music download by ${track.artist_name}`,
        "line_items[0][quantity]": "1",
        "line_items[1][price_data][currency]": "usd",
        "line_items[1][price_data][unit_amount]": String(surcharge),
        "line_items[1][price_data][product_data][name]": "Buyer processing charge",
        "line_items[1][quantity]": "1",
        "payment_method_types[0]": "card",
        "payment_intent_data[application_fee_amount]": String(platformFee + surcharge),
        "payment_intent_data[transfer_data][destination]": track.stripe_account_id,
        "payment_intent_data[metadata][musicbat_purchase_id]": id,
        "metadata[musicbat_purchase_id]": id,
        "metadata[musicbat_buyer_account_id]": user.userId,
        "payment_intent_data[metadata][musicbat_buyer_account_id]": user.userId,
        "metadata[musicbat_track_id]": String(track.id),
        "metadata[musicbat_processing_cents]": String(surcharge),
      };
    // Persist exact replay inputs before the external call. An ambiguous network
    // failure must never discard the order or generate a replacement charge.
    await env.DB.prepare('UPDATE purchases SET checkout_request_json=? WHERE id=?')
      .bind(JSON.stringify(checkoutFields), id).run();
    const allowed = await env.DB.prepare('SELECT id FROM purchases WHERE id=? AND sale_withdrawn_at IS NULL').bind(id).first();
    if (!allowed) return response({ error: "The artist withdrew this song from sale." }, 409, buyer.cookie);
    try {
      checkout = await stripePost<StripeCheckoutSession>(env, "/v1/checkout/sessions", checkoutFields, `musicbat-checkout-${id}`);
    } catch (error) {
      await env.DB.prepare("UPDATE purchases SET cleanup_state='retry', cleanup_error='checkout_creation_outcome_unknown' WHERE id=? AND status NOT IN ('paid','refunded')").bind(id).run();
      throw error;
    }
    if (!checkout.id || !checkout.url || !stripeModeMatches(env, checkout.livemode)) {
      await env.DB.prepare("UPDATE purchases SET cleanup_state='retry', cleanup_error='invalid_checkout_response' WHERE id = ? AND status NOT IN ('paid','refunded')").bind(id).run();
      throw new Error("Stripe returned an invalid Checkout Session.");
    }
    await env.DB.prepare("UPDATE purchases SET status = CASE WHEN status='awaiting_checkout' THEN 'pending' ELSE status END, processor_session_id = COALESCE(processor_session_id, ?) WHERE id = ?")
      .bind(checkout.id, id).run();
    const deliverable = await env.DB.prepare(`SELECT p.id FROM purchases p JOIN tracks t ON t.id=p.track_id
      WHERE p.id=? AND p.sale_withdrawn_at IS NULL AND p.status='pending'
      AND t.status='active' AND t.rights_attested=1 AND t.sale_enabled=1 AND t.sale_rights_attested=1`).bind(id).first();
    if (!deliverable) {
      await expireWithdrawnCheckouts({ ...env, DB: env.DB }, trackId);
      return response({ error: "The artist withdrew this song before Checkout was ready." }, 409, buyer.cookie);
    }
    return response({ purchase: { ...purchase, trackId }, checkoutAvailable: true, checkoutUrl: checkout.url }, 201, buyer.cookie);
  } catch (error) {
    if (error instanceof StripeConfigurationError) return response({ error: error.message }, 503);
    console.error("MusicBat purchase checkout error", error);
    return response({ error: "Could not start Stripe checkout. Try again shortly." }, 503);
  }
}

export async function GET(request: Request) {
  try {
    if (!env.DB) return response({ error: "Purchases are temporarily unavailable." }, 503);
    const user = await getChatGPTUser();
    if (!user) return response({ error: "Sign in to access purchased music." }, 401);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      const rows = await env.DB.prepare("SELECT id,title,artist_name,status FROM purchases WHERE buyer_account_id=? ORDER BY created_at DESC LIMIT 100").bind(user.userId).all();
      return response({ purchases: rows.results });
    }
    const purchase = await env.DB.prepare("SELECT id, track_id, title, artist_name, amount_cents, currency, status FROM purchases WHERE id = ? AND buyer_account_id = ?")
      .bind(id, user.userId).first<{ id: string; status: string }>();
    if (!purchase) {
      const buyer = await buyerIdentity(request);
      const legacy = buyer && await env.DB.prepare("SELECT id FROM purchases WHERE id=? AND buyer_hash=? AND buyer_account_id IS NULL AND status='paid'").bind(id,buyer.hash).first();
      return legacy ? response({ error:"This older purchase needs explicit account recovery before downloading.", recoveryRequired:true },409) : response({ error: "Purchase not found." }, 404);
    }
    return response({ purchase, downloadUrl: purchase.status === "paid" ? `/api/musicbat/purchase/${purchase.id}/download` : null });
  } catch (error) {
    console.error("MusicBat purchase status error", error);
    return response({ error: "Purchase status is temporarily unavailable." }, 503);
  }
}
