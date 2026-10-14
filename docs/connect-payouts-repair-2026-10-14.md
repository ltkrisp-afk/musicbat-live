# Connect Stripe payouts repair — development only

Continues from the existing local verified security checkpoint `ae2223ccfcc1fe5194c09b25367f85436f62f13f`, tree `f6da40a4f4e51562f6adfbbbe1f2e5f1838d18dc`. That checkpoint descends from the local source corresponding to GitHub `0c3edda`; the GitHub development branch still pointed to `0c3edda` when work began. The exact security source tree is preserved as a separate parent commit before this repair. Existing local source history and recovery materials remain intact.

## Confirmed failures and repairs

- The Add Track payout button caught request failures but placed their message only in the Radio panel. The active upload view did not show that message, making a failed click appear inert. Errors now appear beside the payout button, with a sign-in link for HTTP 401 and retry available after failure.
- The Connect route's `requireArtist` only required a signed-in user. It now requires an artist profile or owned track; patrons receive 403 before Stripe requests or account writes. Representatives cannot connect another artist's account through client-supplied IDs. An aspiring artist can explicitly create their own identity using the entered band name as part of the payout action; the UI does not silently convert a listener with no entered name.
- A synchronous in-flight guard blocks duplicate clicks before React rerenders. A response lacking both a usable onboarding link and confirmed readiness produces an error instead of claiming payouts are ready.
- Account creation validates the returned Stripe account ID; onboarding redirects require Stripe's HTTPS Connect origin. Same-origin POST is mandatory. Client account/artist IDs are not trusted.
- The existing local adapter pre-seeded completed payout setup and did not implement account creation or account links. An optional unconnected fixture now exercises account creation, expiring/replacement links, simulated completion and subsequent status refresh. Its pages explicitly say they are offline simulations and never collect banking details. Existing ready-by-default acceptance fixtures are preserved.

These are source and isolated runtime findings. The precise hosted response seen by the user was not captured, and this development fix has not been deployed to production or synchronized to the user's Linux workstation by this session.

## Actual checks

VERIFIED: 36 relevant automated tests passed, zero failures/skips. Includes actual isolated handler flow for artist Connect onboarding and refreshed links, a complete simulated purchase through signed settlement, current local acceptance, prelaunch security, purchase/refund/rounding history, UI navigation and permissions, persistent-player lifecycle and tuning queue. TypeScript and application build passed; ESLint on changed files and whitespace checks passed.

After extending the same-origin/configuration assertions, the four prelaunch security tests and that file's lint were rerun and passed. Other completed checks were not repeated unnecessarily.

The UI regression mounts the real React screen with synthetic DOM boundaries: it verifies errors in the same payout container as the button, 401 sign-in action, retry, same-tick duplicate prevention and deliberate artist identity creation before Connect. It is not a real browser interaction test.

The unconnected fixture verifies signed-out rejection, patron GET/POST rejection, one account under concurrent requests, cross-user onboarding denial, expired link replacement, readiness only after simulated completion, and no duplicate onboarding after readiness. Its complete simulated purchase verifies $2 base → $1.70 artist + $0.30 MusicBat, plus a separately confirmed $0.37 fixture processing charge ($2.37 buyer total at the test rate). After withdrawal, new sales are denied, the paid download remains accessible and the complete purchase row is unchanged. These are simulated processor amounts, not actual Stripe balances or fees.

## External blockers and next action

NOT TESTABLE: actual Stripe Connect onboarding, authentic webhook delivery and Connect settlement. No `STRIPE_SECRET_KEY`, song webhook secret or Radio Plus webhook secret is available in this execution environment. No sandbox endpoint or test-connected account access was established. Hosted proxy/authentication configuration was not exercised; the route continues using the existing trusted-header authentication integration. No production environment secrets were read or changed.

NOT TESTABLE: real browser onboarding/redirect and playback continuity. Managed control-browser is unavailable and no bypass was attempted. No browser pass is claimed.

Next: use an isolated test-only Stripe configuration and reachable signed purchase webhook to complete actual Express onboarding, run the $2 sandbox purchase, inspect the destination/application-fee ledger and retained paid download after withdrawal. Retest the visible Connect button and Radio continuity with supported browser access. Live payments and production remain untouched; the separate $6 DMCA agent registration remains pending.
