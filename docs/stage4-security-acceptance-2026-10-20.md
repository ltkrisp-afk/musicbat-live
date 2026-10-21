# Stage 4 security correction and hosted acceptance — October 20, 2026

## Result and scope

**Security corrections: VERIFIED. Full Stage 4 acceptance: BLOCKED by one unresolved historical purchase ownership review.**

This is separate-account technical acceptance controlled by the owner, not an independent-human customer test. No new purchase was made. Existing financial acceptance remains preserved.

Only project `appgprj_6ad26204823c81918260d33e13429074` was deployed. Production project `appgprj_6aaa2f4673e88191b504cf941f475802` and musicbat.audio were not changed. No Stripe write operation, live charge, infrastructure creation, catalog modification, recovery reset, or Radio engine change occurred in this correction.

Recorded observations use UTC. Continuation observations on 2026-10-21 UTC occurred on October 20 in America/Los_Angeles.

## Revision reconciliation

- Authoritative branch: `repair/85-15-authoritative-2026-10-18`.
- Tested GitHub code commit: `dd46fe9f8ae4baf50249e48b802e545368ca6fcd`.
- Deployed Sites source: `a9bc1ad45a47e3cc45f04c6119d536bfac384cb2`.
- Sandbox version: **20**.
- Saved version: `appgprj_6ad26204823c81918260d33e13429074~appgver_09bde474757c8191867058dcc35593ac`.
- Deployment: `appgdep_6ad7c47a62e881918f12314663a45e9d`, succeeded; environment revision 6.
- Worker revision observed in the successful hosted download log: `10628f2f-7aa8-455a-bfc6-7dd979d75d53`.
- Sandbox: https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/
- All **17 changed source/test/migration files** were compared byte-for-byte between the GitHub code commit and the restored Sites checkout at the deployed SHA: all matched.
- The continuation initially found a stale local checkout at `2bc1d2efb8dc390f14d0d2691042de00b29bd5e5`. Its four untracked evidence documents were first compared to deployed source (all identical), preserved separately, then the supported Sites helper fast-forwarded the checkout. No reset, overwrite, deployment, or production operation was used.
- This report is a later documentation-only GitHub commit; it does not imply another sandbox deployment.

## Confirmed root causes and correction

### Purchase ownership

Creation, receipt reads and purchased downloads previously relied on the `musicbat_buyer` cookie hash. The cookie survived an account switch and did not establish authenticated-account ownership. Stripe settlement stored payment state but never attached a stable buyer account.

The additive migration `0015_purchase_account_ownership.sql` adds nullable `purchases.buyer_account_id`, an account lookup index, and `purchase_ownership_audit`. It does not backfill guessed owners or rewrite financial snapshots.

- Purchase POST now requires the platform-authenticated user, persists that stable ID before calling Stripe, and includes it in Checkout/PaymentIntent metadata.
- Pending Checkout reuse is scoped to the account. Unowned historical pending/review orders block replacement payment rather than silently creating another Checkout.
- Receipt GET, account purchase listing and download GET authorize against the stable account ID; the buyer cookie no longer grants a download.
- Signed webhook, allocation, refund and recovery processing do not reassign ownership. Their implementation files were unchanged.
- “My purchased music” exposes the signed-in account's paid downloads after reauthentication.
- Legacy recovery is explicit, not automatic. It requires the original browser credential, an actual paid/complete Stripe Session with matching order metadata/mode, and its receipt email matching the platform-authenticated account email. The first claim is recorded atomically in an ownership audit; existing ownership cannot be replaced. Missing/conflicting evidence fails closed for review.
- Cookie possession or a request-supplied account/email alone never assigns ownership. Purchases without sufficient original-device/receipt evidence need manual review; there is no invented administrative backfill.

### Shock Room

`GET /api/musicbat?view=shock-room` previously returned analytics for all active tracks without authentication or artist authority. The public tracks response also exposed private aggregate fields.

- Shock Room now requires authentication plus artist/representative authority and returns only authorized tracks.
- Global category ranking is calculated before authorized-row filtering so existing ranking behavior is preserved.
- Listener/public catalog responses omit Shock Room metrics, including purchase, completion and repeat counts.
- Management, export and cleanup views retain their existing account-specific filters.
- The browser analytics reader tolerates expected listener 401/403 responses so private analytics denial cannot prevent loading the public catalog/Radio. UI visibility is not the authorization boundary.

