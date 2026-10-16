# Restricted Stripe sandbox credentials

Development baseline: `ce962c9b5033c1fd4dbfbe033ec7b83097347a6f`.

Both server payment clients now accept `rk_test_` as well as `sk_test_` credentials through the existing STRIPE_SECRET_KEY binding. Test credentials cannot authorize live-mode requests. Live restricted credentials remain rejected. Radio Plus remains test-only. No schema, purchase snapshots, consent, payment allocation, webhook verification, or download authorization logic changed. The live-only stripe-readiness script is intentionally unchanged and must not be used for sandbox readiness.

## Sandbox Connect Accounts v2 repair

Linux sandbox attempts reached Stripe but failed with HTTP 400 because new Connect account creation through Accounts v1 was blocked. The user reported enabling the compatibility policy in the sandbox; the same API error persisted. That does not establish whether the policy changed in the account associated with the key.

Sandbox onboarding now uses `POST /v2/core/accounts` and `POST /v2/core/account_links`, JSON bodies, and pinned `Stripe-Version: 2026-09-30.endive`. The account requests Express Dashboard access, Merchant/card_payments and Recipient/stripe_balance.stripe_transfers capabilities. Fee and loss responsibility remain assigned to the application, matching the previous Express setup. Country defaults to the platform country retrieved from `GET /v1/account`; no artist legal name or entity type is invented. The v2 idempotency key has a separate stable namespace from the previous v1 request.

The account's `livemode` must be false before storing its ID. Account links must reference that stored account and have `livemode: false`; redirects permit only exact HTTPS accounts.stripe.com or connect.stripe.com origins without embedded credentials. Repeated onboarding reuses the stored account; a failed v2 request never falls back to v1 or a broader key. Existing live-mode code continues using its previous v1 path. No production deployment or settings changes were made.

Linux subsequently reached the v2 onboarding-link request but Stripe rejected `use_case.account_onboarding.configurations` as an unknown request field. That property was mistakenly copied from a response shape. It has been removed: the pinned Endive link request sends `account`, `use_case.type`, and `use_case.account_onboarding` with only `return_url` and `refresh_url`. Capabilities/configurations remain on the Account creation request, where they belong. The strict fixture reproduces the original 400-style rejection before the repair and accepts the corrected request; all nine affected Connect/security tests plus TypeScript and changed-file lint pass. Existing stored accounts are reused, so this correction does not create a replacement account or require credential/database changes. Actual corrected link acceptance remains pending Linux retry.

Existing account readiness retrieval remains `GET /v1/accounts/{id}`, using Stripe's documented Accounts v2/v1 interoperability. The existing `acct_` ID is retained for Checkout destination charges. Purchase, refund, webhook and download handlers were not rewritten. Existing v1 accounts used through v2 onboarding can be subject to Stripe's documented conversion availability delay; no account is silently replaced to bypass it.

The permission audit below predates this repair: sandbox account and account-link writes now target v2 rather than v1. Platform Accounts Read remains necessary for country/readiness checks. Actual grants for v2 creation and both requested configurations must be confirmed against the sandbox key; fixture tests cannot establish Stripe key permissions. No additional privileges were enabled.

Sources: https://docs.stripe.com/api/v2/core/accounts/create ; https://docs.stripe.com/api/v2/core/account-links/create ; https://docs.stripe.com/connect/accounts-v2 ; https://docs.stripe.com/connect/accounts-v2/connected-account-configuration ; https://docs.stripe.com/connect/marketplace/tasks/create

## Permissions from the source audit

These resource labels follow Stripe's published permission reference. This is the minimum direct-operation mapping, not a claim that the account's actual restricted key has been tested or that implicit Checkout dependencies have been verified.

| Resource | Access | Operation |
| --- | --- | --- |
| Accounts | Read | GET /v1/accounts/{id}; GET /v1/account for sandbox creation defaults and in the separate readiness script |
| Accounts creation | Write operation; exact grant unresolved | POST /v2/core/accounts in sandbox; unchanged POST /v1/accounts in live code |
| Account Links | Write | POST /v2/core/account_links in sandbox; unchanged POST /v1/account_links in live code |
| Checkout Sessions | Write (includes Read) | POST /v1/checkout/sessions in payment and subscription modes; GET /v1/checkout/sessions/{id} |
| Payment Intents | Read | expand[]=payment_intent during purchase webhook verification |
| Charges and Refunds | Read | GET /v1/charges/{id} verifies refund evidence; no refund creation calls |
| Subscriptions | Write (includes Read) | GET /v1/subscriptions/{id}; POST /v1/subscriptions/{id} with cancel_at_period_end=true |
| Invoices | Read | GET /v1/invoices/{id} verifies paid membership periods |
| Events | None | Incoming events verified locally; no Events API calls |
| Webhook Endpoints, Event Destinations | None | No API registration or endpoint management |
| Transfers, Payouts, Application Fees, Login Links | None for direct API calls | No direct calls; destination and fee are set within Checkout |

No direct Customers, Products, Prices, or Payment Methods API calls exist; Checkout receives inline price_data/product_data and creates related resources. Do not add broad write access preemptively: record any sandbox permission error for this exact request shape before deciding whether a dependency is required. Requests use platform context; no Stripe-Account header is sent.

Stripe's restricted-key guide states every API supports restricted keys. Its Stripe Apps reference lists only connected_account_read for Accounts, so that reference does not identify a grant for Express account creation. Account creation is not proven supported or unsupported for the configured key. No unrestricted-key fallback or silent permission escalation was added. Failed Stripe requests remain failures.

The destination-charge calculation remains artistShare=round(base*85/100); platformShare=base-artistShare. Checkout total=base+buyerProcessing; application_fee_amount=platformShare+buyerProcessing. The artist receives total minus that application fee. Actual Stripe fees and settlement remain sandbox acceptance items.

## Verification

30 affected automated tests passed, including rk_test_ Connect route authorization/onboarding, credential forwarding and permission-error propagation, Checkout split and buyer processing, signed purchase/download verification, historical ledger preservation, refund replay, webhook body limits, and restricted-key subscription activation/renewal/cancellation/expiry. Invalid prefixes and cross-mode keys fail closed. TypeScript, changed-file ESLint, build and git diff --check passed.

All processor tests use isolated fixtures and disposable in-memory databases; none are actual Stripe requests. Sandbox credentials and both webhook signing secrets are absent from this execution environment. The application-side key-format blocker is removed; actual Express onboarding, Checkout permissions/dependencies, signed Stripe webhook delivery and settlement are still unverified. No deployment, live request, infrastructure or Stripe settings change was made.

For the subsequent v2 repair, 29 affected tests passed: 22 Connect/security/purchase/key-mode checks, four new v2 checks, and three offline adapter checks. TypeScript, changed-file ESLint and build passed. The v2 tests validate JSON and version headers, requested capabilities/responsibilities, stable idempotency, existing account and paid-purchase preservation, permission failures without fallback, cross-mode rejection and exact-origin redirect validation. These results do not establish actual Stripe sandbox v2 acceptance; Linux must update and retry with its privately stored sandbox key. No database migration or credential update is required for this repair.

References:
- https://docs.stripe.com/keys/restricted-api-keys
- https://docs.stripe.com/stripe-apps/reference/permissions
- https://docs.stripe.com/connect/destination-charges
