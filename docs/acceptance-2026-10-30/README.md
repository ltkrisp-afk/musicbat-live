# Nonproduction browser and hosted acceptance — October 30, 2026

## Result

**PARTIAL; release acceptance remains BLOCKED.** The current PR's local browser
flows were exercised and two development-adapter defects were repaired. The hosted
sandbox is older than this implementation and has no currently evidenced playable
catalog recording. No production, deployment, merge, genuine Stripe transaction,
agreement activation or hosted rights mutation occurred. Governance remains closed.

Start: existing draft PR #5 head `c1d31ddfc9d046d6721a0e0ffef648c943d2bbae`;
working tree clean. Local source tree matched the preceding committed closeout.
Current host observations were made October 30, approximately 13:38–13:48 Pacific
(20:38–20:48 UTC). Browser actions used the cloud Chromium browser, not a physical
phone. The containing commit is the recoverable test-adapter/evidence checkpoint.

## Environments and evidence boundaries

| Environment | Verified identity / source | What the evidence establishes |
| --- | --- | --- |
| Local managed preview | Current PR checkout; Sites daemon at `http://terminal.local:4173/`; existing development-only acceptance adapter | Actual application components/routes with synthetic musician and patron identities, generated WAV fixtures, an isolated database and a processor simulator that blocks outbound payment requests. No genuine registration, external authentication, real catalog clearance or Stripe completion is established. |
| Existing Stage 4 Sandbox | Project `appgprj_6ad26204823c81918260d33e13429074`; version 20, source `a9bc1ad45a47e3cc45f04c6119d536bfac384cb2`; existing signed-in owner session | Read-only environment/database observations and browser navigation in the existing deployment. This is not deployment of current PR #5. |

Hosted URL: https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/ .
Environment revision 6 explicitly reports `MUSICBAT_STRIPE_MODE=test` and release
pause `0`. Secret values were not printed or copied. The sandbox contains four
recordings: three withdrawn generated tones and active `Unity`. The only two
`playback_permissions` rows belong to withdrawn, expired test tones; no playback
permission row was returned for Unity. The browser reports a quiet/unavailable
station with disabled Play. No tone was substituted as successful catalog playback
and no artist grant or operator approval was invented.

The hosted schema contains the earlier account/radio/purchase tables but lacks the
newer versioned consent, personal-account observation and rights-case tables. The
hosted UI still shows the older `$3` planned-membership label. The current local
implementation shows `$5`. These are deployment discrepancies, not grounds to
change the current approved price or activate the held agreement.

## Defects repaired

1. **Missing local rights route.** The selected recording's rights panel displayed
   “Rights status is unavailable.” The adapter had not mapped `/api/musicbat/rights`
   to its existing application handler. It now does. Browser rerun displayed recorded
   decisions and retained-request count without error. A regression verifies owner
   access, stranger denial, review-request retention, member-stream withdrawal and
   unaffected sale enablement.
2. **Managed preview origin mismatch.** The simulated membership checkout failed
   with `MUSICBAT_BASE_URL must use HTTPS.` The existing adapter supported loopback
   URLs but the managed proxy uses `terminal.local`. Only the development adapter now
   translates the explicitly enabled managed request to its loopback fixture origin
   and translates loopback redirects back. Foreign-origin submissions are rejected
   before translation. Production HTTPS, same-origin and payment-mode checks are
   unchanged. Browser rerun completed simulated subscription and purchase checkout;
   a regression verifies the managed origin, safe redirect, disabled-mode pass-through
   and foreign-origin rejection.

Changed source files: `scripts/local-acceptance.mjs` and
`scripts/musicbat-local-acceptance.test.mjs`. Remaining new files are this evidence
report and three screenshots. No application route, financial engine, agreement,
schema or production configuration changed. The preview used temporary development
flags and its existing TypeScript loader; `package.json` was restored byte-for-byte
before final regression/build checks. Ignored local profile state was adjusted for
the managed preview and restored for the standard local validation environment.
The preview was stopped after testing.

