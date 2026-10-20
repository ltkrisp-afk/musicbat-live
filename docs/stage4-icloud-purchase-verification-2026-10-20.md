# Stage 4: authenticated iCloud session recovery and hosted purchase

Recorded 2026-10-20T19:29:12Z. This is **separate-account technical acceptance controlled by the owner**, not independent-human customer acceptance.

Target: appgprj_6ad26204823c81918260d33e13429074 only.
URL: https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/
Deployed version: 19; Sites source: 2bc1d2efb8dc390f14d0d2691042de00b29bd5e5.
Deployment: appgdep_6ad68f4742a08191b12cd6bfa62d6de5, succeeded; Worker version 1d89b2e5-4af3-4733-ba85-5d135e1b1fd2; environment revision 6.
Application GitHub runtime provenance remains 2a4151faa6afcdd1d431e644654bcfa4461ead06 per the saved v19 checkpoint. This follow-up changes documentation only.

## Callback investigation and operational recovery

Confirmed failure: GET /callback returned 404 at 2026-10-20T19:16:10.804Z.
Worker request ID d0a060ddf33568d138f1b57d038d3d12; outcome ok, response status 404, same expected Worker version. Callback code/state and private request headers are omitted.

Sites get_site confirmed the existing sandbox auth client is configured and the current project is public. Deployment status confirms v19 and the expected source, not a new or mismatched deployment. The source preserves the Sites build integration and starter authentication helpers. The vendored local mock is configureServer-only, not the hosted callback implementation.

Sites identity documentation explicitly assigns /signin-with-chatgpt, /signout-with-chatgpt and /callback to platform dispatch and prohibits application implementations of those routes. Therefore an absent app/callback route is not itself an application defect. No custom callback, OAuth exchange, credential, or replacement authentication stack was added.

The failing callback was forwarded to the application with authenticated-user headers already present, and the subsequent account check still returned the owner identity. The original owner session had not been signed out before initiating account switching. This establishes the failure context, not the undisclosed internal dispatch condition that produced 404.

Corrective action used existing supported controls:
1. Top-level navigation to /signout-with-chatgpt?return_to=%2F.
2. The canonical sandbox page changed to MusicBat listener, confirming sign-out.
3. Top-level /signin-with-chatgpt?return_to=%2F.
4. The real OpenAI chooser now offered the already-authenticated iCloud account. Selected that requested account, without repeating Apple password or two-factor entry.
5. Navigation completed to the sandbox root.
6. Fresh GET /api/musicbat?view=rotunda returned a nonempty stable accountId different from the owner ID retained before sign-out, tracks=[], profile=null.
7. GET /api/musicbat?view=artists returned signedIn=true, canManage=false, artistIdentity=null, no owned artist.

Result: authenticated session recovery PASS, with no source/configuration mutation or deployment. The internal platform reason for the earlier callback dispatch miss remains unconfirmed. Do not describe this operational recovery as a proven application callback-code fix or identity collision.

## Hosted track 3 Checkout and fulfillment: PASS

Used the existing sale-enabled generated 550 Hz fixture, track 3. No recording uploaded, withdrawn fixture reinstated, or Radio test repeated.

Before: seven purchase rows, zero for track 3.
Checkout quote observed in the native browser confirmation:
- Song USD 2.00
- Buyer processing USD 0.37
- Total USD 2.37
- Artist receives 85% of song price.

Published environment confirmed MUSICBAT_STRIPE_MODE=test, base URL exactly the sandbox, processing 290 bps plus 30 fixed cents, release pause=0, secrets configured. Secret values were not printed.

Actual hosted Stripe Checkout displayed Sandbox and the two itemized lines. Used Stripe's published 4242 test card, synthetic cardholder/address data and the requested buyer email. Link save-information was unchecked. One purchase and one payment were completed; no replacement Checkout was created after a form-tool timeout.

