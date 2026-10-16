# Phase 3 — recovery and integrated regression verification

## Exact source recovered

The original environment reconnected on October 16, 2026. Direct execution confirmed:

- Checkout: `/workspace/scratch/musicbat-player-fix`.
- Phase 2 branch: `phase2-durable-checkout-recovery-2026-10-16`.
- Phase 2 HEAD: `0683cdfe6869468076fbcdff6602ef2b41b13435`.
- Phase 1 parent: `5773f2c0b9e7ee31a29f2f73ea7c64d0bee3594d`.
- Both commit objects and the original Phase 2 report exist. Working tree was clean before this task resumed.

The earlier failure was an exec-server WebSocket connection failure. Reconnection exposed the retained disk and Git objects. No source was reconstructed, recloned, reset or replaced. No evidence establishes the underlying infrastructure root cause beyond that connection failure.

Phase 3 local branch: `phase3-integrated-regression-2026-10-16`, descended directly from Phase 2. Phase 1 and Phase 2 branches/commits remain unchanged. Hosted source `2a9fe5e` was never substituted for development source.

## Workbook continuity and sandbox evidence

Read all sheets of the attached `MusicBat_Verification_Master_Updated_2026-10-16(2).xlsx`, including **Oct 16 Continuity**. The workbook was not modified. Its execution/source-recovery blocker is superseded by the direct Git checks above; its October 13 checklist remains historical.

The workbook records a prior genuine Linux sandbox purchase `8006e921-f76f-4eae-a6b5-e7cce99ae819` and event `evt_1UQw4eLKJHBmA7JwW6KeVLpd`, with $2.37 total, $1.70 artist, $0.30 base platform and $0.37 processing. That is prior operator evidence, not a new transaction independently verified in this Work session. The older local sandbox-preparation document describes an earlier pending stage and does not override the later workbook evidence.

No API key was rotated, no existing successful purchase was repeated, and no secret was printed. Public track pricing was not changed to the isolated $2 test scenario. No new real Stripe API request was made by Phase 3 tests; all processor calls in those tests are test doubles.

## Connected integration evidence

Added `scripts/musicbat-phase3-integrated.test.mjs`, reusing the existing upload/purchase/SQLite fixtures and actual application handlers, catalog/membership boundaries, radio gateway and persistent RadioRuntime. New connected test coverage:

1. Reject an upload without rights attestation; inspect a successful upload's stored rights and generated WAV bytes.
2. Register an explicitly reviewed generated recording in a real local RadioRuntime with its own SQLite ledger. Free Radio serves the exact uploaded bytes through the gateway/catalog/membership boundaries, verified by SHA-256, without calling Stripe or creating a Plus enrollment.
3. A patron cannot withdraw a track, stop its sales or obtain artist-management catalog data.
4. Create three isolated fixture Stripe Checkout orders for the same uploaded recording. Verify signed paid settlement, duplicate delivery, stranger download denial, pending download denial, exact paid audio bytes and the 170/30 base allocation plus 37 processing cents.
5. Withdraw the artist's track during a processor outage. The artist response retains two durable cleanup obligations; new purchases and Radio media delivery are denied. A failed webhook verification against unavailable Stripe does not consume its event ID.
6. Close the actual file-backed application database, reopen it, and run two workers on independent SQLite connections. They process the remaining two jobs once each: one unpaid Session expires, and the paid-but-unordered Session enters durable review.
7. Deliver and replay a same-second signed paid event and a later expiration event. The uncertain purchase stays in `payment_review`; no download is granted and it is not silently classified as paid, failed or cancelled.
8. The earlier paid download retains its original bytes and financial snapshot after withdrawal, recovery and artist deletion.
9. Separate dependency-outage integration denies purchases when DB, object storage or Stripe are unavailable, produces no purchase record, and denies Radio when its service is unavailable.

These are **local handler/runtime integration tests**. SQLite, cryptographic fixture signatures, generated audio bytes and the RadioRuntime are real local execution; ChatGPT identity, R2 storage and Stripe are fixtures/test doubles. This is not browser acceptance, hosted D1/R2 verification or genuine Stripe API evidence. Test migrations are applied only to disposable isolated fixtures, never existing development/operator or hosted databases.

