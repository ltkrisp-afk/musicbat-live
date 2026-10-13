# MusicBat final checkout correction — October 12, 2026

No deployment, production writes, GitHub push, live charges or refunds performed.

## VERIFIED
- Base checkpoint: 7f71f67d99c4e5467558723a444c16905e4faf10. Original recovery ZIP still hashes to cd2220ae2b739604785272d9823ddc5d5f4d04928388c5823bcdaeae7680cd00; untouched.
- Current GitHub branch bat-radio-shock-room resolves to ed3c566c5eba7166da7be65ace12c8cf334a4037. Local complete checkpoint history proves that commit is an ancestor of the specified base; 59 files changed between them. No newer GitHub work was found. GitHub compare endpoint cannot compare a checkpoint it does not contain (404); ancestry comparison performed locally against the exact remotely resolved SHA.
- Preserved prior verified descendant 175908a3d20d8fd4cefe256a02b86adca90fd083, including upload wording and 11-price Checkout tests. Checkpoint already implements 85/15 with itemized buyer processing. No obsolete active 90/10 language/calculation remains. Historical documentation and historical 900/100 purchase fixture deliberately retained.
- Artist share = floor((85 × base cents + 50)/100); platform base share = base minus artist share. Processing reserve = ceil((base × configured basis points + fixed cents × 10000)/(10000 − basis points)). Calculation uses integer-valued arithmetic, bounded sale prices and safe-integer validation.
- Buyer must confirm base plus processing before purchase creation. Application fee = platform base share plus processing reserve; destination proceeds after application fee equal artist share. Buyer processing is separately itemized. Historical purchase amounts are never recalculated.
- At configured test rate 290 basis points + 30 cents: $2 base, $0.37 processing, $2.37 buyer total, $1.70 artist, $0.30 platform base share; application fee $0.67. Platform pays processor fees from the retained amount, so actual net depends on actual fees.
- Signed webhook confirms processor-retrieved amount, currency, application fee, destination and metadata before unlocking downloads. Duplicate/concurrent event insertion is idempotent; repeated payment events do not reset paid timestamps.
- Added processor-retrieved charge.refunded verification: full refunds revoke future downloads; partial refunds retain access. Late payment/failure/expiry events cannot resurrect refunded orders. Refund event replay retains original financial snapshots. Mismatched refund totals rejected.
- 90 automated tests passed, zero failures/skips. TypeScript, ESLint, production build and diff whitespace check passed. Price sweep: 1, 10, 99, 100, 199, 200, 500, 999, 1000, 1999, 10000 cents, including rounding boundaries and $2. Low-cent fixtures exercise arithmetic; artist UI price limits remain unchanged.
- Retrofutura console/dial files byte-identical to requested checkpoint. No artist rights, radio functionality, production data or recovery archives changed.
- Sites current metadata still identifies musicbat.audio, version 13, October 1 source 706082ad960574dd1f67f84bab61667dabfb0897. Its committed purchase route uses round(base × 0.9) and no buyer processing item. GitHub route independently also uses 0.9. Deployed source is outdated in both wording and transaction logic, not merely display text.

## UNVERIFIED / release boundaries
- Tests use mocked Stripe API responses and signed simulated events. Real Stripe Checkout, actual destination balance settlement, actual processor fee schedule, card surcharge eligibility, and real refunds/transfer reversals are unverified. Integration deliberately remains test-only.
- Refund issuance is an administrative Stripe operation; no new public refund endpoint was introduced. Destination-charge refunds must account for transfer reversal and application-fee refund. See https://docs.stripe.com/api/refunds and https://docs.stripe.com/connect/destination-charges . The new webhook verifies purchase access state, not actual reversal accounting or processor fee reimbursement.
- Concurrent webhook retries and sequential Checkout retries tested. Simultaneous independent purchase-creation requests are not proven to collapse to one order; per-order Stripe idempotency remains intact.
- Partial refund access behavior follows existing paid/refunded schema; no partial-refund accounting model introduced. Browser runtime, audible radio and actual live customer settlement unverified. Current live HTML/UI not independently exercised in this pass; outdated source conclusion uses deployment provenance and committed source.
- No production migration applied. Existing processing column migration and authoritative live schema must be checked before release. No historical rows edited.

## Deliverable
Complete source and reachable Git history bundled after all checks passed, with verification logs and this report. Restore with git clone musicbat-final-checkout.bundle musicbat-restored; install dependencies using npm run install:ci, then npm test, npm run typecheck, npm run lint and npm run build. Dependencies and secrets excluded. Original checkpoint remains reachable in complete history; original recovery ZIP remains unchanged at its existing location.
