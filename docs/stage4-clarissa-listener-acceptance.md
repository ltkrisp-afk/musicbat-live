# Separate listener purchase/download — prepared for Clarissa

Status: **BLOCKED pending participant sign-in and sale-ready generated fixture**.
Prepared against sandbox v19, Sites source
`2bc1d2efb8dc390f14d0d2691042de00b29bd5e5`; GitHub runtime
`2a4151faa6afcdd1d431e644654bcfa4461ead06`.

Target only:
https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/

## Readiness gate before requesting Clarissa's time

1. Re-read the existing sandbox deployment, test-mode readiness, test artist Connect
   readiness and generated asset. Never select Minimum Loop or musicbat.audio.
2. Current track 1 is withdrawn; do not reinstate it. Current track 2 is Radio-only
   and not for sale; do not silently repurpose its Radio permission as sales consent.
3. Prepare a fresh, clearly named purchase-only test tone using the existing
   `tone(12000, 440)` generator in `e2e/fixtures.mjs`: PCM WAV, 16000 Hz mono,
   384044 bytes, SHA-256
   `571c17392f99b183533d06ae6c324b21df37c5f4e678df36a77303f528812f0f`.
   Upload through existing sandbox artist controls, explicitly attest generated
   recording/composition and sales rights, set the intended test price, and verify
   the existing artist test-account association. Do not copy original music,
   create infrastructure or run acceptance setup that modifies the working Radio.
4. Confirm sale_enabled, sales rights, price, stored WAV/hash and existing Stripe
   test configuration before starting a listener Checkout. Do not create a Checkout
   merely to preflight or reuse the owner's completed purchase as her evidence.

## Distinct listener browser session

When Clarissa is available, open the supported sign-in screen and request her
existing authorized ChatGPT account through the secure browserAuth flow.
Never request passwords/codes in chat or assume an email address. Stop for actual
participant interaction when required. Record distinct account roles without
publishing private account identifiers.

Use Clarissa's own separate browser/session, rather than logging her into the
owner's purchase-bearing session. Current purchase/download ownership is a
device buyer cookie/hash (`app/api/musicbat/purchase/buyer.ts`), not an account
entitlement. Verify an independent buyer identity without printing its value;
account switching alone does not prove purchase isolation. Do not transfer the
owner's cookie or entitlement. If the cloud browser cannot provide an isolated
session, use her browser with observed evidence or report that limitation.

## One necessary new test transaction, then download

* Confirm listener has no artist management rights. Open only the fresh generated
  fixture listing. Record the actual quoted base, buyer processing offset and total;
  retain existing 85/15 evidence without rerunning its generic test matrix.
* Complete one genuine Stripe test-mode Checkout using published test payment
  details, no real card, live charge, saved payment method or subscription.
  Record Checkout/purchase/event IDs and UTC timestamps, never secrets.
* Verify the signed test webhook persisted paid state for that purchase, then
  download in the same listener session. Record HTTP result, byte count and SHA-256
  matching the generated WAV above.
* Check another independent buyer session cannot retrieve this receipt/download.
  Do not label cookie-bound access as cross-device/account-based purchase access.
* Preserve the existing withdrawal PASS; do not withdraw or repurchase unrelated
  fixtures to repeat completed work. Leave the new purchase/receipt auditable.

Record PASS only with observed separate sign-in, actual test purchase and verified
download. Use FAIL for reproducible incorrect behavior and BLOCKED for missing
participant/session/fixture readiness. Do not declare full Stage 4 acceptance until
both separate-listener acceptance and the requested recovery evidence are complete.
