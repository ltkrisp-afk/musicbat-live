# MusicBat — Zipper Reconciliation Protocol (ZRP-001)
Date established: 2026-10-20
Status: GOVERNING ENGINEERING PROTOCOL / implementation and acceptance NOT YET VERIFIED
Scope: MusicBat repository, Stage 4 Sandbox, and historical production/source evidence. Documentation-only change.

## Purpose
Open a defect, establish its actual provenance and cause, reconcile historical and current architecture, correct the responsible mechanism, verify dependent behavior, and close only with evidence. No verbal assurances or inferred green checks. Preserve verified functionality and artist rights.

## Gate 0 — Provenance before inference
For EVERY claimed historical PASS, FAIL, approval, fix, or deployed behavior record:
- repository and branch, exact commit SHA and file paths
- application/project ID, deployed revision, deployment timestamp, environment (local / Stage 4 Sandbox / production)
- database/bindings/routes and Stripe test-vs-live mode where relevant, without secrets
- original test/log/response evidence, actor/account role and stable pseudonymous identity
- scope of owner's approval and whether action stayed inside it
- verification confidence: VERIFIED, REPORTED, UNRECONCILED, BLOCKED, FAILED
Do not accept a passing test on one branch/environment as proof for another. An unverified old claim must remain UNRECONCILED, not silently discarded or accepted. An existing production approval never authorizes new production changes.

## Five cross-referenced records
1. CAUSAL LEDGER: immutable incident IDs; initial symptom; time; evidence; cause (confirmed vs hypothesis); original fix; regressions and recurrences.
2. CURRENT ARCHITECTURE: actual source modules, API routes, auth middleware, account/artist/track/purchase schema, migrations, job scheduler, runtime bindings and deployed revisions.
3. RECONCILIATION: compare each ledger claim with the running implementation; detect branch/environment drift, duplicate or obsolete paths, superseded-but-still-active code, unreachable old code, missing migrations and permission boundaries.
4. VISUAL Q SHEET: one row per falsifiable claim with status, owner, evidence URLs, linked incident/correction IDs and clear closure gate. Green means demonstrated in the intended deployed environment, not just committed.
5. CORRECTION LINEAGE: incident -> root cause -> changed source -> commit -> migration/config -> target deployment -> tests -> observed hosted behavior -> closed ledger entry. Recurrences reopen original incident and link the new evidence.

## Status rules
- VERIFIED PASS: explicit evidence of the stated behavior in its stated environment.
- VERIFIED FAIL: reproducible evidence of contrary behavior.
- BLOCKED: specified external constraint prevents verification; no fabricated conclusion.
- UNRECONCILED: historical or deployment identity cannot be independently tied to the claim.
- SUPERSEDED STILL ACTIVE: older implementation demonstrably executes despite later replacement.
- NOT TESTED: no supporting execution evidence.
- CLOSED: root cause, affected dependencies, corrected revision, targeted regression, hosted result, and provenance all documented.
Do not equate a green functional test with security or architectural closure.

## Zipper sequence and closure gates
OPEN -> TRACE -> RECONCILE -> CORRECT -> VERIFY -> CLOSE.
A. Isolate the actual failure and its observable boundaries; do not assume similar symptoms share a cause.
B. Trace backward to the earliest supported causal component; inspect prior fixes and environment/branch mismatches.
C. Compare current code and deployed behavior, including dependencies and alternate active paths. Distinguish hypotheses from confirmed root causes.
D. Implement a coherent, narrowly scoped correction at the appropriate shared layer; do not patch unrelated endpoints merely to silence symptoms. If the issue is isolated, a local fix is acceptable.
E. Add targeted regression tests, run existing dependent tests, and verify actual Stage 4 hosted behavior. Avoid unnecessary repeat payment transactions.
F. Close only when evidence proves correction and no relevant regression. If evidence missing, keep open with exact blocker and next investigation.
Safeguards: do NOT force every recurrence into one root cause; do NOT require exhaustive historical reconstruction when a safe correction can be justified and verified with sufficient evidence.

## Initial evidence-backed Q sheet (not a fresh source audit)
| ID | Claim | Status | Evidence/next gate |
| --- | --- | --- | --- |
| MB-001 | Separate iCloud sign-in with distinct account ID | REPORTED PASS | Owner-provided latest Work report; retrieve committed hosted evidence and revision |
| MB-002 | $2 Stripe test Checkout + signed webhook + paid record | REPORTED PASS | Owner-provided latest Work report; preserve existing transaction, fetch committed evidence |
| MB-003 | $1.70 artist / $0.30 platform / $0.37 buyer processing | REPORTED PASS | Owner-provided latest Work report; reconcile accounting and test-mode records |
| MB-004 | Download bytes match 550 Hz test fixture | REPORTED PASS | Owner-provided latest Work report; preserve fixture and hash evidence |
| MB-005 | Durable purchaser-account entitlement independent of browser session | VERIFIED FAIL per Work report; source cause UNCONFIRMED | Trace purchase, webhook, entitlement, auth and download ownership; regression tests |
| MB-006 | Shock Room private API authorization per artist | VERIFIED FAIL per Work report; scope/cause UNCONFIRMED | Inventory exact endpoints, payloads and server-side auth; test listener, other artist, owner |
| MB-007 | Historical /callback 404 | OBSERVED; cause UNRECONCILED | Earlier commit cd35693 documents callback 404 and stale owner session; later distinct sign-in succeeded |
| MB-008 | Unattended recovery original scheduler attribution | BLOCKED | Historical summary exists; original invocation receipt unavailable; do not reset completed jobs |
| MB-009 | Stage 4 vs production vs repository revision alignment | UNRECONCILED | Identify exact project IDs, source commits, database bindings and routes before changing code |

Historical checkpoint: https://github.com/ltkrisp-afk/musicbat-live/commit/cd35693c7a616cd63577d4b5a5adfdf999ff8c08
Stage 4 Sandbox project ID: appgprj_6ad26204823c81918260d33e13429074.
Earlier production project ID reported: appgprj_6aaa2f4673e88191b504cf941f475802. Independently recheck current environment mapping.

## First execution assignment for ChatGPT Work
1. Read this protocol and prior acceptance documents. Locate latest authoritative evidence commit for the successful separate-iCloud $2 purchase.
2. Perform Gate 0 and output an environment/source/revision matrix with citations; do not conflate GitHub source, Stage 4 deployed code and production.
3. Trace shared account identity, artist ownership, Shock Room authorization, purchase entitlement and download authorization through code, schema, routes and actual hosted responses. Determine whether a common defect exists; do not assume it.
4. Compare with prior fixes and migrations. Identify superseded-but-still-active paths only with execution proof.
5. Implement and test verified non-production corrections within existing authorization, preserving 85/15, Radio/Retrofutura, recordings, purchases, audit history and withdrawal semantics.
6. Update the five records and checkboxes. For every closed item attach exact commit, test, deployment revision, evidence and regression results. For unresolved items state the exact blocker.
7. No production changes, live charges, destructive migration, invented environment, or duplicate infrastructure without explicit approval. Do not repeat successful purchases without technical justification.
Output a concise Q sheet first, followed by the linked evidence and only necessary owner decisions.
