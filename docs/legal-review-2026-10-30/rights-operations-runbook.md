# Recording rights operations — nonproduction review runbook

The existing authenticated account and rights declaration remain the entry points. There is no new identity, licensing business or payment model.

## Artist workflow

1. Upload through the existing agreement/rights form. Complete master and composition/lyric authority separately; disclose PRO/publisher interests and surviving distributor restrictions. Nonexclusive or ended distribution, earnings and popularity do not automatically disqualify a work.
2. Open Account → Declarations & rights → select recording → Recording-specific clearance. Review existing decisions and case statuses. Submit selected uses with private master/composition authority references and restrictions. Submission appends `artist_track_audit`; it cannot grant a right or publish music.
3. Existing owner/representative permission applies. A revoked representative cannot retrieve or submit the private workflow. Original signer-only agreement exports remain unchanged.

## Configured reviewer workflow

`GET /api/musicbat/rights?trackId=ID` is private. Only the authenticated owner/current representative or configured `MUSICBAT_OPERATOR_ID` may read it. Operator notice evidence stays in private case records; the artist view supplies case status, not another party's private contact/documents.

`POST /api/musicbat/rights` consumes bounded JSON (16 KiB), requires same origin, and honors the release pause. Artist `request_review` is account-authorized and grants nothing. All operator actions additionally require explicit `MUSICBAT_RIGHTS_REVIEW_ENABLED` equal to the configured `MUSICBAT_STRIPE_MODE` (`test` or `live`) and the authenticated configured operator. No fallback to an artist-selected reviewer or a mismatched payment mode exists. This work does not set these values in production.

Actions:

| Action | Required evidence / result |
| --- | --- |
| `request_review` | Owner/current representative; `trackId`, nonempty `uses`, `masterAuthority`, `compositionAuthority`, `restrictions`. Append-only request, no permission changes. |
| `verify_ingestion` | Operator and private bucket; invokes the existing 72-hour file-verification worker. A verified file grants no copyright. |
| `review_use` | Operator; `trackId`, one existing `use`, and `review` matching `UseDecision` in `lib/recording-use.ts`. Server records the reviewer and time. Clearances require accepted recording declaration, verified ingestion, both rights verified, authority/compensation/recipient references, actual territory/term, and applicable license funding/ceiling/counsel evidence. PRO declarations need `proEvidenceReference`; shared/external/unknown/restricted matters need `restrictionEvidenceReference`. No automatic publication. |
| `record_complaint` | Operator records a notice received through the existing public complaint contact, selected use, reason and private authority/notice reference. Returns case ID. Intake is an allegation, not an infringement decision or automatic hold. |
| `case_decision` | Operator; `caseId`, `trackId`, `state` (`hold`, `resolved`, `counter-notice`), reason and evidence reference. Counter-notice retains hold; resolution grants nothing. Concurrent stale decisions are rejected. Resolve each independent case; one resolution cannot release another case. |
| `delivery_restriction` | Operator; an existing download case, explicit `restricted` boolean, reason and documented authority reference. Existing purchases remain stored; restricted delivery responds 451. Releasing requires a resolved case and its own reviewed decision. No automatic restoration by counter-notice. |

The review payload's fields are: `decision`, `master_verified`, `composition_verified`, `authority_reference`, `compensation_reference`, `recipient_reference`, `territory`, `starts_at`, `expires_at`, `license_required`, `platform_cost_cents`, `payer`, `funding_source`, `ceiling_bps`, `ceiling_reference`, `counsel_required`, `counsel_reference`. Use existing field units (UTC ms, USD cents, basis points). A label or evidence reference is not independent proof: the human reviewer must actually inspect authority and retain the underlying evidence. Operator approval is not counsel approval.

## Effect of decisions

- Runtime authorization checks current case holds before the historical-agreement boundary; a reviewed case can stop a newly affected legacy use without rewriting its contract.
- Download holds also fence new purchase insertion and sale enablement in the database, and stop new sales. Separately cleared streaming remains independently evaluated.
- Pending/held case evidence prevents destructive private-audio cleanup on offer deletion. Withdrawal/deletion still stops new offers and retains necessary records.
- Existing recorded contractual legacy versions retain their boundary. Unknown future agreement versions fail closed until an explicit clearance policy is established. This does not activate any future text.
- Reviewed use records do not automatically enable an offer, change a payout recipient or restore withdrawn playback permission. Existing artist offering controls and transmission/playback authorizations still apply. Registration of private radio assets and channel review remain existing operational responsibilities.

## Notice handling responsibilities

The public copyright page provides the existing complaint contact. The operator must receive and evaluate notices, contact appropriate parties, preserve private notice/counter-notice evidence, and determine lawful restriction/restoration timing. The API records and enforces decisions; it does not verify DMCA agent registration, adjudicate infringement, send notices, calculate statutory counter-notice restoration deadlines or promise safe-harbor qualification. Repeated substantiated claims require a documented operator account-level decision; they do not cause automatic career bans. Qualified legal questions remain operation-specific.

## Financial and release boundaries

No changes to purchase allocations, $5 pricing, fixed 25% new QCMR pool, carry-forward liabilities, historical settlement or designated-recipient accounting. Existing settlement integration tests remain required. A rights case does not erase earned allocations or itself prove a payout. Actual disbursement holds, mandatory notice/customer remedies and any external processor action require the recorded responsible operator process. No new automated streaming-bank-payout engine is represented.

Apply migration 0022 only in an authorized environment before running the new code. It adds case events and explicit agreement-clearance policy, replaces only the derived payment-eligibility view, and adds targeted database guards. Take a schema/data snapshot and rehearse first. An application rollback can leave the additive evidence/policy tables intact; do not delete legal history to roll back UI. No production migration or configuration change is authorized here.

Artist `withdraw_use` accepts `trackId` and one existing `use` from the authenticated owner/current representative. It records a scoped hold with server identity/time, without waiting for operator review and without the operator-review feature flag. It cannot erase another use or existing entitlements. The rights screen supplies this control within a selected recording. Restoration needs renewed authority evidence and a documented case resolution; the artist cannot self-clear the hold by submitting a review request.