The complete suite additionally exercises the optional Plus Checkout's actual 300-cent monthly configuration, recurring consent, invoice validation, membership boundaries, musician/patron separation, signature tampering, amount/fee/destination validation, historical allocations, refunds, processor outages, retry exhaustion, lease reclamation, lost creation responses, stale workers, private diagnostics, HTTP radio delivery and the automatic worker process/SIGTERM behavior.

## Changes and check results

No application logic defect was demonstrated by the connected tests, so no application code was rewritten. Changes are the two new integration tests, this continuity/evidence report, and a migration-test projection cleanup. Full lint identified seven unused-destructuring warnings in that projection; it now filters the same additive fields without unused bindings. The historical preservation assertion is unchanged in meaning.

Final checks: `npm test` passed **209/209**, zero failed/skipped/cancelled, including two new connected Phase 3 tests. `npm run typecheck`, full-repository `npm run lint` (zero errors and zero lint warnings), `npm run build`, and `git diff --check` passed. npm printed an environment-level notice about its existing `http-proxy` setting; it did not fail any check. No browser acceptance or hosted runtime success is inferred from these commands.

## GitHub preservation method

The recovered checkout has no configured Git remote; no authenticated Git push transport has been established here. The connected GitHub app can create content/tree/commit objects and a new branch, but its commit tool does not accept original author/committer timestamps. Consequently, a connector-created source checkpoint has a **different commit SHA** from the recovered local commit.

The authorized preservation target is a new development-only branch `musicbat-phase3-recovered-2026-10-16` in `ltkrisp-afk/musicbat-live`. Its source tree must hash identically to the final local Phase 3 source tree before the branch is created. The existing development, release and default branches are not overwritten or advanced. The GitHub commit message records the original Phase 1/2 full SHAs and the local Phase 3 SHA. Source publication results, returned checkpoint SHA and tree comparison are reported separately after this local report is committed.

This preserves exact tracked source bytes and file modes remotely. It does not falsely claim that the original local commit history was pushed unchanged. Original commits remain in the recovered checkout. No application release or hosted deployment is part of source preservation. If any API preservation operation fails, do not substitute a different tree or claim success.

## Phase 4 prerequisites — no Phase 4 actions performed

Read-only hosting inspection earlier in this same conversation established public MusicBat version 15 and saved runtime source `2a9fe5ede5fc7e9c34beebfa797ce60ff15812ed`; these remain separate from recovered development source. Runtime environment revision 10 listed test mode and a masked Stripe key, but no `STRIPE_WEBHOOK_SECRET`. The complete D1 `DB` listing lacked `checkout_recovery_jobs` and `checkout_payment_evidence`, as well as newer catalog/identity tables. No Sites automation was attached; an external scheduler remains unknown. These observations were not redundantly repeated after reconnecting.

Before claiming hosted sandbox acceptance:

- Select an isolated sandbox target and reconcile its full required schema with the exact development source. Review the controlled migration plan first; do not apply migrations under this Phase 3 authorization.
- Privately verify the configured key's sandbox platform and required Checkout read/expire, Session-list, event-read and expanded payment/refund-read permissions. Reuse the existing verified account; do not rotate working keys or create duplicate accounts.
- Establish actual signed platform webhook delivery with the endpoint's own signing secret. A masked API key entry is not proof of webhook readiness. Preserve the existing checkout pause until acceptance is ready.
- Establish authenticated private Radio transport, reviewed test catalog, durable radio ledger/assets, working D1/R2 bindings, and account/artist identity mapping for the sandbox target.
- Provision/confirm unattended recovery execution using existing hosting capabilities within the no-new-expense constraint. No scheduler or hosted worker was enabled here.
- Verify real expiration/retrieval, payment-versus-withdrawal races, webhook idempotency and historical download behavior. Reuse prior successful purchase evidence where applicable; any additional transaction must test a specific unverified behavior.
- Keep same-second/missing-evidence races in review. Production readiness, bank settlement, browser listening quality and hosted operational resilience are not established by local integration tests.

No deployment, production/source-site mutation, credential update, operator/hosted schema migration, live charge, pricing change, new hosting expense or redundant backup was performed. Stop before Phase 4.
