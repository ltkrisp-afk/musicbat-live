# Authorized hosted sandbox rollout — October 15

Founder explicitly authorized release05cfe41 deployment, additive migration, guarded original-artist linkage and genuine hosted sandbox purchase. Live credentials, live payment activation and real charges remain forbidden. The central operational record is still the existing MusicBat Command Center.

Completed native deployment: version14, source59fd7965084295a1c2fe0b6e11a7e2684be11bd3, tree20d8cb5713ffeab206834d65705f3d46cc3c93e7 identical to approved GitHub05cfe41. Deploymentappgdep_6ad1498627a881918033b64ef268d856 succeeded, environmentrevision2. Existing public audience/domain preserved. Hosted purchases now contains processing_cents; no rows exist at inspection.

Public checks after deployment: / HTTP200; catalog HTTP200 with all five originals and existing sale prices; Unity HTTP200,2671395bytes, SHA2560960f654c0c9a96f5718f54b82b31a117315642f994e2dab0b97cb3fbbec45c8; Range bytes0-15 returns206/16bytes. Anonymous can_manage0 on all tracks. Checkout is intentionally503 with purchases temporarily unavailable while setup is incomplete. These prove delivery and range behavior, not audible speaker output or a completed purchase.

Hosted settings staged: MUSICBAT_STRIPE_MODE=test, MUSICBAT_CHECKOUT_PAUSED=1, MUSICBAT_PROCESSING_BPS=290, MUSICBAT_PROCESSING_FIXED_CENTS=30. Base URL and DB/BUCKET unchanged. No Stripe API credential or webhook secret was available in hosted settings, Work environment or Work credential files. The existing key is on the founder's Linux machine, which Work cannot access directly. No key was requested in chat, displayed or written to source.

## Narrow follow-up for guarded linkage
The Sites database connector exposes read-only rows. To avoid requiring founder SQL execution, this follow-up adds an explicit configuration-gated repair to the existing Connect and purchase paths, not a new administrative/SQL endpoint:
- MUSICBAT_SANDBOX_LINK_APPROVED=1 must be deliberately configured by the operator under the founder's authorization.
- Only the recorded original owner and Unity asset may qualify. Existing owner/account conflicts stop; ownership and historical purchases remain untouched.
- The key must be sandbox-only. Fresh Stripe GETs must match the known sandbox platform, existing account, local_seedy/original-owner metadata crosswalk and enabled charges/payouts/details.
- Only after verification does one guarded INSERT associate the existing account, initially readiness0. The normal eligibility refresh supplies current Stripe flags. No account creation, arbitrary remapping, live fallback or fabricated success is added.
- An authenticated original artist's normal Connect status refresh can complete linkage once credentials are configured; alternatively the first authorized unpaused purchase attempt performs the same guarded verification before issuing a quote. Checkout consent and signed webhook remain mandatory.
- A concurrent matching repair is idempotent; a conflict stops. Clearing the flag disables the one-time repair.

Validation for this follow-up: the affected commerce/readiness suites passed25 tests, plus a separate actual purchase-handler integration passed18 purchase tests after addition; TypeScript and the production build passed for the application changes. Tests cover missing/live keys, wrong platform/account/metadata/eligibility, recording mismatch, either association conflict, concurrent retries, original ownership/history preservation and no account-creation calls. The added purchase-handler test confirms linkage still cannot create Checkout without buyer quote consent. Existing unaffected Radio/UI suites were not repeated.

## Remaining founder action
Enter the EXISTING matching restricted sandbox API key privately as secret STRIPE_SECRET_KEY in hosted MusicBat environment settings. Register the PLATFORM sandbox snapshot webhook at https://musicbat.audio/api/musicbat/stripe/webhook for checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired and charge.refunded; privately enter that endpoint's own secret as STRIPE_WEBHOOK_SECRET. Do not use the Linux CLI listener's secret. No key value should be sent in chat. This cannot be completed with only the source-repository credential.

After those values are available, apply the new environment revision, verify Stripe platform/account, permit the guarded linkage, perform the authorized hosted sandbox purchase and verify one signed event,85/15 base allocation and original-file download. Keep Checkout paused until actual Stripe configuration is verified. No hosted purchase or bank payout is claimed yet.

Off-iMac access confirmed: GitHub release branch contains the complete committed candidate source; existing MusicBat-Emergency-2026-10-15.tar.gz remains in Library,14800415bytes, library IDlibfile_2544c4800af881918da554fad1012683. The archive predates this release and is not described as containing the new source. Use the GitHub source plus the existing archive and Command Center together; no repeated backup was created.
