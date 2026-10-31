# MusicBat Minimum Working Loop

## Development governance

“Keep the mystery in the music. Take the mystery out of the business.”

Developers and AI agents must follow the permanent
[MusicBat Golden Foundation](docs/governance/MUSICBAT_GOLDEN_FOUNDATION.md)
and [engineering instructions](AGENTS.md). The foundation guides architecture and
observable verification; it does not amend agreements or authorize deployment.
See the [initial alignment findings](docs/governance/golden-foundation-alignment-2026-10-30.md)
for verified discrepancies and evidence boundaries. Historical implementation notes
below must not override newer owner-approved rules or current verified source.

A deployable proof of the MusicBat activity engine:

1. An artist uploads an MP3, WAV, or FLAC file (up to 25 MiB), supplies a track title and artist/band name, and attests their rights.
2. The authenticated owner sees the track in My Music. Upload attestation alone does not publish audio; reviewed recording/composition permissions, private source import and an eligible shared channel are required.
3. A signed-in listener hears server-assigned shared Radio. Free Radio creates exposure; entitled Radio Plus listeners qualify after 12 seconds.
4. A qualified Radio Plus listener submits ▲, ▼ or an independent Keep; retries cannot multiply the score.
5. Shock Room updates from distinct listener choices and recorded purchases.

The loop uses platform-provided identity and durable D1 storage for the catalog plus R2 for uploaded audio. Shared scheduling and immutable audio delivery use the separate private SQLite Radio runtime. No production configuration is asserted by this source checkout.

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

The legacy per-track Radio audio route is closed; shared audio requires authenticated current channel authority; purchase authorization is not DRM and cannot prevent capture of an openly streamed recording. Refund initiation, tax-liability configuration, receipts inside MusicBat, and cross-device purchase recovery are outside this phase.

Validation: `node --test scripts/musicbat-upload.test.mjs scripts/musicbat-rotation.test.mjs scripts/musicbat-purchase.test.mjs`.

### Buyer processing charge configuration (test mode)

Set `MUSICBAT_PROCESSING_BPS` and `MUSICBAT_PROCESSING_FIXED_CENTS` from the **verified Stripe account's actual applicable processing rate**, including any applicable fees. The server fails closed if these are absent. The buyer charge is rounded up to cover the configured percentage on the entire checkout total plus the fixed fee. This is a configured estimate, not a Stripe-confirmed final fee; verify account-specific rates and any tax or alternative payment method fees before release. The checkout shows separate song and buyer processing line items and requires explicit buyer confirmation. Existing purchase rows and their historical splits are not rewritten. The webhook verifies the total using the fee recorded in session metadata; older sessions without this metadata use the historical base total.

Integrated correction: Checkout application fee includes the base platform share plus the buyer processing charge, leaving the artist exactly the recorded base share. Migration 0006 snapshots processing cents; historical rows default to zero. Webhook metadata must match that snapshot. Actual processor fees and surcharge eligibility remain release gates, not verified settlement.

## Playback enforcement (nonproduction)

Migration 0007 introduces reviewed, time-limited, territory-scoped recording and composition permission evidence and an audit table. No existing checkbox or catalog row is converted into a license. The audio endpoint checks permissions before GET, HEAD and every range request; audit-storage errors deny service. It uses interactive authorization because this endpoint permits individual track requests and seeking, regardless of a client mode parameter. Free-only permissions cannot be used here. Cache responses are private/no-store. An already delivered buffer cannot be recalled. Audit records describe authorization/access decisions, not confirmed listening or completed performances.

Statutory playback is disabled. The private direct-license runtime implements continuous shared scheduling, persistent channel history and per-delivery eligibility checks. Direct-license restrictions are enforced by the scheduling engine. Statutory service eligibility, reporting and royalty operations remain unconfigured and statutory transmission remains disabled. Direct license evidence must cover the actual recording and composition uses, including applicable reproduction rights; qualified rights review is required before a grant is entered through trusted administration. No self-service public grant endpoint exists. Existing tracks will stop streaming until reviewed grants exist after applying this migration; these migrations have not been applied to production.

Reference checked October 12, 2026: https://www.copyright.gov/title17/92chap1.html, sections 114(d)(2), 114(d)(3)(C), 114(d)(4) and 114(j)(13). Statutory sound-recording performance-complement rules concern a three-hour channel window, distinct album/artist/compilation selections and consecutive limits; they do not create composition authorization. This implementation declines statutory playback rather than representing unchecked playback as compliant.

Radio reconciliation: retain newer energy lanes, Shock Room, genre editing and reversible Keep controls. Retain append-only feedback evidence, but count only each listener’s latest per-track triangle choice. Preserve the older listener-choice branch in the prior reconciliation backup rather than applying its incompatible migration. Migration IDs 0006 and 0007 follow the existing 0005 migration.
