# Phase 1 — Checkout expiration after sales withdrawal

## Source and boundary

Development branch: `phase1-checkout-withdrawal-2026-10-16` in the existing `/workspace/scratch/musicbat-player-fix` checkout. Starting HEAD was `fc1f3374f8caaa3e1c293fc259fb96bfcc7d0527` plus existing uncommitted development. Commit `7a6a961` preserves that existing work before this Phase 1 diff; it is a Git checkpoint, not another recovery archive. The latest full working catalog/player source was reused, including migration 0012. The separate public-readiness checkout is at `2a9fe5e` and contains a narrower hosted commerce variant. These are not asserted to be synchronized with Kris's Linux checkout or GitHub. This development checkout has no configured remote; no push was performed.

Read-only GitHub inspection confirmed private `ltkrisp-afk/musicbat-live`, default branch `bat-radio-shock-room`, plus `musicbat-acceptance-restored-2026-10-13`, `musicbat-public-readiness-2026-10-15`, and `musicbat-recovery-2026-10-12`. The acceptance branch's purchase handler matches this development baseline's former behavior. This is not a claim that all branches match.

Read-only Sites inspection confirmed existing project `appgprj_6aaa2f4673e88191b504cf941f475802`, public at https://musicbat.audio, version 15. Source manifest declares D1 `DB` and R2 `BUCKET`. Runtime environment revision 10 reports Stripe `test` mode, a masked `STRIPE_SECRET_KEY`, base URL, processing configuration and checkout/sandbox flags; no `STRIPE_WEBHOOK_SECRET` entry was listed. Masked key presence does not prove key validity, permissions or a functioning webhook. No secret value was read, copied, replaced or printed. Hosted schema compatibility/migrations and real webhook delivery remain unverified. Every Sites deployment is production; no save, deployment, database mutation or environment update was made.

## Implementation

- Additive migration `0013_checkout_withdrawal.sql`, schema fields, journal and index. **Not applied to hosted or existing operator databases.** Tests apply it only to isolated SQLite fixtures. Apply the additive migration through the existing local migration workflow before running this source against an older development database.
- A SQLite trigger writes the first withdrawal cutoff and cleanup state on unresolved purchases in the same transaction as disabling sale/rights or changing track eligibility. Repeated requests and later re-enabling cannot erase that cutoff. Paid/refunded history is excluded. Legacy withdrawn unresolved orders get cutoff zero, meaning unknown historical ordering rather than invented permission.
- `expireWithdrawnCheckouts` checks at most 50 outstanding purchases per invocation, retrieves each known Stripe Session, validates its identity and sandbox mode, and calls `/v1/checkout/sessions/{id}/expire` only for open unpaid Sessions. It uses a stable per-purchase idempotency key. If another caller/payment wins or the POST response is lost, a fresh GET determines the next state. Unknown outcomes remain retryable. Complete unpaid Sessions await payment reconciliation; paid Sessions await authenticated webhook processing, never being incorrectly labelled expired.
- Artist Stop Selling, withdrawal and deletion perform inline expiration after committing permissions. Responses include outstanding cleanup count. Unknown processor outcomes never restore sale consent. The trigger also covers direct eligibility writes, which leave durable work for a later request/Phase 2.
- New drafts require active sale and rights eligibility inside `INSERT ... SELECT`. Reused Sessions are checked again after Stripe GET. New requests persist exact creation fields before the external call, and attach a returned Session without resetting a concurrent paid/refunded/review status. A withdrawal during creation prevents URL delivery and triggers expiration of the late Session.
- Ambiguous creation errors retain the draft and exact replay inputs with the original `musicbat-checkout-{purchaseId}` key; retries do not create a replacement Checkout. Complete unpaid/paid Sessions also block replacement pending verification. A paid webhook can recover a missing local Session association from Stripe-verified server-created purchase metadata, after amount, fee, currency and destination validation.
- Authenticated paid webhooks evaluate eligibility and cutoff **inside the atomic ledger write**, not only in an earlier SELECT. Event ledger insertion and purchase updates share the D1 batch transaction. Duplicates do not mint extra entitlements. Expiration/failure events cannot overwrite paid, refunded or review states. Existing full/partial refund behavior remains.
- Download authorization continues to require `paid`; deletion retains bytes for paid, unresolved and review obligations. A locally cancelled status alone is no longer treated as proof that an unknown Stripe payment cannot exist. No price, buyer surcharge, historical financial snapshot or 85/15 formula was changed.

## Explicit race policy and limits

Paid/refunded orders already recorded before withdrawal are unchanged. For an unpaid local order whose paid webhook arrives later:

