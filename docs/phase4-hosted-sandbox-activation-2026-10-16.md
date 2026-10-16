# MusicBat Phase 4 hosted sandbox activation — October 16, 2026

## Exact source and history

GitHub branch `engineering/phase4-acceptance-2026-10-16` was read at
`1433110dfe236fc54cb21da21dac2ccfa286917a`. GitHub compare confirms it is two
commits ahead of original Phase 3 `b671d84e5783820352819fde24e05ac6bd38e92c`,
with zero commits behind and that original commit as merge base.
The two intervening commits are f512014 and 1433110. No history is replaced.

This task's container does not contain the published environment's
`/workspace/musicbat-live` checkout. Its anonymous Git HTTPS attempt failed for
missing authentication, while the connected GitHub app successfully read the
exact original commit, Git objects, branch and source tree. This is a different
tool/runtime access result from the previously verified cloud Git push.
The original remote history remains intact; no replacement recovery is claimed.

## Existing isolated hosted target

Project: `appgprj_6ad26204823c81918260d33e13429074`.
URL: https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site
Owner: current user. Access: custom, only the owner, no external visitors.
Existing version: 1; source b42f746879862ee6b716e4de1c5269d856c5c6b1.
Deployment: appgdep_6ad26321b0fc8191b9ee83fb9243e832.

The retained local sandbox checkout is clean at that saved source commit.
A Git-blob SHA-1 comparison against the complete recursive 1433110 tree
(d41848039b6dedc59714fecbe2c33b021326e49f, not truncated) found 251 matching
tracked files. Its four baseline differences are the intentional sandbox
hosting identity and three missing engineering-only files: AGENTS.md,
.github/workflows/verify.yml, and docs/cloud-engineering-continuation-2026-10-16.md.
Application source, migrations, tests and dependency inputs match the saved
engineering revision. The sandbox is not substituted for original Git history.

The manifest declares D1 DB and R2 BUCKET. Hosted D1 inspection confirms
checkout_recovery_jobs and checkout_payment_evidence and the application tables.
This confirms table presence, not every migration/column or R2 byte operation.
Bounded reads show tracks, artist_accounts, purchases, checkout_recovery_jobs
and radio_engine_catalog are empty (has_more false).
Site metadata reports no attached automations.

Runtime revision 1 contains only MUSICBAT_BASE_URL, MUSICBAT_PROCESSING_BPS,
MUSICBAT_PROCESSING_FIXED_CENTS, MUSICBAT_RELEASE_PAUSED and MUSICBAT_STRIPE_MODE.
The configured test scenario is test mode, this sandbox origin, release pause 1,
290 processing basis points and 30 fixed cents. No STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET, RADIO_RUNTIME_ORIGIN or RADIO_RUNTIME_TOKEN is configured.
These fee settings are the retained test scenario, not a newly verified fee contract.

Production musicbat.audio was identified in the inventory but not changed.
No production database or runtime environment was queried by this task.

## Available Stripe and hosting evidence

The connected Stripe account is the existing MusicBat.audio sandbox platform
acct_1UHA0OLKJHBmA7Jw, livemode false. Read-only GetWebhookEndpoints returned
an empty list, has_more false. Thus no registered webhook endpoint currently
exists on that selected test platform. A previous Stripe CLI listener is not
excluded by this endpoint inventory.

Read-only GetAccounts found the existing test artist acct_1UQrXtLKJHXYfqXB,
with charges_enabled and payouts_enabled true and metadata musicbat_artist_id
local_seedy. No account was created or altered. The sandbox Site artist_accounts
table is empty; a project-specific authenticated artist must be deliberately
associated with that existing account. Metadata local_seedy is not a hosted
identity and must not be treated as one.

Render's legacy free PostgreSQL instance musicbat-postgres was separately
verified suspended after its October 7 free-plan expiration. This database is
not identified as a dependency of the existing Stage 4 Site. It must not be
reactivated, upgraded or treated as a required hosting prerequisite. The
approved target for application data and objects is Cloudflare D1 and R2.

## Minimum activation changes, for review before execution

Reuse this existing owner-only Site and its existing DB/BUCKET; do not create
another sandbox, expose the full Site publicly, migrate production, or change
pricing. Keep the sandbox release pause until all readiness checks below pass.

1. Source: prepare the sandbox build from exact 1433110 (or its explicitly
   reviewed development descendant), retaining only the sandbox project identity.
   Original engineering ancestry must stay on GitHub.
2. Credentials: securely bind the existing working test/restricted API key.
   Verify its platform and required Checkout, expire, event, payment/refund and
   Connect reads. The connected Stripe app cannot substitute for an application
   runtime API key. Do not rotate keys or copy the masked production key.
