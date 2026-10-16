import { env } from "cloudflare:workers";
import { StripeCheckoutSession, StripeConfigurationError, StripeWebhookBodyTooLarge, readStripeWebhookBody, stripeGet, stripeModeMatches, verifyStripeWebhook } from "../stripe";

type Purchase = {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  processing_cents: number;
  processor_account_id: string;
  processor_session_id: string;
  status: string;
  sale_withdrawn_at: number | null;
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
  if (env.MUSICBAT_RELEASE_PAUSED === "1") return Response.json({ error: "MusicBat is briefly paused for an update." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });
  try {
    if (!env.DB) return Response.json({ error: "MusicBat storage is unavailable." }, { status: 503 });
    const rawBody = await readStripeWebhookBody(request);
    const event = await verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET, undefined, env);
    const supported = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "charge.refunded"]);
    if (!supported.has(event.type)) return Response.json({ received: true });
    const sessionId = event.data.object.id;
    const already = await env.DB.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(event.id).first();
    if (already) return Response.json({ received: true, duplicate: true });
    if (event.type === "charge.refunded") {
      const charge = await stripeGet<{ id: string; livemode: boolean; payment_intent: string | null; amount: number; amount_refunded: number; refunded: boolean; currency: string }>(env, `/v1/charges/${encodeURIComponent(sessionId)}`);
      if (charge.id !== sessionId || !stripeModeMatches(env, charge.livemode) || !charge.payment_intent) return Response.json({ error: "Refund verification failed." }, { status: 400 });
      const purchase = await env.DB.prepare("SELECT id, amount_cents, processing_cents FROM purchases WHERE payment_intent_id = ?")
        .bind(charge.payment_intent).first<Purchase>();
      if (!purchase) return Response.json({ error: "Purchase not found." }, { status: 404 });
      if (charge.currency !== "usd" || charge.amount !== purchase.amount_cents + purchase.processing_cents ||
          !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > charge.amount) {
        return Response.json({ error: "Refund verification failed." }, { status: 400 });
      }
      // Partial refunds preserve access; a confirmed full refund permanently revokes it.
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type),
        env.DB.prepare("UPDATE purchases SET status = 'refunded' WHERE id = ? AND ? = 1 AND ? = ?")
          .bind(purchase.id, charge.refunded ? 1 : 0, charge.amount_refunded, charge.amount),
      ]);
      return Response.json({ received: true });
    }
    const session = await stripeGet<StripeCheckoutSession>(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { "expand[]": "payment_intent" });
    if (session.id !== sessionId || !stripeModeMatches(env, session.livemode)) return Response.json({ error: "Stripe session mode or identity mismatch." }, { status: 400 });
    const purchase = await env.DB.prepare(`SELECT id, amount_cents, processing_cents, platform_fee_cents, processor_account_id, processor_session_id, status, sale_withdrawn_at FROM purchases WHERE processor_session_id = ? OR (id=? AND processor_session_id IS NULL)`)
      .bind(session.id, session.metadata?.musicbat_purchase_id ?? "").first<Purchase>();
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
      const paidEventSecond = Number.isSafeInteger(event.created) && event.created! > 0 && event.data.object.payment_status === 'paid'
        ? event.created! : 0;
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type),
        env.DB.prepare(`INSERT OR IGNORE INTO checkout_payment_evidence(event_id,purchase_id,session_id,stripe_created,paid_snapshot) VALUES(?,?,?,?,?)`)
          .bind(event.id,purchase.id,session.id,paidEventSecond || null,event.data.object.payment_status==='paid'?1:0),
        // Evaluate against the durable cutoff inside the write: withdrawal may
        // commit after the SELECT above. Stripe event seconds describe event
        // creation, never use delivery time or Session/Intent creation as payment time.
        env.DB.prepare(`UPDATE purchases SET
          payment_intent_id=?, processor_session_id=COALESCE(processor_session_id, ?),
          status=CASE WHEN
            (sale_withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=purchases.track_id AND t.status='active' AND t.rights_attested=1 AND t.sale_enabled=1 AND t.sale_rights_attested=1))
            OR (sale_withdrawn_at>0 AND ? > 0 AND (? + 1)*1000 <= sale_withdrawn_at)
            THEN 'paid' ELSE 'payment_review' END,
          paid_at=COALESCE(paid_at, CURRENT_TIMESTAMP),
          payment_review_reason=CASE WHEN sale_withdrawn_at IS NOT NULL AND NOT (sale_withdrawn_at>0 AND ? > 0 AND (? + 1)*1000 <= sale_withdrawn_at)
            THEN 'withdrawal_payment_order_requires_review' ELSE NULL END,
          cleanup_state=CASE WHEN sale_withdrawn_at IS NOT NULL THEN 'payment_review' ELSE cleanup_state END
          WHERE id=? AND status NOT IN ('paid','refunded')`)
          .bind(paymentIntentId(session), session.id, paidEventSecond, paidEventSecond, paidEventSecond, paidEventSecond, purchase.id),
        env.DB.prepare(`UPDATE purchases SET cleanup_state=CASE WHEN status='paid' THEN 'settled_before_withdrawal' ELSE cleanup_state END
          WHERE id=? AND sale_withdrawn_at IS NOT NULL`).bind(purchase.id),
      ]);
      return Response.json({ received: true });
    }
    if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type),
        env.DB.prepare("UPDATE purchases SET status = ? WHERE id = ? AND status NOT IN ('paid', 'refunded', 'payment_review')").bind(event.type.endsWith("expired") ? "cancelled" : "failed", purchase.id),
      ]);
      return Response.json({ received: true });
    }
    await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)").bind(event.id, event.type).run();
    return Response.json({ received: true, pending: true });
  } catch (error) {
    console.error("MusicBat Stripe webhook rejected", error);
    return Response.json({ error: error instanceof StripeConfigurationError ? error.message : "Webhook rejected." }, { status: error instanceof StripeWebhookBodyTooLarge ? 413 : error instanceof StripeConfigurationError ? 503 : 400 });
  }
}