1. A signature-verified paid event with a paid snapshot and event creation second strictly, unambiguously before the durable cutoff grants the historical download, even if the track is now withdrawn/deleted.
2. A later paid event enters `payment_review`, records the payment intent and review reason, retains the audio, and grants no automatic download. No automatic refund is initiated in Phase 1.
3. Same-second, missing paid timestamp/snapshot, or unknown legacy cutoff enters the same review path. Stripe event timestamps are second-resolution, so this implementation does not pretend to establish subsecond ordering. This can delay first-time access for a legitimate earlier payment in the same second; it does not revoke an already granted paid purchase. Review resolution is a remaining operational requirement.

Use event creation time, not webhook arrival, Session creation or PaymentIntent creation time. The timestamp is a conservative ordering signal, not a guarantee of exact payment capture time. Funds may already have been collected when review is required. This is explicitly not a distributed atomic transaction with Stripe.

## Verification

Automated tests execute real application handlers with isolated SQLite/R2 and mocked Stripe APIs, including cryptographically signed fixture webhooks. They are **not real Stripe sandbox verification**. A restart regression closes an actual file-backed SQLite database, reopens it, and expires the persisted retry using a fresh DB binding. Transaction rollback is tested by injecting a database failure after the event insertion in the batch.

New regression coverage includes all three artist withdrawal paths, open expiry, concurrent withdrawals, preserved paid downloads/ledger, outage and restart recovery, returned live-mode rejection, creation/reuse races, pre/post/same-second/missing payment ordering, cutoff changes between verification and write, expiration-versus-payment races, ambiguous create responses, webhook association recovery, re-enabling sales, incomplete payments and legacy migration backfill. Existing purchase tests continue to verify 85/15, historical allocation, signed webhooks, duplicates, payment-integrity mismatches, full/partial refunds and access enforcement.

Final validation: `npm test` passed **183/183** (zero failed/skipped/cancelled), including **22** new Phase 1 regression cases. `tsc --noEmit`, ESLint for the changed application/schema and new fixture/test files, `npm run build`, and `git diff --check` passed. No automated failures remain. Existing test loaders were updated to inline the newly imported Stripe helper. One website integration assertion still expected deleted unreferenced audio to be retained; it now agrees with the already-implemented 0012-era deletion behavior, without changing its follower/catalog assertions.

Read-only `scripts/sandbox-purchase.mjs --check`: `ready:false`, `noPaymentCreated:true`. Blockers in this Work checkout: missing sandbox credentials, genuine webhook signing secret and processing settings; Unity checksum/original ownership/verified existing-account fixture unavailable. This does not invalidate the separately reported prior Linux sandbox purchase. **No new real Stripe expiration, payment, webhook delivery, refund or settlement was verified in this session.** No browser or hosted acceptance is claimed.

## Phase 2 work — documented only

No unattended worker, cron job, queue consumer, retry service or rollout is implemented here.

- Drain durable pending/retry/awaiting-session work across restarts with bounded fair scheduling, leases, retry backoff, rate limits, alerts and dead-letter/operator visibility. Inline requests intentionally process only 50 rows; remaining rows stay durable.
- Recover creation outcomes after crashes using persisted request fields and original idempotency keys inside Stripe's retention window; beyond it reconcile by verified purchase metadata/Session listings before considering any new creation. Never blindly replay an aged creation key. Legacy drafts may lack replay inputs.
- Reconcile `payment_observed`, `awaiting_payment` and `payment_review`; persist sufficient timestamp/evidence and provide a deliberate operator/refund resolution path. Event IDs and review state exist, but no review UI or automatic refund policy is introduced.
- Resolve ambiguous same-second ordering; assess clock skew and processor-event latency. A subsecond proof of ordering cannot be invented from Stripe's second-resolution event field.
- Add durable object/Radio-copy retention cleanup after payments become terminal and failed object deletion retries. This Phase 1 retains uncertain obligations rather than risking purchased files.
- Validate on a dedicated hosted sandbox with migration readiness, real secret permissions, public signed webhook routing and real Stripe GET/expire/payment race evidence. The new inline expiration helper deliberately fails closed outside test mode; removing that sandbox-only guard belongs to a separately approved release, after acceptance.

Official processor references consulted:
- https://docs.stripe.com/api/checkout/sessions/expire
- https://docs.stripe.com/api/events/object
- https://docs.stripe.com/api/checkout/sessions

Stop here: Phase 1 development/testing only. Production, live charges, pricing and Phase 2 execution remain outside this change.
