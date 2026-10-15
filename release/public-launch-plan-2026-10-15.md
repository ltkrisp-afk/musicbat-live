# MusicBat public payment release plan

Update: founder authorization received and the approved foundation deployed. See hosted-rollout-2026-10-15.md for actual completed actions, the guarded runtime linkage follow-up, and credential blocker. Earlier preparation statements below are historical planning context.

## Decision
The Linux Stripe sandbox purchase has passed. The public site's payment connection has not. This candidate uses the exact published source as its baseline, not the newer development Radio implementation. It is ready for review and an approved hosted SANDBOX payment rollout; live payment launch remains blocked.

Published baseline: 706082ad960574dd1f67f84bab61667dabfb0897, Sites version 13, deployment appgdep_6abdce7767388191a35540ca372d6e45, project appgprj_6aaa2f4673e88191b504cf941f475802. Public https://musicbat.audio, native https://musicbat-minimum-loop.ltkrisp.chatgpt.site. Development payment core: 5ee7e666af08ee9355fe1a03e3c41a2aed079283. The release branch deliberately contains the published application plus this narrow payment repair. It must not replace the development branch or be deployed wholesale from development.

## Findings from read-only hosted inspection
- Hosted artist_accounts is empty. Purchases and stripe_events are empty at inspection. The five tracks retain original owner yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil.
- Hosted environment revision 1 exposes only MUSICBAT_BASE_URL=https://musicbat.audio. No Stripe API key, webhook signing secret, mode, or processing schedule is registered through that interface. No functioning hosted live or sandbox integration was established.
- Original published code accepts only sk_test_ and uses 90/10. Empty artist association causes the displayed incomplete-setup message before Stripe is called. The enabled Linux sandbox account is not automatically shared with hosted D1.
- Hosted tracks 1,2,3,5 are offered at $5 with existing sale consent. Track4 is not offered for sale. Preserve these prices/rights; the successful $2 Unity purchase was a separate isolated snapshot.

## Prepared changes
- 85/15 of base price, rounded in cents; processing surcharge separate, fully quoted and explicitly confirmed before Checkout. Server rechecks final price and account eligibility. At $5: artist $4.25, MusicBat base share $0.75. No historical split recalculation.
- Port proven restricted sandbox key support, bounded signed webhook verification, mode/destination/amount/application-fee checks, retry protection and terminal refund handling. Sandbox destination-charge Checkout explicitly opts out of account-default Managed Payments per request.
- Add ONLY processing_cents to purchases, default 0, nonnegative constraint. Migrations 0000–0004 unchanged; 0005_commerce_processing added to the public journal and schema snapshot. No table rebuild/drop and no modern Radio schema migrations.
- Preserve existing public catalog, ranking, Radio API, audio delivery, player and rotation files byte-for-byte; baseline hashes included. Preserve artist authorization on sales/priority changes, and restrict Connect to authenticated artists with an existing owned track or association. Onboarding returns to Add Track/catalog instead of a patron destination.
- Add checkout-only pause so new purchases can be stopped without disabling Radio, existing signed webhooks, purchase status or paid downloads.
- Prepare guarded sandbox artist linkage; no hosted SQL executed. Existing identical association is a no-op, either conflicting owner/account fails a unique constraint, missing original Unity produces no association. Readiness starts at zero and must refresh from Stripe. No account creation or rights/owner rewrite is needed for this artist.
- Radio Plus is excluded: it is not in this published baseline. Do not advertise or activate hosted subscriptions with this payment-only release.

## Required hosted settings (private settings only)
| Name | Required value / source | Current finding |
|---|---|---|
| MUSICBAT_BASE_URL | https://musicbat.audio | Present |
| MUSICBAT_STRIPE_MODE | test for the next hosted sandbox phase | Missing |
| STRIPE_SECRET_KEY | Existing matching sandbox credential, entered privately; verify /v1/account returns platform acct_1UHA0OLKJHBmA7Jw | Missing through inspected interface |
| STRIPE_WEBHOOK_SECRET | whsec_ for the NEW hosted sandbox endpoint below; not the Linux CLI listener's secret | Missing |
| MUSICBAT_PROCESSING_BPS | Explicit approved sandbox scenario, e.g. 290 | Missing; not proof of live fee contract |
| MUSICBAT_PROCESSING_FIXED_CENTS | Explicit approved sandbox scenario, e.g. 30 | Missing; not proof of live fee contract |
| MUSICBAT_CHECKOUT_PAUSED | 1 during setup; 0 only for approved hosted sandbox test | New release guard |

DB and BUCKET retain existing project bindings. No new account, bucket, database, tunnel, domain or Radio service is required. Do not set MUSICBAT_RELEASE_PAUSED for a checkout pause: that older switch also rejects webhooks. Do not paste credentials into chat or source. The API key is never used by the browser.

## Hosted webhook requirements
Create an endpoint in the SAME MusicBat.audio SANDBOX platform acct_1UHA0OLKJHBmA7Jw:
https://musicbat.audio/api/musicbat/stripe/webhook