3. Radio: Cloudflare-first architecture is mandatory. The existing
   radio:start implementation currently uses a persistent Node HTTP listener,
   local SQLite database and filesystem asset directory; it is NOT a deployed
   Cloudflare Worker and must not be presented as D1/R2-native. Audit its
   persistence, stream/range behavior, authorization and rights/rotation logic.
   Adapt the radio catalog/state to bound D1 and authorized audio bytes to R2,
   and expose streaming through the existing authenticated Cloudflare-compatible
   application gateway, preserving range responses, revocation and listener
   controls. Use Workers-compatible request handlers and durable state patterns
   rather than Node listeners, local disk or SQLite as hosted dependencies.
   Verify actual hosted D1/R2 operations before declaring the migration done.
   No Render, PostgreSQL, new persistent Node host, or paid service is part of
   the approved target architecture. If a hard platform limitation is found,
   document the specific failing test and ask before proposing any alternative.
4. Webhook: retain owner-only Site access. Prepare a narrowly exposed HTTPS
   relay that forwards only the Stripe webhook route, unchanged raw bytes and
   Stripe-Signature, through supported Sites service authorization. No visitor
   identity is forged. Keep the bypass credential server-side. Register only
   a test-mode platform endpoint after the relay URL/hosting is approved, then
   securely bind that endpoint's genuine signing secret. Do not treat manually
   generated HMAC fixtures or connector event reads as genuine delivery.
5. Recovery: provide a protected sandbox-only D1 recovery writer that invokes
   the existing recovery function against this Site's DB and test credentials,
   plus supported unattended execution. Do not point the existing SQLite CLI
   worker at a fabricated local mirror and call it hosted D1 recovery. Verify
   fresh unattended authorization and persisted readback before scheduling.
   Determine the supported schedule and any cost before approval.
6. Identity/assets: use actual signed-in artist/listener sessions for this Site,
   separate reviewed Radio and sale permissions, and an authorized recording.
   Reuse the existing Connect account after intentional identity mapping;
   refresh its actual readiness rather than inserting manufactured ready flags.
7. Activate only this sandbox after exact source, DB schema/R2 operations,
   credentials, Radio, signed delivery and recovery readiness pass. Sites calls
   every hosted publication a production deployment; this isolated target must
   be explicitly identified in any requested deployment approval.

No new host, relay URL or schedule is invented here. Missing secure credentials, hosted Radio D1/R2 adaptation and webhook/recovery
integration prevent a complete topology from being verified.
Approval alone does not supply those dependencies.

## Acceptance run and required evidence

Use the existing 209-test Phase 3 verification; do not rerun it just for this
documentation-only inspection. Run targeted and required checks if code changes.

- Upload: real browser artist upload with explicit authorization; record track
  ID, ownership/consents, original file SHA-256 and hosted stored-byte evidence.
- Radio: play that reviewed recording in a real browser; verify advancing audio
  time and delivered content. Diagnose the previous timeout only if it recurs.
- Paid order: real hosted Checkout with test card; record Session, PaymentIntent,
  purchase and genuine Stripe event IDs and livemode false. Never fulfill from
  the return page. Verify signed webhook response and one paid ledger entry,
  including a replay without duplicate entitlement.
- Allocation/download: inspect Stripe destination/application fee and immutable
  purchase snapshot. For the existing isolated $2 scenario, 170 artist cents,
  30 base platform cents and separately quoted processing; do not change public
  prices. Authenticated buyer downloads bytes matching the original checksum;
  unrelated and pending buyers cannot download.
- Withdrawal: create an additional open Session specifically for expiration
  coverage, then withdraw. New purchases fail; paid history/download survive.
  Confirm real Stripe retrieval/expiration, not only a local status flag.
- Durable recovery: interrupt a sandbox recovery execution after a persisted
  obligation, restart unattended execution, and verify eventual expiration or
  explicit review with leases/idempotency intact. Missing/same-second payment
  ordering remains review. Record actual job and Stripe states across restart.

All eight requested hosted acceptance steps remain unexecuted in this task
because the target is paused and the prerequisites above are absent. There was
no new charge, browser run, upload, mutation, migration, deployment, key rotation,
account creation, scheduler creation or production change. No application defect
was established and no speculative application repair was made.

## Architecture correction — October 16, 2026

User direction: MusicBat is Cloudflare-first. This supersedes the earlier Render
hosting exploration in this historical inventory. Do not move application
data to Render PostgreSQL or provision a persistent Render sidecar. Preserve
the existing Site's D1 DB and R2 BUCKET bindings and the verified e60c051
Radio fixes. The local Node/SQLite Radio harness remains useful for regression
testing, but its hosted implementation must be adapted to D1/R2 and a
Cloudflare-compatible request lifecycle, with no claim of successful migration
until actual hosted tests pass. Production changes and paid services still
require explicit approval. The user reported a later Site publication; its
deployed revision and acceptance results were not accessible in this GitHub
inspection and must not be assumed from this document.
