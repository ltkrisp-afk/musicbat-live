# Owner-operated separate-account acceptance: authentication blocked

Observed 2026-10-20, recorded at 2026-10-20T19:16:47Z.
Target: existing MusicBat Stage 4 Sandbox, appgprj_6ad26204823c81918260d33e13429074.
This is a separate-account technical test controlled by the owner, not an independent-human customer test.

## Observed browser sequence

1. Existing owner session was confirmed with GET /api/musicbat?view=rotunda. Its accountId equalled artist_id on the existing tracks 1, 2 and 3.
2. Opened /signin-with-chatgpt?return_to=%2F and selected Use another account on the real OpenAI chooser.
3. An earlier Google-method attempt returned the existing owner session. It did not test the iCloud identity.
4. On the requested iCloud attempt, OpenAI email sign-in directed to Apple. Apple initially rejected account information. After the owner corrected the password, secure browserAuth entry succeeded and Apple requested two-factor verification.
5. Secure verification completed. Chose Don't Trust for persistent browser trust.
6. Apple displayed the intended iCloud account. OpenAI consent then displayed that same requested account for MusicBat Stage 4 Sandbox.
7. Continuing returned to the sandbox /callback path, which rendered 404: This page could not be found.
8. Per authentication recovery guidance, opened a fresh tab at the sandbox canonical origin. The site rendered, but a fresh GET /api/musicbat?view=rotunda still returned the original owner accountId, the existing artist profile, and can_manage=1 on tracks 1, 2 and 3.

Credentials, verification codes, callback authorization code/state and full stable user IDs are intentionally omitted. No secret was requested in chat or entered through a model-visible API.

## Results

| Check | Result |
| --- | --- |
| Apple authentication and intended account on OpenAI consent | PASS |
| MusicBat listener session establishment | BLOCKED: callback 404; original owner identity still observed |
| Different stable MusicBat user ID | BLOCKED: returned ID equals original owner ID |
| Listener isolation from owner management and purchases | NOT RUN under a verified distinct listener identity |
| Track 3 Checkout, signed webhook, paid allocation and download | NOT RUN: stopped before purchasing under the explicit same-ID stop condition |

The observations do not establish that the iCloud identity itself maps to the owner's Gmail identity. A failed callback or unchanged session can explain the returned owner identity; the exact cause has not been established. No application defect or required code correction is asserted from this observation alone.

Next required work: diagnose the existing Sites sign-in callback/session completion using supported platform controls, then establish the distinct authenticated listener and an independent buyer session before the one requested track 3 transaction. Existing purchase authorization is browser-cookie-bound per the saved checkpoint; do not label it account-bound without further evidence.

No Checkout, payment, refund or new download entitlement was created in this attempt. Track 3 was not modified. No Radio or recovery tests were repeated. No source logic, financial allocation, deployment, production resource, or live Stripe setting was changed.