| Evidence | Value |
| --- | --- |
| Purchase | e28285af-e826-49b9-861f-fa87af700ef7 |
| Created UTC | 2026-10-20 19:23:43 |
| Checkout | cs_test_b18VYwf7349DHTJUo68o1FPCqYI8qTrQ9k4ExpFk5dB1WTMXyIaW7AOLIj |
| PaymentIntent | pi_3USifPLKJHBmA7Jw1cjedfXj |
| Charge | ch_3USifPLKJHBmA7Jw1Sb24YcS |
| Webhook event | evt_1USifRLKJHBmA7JwkJWofUcM |
| Event type | checkout.session.completed |
| Paid UTC | 2026-10-20 19:25:50 |
| Worker webhook UTC | 2026-10-20T19:25:50.846Z |
| Worker webhook request | d182572564dedf9e37f15cc78f60763a |
| Worker webhook response | HTTP 200, outcome ok |
| D1 status | paid, cleanup_error=null, payment_review_reason=null |
| D1 allocation | artist_share_cents=170, platform_fee_cents=30, processing_cents=37 |
| Stripe mode/status | livemode=false, complete, paid; PaymentIntent succeeded |
| Stripe total/application fee | 237 cents / 67 cents |
| Destination | existing test artist acct_1UQrXtLKJHXYfqXB |
| Destination transfer | tr_3USifPLKJHBmA7Jw1zkjhNrB, gross 237 cents, reversed=false |
| Actual Stripe processing | 37 cents, balance transaction txn_3USifPLKJHBmA7Jw1oKEIj3j |

Stripe MCP independently retrieved the completed Checkout with expanded PaymentIntent, charge and balance transaction. The 67-cent application fee is 30-cent MusicBat share plus 37-cent buyer offset; gross destination transfer 237 less application fee 67 leaves the artist 170. The actual Stripe processing fee is 37, leaving MusicBat 30 net. This is the requested 85/15 base-price allocation with buyer-funded processing.

Signature evidence: the deployed webhook handler verifies stripe-signature before processing; its paid-state path independently retrieves the Session/PaymentIntent and requires matching mode, purchase metadata, total, application fee and destination. D1 stripe_events contains the new event and checkout_payment_evidence links that event to this exact purchase/session with paid_snapshot=1 and stripe_created=1792524349. This is actual delivered signed-event processing, not a synthetic success-page write.

The hosted browser returned to MusicBat with Payment confirmed. Your track is ready to download. It exposed the actual order's Download track link.
Purchased download completed through that link:
- /api/musicbat/purchase/e28285af-e826-49b9-861f-fa87af700ef7/download
- 384044 bytes, mono PCM WAV, 16000 Hz, 12 seconds
- SHA-256 68284af0d7ec16d57a9df31942122ef4f889011da62dbec6abcaa94e1213e43c
- Exact match to the prepared generated source.
The browser download event and completed file were observed; a separate HTTP status for the download was not captured in the retrieved Worker log window and is not invented.

## Account isolation: partial PASS and confirmed FAIL

PASS: the iCloud authenticated account differs from the original owner, has no managed tracks/profile, and canManage=false. Manage Songs and Shock Room tabs are absent from its hydrated UI.

FAIL against the requested Shock Room restriction: authenticated GET /api/musicbat?view=shock-room still returns two rows. Source inspection shows this read API is public while the management tab is hidden. This report does not infer a new privacy policy or silently change that established behavior.

FAIL against account-based purchase/download isolation: after switching to iCloud, this same browser could retrieve the previously paid owner receipt c985ed12-4f04-41cc-80cb-961830651251 and its download URL. D1 confirms the new and prior paid orders share the same buyer_hash (the hash itself is omitted).
The current buyerIdentity implementation authenticates receipt/download access using an HttpOnly browser cookie; purchases are not keyed to the signed-in account. Therefore this test proves successful purchase/download while a distinct iCloud account is signed in, but **does not prove an entitlement exclusively owned by that account**.

No buyer cookie was copied, printed, reset or forged. Account-based entitlement binding would require a separately reviewed application change, not a callback repair. Do not mark full separate-account acceptance PASS from this run.

## Preserved scope

No application code, financial logic, environment binding, audience, infrastructure or deployment was changed. Track 3 and the existing Radio/withdrawn fixtures were preserved. No production project, original catalog, live payment configuration or recovery job was modified. No automated suite was rerun because no source changed.

Remaining acceptance issue: enforce or explicitly settle the requested account-bound purchase and Shock Room access boundaries. Financial purchase loop and recovered distinct authentication are verified PASS; full account isolation remains FAIL.
