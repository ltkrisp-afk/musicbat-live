# Isolated Stripe verification continuation

Continues from GitHub development commit `3cd7944302f072e540e701cf9febca0f4e26a882`, source tree `050678f8e3c6fd538779fc98a11cd33afaf9f19c`. The existing local full-history checkpoint had the same source tree. Production is untouched.

## Precise actual-sandbox blocker

NOT TESTABLE: the current execution environment has no `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` or `STRIPE_RADIO_PLUS_WEBHOOK_SECRET`. No actual local secret file exists; `.env.example` is only a template. There is no established authenticated Stripe sandbox access or registered reachable sandbox webhook endpoint in this session. The read-only `scripts/stripe-readiness.mjs` is live-only and was deliberately not executed. No live secrets, account settings or production environment were inspected or changed. No external Stripe requests, real charges or live payment activation occurred.

Actual verification needs a test-only account key, an isolated persistent test database with existing additive migrations, artist test Connect readiness for song purchases, private Radio test wiring, and registered signing secrets for the intended song-purchase and Radio Plus webhook endpoints. Do not put secrets in reports or commit them. Actual Stripe Checkout/webhook delivery, Connect settlement and processor fees remain unverified. The isolated processor does not prove these outcomes.

## Confirmed defect repaired

FAILED before repair: Radio Plus accepted invalid configured modes such as `invalid` and `TEST`, reporting enrollment available. Its gate previously excluded only `live`.

VERIFIED after repair: status and enrollment agree on the same test-mode restriction, while preserving the existing default-to-test behavior when the mode is omitted. Invalid/live mode, missing/wrong secret, missing/wrong signing secret, missing database, disabled enrollment and release pause are rejected before any processor call or enrollment/event ledger write. No permissions, prices, subscription records or historical purchase amounts were migrated.

## Next independent acceptance task completed

VERIFIED: the actual subscription webhook route module was exercised against an isolated SQLite database and processor fixture. Only the Cloudflare environment binding was injected. A network trap prohibited external fetches. Unsigned delivery, wrong secret, expired signature, wrong mode and mismatched paid amount return 400 and grant no access. Concurrent valid signed deliveries return 200, grant one paid period and record one event/invoice; replay does not rewrite enrollment. Missing signing-secret configuration returns 503 without changing the existing enrollment. This proves handler behavior with simulated evidence, not Stripe-origin delivery or HTTP routing in a hosted environment.

## Checks actually run for this change

- New invalid-configuration regression reproduced the defect before repair.
- Affected subscription and mode tests: 9 passed, 0 failed.
- New route regression: 1 passed, 0 failed.
- Final affected subscription, webhook, mode, local acceptance and radio HTTP suites: 15 passed, 0 failed, no skips.
- TypeScript and application build: passed.
- ESLint on all changed code/test files: passed with no warnings or errors.
- `git diff --check`: passed.

The final radio HTTP test emitted a Vite dependency-scan warning during fixture shutdown; its assertions and process exit passed, as did the application build. This is not a browser pass. The complete 127-test baseline from the preceding checkpoint was retained as prior evidence and not rerun. Unchanged purchase arithmetic/refund tests, persistent-player lifecycle tests and recovery bundles were not repeated.

The affected local acceptance test confirms Free → simulated Plus enrollment → cancellation retaining paid access → role return, patron mutation rejection, actual authorized audio bytes, 85/15 purchase amounts, retained paid download/history after withdrawal and quiet withdrawn stations. The HTTP radio test confirms two listener timelines, category switching, reconnect, withdrawal denial, restart continuity and silence. Neither test decodes browser audio.

## Remaining acceptance boundary

Actual Stripe sandbox work needs the credentials and webhook wiring above. Real browser acceptance remains pending because managed `control-browser` is unavailable; no substitute browser or bypass was used. Linux synchronization is not established here. Existing persistent player, tuning queue, artist/patron separation, withdrawal protections, historical purchases, 85/15 commerce and recovery materials remain preserved.

Next: when isolated sandbox access is available, verify test Checkout, authentic delivered webhook retries, Connect balances and subscription renewal/cancellation. With supported browser access, verify decoded playback continuity and patron/musician interactions. No additional credential-independent failure was established by this run; do not repeat completed checks without changed inputs or a concrete failure.
