# Restricted Stripe sandbox credentials

Development baseline: `ce962c9b5033c1fd4dbfbe033ec7b83097347a6f`.

Both server payment clients now accept `rk_test_` as well as `sk_test_` credentials through the existing STRIPE_SECRET_KEY binding. Test credentials cannot authorize live-mode requests. Live restricted credentials remain rejected. Radio Plus remains test-only. No schema, purchase snapshots, consent, payment allocation, webhook verification, or download authorization logic changed. The live-only stripe-readiness script is intentionally unchanged and must not be used for sandbox readiness.

## Permissions from the source audit

These resource labels follow Stripe's published permission reference. This is the minimum direct-operation mapping, not a claim that the account's actual restricted key has been tested or that implicit Checkout dependencies have been verified.

| Resource | Access | Operation |
| --- | --- | --- |
| Accounts | Read | GET /v1/accounts/{id}; GET /v1/account in the separate readiness script |
| Accounts creation | Write operation; exact grant unresolved | POST /v1/accounts (Express, card_payments and transfers capabilities) |
| Account Links | Write | POST /v1/account_links |
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

References:
- https://docs.stripe.com/keys/restricted-api-keys
- https://docs.stripe.com/stripe-apps/reference/permissions
- https://docs.stripe.com/connect/destination-charges
