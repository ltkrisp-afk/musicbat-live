# MusicBat rights-engine completion — October 30, 2026

## Scope and recovery

Continuation of existing draft PR #5, branch `change/5-dollar-radio-plus-and-license-consent-2026-10-28`, from GitHub `dd83e2802616815e433500b750bf09d858b63b35`. The restored local baseline tree was checked against GitHub and equals `11d2acc827562b7fee194b6c1a8de81d3d2f2e96`. Existing recovery history, accounts, stereo, analytics, payment code and historical agreements are retained. The commit containing this report is the recoverable implementation checkpoint; its GitHub parent is the preserved baseline. No merge, deployment, production database/configuration, DNS, live Stripe or agreement activation is part of this work.

## Implemented behavior

The existing upload declaration now records prior distribution and surviving restrictions without requiring prior earnings or popularity. Nonexclusive and terminated distribution do not themselves disqualify a recording. PRO affiliation requires evaluation of the relevant authority, rather than automatic rejection. Master and composition evidence remain distinct.

The existing selected-recording Declarations & rights area now exposes private clearance status, evidence-reference submission and withdrawal of an individual authorized use. Requests append audit evidence and grant no permission. Owners and currently authorized representatives can act only on their own records; server authentication establishes identity. A configured operator reviews evidence through the bounded, same-origin API. The review feature is explicitly mode-gated and disabled unless configured. No operator or production configuration was enabled.

New append-only case events record complaints, scoped holds, counter-notices and resolutions. A mere complaint is an allegation; an operator makes the restriction decision. Authenticated artist withdrawal immediately establishes a hold on the selected use. Runtime checks enforce that hold independently of other uses, including historical-version boundaries. Download holds also prevent new purchases and sale re-enablement at the database layer. Independent delivery restrictions can block redelivery while preserving the underlying purchase record. Counter-notices and resolutions never manufacture a missing grant. Multiple cases must each be resolved. Pending case evidence prevents destructive private-audio cleanup when an offer is removed.

Clearance requires existing agreement acceptance, verified ingestion, separate master/composition authority, valid territory/term and compensation/recipient evidence. Platform-paid licenses additionally retain funding and owner-ceiling checks. Independently cleared uses needing no additional license incur no invented platform licensing charge. Reviews do not automatically publish a recording, register radio assets or activate an agreement. Unknown future agreement versions cannot inherit the historical clearance bypass.

## Contract integrity and professional review package

Historical agreement **2026-10-29.3** remains exactly **48,789 bytes**, SHA-256 `4fc7e2df7ce5de07f31284c5d733e4aaaf102821cb2cdef52ce0ffb697454e73`, with six schedules A–F. Its served text, held status and prior acceptance history were not substituted.

The complete inactive working text is [working agreement](../../legal/review/musicbat-integrated-working-agreement-2026-10-30.3.md), with [exact diff](../../legal/review/integrated-working-agreement.diff) and [integrity manifest](../../legal/review/integrated-working-agreement-integrity.json). It reconciles the existing full agreement and schedules with the submitted integrated framework; it is not registered for acceptance. Working version `working-2026-10-30.3` is 51,117 bytes, SHA-256 `b6ad46fff2c8d7611407fb0d4eb3367bfa9618f77e935306e531cf21f6ddf503`. Unsupported attorney-review assertions are removed only in this working copy. Informal owner-reported business counsel feedback is not characterized as certification. Substantive artist independence, nonexclusive permissions, financial protections and synchronization exclusion remain.

| Requirement / framework provision | Operational control and records | Verification evidence |
| --- | --- | --- |
| Ownership, limited license, authority and redistribution (Articles 1–3; rights schedules) | Existing consent/rights declarations; separate master/composition review; distributor and PRO evidence references | Independent-owner, PRO, prior-distribution, missing-composition and restricted-distributor tests |
| Marketplace and preserved entitlements (Article 4) | Existing 85/15 purchase pipeline; per-use gates; database purchase guards; independent delivery restrictions | Existing purchase allocation/entitlement suite; scoped hold and 451 delivery tests |
| Authorized free/member radio (Article 5) | Existing membership verifier and transmission/tier gates plus current scoped holds | Existing radio/membership suite; artist streaming withdrawal leaves download permission valid |
| Fixed pool and reconciliation (Article 6; Schedule D) | Existing QCMR settlement, fixed 25% newly funded pool, separate carry-forward liabilities, rounding and designated recipients | Full existing financial regression suite; no financial formula modified |
| Preservation and withdrawal (Article 7) | Append-only case/audit history; scoped withdrawal; guarded object cleanup; durable purchases | Immutable-case, deletion-preservation, withdrawal and multiple-case tests |
| Copyright complaints (Article 8) | Private notice references; operator review/hold/resolution; separate delivery decision | Counter-notice remains held; resolution grants nothing; independent cases remain enforced |
| Excluded synchronization (Article 9) | Existing excluded-service and activation gates retained | Existing legal/rights regression suite; no synchronization activation code added |
| Contract version/consent integrity (Article 10) | Immutable baseline, existing server acceptance, explicit version clearance policy | Integrity verifier and unknown-future-version regression |

