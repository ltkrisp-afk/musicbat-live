# Integrated framework: reconciliation and engineering review
Date: October 30, 2026
Status: PROPOSED / NOT EFFECTIVE / NOT LEGAL APPROVAL
Inspected PR #5 head: d44f57fa5ae7e8a86bfe7de2444827b133d86688
Base tree: 49bd93eb3bef42bc8093876c4cc4e5ba752a56e0

## Scope and authority

The owner's ten submitted articles are preserved in `legal/proposed/musicbat-integrated-framework-proposed-2026-10-30.2.md`. This proposal identifier does not designate a replacement operative agreement. It coexists with proposed addenda 2026-10-30.1 and the narrower proposed 2026-10-29.4 correction. None is automatically incorporated into held 2026-10-29.3. No acceptance flow, runtime import, database, use grant or public legal page is changed.

Golden Foundation principles remain governing architecture. MusicBat provides defined discovery, preservation, delivery and commerce services; stewardship grants neither ownership nor career control.

## Article mapping

| Article | Existing agreement/addenda relationship | Engineering disposition |
| --- | --- | --- |
| 1 Ownership/role | Golden Foundation; addenda M1 and W; held agreement purpose/ownership framework | Retain no transfer, no career agency, no exclusivity. No new ownership or account model. |
| 2 Operational license | Addenda M2–M3 and recording-specific use schedules | Bind technical provider activity to cleared use/territory/term. No implied sync, training or endorsement. Operational access is not compensation waiver. Runtime gates unchanged. |
| 3 Authority | Addenda W1–W4; existing rights declarations and review holds | Sufficient authority may include other owners' documented authorizations; no blanket exclusion based solely on PRO affiliation. Current `recording-use.ts` requires verified master/composition authority and compensation references. Full review workflow not functionally retested. |
| 4 Marketplace | Held Section 7 and addendum M4–M5 | Preserve 85/15, buyer processing subject to law/provider rules, designated recipient and entitlements. Deduction exception requires reconciliation below; no runtime deduction enabled. |
| 5 Membership | Held Section 8 and R1–R2 | $5 optional membership retained; free/member and actual noninteractive transmission use checks remain separate in `authorizeChannelUse`. A membership is not copyright permission. |
| 6 Accounting | Held Section 8/Schedule D and R3–R5 | Existing accounting source reviewed: settled mode-pinned receipts, reversal limits, fees/credits, fixed 25% new pool, proportional units, largest-remainder rounding, prior liabilities. Proposal must not weaken these specifics. |
| 7 Preservation | Addenda M5/X2 and historical-rights records | Retention is not exploitation authority. Keep limited lawful records and purchaser survival rights; no perpetual promotional rights or unlimited personal-data retention inferred. |
| 8 Complaints | Addendum D and existing complaint/hold requirements | A published promise is not verified agent registration, staffing or operational compliance. Agent registration, policy publication, counter-notice deadlines and restoration behavior remain unverified in this bounded review. |
| 9 Exclusions | Existing sync exclusion; earlier proposed X1 future extension | This agreement grants no sync authority. X1 remains a distinct inactive proposal, not an authorized program. No licensing-negotiation feature is activated. |
| 10 Integrity | Held integrity manifest and W4 | Version/digest/identity/capacity/time/declarations remain required. No retroactive substitution. Existing legal source and manifest are preserved. |

## Specific reconciliation points before adoption

