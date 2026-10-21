# Correction lineage and release controls
Recorded 2026-10-21 UTC (October 20 Pacific). Governed by [ZRP-001](https://github.com/ltkrisp-afk/musicbat-live/blob/11f7119fb2bb8ff49a513fc72cb54d09b7c6dcf9/docs/zipper-reconciliation-protocol-2026-10-20.md), [release plan](https://github.com/ltkrisp-afk/musicbat-live/blob/c19f0cb3c38cffc1d6235bb2b78315a75771a1c6/docs/musicbat-final-release-readiness-2026-10-20.md), and [v20 reconciliation](https://github.com/ltkrisp-afk/musicbat-live/tree/bd3e3311b59a43a33c47527d6241fe84685c8beb/docs/zrp-001-v20).

[Q sheet](README.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [evidence](evidence.json)

## Completed corrections preserved
MB-005/006 -> confirmed cookie ownership/unscoped analytics -> account-owned purchase creation/receipt/download, additive0015 audit schema, scoped Shock Room/public data -> dd46fe9f8ae4baf50249e48b802e545368ca6fcd -> Sitesa9bc1ad v20/env6 ->266 regressions, TypeScript/lint/build and hosted sign-out/sign-in recovery/cross-account denial/owner access -> CLOSED for sandbox. No passing code changed.

## New audit findings are not claimed fixed
LR-001 -> production3d0… deliberately410 raw media -> old player still requests those paths -> hosted410 and0/0 -> OPEN until compatible reviewed channel delivery is verified after separately authorized release. It is unsafe to reverse the media protection as a shortcut.

LR-002 -> production predates tested account entitlement/artist boundary -> fresh source/schema evidence -> OPEN release promotion gap. Existing sandbox correction is the minimal known-good reference; no duplicate rewrite.

LR-003 -> production and Stage4 migration histories diverged -> processing_cents already exists -> isolated exact-SQL rehearsal fails -> OPEN release-profile correction. Do not edit deployed historical SQL, blindly renumber journals, mark migrations applied without matching schema, or deploy Stage4 as-is. Prepare a release-specific append-only profile rooted in production's exact immutable baseline; translate remaining changes exactly once and verify archives/rows/financial snapshots. A rehearsed rollback must retain newly created legitimate purchases, rather than restoring an old DB snapshot over them.

LR-004 -> test-only recovery runner/MCP/D1 Radio -> live mode not supported by these adapters -> OPEN production execution boundary. No live key inserted and no test-mode guard removed. Before commercial activation, prove the chosen mode-safe runner and service route with fixtures in non-production and current logging/lease behavior. Use existing infrastructure; if it cannot provide the required unattended execution, return the incompatibility for an explicit owner decision before provisioning anything.

LR-005 -> D1 network loss -> endpoint later200 without source change -> dependency recovery observed, no code patch justified. Existing bounded optimistic retries and fail-closed behavior preserved.

LR-006 -> expired review -> safe silent snapshot -> PASS for authorization behavior, NOT a fresh playback pass. No original catalog inserted in sandbox and no permission renewed.

LR-008/009 -> source/config/deployment runbook drift -> this report separates configured env11 from deployedenv10 and supersedes historical v13 commands for today's release. Operational deployment remains OPEN.

## Exact authorized actions in this audit
Read Sites metadata/config (masked secrets), D1 overview and bounded catalog/purchase rows, domain state and Worker logs; inspect existing clean source; use existing browser owner session for read-only public/catalog/channel/Stripe readiness views; run one in-memory SQLite incompatibility rehearsal; commit engineering records. No production API POST, live provider operation, permission change, data edit, new fixture, recovered-job reset, background recovery call or deployment.

Commercial/business actions remain explicitly on owner hold. Nothing in this record is approval to deploy, unpause, configure live commerce, connect a bank, or form a business.
