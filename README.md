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
- the artist share is 85% and the platform application fee is 15%, rounded to whole cents;
- signed Stripe webhooks verify the amount, fee, destination, test mode, and purchase metadata before a download is unlocked; and
- pending, failed, cancelled, refunded, unsigned, or mismatched payments remain locked.

The server refuses live Stripe secret keys and live-mode webhook events. Configure only `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`, and `MUSICBAT_BASE_URL=https://musicbat.audio` in the hosted environment. Register `https://musicbat.audio/api/musicbat/stripe/webhook` for Checkout Session completed, asynchronous success/failure, and expired events from the MusicBat platform account.

The Radio Buy button snapshots the exact track, price, seller, and stored file into a durable guest purchase. A secure HttpOnly device cookie authorizes status and download access on that device. The browser redirect is never accepted as proof of payment. Buyer-paid processing charges are not implemented in this test flow.

Stripe-hosted Checkout can present eligible wallets alongside card entry. Wallet availability remains controlled by Stripe, the device/browser, domain registration, and the MusicBat Stripe account's payment-method settings.

The Radio audio route remains public listening audio; purchase authorization is not DRM and cannot prevent capture of an openly streamed recording. Refund initiation, tax-liability configuration, receipts inside MusicBat, and cross-device purchase recovery are outside this phase.

Validation: `node --test scripts/musicbat-upload.test.mjs scripts/musicbat-rotation.test.mjs scripts/musicbat-purchase.test.mjs`.
