# ZRP-001 — Stage 4 v20 closure record

Recorded 2026-10-21T01:43:55Z (October 20, America/Los_Angeles). Governing protocol: [ZRP-001 at its immutable commit](https://github.com/ltkrisp-afk/musicbat-live/blob/11f7119fb2bb8ff49a513fc72cb54d09b7c6dcf9/docs/zipper-reconciliation-protocol-2026-10-20.md). The protocol branch is a documentation branch, not the deployment source; it was read, not merged or modified.

Records: [Q sheet](q-sheet.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [machine evidence](evidence.json).

## Q sheet first

| Claim | Status | Closure |
| --- | --- | --- |
| MB-009 source-to-v20 provenance | VERIFIED PASS | Closed for the security runtime: full Git blob/mode comparison, exact deployment and environment mapping |
| MB-001–004 separate account, existing payment, allocation and matching download | VERIFIED PASS | Existing transaction preserved; no new purchase |
| MB-005 account-owned entitlement | VERIFIED PASS | Closed correction; legacy fixture review tracked separately as MB-010 |
| MB-006 artist-only Shock Room API | VERIFIED PASS | Closed correction; server ownership filters and independent hosted/CI evidence |
| MB-011 exact-commit regression/build checks | VERIFIED PASS | Independent CI logs: 266/266; TypeScript, lint and build successful |
| MB-010 older fixture ownership | BLOCKED | Paid record preserved; no account assignment without documented proof and explicit reviewed mapping |
| MB-008 original scheduler invocation attribution | BLOCKED | Historical PASS receipt preserved, but original invoker-specific execution receipt cannot be independently retrieved |
| MB-008a current recovery state/schedule | VERIFIED PASS | Eight completed jobs, no errors/leases; existing linked task enabled |
| MB-007 callback incident cause | UNRECONCILED | Nonblocking historical cause; later authentication succeeded |
| Physical iPhone/Safari / second physical browser | NOT TESTED | CI Chromium and hosted account switching are not physical-device proof |

The authoritative runtime fix is `dd46fe9f8ae4baf50249e48b802e545368ca6fcd` on `repair/85-15-authoritative-2026-10-18`. Its documentation head before this reconciliation was `c9db2087d8549e980f7a5462b1e5fc5e0d749666`. Sites v20 deploys the separate source-repository Git commit `a9bc1ad45a47e3cc45f04c6119d536bfac384cb2`. These identifiers represent different Git histories; their differing SHAs are not evidence of differing application code.

This execution changed engineering records only. No source repair, deployment, new transaction, live payment, ownership mapping, recovery writer, fixture reset, infrastructure or production mutation was performed. Full Stage 4 acceptance is not declared while the specified open evidence/ownership gates remain. Physical-device coverage is reported as a limit, not manufactured into a software defect.
