import { readStripeWebhookBody, verifyStripeWebhook, StripeWebhookBodyTooLarge } from '../app/api/musicbat/stripe/stripe';

const target = 'https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/api/musicbat/stripe/webhook';
const events = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded']);
interface IngressEnvironment {
  MUSICBAT_STRIPE_MODE?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  MUSICBAT_PRIVATE_SITE_TOKEN?: string;
}
const reply = (status: number) => new Response(status === 200 ? 'accepted' : 'unavailable', {
  status, headers: { 'cache-control': 'no-store', ...(status === 503 ? { 'retry-after': '60' } : {}) },
});

// Deployment candidate only. No database, payment logic, background promises or
// in-memory delivery queue. Stripe retains retry responsibility until MusicBat
// acknowledges the event; the existing D1 handler owns durable deduplication.
export async function receiveStripeEvent(request: Request, env: IngressEnvironment, deliver: typeof fetch = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/musicbat/stripe/webhook' || url.search || request.method !== 'POST') return reply(404);
  if (env.MUSICBAT_STRIPE_MODE !== 'test' || !env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') ||
    !env.MUSICBAT_PRIVATE_SITE_TOKEN || /[\r\n]/.test(env.MUSICBAT_PRIVATE_SITE_TOKEN)) return reply(503);
  let raw: string;
  const signature = request.headers.get('stripe-signature');
  try {
    raw = await readStripeWebhookBody(request);
    const event = await verifyStripeWebhook(raw, signature, env.STRIPE_WEBHOOK_SECRET, undefined, { MUSICBAT_STRIPE_MODE: 'test' });
    if (!events.has(event.type)) return reply(400);
  } catch (error) { return reply(error instanceof StripeWebhookBodyTooLarge ? 413 : 400); }
  try {
    // Fixed destination and allowlisted headers only: never proxy user URLs,
    // identity, cookies or arbitrary methods. Redirects must never leak access.
    const response = await deliver(target, { method: 'POST', body: raw, redirect: 'manual',
      signal: AbortSignal.timeout(8000), headers: {
        'content-type': 'application/json', 'stripe-signature': signature!,
        'OAI-Sites-Authorization': `Bearer ${env.MUSICBAT_PRIVATE_SITE_TOKEN}`,
      } });
    // Do not acknowledge a redirect, rejected event, paused app or uncertain
    // network outcome. Stripe retries; a prior commit is handled idempotently.
    const accepted = response.ok && response.headers.get('content-type')?.includes('application/json') &&
      (await response.json() as { received?: boolean }).received === true;
    if (!response.bodyUsed) await response.body?.cancel();
    return reply(accepted ? 200 : 503);
  } catch { return reply(503); }
}
const worker = { fetch: (request: Request, env: IngressEnvironment) => receiveStripeEvent(request, env) };
export default worker;
