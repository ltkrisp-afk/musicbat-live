import { env } from "cloudflare:workers";
import { buyerIdentity } from "./buyer";
import { connectReady, musicBatOrigin, StripeAccount, StripeCheckoutSession, StripeConfigurationError, stripeGet, stripePost } from "../stripe/stripe";

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
};

function response(data: unknown, status = 200, cookie?: string | null) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
}

function processingSurcharge(amount: number) {
  // Explicitly configured TEST checkout rate; fail closed rather than invent a processor rate.
  const bps = Number(env.MUSICBAT_PROCESSING_BPS);
  const fixed = Number(env.MUSICBAT_PROCESSING_FIXED_CENTS);
  if (!env.MUSICBAT_PROCESSING_BPS || !env.MUSICBAT_PROCESSING_FIXED_CENTS ||
      !Number.isInteger(bps) || bps < 0 || bps >= 10000 ||
      !Number.isInteger(fixed) || fixed < 0) {
    throw new StripeConfigurationError("Buyer processing fee schedule is not configured.");
  }
  return Math.ceil((amount * bps / 10000 + fixed) / (1 - bps / 10000));
}

function split(amount: number) {
  const artistShare = Math.floor((amount * 85 + 50) / 100);
  return { artistShare, platformFee: amount - artistShare };
}

async function existingCheckout(purchase: PurchaseDraft) {
  if (!purchase.processor_session_id) return null;
  const session = await stripeGet<StripeCheckoutSession>(env, `/v1/checkout/sessions/${encodeURIComponent(purchase.processor_session_id)}`);
  return session.status === "open" && session.url ? session.url : null;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return response({ error: "Open MusicBat to buy this song." }, 403);
    if (!env.DB || !env.BUCKET) return response({ error: "Purchases are temporarily unavailable." }, 503);
    let body: { trackId?: unknown; confirmedTotalCents?: unknown };
    try { body = await request.json(); } catch { return response({ error: "Choose a valid song." }, 400); }
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
    let purchase = await env.DB.prepare(`SELECT id, title, artist_name, processor_session_id FROM purchases
      WHERE buyer_hash = ? AND track_id = ? AND audio_path = ? AND amount_cents = ? AND processing_cents = ? AND status IN ('awaiting_checkout', 'pending')
      AND created_at > datetime('now', '-1 day') ORDER BY created_at DESC LIMIT 1`)
      .bind(buyer.hash, trackId, track.audio_url, track.sale_price_cents, surcharge).first<PurchaseDraft>();
    if (purchase) {
      const checkoutUrl = await existingCheckout(purchase);
      if (checkoutUrl) return response({ purchase: { ...purchase, trackId }, checkoutAvailable: true, checkoutUrl }, 200, buyer.cookie);
      await env.DB.prepare("UPDATE purchases SET status = 'cancelled' WHERE id = ? AND status != 'paid'").bind(purchase.id).run();
      purchase = null;
    }
    const id = crypto.randomUUID();
    const { artistShare, platformFee } = split(track.sale_price_cents);
    purchase = await env.DB.prepare(`INSERT INTO purchases
      (id, buyer_hash, track_id, title, artist_name, artist_id, audio_path, status, amount_cents, artist_share_cents, platform_fee_cents, currency, processor_account_id, processing_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_checkout', ?, ?, ?, 'usd', ?, ?)
      RETURNING id, title, artist_name, processor_session_id`)
      .bind(id, buyer.hash, trackId, track.title, track.artist_name, track.artist_id, track.audio_url, track.sale_price_cents, artistShare, platformFee, track.stripe_account_id, surcharge).first<PurchaseDraft>();
    if (!purchase) throw new Error("Purchase draft could not be saved.");
    const base = musicBatOrigin(env, request);
    let checkout: StripeCheckoutSession;
    try {
      checkout = await stripePost<StripeCheckoutSession>(env, "/v1/checkout/sessions", {
        mode: "payment",
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
        "metadata[musicbat_track_id]": String(track.id),
        "metadata[musicbat_processing_cents]": String(surcharge),
      }, `musicbat-checkout-${id}`);
    } catch (error) {
      await env.DB.prepare("UPDATE purchases SET status = 'failed' WHERE id = ?").bind(id).run();
      throw error;
    }
    if (!checkout.id || !checkout.url || checkout.livemode) {
      await env.DB.prepare("UPDATE purchases SET status = 'failed' WHERE id = ?").bind(id).run();
      throw new Error("Stripe returned an invalid test Checkout Session.");
    }
    await env.DB.prepare("UPDATE purchases SET status = 'pending', processor_session_id = ? WHERE id = ?")
      .bind(checkout.id, id).run();
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
    const buyer = await buyerIdentity(request);
    if (!buyer) return response({ error: "This purchase was not found on this device." }, 404);
    const id = new URL(request.url).searchParams.get("id");
    const purchase = await env.DB.prepare("SELECT id, track_id, title, artist_name, amount_cents, currency, status FROM purchases WHERE id = ? AND buyer_hash = ?")
      .bind(id, buyer.hash).first<{ id: string; status: string }>();
    if (!purchase) return response({ error: "Purchase not found." }, 404);
    return response({ purchase, downloadUrl: purchase.status === "paid" ? `/api/musicbat/purchase/${purchase.id}/download` : null });
  } catch (error) {
    console.error("MusicBat purchase status error", error);
    return response({ error: "Purchase status is temporarily unavailable." }, 503);
  }
}
