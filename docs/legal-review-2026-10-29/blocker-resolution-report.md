# Targeted release-blocker corrections — October 29, 2026

Protected parent: 5b6d15ce2548a1f18eb2939e9f52f27e58a08af1.
No production, DNS, payment configuration or agreement activation occurred.

Completed: separate proposed-2026-10-29.4 legal correction/diff/manifest, preserving
all original 48,789 bytes and SHA-256 for 2026-10-29.3. Only version/status labels
and the two unsupported review assertions change in the proposal. It is not
referenced by the runtime, accepted or seeded. Owner approval is still needed.

Added strict membership mode pins and explicit matching test/live opt-ins. A live
configuration cannot adopt a legacy/test enrollment. All live-mode execution
here used synthetic processor fixtures; no live credential or payment was used.
Read-only provider settlement traversal verifies known invoice -> invoice payment
-> PaymentIntent -> charge -> available balance transaction -> actual tax/fee
breakdown. Test revenue, plays and statements use separate tables and cannot
enter live QCMR. Missing fees, taxes or ambiguous payments stay unaccounted pending
review. Signed invoice storage queues bounded leased reconciliation work with
retry and idempotency. Full settled refunds are linked once to original principal.
Partial refund tax splits, disputes and fee-credit classification still require
verified reconciliation evidence; they are not estimated or silently deducted.
Worker scheduling and production enablement remain unperformed deployment work.

Verified member play integration uses server-resolved performance/identity,
separately cleared transmission/member rights, server membership, signed recipient
instructions, actual completed byte-delivery evidence and elapsed listening
observations. Free discovery, self plays, overlap, missing delivery and abnormal
repeat counts do not produce pool units. Browser telemetry alone cannot qualify.
The optional accounting/evidence endpoints default off and require server flags;
accounting requires authenticated operator identity and same-origin bounded input.
No uploader can approve their own rights or change a license ceiling.

License ceilings now have a trusted append-only operator decision entrypoint and
per-recording headroom report. An unset ceiling remains unset. No-cost independently
cleared uses remain independent. Artist amounts and the pool fund no platform cost.
A tier-specific denial no longer removes an otherwise active recording from the
whole runtime catalog; actual withdrawal still removes it.

Fresh read-only production export: 5 tracks, 38 listens, 2 Hangers, 5 feedback,
5 Keeps, 0 accounts, purchases or Stripe events. All original rows survived an
isolated-memory upgrade and compatibility rollback. Two additional representative
fixture checks preserve five tracks, synthetic accounts, old paid entitlements,
new 85/15 purchases and rollback after failure. See release/TRANSITION-2026-10-29.md.
Provider-native D1/R2 restore execution is still unverified and is not replaced by
Git source recovery. Recording-specific clearance matrix documents missing rights
evidence without inventing signatures or changing the live catalog.

Financial evidence: a read owner-connected Cloudflare invoice notification dated
October 28 reports $0.00 due. Service line items, usage, credits, the billing period
and future costs were not established by that email. GitHub-specific paid usage,
managed hosting charges and domain/administrative/legal costs remain unknown.
Only a Stripe sandbox account is connected; sampled settled sandbox charge rows
show 237-cent gross / 37-cent simulated fees. These are test evidence, not actual
live costs or a quoted membership rate. See operating-cost-evidence.md for official
Cloudflare list prices and explicit workload/margin assumptions. No recurring
service or staffing expense was added. The approved economic model is unchanged.

Validation before visual-branch isolation: 303 full-suite tests passed, zero
failed/skipped/cancelled; two newly added transition tests additionally pass.
Typecheck, lint and build passed. The full suite will be rerun after final edits.
Chrome-for-Testing 151.0.7922.34 and headless shell were obtained from official
Google storage. Full Chrome hits a host-denied singleton socket; supported
headless shell works. Existing radio browser acceptance passes all 8 checks with
headless shell. Application/mobile/agreement/keyboard acceptance remain to be
completed on the final source. No physical iPhone/Safari acceptance is claimed.

Release remains BLOCKED for owner legal-text approval, actual recording-specific
executions, any applicable explicit license budget/funding choices, remaining
browser/hosted acceptance, production configuration/restore/cutover authorization
and missing actual-cost evidence. Those evidence requirements do not authorize a
business-model redesign, blanket licensing fees or artist deductions.
