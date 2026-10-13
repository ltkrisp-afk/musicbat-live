# Radio Plus enrollment — development only

The private GitHub development branch is `musicbat-acceptance-restored-2026-10-13`.
This change implements optional $3/month Radio Plus enrollment in test mode.
Free Radio and artist participation remain free. Song purchases remain separate.

## Implemented

- Authenticated enrollment with explicit recurring-payment consent and a fixed $3 USD monthly price.
- Test Stripe Checkout subscription sessions. Stable per-user attempt keys avoid duplicate sessions on concurrent clicks.
- Separate signed subscription webhook at `/api/musicbat/subscription/webhook`.
- The webhook retrieves current subscription and invoice state with pinned Stripe API version `2025-03-31.basil`. It checks identity, metadata, one monthly $3 item, invoice amount, currency, paid status and matching invoice/item periods before granting access.
- Checkout returns are informational only. They do not grant membership.
- Verified invoices grant access only through their paid period. Successful renewal extends it; failed renewal does not. Cancellation stops renewal and preserves existing paid access; expiry/ended subscriptions revoke access.
- Events and invoice evidence are retained. Duplicate events are idempotent. Old subscription attempts cannot overwrite a new enrollment.
- Channel, audio and listener-signal handlers obtain membership from the server ledger. Browser-supplied entitlement headers cannot grant access. Test grants do not authorize a non-test deployment.
- Membership dialog offers enrollment when test configuration is available, status refresh and cancellation when active. Otherwise the button says “About Radio Plus · planned $3/month”.

## Linux isolated acceptance

The local fixture now begins with Free access, rather than pre-granting Radio Plus.
No external Stripe requests or real charges occur in this fixture.

```bash
cd /home/musicbat/musicbat
TMPDIR=/dev/shm env -u STRIPE_SECRET_KEY -u STRIPE_WEBHOOK_SECRET -u STRIPE_RADIO_PLUS_WEBHOOK_SECRET npm run dev:acceptance
```

Open `http://127.0.0.1:5173/__local`, choose Patron or Musician, open Join Radio Plus, confirm the monthly terms, and continue to the clearly labeled offline subscription simulation. Simulate payment, return to Radio, and open Manage Radio Plus to inspect the verified paid period. Cancellation is available there.

`http://127.0.0.1:5173/__local/plus-control` provides test-only renewal, failed-renewal and subscription-ending buttons. It exists only in the development adapter, behind a local session. There is no production lifecycle-simulation endpoint.

All local fixture data resets on restart. Keep the same browser session during purchase-history and withdrawal checks. The downloaded song itself can still play after restart, but its isolated test history resets.

## Actual Stripe sandbox setup — not performed

Migration `drizzle/0011_radio_plus_subscriptions.sql` is additive and has not been applied remotely. It must be applied only to the intended isolated test database first.

Test enrollment requires `MUSICBAT_RADIO_PLUS_ENABLED=test`, `MUSICBAT_STRIPE_MODE=test`, a test Stripe secret, and a separate `STRIPE_RADIO_PLUS_WEBHOOK_SECRET` for the subscription endpoint. The private Radio gateway/runtime and persistent DB must be configured in the target test environment. Do not reuse the song-purchase endpoint's signing secret unless the endpoint configuration explicitly establishes that exact secret.

Register these subscription test events: `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

Documentation consulted: https://docs.stripe.com/billing/subscriptions/webhooks and https://docs.stripe.com/api/checkout/sessions/create .

## Evidence and limits

The existing Linux browser confirmations remain user-reported passes: Radio sound/playback, volume, station navigation, Plus triangle/Keep selections and simulated song purchase/download. Those predate this enrollment implementation and are not proof of the new join UI.

The automated subscription/handler tests exercise the real verification logic using an isolated simulated processor. Actual Stripe sandbox checkout, webhook registration/delivery and billing settlement are not verified. Chromium was absent from the Work runtime; its download failed, so browser enrollment remains pending. The production service, Stripe activation and remote migrations are untouched.

Live rollout is deliberately disabled. Refund/dispute handling, taxes/account-specific billing fees, target deployment wiring and a completed browser/sandbox acceptance run remain prerequisites for a future live subscription implementation. Purchase history after artist withdrawal also remains pending on the user's Linux browser, although isolated automated coverage passes.

Final development checks: `npm test` 120 passed, zero failures; `npm run typecheck` passed; `npm run build` passed; `npm run lint` zero errors and one existing unused-variable warning in `musicbat-release-migration.test.mjs`; `git diff --check` passed. Browser enrollment attempt was blocked by missing Chromium and a failed browser download. No live credentials were used.