This is technical implementation evidence, not a formal legal opinion. Applicable U.S. copyright review should examine 17 U.S.C. §§106, 114, 115 and 512 against the actual services, source grants and proposed text. Attempts to retrieve current official authorities in this session failed (search/open returned tool errors, Copyright Office returned HTTP 403, and GovInfo retrieval timed out). Independent current-law validation is therefore **not completed** and no compliance certification is claimed.

Professional judgment remains necessary for actual PRO/distributor grants and notice obligations; actual transmission rights/territories; copyright-agent registration and notice/counter-notice deadlines; repeat-infringer procedures; remedies/indemnification and governing law; lawful fees, consumer remedies, record retention and cross-border operation. Neither warranties nor an operator's evidence reference eliminates third-party liability. The operator must inspect and retain genuine underlying evidence. Synthetic tests do not establish rights in any real catalog recording.

## Financial integrity

No financial allocation or pricing formula changed: digital purchases retain 85% artist / 15% MusicBat, enhanced membership remains $5 monthly, and the fixed 25% newly funded QCMR pool remains separate from purchase revenue and carry-forward liabilities. Existing recipient, refund, settlement and rounding tests are retained. Platform-paid license costs remain separate; required but undecided funding/ceiling blocks that use. No artist allocation is used as a platform licensing reserve. This run does not prove actual external disbursement or substitute for billing/usage evidence.

## Schema and operations

Migration `0022_rights_operations.sql` adds `rights_case_events` and `agreement_clearance_policy`, a current-case view, append-only protections and targeted download guards; it replaces only the derived payment-eligibility view. Existing versions are explicitly classified; unknown future versions fail closed. No historical agreements, entitlements, financial rows or recordings are deleted. Existing local migration and release-transition fixtures cover the 23-migration chain; this is not a current production-copy rehearsal.

Apply the migration before new runtime code only in an authorized environment. Take a schema/data snapshot and rehearse. For application rollback, retain additive evidence tables; do not erase case history. Reverting enforcement can reopen affected uses and requires an explicit restricted-service plan and authorization. The [operations runbook](rights-operations-runbook.md) lists exact API actions, evidence, responsible operator duties and limits. [Permanent governance](../governance/MUSICBAT_LEGAL_EXECUTION_AUTHORITY.md) records the owner's execution authority and continuous, enforceable, proportional rule.

## Verification

Final local suite: **337 passed, 0 failed, 0 skipped/cancelled**. Focused rights-operation suite: **14 passed, 0 failed** (included in the full count). Typecheck, lint, production build and historical/working agreement integrity checks passed. Initial missing rights-view D1 fixture and helper-name lint issues were corrected before these final runs. External Cloudflare metadata fetch was disabled for local validation, as in the established environment.

Browser/mobile/hosted acceptance and live processor integration were **not executed in this continuation**; no screenshot or real payment completion is claimed. Current official-law retrieval was blocked as described above. Exact individual browser test counts are not known because those programs were not run. No production inspection/mutation was performed in this continuation.

## Changed files

- `AGENTS.md`; `docs/governance/MUSICBAT_LEGAL_EXECUTION_AUTHORITY.md`; this report and `docs/legal-review-2026-10-30/rights-operations-runbook.md`.
- `app/api/musicbat/rights/route.ts`; `lib/rights-operations.ts`; `lib/recording-use.ts`; `app/api/musicbat/route.ts`; `cloudflare-env.d.ts`.
- `components/recording-rights-workflow.tsx`; `components/artist-rights-declarations.tsx`; `components/artist-rotunda.tsx`; `app/musicbat-loop.tsx`; `app/globals.css`; `lib/artist-rights-declaration.ts`.
- `drizzle/0022_rights_operations.sql`; `drizzle/meta/_journal.json`; `db/schema.ts`.
- `scripts/musicbat-rights-operations.test.mjs`; `scripts/license-fixture.mjs`; `scripts/musicbat-d1-radio.test.mjs`; `scripts/musicbat-local-migrations.test.mjs`; `scripts/musicbat-release-migration.test.mjs`; `scripts/register-typescript.mjs`.
- `legal/review/musicbat-integrated-working-agreement-2026-10-30.3.md`; `legal/review/integrated-working-agreement.diff`; `legal/review/integrated-working-agreement-integrity.json`.

## Readiness and remaining decisions

**Implementation:** local automated engineering validation passed. **Legal-review readiness:** complete working text, schedules, diff, control map and evidence prepared; current authorities and actual grants still need professional evaluation. **Production activation: BLOCKED / NOT AUTHORIZED.** These are separate decisions.

Remaining release work is authentic nonproduction browser/operator acceptance, current production-copy transition rehearsal where authorized, actual recording-level evidence review and operational notice handling, then owner authorization for any contract activation, configuration, merge or deployment. Owner license-cost ceilings remain a decision only for uses requiring platform-paid licenses. There is no need to reopen the approved business model or suspend unrelated development. Current photographic receiver acceptance and separately deferred Rotunda work are not claimed complete by this legal-engine assignment.