1. **Artist allocation safeguard — Article 4, paragraph beginning “MusicBat shall not reduce”.** Its exception for a separate valid agreement also appears in held Section 7's signed-Schedule-D exception, but the protected owner direction and current `evaluateUse` reject Artist as a platform-license payer. Retain the proposed text as submitted; do not implement deductions. Recommended review wording, not approved substitution: “MusicBat shall not reduce the Artist's 85% allocation to fund MusicBat's operating expenses or separately incurred licensing obligations. Any independently required Artist obligation must be identified separately and may not silently change this allocation.”
2. **Fixed funding — Article 6, second paragraph.** Held Section 8 and `membershipStatement` establish a new pool equal to 25% of QCMR, rounded down to cents. “Not exceeding” and undefined “funding conditions” must not authorize discretionary underfunding, overhead deductions, cancellation of accrued liabilities or a unilateral percentage change. Preserve current fixed funding unless an explicit versioned amendment is separately approved.
3. **Carry-forward — Article 6, pool and distribution paragraphs.** Current code calculates newPool = floor(QCMR / 4); distributable total includes prior unallocated pool liabilities. A later total distribution can exceed 25% of that later month's QCMR without increasing its newly funded pool. Describe new funding and prior-liability distribution separately.
4. **Streaming recipient — Articles 4 and 6.** Article 4 expressly identifies a designated recipient; Article 6 does not repeat the rule. Incorporate held Sections 7/8 and Schedule D's same single designated, verified recipient per recording/payment stream. Beneficiary allocations are accounting instructions, not a promise of automatic processor payouts to every beneficiary.
5. **Schedule specificity — Article 6.** Preserve the existing USD/UTC-month basis, actual tax/principal/processing adjustments, no duplicate reversals, deficits, deterministic largest remainder, zero-unit carry-forward, holds and linked corrections. Do not make these already documented provisions blank or unresolved merely because the overview defers them to a schedule.
6. **Eligibility — Article 6.** Preserve the held rule of verified eligible member listening, at least 30 seconds or a full shorter recording, applicable permission, self/bot/test/duplicate/overlap exclusions and signed instructions. Qualification is distinct from verified full-track completion. Vote weighting remains unauthorized; this proposal's amendment mechanism does not approve it.
7. **No agreement replacement by summary.** These ten articles omit many detailed protections from the complete agreement and six schedules, including execution particulars, use-specific permissions, withdrawal procedures, payment timing and retention controls. They are an integration layer for review, not a standalone replacement that silently deletes those terms.

No settled economics are reopened by this report. The recommendations explain how to preserve the protected rules when drafting a future integrated version.

## Verified source findings

- `lib/membership-accounting.ts`: new pool is integer QCMR/4; prior unallocated liabilities are separate; zero-weight allocation preserves the total as unallocated; settled test/live mode and duplicate/reversal checks are explicit.
- `lib/recording-use.ts`: independent use clearance requires verified recording/composition authority, payment references and territory/time limits. MusicBat-paid licensing requires an approved owner ceiling and documented funding. Artist-funded platform licenses are rejected. `authorizeChannelUse` checks noninteractive transmission plus the applicable free/member permission.
- Held Sections 7–8 explicitly retain designated recipients, fixed 25% funding, zero-unit carry-forward and linked adjustments.
- `legal/agreement-integrity.json` continues to identify version 2026-10-29.3, 48,789 bytes, six schedules and SHA-256 4fc7e2df7ce5de07f31284c5d733e4aaaf102821cb2cdef52ce0ffb697454e73; activation held. No legal body, digest or manifest is edited.

## Validation and limits

Executed document checks: ten ordered articles; proposed text SHA-256 5930af047956744e3041c79c58f1efaeade3b256a8fcdf9d21a9c33c095e27b6; 9,368 UTF-8 bytes with a final newline. Git tree changes are confined to these new proposal/review files. Current source inspection is not functional or hosted acceptance.

Tests, typecheck, lint, build and browser tests were NOT RUN for this documentation-only integration. Previous 323-test reports are historical evidence, not new results. The prior scratch checkout was removed by workspace maintenance; current source was read at the pinned GitHub head instead of restoring an obsolete checkout.

Both public legal-source searches failed in this environment. No current-law research, formal legal opinion, enforceability certification or legal clearance is claimed. Informal business counsel remains classified as informal feedback.

## Release status

BLOCKED FOR ACTIVATION. Existing unsupported attorney-review assertions, legal operator/execution particulars, actual rights evidence, any outstanding license-funding/ceiling decisions and operational complaint compliance remain gates. No merge, deployment, production database/account change, live Stripe, DNS or automatic agreement activation is authorized or performed.