## Browser case ledger

Each row is one bounded manual acceptance case, not an assertion that an entire
feature or external integration passed. Final ledger: **22 PASS, 1 FAIL, 6 BLOCKED,
3 NOT RUN**. Earlier local failures in cases L05 and L11 were repaired and rerun;
the final PASS counts do not erase that defect history.

| ID | Case | Outcome | Observed evidence / limit |
| --- | --- | --- | --- |
| L01 | Musician overview | PASS | Concise welcome, counts and account section navigation; no expanded rights/upload administration. Synthetic identity. |
| L02 | Compact catalog and selected details | PASS | Three compact selectable entries; individual recording analytics and collapsed management. |
| L03 | Listening and voting analytics | PASS | After the browser session, recording 3 showed 2 observed sessions, 14.8 seconds, 24.7% average heard, zero verified completions, two early exits and one positive period vote. These are local fixture observations; other preseeded fixture metrics are not represented as newly earned activity. |
| L04 | Creation declaration display | PASS | Human, Human + AI and AI catalog classifications; selected declaration and retained upload-history timestamp. No new declaration was submitted. |
| L05 | Private rights status | PASS | Before repair: unavailable. After repair: no independent use decisions recorded, zero retained requests, existing review form available. No synthetic review was presented as real clearance. |
| L06 | Listener account separation | PASS | Patron fixture exposes listening collections and preferences without musician catalog/analytics sections. Distinct fixture identity, not a second genuine hosted account. |
| L07 | Logout / role transition | PASS | Sign out returns to isolated role selector; musician and patron re-entry show corresponding account views. |
| L08 | Durable preferences | PASS | Start muted saved with success feedback and remained checked after reload and data load. |
| L09 | Local fixture playback | PASS | Media `paused=false`, `readyState=4`, advancing time and no media error; private channel audio URL. Generated audio only; not real catalog acceptance or an independent audibility measurement. |
| L10 | Free restrictions | PASS | Free category controls cannot confirm paid tuning; More/Less/Keep disabled on free station even with active membership. |
| L11 | Simulated membership checkout | PASS | After adapter repair: $5 recurring disclosure, simulator checkout and paid member controls. No card or external Stripe payment. |
| L12 | Keyboard directed tuning | PASS | ArrowRight on existing dial tuned Jazz, then current category and private audio URL reflected Jazz. Current receiver uses immediate tuning; this is not the deferred rotate-and-confirm floating Rotunda implementation. |
| L13 | Qualified paid voting | PASS | Paid station initially disabled votes with listening-duration explanation; after qualification, positive vote returned “More like this recorded.” |
| L14 | Saved recording | PASS | Save changed to Saved recording; distinct saved collection/count retained in listener account. This does not create ownership. |
| L15 | Purchase quote | PASS | $2.00 base + $0.37 buyer processing = $2.37; disclosed 85% artist allocation. Fixture fee schedule only. |
| L16 | Simulated purchase confirmation | PASS | Simulator displayed $1.70 artist / $0.30 platform; account history recorded paid test purchase and separate processing. Handler regression independently inspects recorded allocations. |
| L17 | Authorized download | PASS | Actual browser download from the account-owned purchase link completed. Synthetic WAV bytes only. |
| L18 | Radio-only withdrawal | PASS | Musician selected recording 3 → Manage → Remove from Radio. Status became Radio withdrawn while Sales enabled remained. No production recording changed. |
| L19 | Re-download after withdrawal | PASS | Patron re-login retained purchase; second download hash exactly matched the first. |
| L20 | Mobile navigation | PASS | Existing 390px iframe shows compact account select; keyboard Down/Enter opens collections. This is responsive iframe acceptance, not touchscreen or Safari acceptance. |
| L21 | Current artist profile | PASS | Browser link navigated to local artist slug and displayed the catalog; current source does not reproduce the hosted profile failure. |
| L22 | Account-to-radio navigation | PASS | Semantic link click reached `/?view=radio` and rendered current receiver. Early immediate snapshots were inconclusive; explicit navigation completion verified. |
| H01 | Hosted artist-profile link | FAIL | Clicking The Enucleators left URL/page unchanged; console recorded `[vinext] RSC prefetch setup error: TypeError: f is not a function` and click transition `TypeError: e is not a function` in the older hosted chunk. No obsolete-build-only patch was applied to the working current source. |
| H02 | Hosted current-PR account acceptance | BLOCKED | Version 20 / earlier source and missing newer schema. No deployment authorized or performed. |
| H03 | Authorized hosted catalog playback | BLOCKED | Unity active but lacks recorded playback permission; three tones withdrawn. Play disabled. |
| H04 | Genuine separate-account registration/authentication | BLOCKED | Only existing owner identity available in hosted browser. Local role fixtures do not satisfy this gate; no external credentials or new account created. |
| H05 | Genuine Stripe test checkout and webhook | BLOCKED | Hosted current-version/current-catalog prerequisites unmet. Only local simulator exercised; no genuine charge or signed external event generated in this assignment. |
| H06 | Hosted scoped withdrawal | BLOCKED | Current rights-case implementation/schema not deployed; no hosted artist permissions altered. |
| H07 | Hosted current membership-pool integration | BLOCKED | Newer financial/evidence implementation not present in observed host schema; automated accounting regressions are separate evidence. |
| U01 | New upload / metadata / agreement dialog browser submission | NOT RUN | Held agreement not activated; no binding contract accepted or new recording uploaded. Existing automated upload/metadata/consent regressions retained. |
| U02 | Simultaneous-browser synchronization, network-loss recovery | NOT RUN | Existing automated browser programs were not executed in this CUA run. No claim of new two-browser drift measurement. |
| U03 | Full mobile/touch/accessibility matrix | NOT RUN | 320/375/768 widths, touch gestures, reduced motion and full keyboard-dialog program not executed. One 390px keyboard navigation case does not replace them. |