Listen for platform-account snapshot events:
- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- checkout.session.expired
- charge.refunded

Destination-charge Checkout sessions and charges originate on the platform; a connected-account listener is not a substitute. Use that endpoint's private signing secret. Delivery must preserve raw signed body and Stripe-Signature header; no login/cookie requirement on the webhook. Handler verifies signature, timestamp, event/session mode, fresh Stripe Session, correct total, metadata, fee and destination, and records event id once. Returns 200 on accepted duplicate; never grants downloads based on success redirect alone. Checkout and every Connect status refresh retrieve Stripe eligibility. account.updated is not required by this candidate and is not processed; do not claim automatic event-driven account synchronization.

Required credential operations: read platform/connected accounts, create/read Checkout Sessions (including expanded PaymentIntent), read Charges for refund verification. New Express onboarding additionally needs Accounts v2 creation and account links; it is not part of the existing-artist purchase test. No webhook-endpoint write permission is needed in the runtime API key when a founder configures the endpoint separately. Actual live key permissions remain unverified.

## Exact approval-gated change order
1. Confirm the public project still points to the recorded source/version and that artist_accounts has no conflicting row. If it changed, stop and rebase the narrow candidate; do not overwrite newer work. Do not repeat recovery imports.
2. Obtain explicit founder authorization for a HOSTED SANDBOX rollout: candidate deployment, additive purchase migration, private sandbox settings, sandbox webhook registration, and the documented original-owner→existing-sandbox-account crosswalk. This is not approval for live payments.
3. Stage candidate with MUSICBAT_CHECKOUT_PAUSED=1. Register the hosted sandbox webhook and privately enter matching key/signing secret/settings. Fresh Stripe API reads must confirm the platform and existing connected account acct_1UQrXtLKJHXYfqXB, enabled charges/payouts/details, and intended founder ownership. Account metadata currently refers to local_seedy; record that authorized test-identity crosswalk, never infer ownership solely from a band name.
4. Apply only drizzle/0005_commerce_processing.sql to EXISTING hosted DB. Confirm column default0, nonnegative check, original purchase snapshots/indexes intact. The published build's migration journal must be used; do not apply development migrations 0005–0011.
5. Prepare the exact link SQL with `node scripts/prepare-hosted-artist-link.mjs --prepare-sandbox-only` or use release/hosted-sandbox-artist-link.sql. Apply only after step3 verification. Require the returned row to match original owner and existing sandbox account; zero/conflict stops. Do not update tracks.artist_id, prices, sale consent or historical processor_account_id. Authenticated original artist GET /api/musicbat/stripe/connect must refresh Stripe flags; no Connect POST/re-onboarding.
6. Publish the candidate to the existing project under the authorized sandbox scope, preserving bindings, custom domain and static assets. Verify / and track/audio HEAD/range/full responses, artist-only controls, price quote and account readiness. Audible public playback before/after remains a post-deploy check; local automated tests cannot prove a phone speaker works.
7. Only after explicit hosted sandbox test authorization, unpause Checkout, perform one sandbox Checkout through the public UI at the EXISTING authorized price; verify the signed hosted event, one event row, original-owner destination, fee/base allocation, buyer-bound original-file download/checksum and duplicate retry. Pause Checkout again after the pilot if real customers could mistake test checkout for a paid sale. Do not call this a real sale or bank payout.
8. Record results in the SAME MusicBat Command Center. Never retest the completed Linux transaction as a substitute for hosted proof.

## Live launch gate (not approved)
No live artist-account ID, enabled live Connect verification, live API credential, live webhook secret, actual processing contract or live bank settlement has been verified. A sandbox acct_ is not a live payout destination. Live Account v2 compatibility, Managed Payments/Connect compatibility, mode-consistent hosted records and the founder-approved real-charge test require a separate concrete authorization. Do not flip mode to live, copy this sandbox linkage into a live configuration, advertise successful bank payout, or enable Radio Plus as part of this repair. A live database must never reinterpret existing sandbox purchase/account references as live.

## Abort / rollback
Before activation: stop on source drift, association conflict, wrong platform/mode, missing original audio, failed migration or failed signature. Keep Checkout paused. Do not drop the additive column or erase test/payment history. After a session exists: keep the compatible webhook/status/download code running to settle existing sessions; do not roll back to the old 90/10 webhook or discard rows. Radio code remains the verified public implementation throughout. Fix UI independently or keep new purchases paused; do not restore unrelated development Radio code.

## Validation and limits
33 automated tests pass on this candidate; TypeScript and vinext production build pass. Includes genuine published migrations, historical ledger preservation, signed mocked Stripe settlement/replay/refunds, amount/destination/mode mismatch rejection, buyer isolation, ownership restrictions, UI quote confirmation while Radio advances, playback-handler baseline equivalence, original-byte audio/range/HEAD, and checkout pause with webhook settlement. Automated Stripe calls here are fixtures, not a new genuine Stripe transaction. The earlier genuine Linux sandbox evidence is preserved separately. No production mutation, deployment, key change or real charge occurred during preparation.
