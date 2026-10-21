# Immutable incident ledger — ZRP-001

Recorded 2026-10-21T01:43:55Z. Existing MB IDs retained from [ZRP-001](https://github.com/ltkrisp-afk/musicbat-live/blob/11f7119fb2bb8ff49a513fc72cb54d09b7c6dcf9/docs/zipper-reconciliation-protocol-2026-10-20.md); historical observations are preserved, not erased. 
Records: [Q sheet](q-sheet.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [machine evidence](evidence.json).


| Incident | Earliest supported symptom / cause | Correction and dependent evidence | Current disposition |
| --- | --- | --- | --- |
| MB-005 | v19 allowed the distinct iCloud account to read the old cookie-owned receipt. Source used buyer_hash for creation, receipt and download and had no account-owner column. Cookie persistence across account changes was the confirmed mechanism. The original introducing commit is not established. | dd46fe9f8ae4baf50249e48b802e545368ca6fcd; additive 0015; account-scoped creation/reuse/read/list/download, explicit audited legacy proof. CI 266/266, v20 same code, hosted restored sign-in download 200 and owner cross-account download 404. [Lineage](correction-lineage.md#mb-005) | CLOSED for the account-ownership correction. Historical unowned order is MB-010, not evidence that cookies still authorize downloads |
| MB-006 | v19 Shock Room view returned all active-track analytics without requiring user or artist authority. Public catalog metrics were another active disclosure path. Distinct source cause from MB-005; no common-cause assumption. | dd46fe9f8ae4baf50249e48b802e545368ca6fcd; server authentication and artist/representative filters; public metrics omitted; caller tolerates expected denial. Hosted listener 403, owner scoped rows; other-artist/null-identity regressions. [Lineage](correction-lineage.md#mb-006) | CLOSED for the documented APIs; broader unrelated security claims are not inferred |
| MB-007 | /callback 404 at 2026-10-20T19:16:10.804Z, request d0a060ddf33568d138f1b57d038d3d12. Original internal platform cause not established. | Supported sign-out/account chooser restored distinct account sign-in; subsequent sign-ins and account-owned downloads succeeded. No app callback patch. | UNRECONCILED cause, nonblocking operationally; no speculative reopening |
| MB-008 | Historical scheduled fixture recorded retrying/1 -> completed/2, processed=1, completed 2026-10-19T02:05:08.026Z. Existing committed narrative attributes it to the scheduled cloud task. | Current eight completed jobs and enabled existing task independently observed. Original invoker-specific receipt not independently available through current bounded log tools. | BLOCKED for original scheduler attribution; preserved historical reported PASS is not discarded or converted into a functional FAIL |
| MB-009 | Different GitHub and Sites SHAs could not alone identify deployed application contents. | Full Git tree/mode/blob comparison, native version/deployment/environment and schema-effect evidence. [Gate 0](reconciliation.md). | CLOSED / VERIFIED PASS for v20 code provenance; intentional manifest boundary retained |
| MB-010 | Old paid order c985ed12-4f04-41cc-80cb-961830651251 has no buyer_account_id. Recovery POST refused mismatched receipt at 2026-10-21T01:34:35.112Z, request 0540aacd68bc1a948c7dbd169317641a, HTTP403. | Read-only provider checks confirmed paid/complete test Session, matching ID/metadata, receipt email present but matching neither current account. Historical initial acceptance explicitly used fictional Checkout contact. Record remains paid and unassigned. | BLOCKED ownership review; safety mechanism functioning, not a new payment failure |

## Recurrence rules and unresolved evidence

A demonstrated cookie-based cross-account download on v20 reopens MB-005 with the exact account pseudonyms, request ID and deployed revision. A private analytics disclosure reopens MB-006. Merely sharing a display name, retaining an old cookie, having an empty Radio catalog or encountering browser-control errors does not establish recurrence.

No prior symptom was assigned an invented introducing commit. Source evidence supports these responsible mechanisms and the verified correction. No exhaustive reconstruction is required to preserve them. No recurrence was demonstrated in this documentation-only reconciliation.

## MB-010 proof and authorization gate

Available proof establishes the transaction, its test mode, asset and historical fixture execution, but **does not establish a stable authenticated purchaser ID**. A fictional or unrelated receipt email cannot be silently converted into a Gmail/iCloud owner.

Two acceptable resolution paths:
1. Existing recovery: original device credential, authentic paid Session/order metadata, matching platform-authenticated receipt-email identity and explicit recovery action. All checks must pass; current attempts did not.
2. Reviewed historical fixture mapping: independently cross-reference the original run/receipt and order, establish a specific target stable MusicBat account, and obtain an explicit owner decision approving this exact test-order mapping. Preserve the original payment snapshot/receipt; append evidence/audit; verify cross-account denial and rightful access without another purchase. There is no blanket administrative backfill route in v20.

This command authorizes investigation and records, **not** such an assignment. No reassignment, receipt email edit, destructive migration or new entitlement was performed.
