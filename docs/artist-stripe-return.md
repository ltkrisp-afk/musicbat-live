# Artist identity and Stripe return context

Baseline: `b0400ad`. The Linux user reported completing Stripe sandbox registration, then returning to a listener-facing view labeled with the local mock login name and a Follow button for their own band. Registration completion is user-reported; charges/payout readiness and a real sandbox purchase remain unverified.

## Repair

- Stripe return and refresh URLs explicitly carry `view=artist`. The homepage maps that view and legacy `stripe=return` / `stripe=refresh` URLs to the artist catalog/payout section. Cleaning the Stripe marker retains `view=artist`, so refreshing stays in artist context.
- The directory response reports the current authenticated user's own saved artist identity and per-page `is_owner` flags. Neither the viewed slug nor caller-supplied artist IDs determine ownership. In artist controls and on their own public artist page, the header shows that saved band name rather than the generic login display name.
- An owner sees **Your artist controls** instead of Follow/Unfollow on their own artist page. Visitors retain Follow/Unfollow. The server rejects self-follow mutations; it does not create an automatic follower row. Existing follower rows and counts are not rewritten.
- Ordinary listening and navigation remain available. A view parameter never grants management access: existing authenticated ownership/representative checks remain authoritative.

The stable local mock authentication ID/email are intentionally unchanged. No artist, song, purchase or Stripe account is reassigned. The existing connected account is reused, and existing uploaded music does not need to be uploaded again. No database migration or credential edit is required. Production is not deployed or reconfigured.

## Checks

Affected checks cover artist-context return and retained URL, saved band-name display, ordinary navigation after returning, authenticated ownership versus another artist's page, self-follow rejection and genuine patron follows, owner/visitor Follow rendering, existing upload/management/withdrawal behavior, Connect request validation and the existing signed 85/15 purchase/download loop. Stripe registration alone is not treated as payout readiness.

All 26 unique affected tests passed (17 API/Connect/ownership/navigation checks and nine component checks); the three navigation checks were also rerun with the final component changes. TypeScript, changed-file ESLint, build and whitespace checks passed. These are automated isolated checks, not an independent observation of the user's Stripe account or Linux screen.

To inspect the already-onboarded account after updating Linux, open `http://localhost:5173/?view=artist`. Read the payout status there; do not restart onboarding merely to test the return view. If it says **Finish Stripe setup**, Stripe still reports requirements. If it says **Stripe connected**, the existing readiness endpoint reported all three required flags. Actual Checkout/webhook/settlement acceptance is a separate remaining step.
