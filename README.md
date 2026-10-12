# MusicBat Minimum Working Loop

A deployable proof of the MusicBat activity engine:

1. An artist uploads an MP3, WAV, or FLAC file (up to 25 MiB), supplies a track title and artist/band name, and attests their rights.
2. The track enters MusicBat Radio.
3. A signed-in listener plays it for at least 12 seconds.
4. The qualified listener places one bounded Hanger response.
5. The Weight Room updates from distinct listener signals.

The loop uses platform-provided identity and durable D1 storage for the catalog plus R2 for uploaded audio. It does not depend on Render, Neon, Manus OAuth, or a paid database.

## Commands

- `npm run db:generate` — generate D1 migrations after schema changes.
- `npm run build` — build the production worker.

## Stripe Connect sandbox commerce

MusicBat now includes a sandbox-only Stripe Connect marketplace flow:

- artists connect an Express account and complete Stripe-hosted onboarding;
- tracks require separate sale authorization and a server-stored USD price;
- the Buy button creates a Stripe-hosted Checkout Session using a destination charge;
- the artist share is 85% and the platform application fee is 15% of the song price, rounded to whole cents;
- a separately itemized buyer processing charge is calculated from an explicitly configured rate and shown for confirmation before Stripe checkout; the artist share is not reduced by that charge;
- signed Stripe webhooks verify the amount, fee, destination, test mode, and purchase metadata before a download is unlocked; and
- pending, failed, cancelled, refunded, unsigned, or mismatched payments remain locked.

The server refuses live Stripe secret keys and live-mode webhook events. Configure only `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`, and `MUSICBAT_BASE_URL=https://musicbat.audio` in the hosted environment. Register `https://musicbat.audio/api/musicbat/stripe/webhook` for Checkout Session completed, asynchronous success/failure, and expired events from the MusicBat platform account.

The Radio Buy button snapshots the exact track, price, seller, and stored file into a durable guest purchase. A secure HttpOnly device cookie authorizes status and download access on that device. The browser redirect is never accepted as proof of payment.

Stripe-hosted Checkout can present eligible wallets alongside card entry. Wallet availability remains controlled by Stripe, the device/browser, domain registration, and the MusicBat Stripe account's payment-method settings.

The Radio audio route remains public listening audio; purchase authorization is not DRM and cannot prevent capture of an openly streamed recording. Refund initiation, tax-liability configuration, receipts inside MusicBat, and cross-device purchase recovery are outside this phase.

Validation: `node --test scripts/musicbat-upload.test.mjs scripts/musicbat-rotation.test.mjs scripts/musicbat-purchase.test.mjs`.

### Buyer processing charge configuration (test mode)

Set `MUSICBAT_PROCESSING_BPS` and `MUSICBAT_PROCESSING_FIXED_CENTS` from the **verified Stripe account's actual applicable processing rate**, including any applicable fees. The server fails closed if these are absent. The buyer charge is rounded up to cover the configured percentage on the entire checkout total plus the fixed fee. This is a configured estimate, not a Stripe-confirmed final fee; verify account-specific rates and any tax or alternative payment method fees before release. The checkout shows separate song and buyer processing line items and requires explicit buyer confirmation. Existing purchase rows and their historical splits are not rewritten. The webhook verifies the total using the fee recorded in session metadata; older sessions without this metadata use the historical base total.

Integrated correction: Checkout application fee includes the base platform share plus the buyer processing charge, leaving the artist exactly the recorded base share. Migration 0004 snapshots processing cents; historical rows default to zero. Webhook metadata must match that snapshot. Actual processor fees and surcharge eligibility remain release gates, not verified settlement.
