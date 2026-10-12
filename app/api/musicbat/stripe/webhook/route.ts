import { env } from "cloudflare:workers";
import { StripeCheckoutSession, StripeConfigurationError, stripeGet, verifyStripeWebhook } from "../stripe";

type Purchase = {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  processing_cents: number;
  processor_account_id: string;
  processor_session_id: string;
  status: string;
};

function destination(session: StripeCheckoutSession) {
  if (!session.payment_intent || typeof session.payment_intent === "string") return null;
  const value = session.payment_intent.transfer_data?.destination;
  return typeof value === "string" ? value : value?.id ?? null;
}

function paymentIntentId(session: StripeCheckoutSession) {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
}

export async function POST(request: Request) {
  try {
    if (!env.DB) return Response.json({ error: "MusicBat storage is unavailable." }, { status: 503 });
    const rawBody = await request.text();
    const event = await verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
    const supported = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"]);
    if (!supported.has(event.type)) return Response.json({ received: true });
    const sessionId = event.data.object.id;
    const already = await env.DB.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(event.id).first();
    if (already) return Response.json({ received: true, duplicate: true });
    const session = await stripeGet<StripeCheckoutSession>(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { "expand[]": "payment_intent" });
    if (session.livemode) return Response.json({ error: "Live Stripe events are disabled." }, { status: 400 });
    const purchase = await env.DB.prepare(`SELECT id, amount_cents, processing_cents, platform_fee_cents, processor_account_id, processor_session_id, status FROM purchases WHERE processor_session_id = ?`)
      .bind(session.id).first<Purchase>();
    if (!purchase) return Response.json({ error: "Purchase not found." }, { status: 404 });
    // Legacy purchases have no processing metadata and retain their original ledger terms.
    const feeText = session.metadata?.musicbat_processing_cents;
    const processingCents = feeText === undefined ? 0 : Number(feeText);
    const validProcessing = Number.isSafeInteger(processingCents) && processingCents >= 0 &&
      processingCents === purchase.processing_cents;
    const isPaidEvent = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
    if (isPaidEvent && session.payment_status === "paid") {
      const metadataId = session.metadata?.musicbat_purchase_id;
      const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
      if (metadataId !== purchase.id || (!validProcessing || session.amount_total !== purchase.amount_cents + processingCents) || session.currency !== "usd"
        || intent?.application_fee_amount !== purchase.platform_fee_cents + processingCents || destination(session) !== purchase.processor_account_id) {
        console.error("Stripe checkout verification mismatch", event.id, purchase.id);
        return Response.json({ error: "Checkout verification failed." }, { status: 400 });
      }
      await env.DB.batch([
        env.DB.prepare("INSERT INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type),
        env.DB.prepare(`UPDATE purchases SET status = 'paid', payment_intent_id = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'refunded'`)
          .bind(paymentIntentId(session), purchase.id),
      ]);
      return Response.json({ received: true });
    }
    if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type),
        env.DB.prepare("UPDATE purchases SET status = ? WHERE id = ? AND status != 'paid'").bind(event.type.endsWith("expired") ? "cancelled" : "failed", purchase.id),
      ]);
      return Response.json({ received: true });
    }
    await env.DB.prepare("INSERT INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type).run();
    return Response.json({ received: true, pending: true });
  } catch (error) {
    console.error("MusicBat Stripe webhook rejected", error);
    return Response.json({ error: error instanceof StripeConfigurationError ? error.message : "Webhook rejected." }, { status: error instanceof StripeConfigurationError ? 503 : 400 });
  }
}
