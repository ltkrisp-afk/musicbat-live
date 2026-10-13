# MusicBat payout verification — October 12, 2026

No deployment or production data writes performed.

## Finding
The published Site version 13, successful October 1 deployment appgdep_6abdce7767388191a35540ca372d6e45, identifies source commit 706082ad960574dd1f67f84bab61667dabfb0897. Its committed purchase route computes Math.round(amount * 0.9), with the remainder as application fee. No buyer processing line item exists there. Therefore the published source is outdated in both language and payment calculation, not only display copy. No actual customer charge or settlement was executed or inspected.

## Obsolete references in published source
- app/musicbat-loop.tsx:476 — upload/Connect prompt says receive 90%.
- app/musicbat-loop.tsx:517 — sale consent says artist 90%, MusicBat 10% before processing.
- app/api/musicbat/purchase/route.ts:33 — 0.9 artist-share multiplier.
- README.md:25 — 90/10 description.
- scripts/musicbat-purchase.test.mjs:104 — obsolete 90/10 test expectation (900/100 fixture amounts).

## Verified candidate
Resumed isolated copy of exact verified checkpoint 7f71f67d99c4e5467558723a444c16905e4faf10. That checkpoint already corrects the obsolete references and Checkout fields. Upload prompt clarified to 85% of the song price with separately charged buyer processing fees. Added route-level price coverage across 11 prices, including $2 and rounding boundaries; checks quote confirmation, persisted snapshot, separate line items, destination, application fee and artist net allocation.

Artist = round(base cents * 85/100); platform base share = base - artist. Configured processing estimate = ceil((base * rate + fixed)/(1-rate)). Buyer pays base + processing; application fee = platform base share + processing. Destination allocation after application fee is artist base share.

At the test fixture rate 2.9% + 30 cents: $2 song -> $0.37 processing, $2.37 buyer total, $1.70 artist, $0.30 MusicBat base share; application fee $0.67 includes the processing reserve. Rates are configured estimates, not verified actual Stripe fees.

## Validation
87 automated tests passed, zero failed/skipped. TypeScript, lint, build and diff whitespace checks passed. Includes signed simulated Stripe webhook, purchase/download flow, retries and legacy 90/10 snapshot settlement without rewriting historical amounts. Initial test execution lacked dependencies; reused compatible restored dependencies. New price sweep initially reused the mock session ID across orders; corrected fixture isolation and all checks reran successfully.

No obsolete active 90/10 payout language or allocation exists in the candidate. A historical engineering note mentioning 90% and historical purchase test amounts remain intentionally preserved. Existing recovery ZIP and original source checkpoint remain untouched.

## Limits
Published commit and successful deployment metadata establish outdated deployed source. A direct page fetch did not expose upload text in initial HTML; no browser runtime or completed real Stripe payment was verified. Current Stripe integration remains test-mode only. Production settings, actual applicable processing rate and real Stripe settlement require verification before release. No deploy is authorized by this report.
