# Correction lineage

Recorded 2026-10-21T01:43:55Z. 
Records: [Q sheet](q-sheet.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [machine evidence](evidence.json).


## MB-005

Incident: distinct signed-in buyer inherited a browser-cookie purchase capability.

Confirmed cause: buyer_hash cookie alone selected receipts/downloads; purchase creation had no durable buyer account. Webhook validated payment but could not repair that missing ownership fact.

Correction:
- app/api/musicbat/purchase/route.ts: trusted identity required, buyer_account_id inserted before Checkout, Stripe metadata retained as corroboration, pending reuse scoped by account, unowned pending order blocks replacement, account list/receipt reads, explicit legacy recovery.
- app/api/musicbat/purchase/[purchaseId]/download/route.ts: stable account equality required.
- db/schema.ts and drizzle/0015_purchase_account_ownership.sql + journal: nullable account field and ownership audit; no guessed backfill.
- app/musicbat-loop.tsx: existing purchase recovery control and account purchase rediscovery.

Commit: [dd46fe9f8ae4baf50249e48b802e545368ca6fcd](https://github.com/ltkrisp-afk/musicbat-live/commit/dd46fe9f8ae4baf50249e48b802e545368ca6fcd). Migration: 0015; observed schema/audit in existing sandbox DB. Configuration: no credential/resource change. Deployment: v20, Sites source a9bc1ad45a47e3cc45f04c6119d536bfac384cb2, appgdep_6ad7c47a62e881918f12314663a45e9d, environment6.

Regressions: scripts/musicbat-account-security.test.mjs (cookie-free/account persistence, cookie changes, logout/null identity, cross-account denial, explicit legacy claim proof, no replacement of assigned ownership); scripts/musicbat-purchase.test.mjs (account metadata persistence and no replacement of unowned pending Checkout); dependent purchase/webhook/withdrawal/recovery tests. [CI dd46fe9f8ae4baf50249e48b802e545368ca6fcd](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39485881177) independently confirms 266/266 and typecheck/lint/build. Harness imports were updated to inject platform identities at the existing trusted-auth seam; tests do not pretend fixture identities are hosted accounts.

Hosted proof in [acceptance evidence](https://github.com/ltkrisp-afk/musicbat-live/blob/c9db2087d8549e980f7a5462b1e5fc5e0d749666/docs/stage4-security-acceptance-2026-10-20.md): audit e28285af-e826-49b9-861f-fa87af700ef7 at 2026-10-20T19:44:33Z; restored iCloud account purchase listing; GET download HTTP200 at 2026-10-21T01:28:53.389Z, request b5e0e0da5f63321e5b5d842c24be4245; 384044 bytes, SHA256 68284af0d7ec16d57a9df31942122ef4f889011da62dbec6abcaa94e1213e43c. Owner A cannot download buyer B's purchase: HTTP404 at 01:34:08.489Z, request 6835e70d74ed5302e8c7176f006ffa3f. No new transaction.

Disposition: CLOSED for the corrected security boundary; MB-010 remains an explicitly separate ownership-evidence hold. A safe refusal to guess a legacy owner is not a cookie-authorization recurrence.

## MB-006

Incident: listeners could read private artist analytics through the API.

Confirmed cause: shock-room view selected all active tracks without requiring identity/artist authority. The public catalog also returned private aggregate metrics.

Correction in dd46fe9f8ae4baf50249e48b802e545368ca6fcd: app/api/musicbat/route.ts authenticates and proves artist/representative authority, calculates category rank before filtering returned rows to authorized tracks, and omits private stats from nonowner public track payloads. The browser's analytics read tolerates expected denial to preserve public catalog functionality. No analytics migration, Radio redesign or payment change.

Regressions: scripts/musicbat-account-security.test.mjs verifies listener403, null identity401, separate artist row isolation and legitimate owner200, plus private public-catalog metrics omission. Existing artist/rotation/integration tests now read private analytics under an authorized fixture identity. [Exact-commit CI](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39485881177) passed.

Hosted proof: listener B GET shock-room HTTP403 at 2026-10-21T01:29:44.531Z, request0cbfa947368bda29a7d6ba8954439973; owner A read two rows belonging only to its manageable tracks at 01:36:22.188Z, and three manageable tracks at 01:34:08.372Z. Listener Connect API403 at 01:27:47.235Z, requestb4d89c640e41cea1195b6e7ed0866395. These are deployed API observations, not claims inferred from hiding controls.

Deployment/provenance: same v20 source, full code comparison and environment mapping as MB-005. Disposition: CLOSED for the documented boundary.

## Preserved dependencies and limits

Stripe settlement/refund/recovery implementation files, Radio engine/selector/audio routes and persistent player were unchanged between Sites v19 source2bc1d2e and v20 sourcea9bc1ad. Existing 85/15 allocation and buyer-paid processing evidence are preserved, not re-executed.

The exact-commit [browser workflow](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39485881278) also succeeded in isolated Chromium: eight shared-Radio checks, four application checks, and responsive-console execution. This supports dependency regression preservation; it is not a fresh hosted Radio, payment or physical Safari acceptance claim.

No duplicate application, route family, source workaround or infrastructure was introduced. Callback and original scheduler attribution have no speculative “fix” in this lineage.