Download SHA-256 before and after radio withdrawal:
`9642c22b8e33057c744c73d20fbaea785f951b3a3363a98772470c5dcfc78652`.
The download is a fixture, not a licensed production recording.

## Automated verification

Focused adapter suite: **5 passed, zero failures/skips**. The original three tests
are preserved and two regressions were added. Final full regression: **339 passed,
zero failures/skips/cancelled**. Typecheck, lint, build and agreement integrity:
**PASS**. Historical agreement remains held and byte-identical. No earlier 337-test
checkpoint result was substituted for this fresh run. Check output is recorded in
the local execution logs; new GitHub check status is reported separately after commit.

Existing regressions cover scoped use holds, stranger/self-approval denial, forged
reviewer/origin/mode rejection, immutable case evidence, separate delivery restrictions,
85/15 allocation, fixed 25% new QCMR pool, carry-forward, rounding and entitlement
preservation. Those are handler/database/financial tests, not hosted disbursement,
legal approval or successful real-catalog streaming evidence.

## Screenshots

All are actual browser captures of the current application using explicitly synthetic
local data. They establish observed layout and state only; photographic design
acceptance remains separate.

- [Local receiver](musicbat-local-radio-acceptance-20261030.jpg)
- [390px listener collections](musicbat-listener-mobile-acceptance-20261030.jpg)
- [Musician observed analytics](musicbat-musician-analytics-acceptance-20261030.jpg)

## Remaining gates and continuation

Current PR hosted acceptance requires an explicitly authorized nonproduction deployment
and migration rehearsal against retained sandbox data, a recording with documented
current authority, and genuinely separate test identities. This assignment did not
change the hosted site or renew/forge any permission. Actual external Stripe test-mode
checkout/webhook, membership/settlement evidence, uploads/consent browser coverage,
concurrent playback/recovery and full mobile/accessibility checks remain open.

No new legal drafting, governance revision or business-model decision is required to
continue those engineering tasks. No production change, merge, deployment or agreement
activation is authorized by this report. Receiver visual refinement is not reported
complete, and was not started as a substitute for blocked acceptance.