Affected implementation: purchase route, purchased-download route, main MusicBat API route, the existing MusicBat page's purchase/analytics readers, schema and migration. Retrofutura, its tuning dial, persistent player, scheduler and audio routes were not changed.

## Automated evidence — PASS

The source-change execution completed:

| Check | Result |
| --- | --- |
| Full automated suite | **266 passed, 0 failed, 0 skipped** |
| TypeScript | PASS |
| ESLint | PASS |
| Build via existing Sites environment wrapper | PASS |
| Whitespace/diff check | PASS |

The continuation preserved that completed run rather than rerunning it merely because the session resumed. The successful count is also recorded on the tested GitHub commit. Earlier intermediate failures from old public-analytics expectations and test identity import loaders were corrected before the final 266-test pass.

Regression coverage includes account persistence without buyer cookies and after cookie changes; logout and reauthentication; cross-account denial; authenticated purchase creation and Stripe account metadata; explicit legacy proof checks and immutable claims; old pending-order replacement prevention; listener and expired-session rejection; owner/other-artist filtering; public analytics omission; settlement/refund/withdrawal and recovery compatibility. Cross-artist tests use the actual handlers with separate fixture identities; a second hosted artist was not created.

## Hosted evidence

| Observation | Result | Evidence |
| --- | --- | --- |
| Explicit recovery of existing iCloud purchase | VERIFIED | Purchase `e28285af-e826-49b9-861f-fa87af700ef7`; audit created **2026-10-20 19:44:33 UTC**, evidence type `original_device_and_authenticated_receipt`. D1 owner equals the actual iCloud stable user ID and differs from the original owner ID. |
| First post-recovery download | VERIFIED | Browser download at **2026-10-20T19:45:08.604Z**, 384044 bytes, matching SHA-256 below. |
| Logout denial | VERIFIED | Earlier hosted observation showed “Sign in to access purchased music” and unauthenticated Shock Room denial. Continuation also logged private API HTTP 401 at **2026-10-21T01:33:31.282Z**, request `b240ed75c902f477096922fe25c645b7`. |
| iCloud signs in again | VERIFIED | Existing supported ChatGPT account chooser returned successfully to the sandbox. No password or Apple authentication was repeated. |
| Account purchase rediscovery | VERIFIED | At **2026-10-21T01:28:36.257Z**, “My purchased music” listed the same existing paid track with its download link. No recovery action or purchase repeated. |
| Download after restored sign-in | VERIFIED | HTTP **200**, **2026-10-21T01:28:53.389Z**, request `b5e0e0da5f63321e5b5d842c24be4245`; browser download completed **01:28:56.095Z**. Same 384044-byte file and SHA-256. |
| Listener management context | VERIFIED | **2026-10-21T01:29:44.386Z**: no artist profile, zero manageable tracks, stable ID differs from original owner. |
| Listener Shock Room API | VERIFIED | HTTP **403**, **2026-10-21T01:29:44.531Z**, request `0cbfa947368bda29a7d6ba8954439973`; body “Artist access is required for Shock Room.” A fresh confirmation at **01:32:12.291Z**, request `27e73ca05a2174fb7a0f061162cfa3a2`, also returned 403. |
| Listener artist payment-management API | VERIFIED | HTTP **403**, **2026-10-21T01:27:47.235Z**, request `b4d89c640e41cea1195b6e7ed0866395`, `/api/musicbat/stripe/connect`. |
| Owner cannot download iCloud purchase | VERIFIED | Actual owner stable ID confirmed, then HTTP **404**, **2026-10-21T01:34:08.489Z**, request `6835e70d74ed5302e8c7176f006ffa3f`. Inherited browser state did not transfer access. |
| Owner management access | VERIFIED | At **2026-10-21T01:34:08.372Z**, original owner ID and three manageable tracks. Earlier hosted Manage Songs page displayed the existing three tracks and artist controls. |
| Owner Shock Room access | VERIFIED | At **2026-10-21T01:36:22.188Z**, two active-track rows; every row belonged to its manageable tracks. |
| Second physical browser / physical iPhone | NOT RUN | No claim of a physical second-browser/device test. Cookie-independent authorization is covered by real-handler regressions; hosted logout/account switching and restored sign-in were exercised. |

Downloaded generated 550 Hz fixture SHA-256:

`68284af0d7ec16d57a9df31942122ef4f889011da62dbec6abcaa94e1213e43c`

## Preserved financial and data evidence

D1 still contains **eight purchases**, **two paid orders**, **two checkout payment-evidence rows**, and **six Stripe event rows**. The accepted iCloud purchase remains paid with base 200 cents, artist 170 cents, MusicBat 30 cents, buyer processing 37 cents, and its original Checkout Session. The only new ownership assignment was the explicitly recovered iCloud order, with one audit entry. The attempted historical recovery below did not change its owner or payment record.

Existing signed webhook evidence remains `evt_1USifRLKJHBmA7JwkJWofUcM`, delivered HTTP 200 at **2026-10-20T19:25:50.846Z**, request `d182572564dedf9e37f15cc78f60763a`. It was not replayed for this acceptance. No new Checkout or Stripe mutation was initiated.

Completed recovery evidence is preserved; no jobs were reset or run as part of these security checks. Radio was not reopened for acceptance: its expired/absent eligible test recording was not classified as a code regression and its permissions were not changed.

## Historical purchase review — BLOCKED, safely retained

The older paid order `c985ed12-4f04-41cc-80cb-961830651251` remains unassigned. Its original-device recovery prompt was available, but explicit recovery under the actual Gmail owner failed closed:

- GET receipt HTTP **409**, **2026-10-21T01:34:09.065Z**, request `59d46e61bf2020c4db34f4538d0de391`.
- Recovery POST HTTP **403**, **2026-10-21T01:34:35.112Z**, request `0540aacd68bc1a948c7dbd169317641a`.
- Body: “The receipt does not establish ownership for this signed-in account. Purchase recovery requires review.”
- An independent **read-only Stripe retrieval** established: the saved Session ID matches; livemode is false; Session is complete and paid; order metadata matches; a receipt email is present, but it matches **neither** the Gmail owner account nor the iCloud buyer account.
- No email address, credentials or session secret is included in this report. No ownership guess, receipt edit, Stripe mutation, payment or download grant was made.
- The paid record and original audio remain preserved.

Required resolution: establish the original historical purchaser's account using receipt and prior acceptance evidence. If its receipt email was a synthetic test address, record an explicit, reviewed owner-to-account mapping before any administrative recovery. Do not force-link it to Gmail or iCloud based only on a shared browser cookie. This review is the remaining blocker to claiming every historical paid download has been recovered.

## Earlier callback 404 — cause UNRESOLVED, operational sign-in VERIFIED

Earlier Worker evidence recorded `/callback` HTTP 404 at **2026-10-20T19:16:10.804Z**, request `d0a060ddf33568d138f1b57d038d3d12`. The internal platform reason was not established. Supported sign-out followed by the existing account chooser restored authentication. Both accounts subsequently returned successfully to the sandbox; the iCloud stable ID is distinct.

Sites Dispatch owns the sign-in, sign-out and callback routes. No speculative application callback implementation or redirect rewrite was introduced. This unconfirmed historical cause is documented separately and does not invalidate the successful account-owned download test.

## Acceptance decision

- **VERIFIED / PASS:** durable account-owned iCloud entitlement, download after restored authentication, cross-account denial, server-side Shock Room isolation, original artist management, deployed revision reconciliation, preserved 85/15 and processing snapshots, automated checks.
- **FAILED:** no remaining failed automated checks; the earlier unsafe authorization behavior is corrected.
- **BLOCKED:** recovery/ownership assignment of the older historical paid fixture until original purchaser evidence is reviewed.
- **UNRESOLVED, nonblocking:** internal cause of the earlier callback 404.
- **NOT RUN:** separate physical browser/iPhone testing; no new transaction or Radio/recovery acceptance rerun.
- **Full Stage 4 acceptance is not declared.** Preserve the accepted $2 purchase and resolve the historical ownership review without another charge.
