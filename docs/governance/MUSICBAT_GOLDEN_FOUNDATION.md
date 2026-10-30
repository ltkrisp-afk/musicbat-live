# MusicBat Golden Foundation

Status: Permanent business philosophy and architectural governance.
Established by the owner on October 30, 2026.

> Keep the mystery in the music. Take the mystery out of the business.

## Permanent principles

1. MusicBat manages the discovery and sale of authorized music, not the musician’s career.
2. Musicians retain their ownership, independence, and legitimate rights.
3. MusicBat operates through direct licensing with appropriately authorized rights holders.
4. MusicBat earns compensation for defined services, not control over musicians’ careers.
5. The platform integrates and automates administrative functions to eliminate unnecessary intermediaries, duplicated work, and avoidable costs.
6. All financial allocations, fees, licensing permissions, and purchase terms must be transparent and accurately documented.
7. MusicBat acts as a steward of entrusted recordings, metadata, rights records, and legitimate purchase entitlements.
8. MusicBat’s retained earnings should support preservation, reliability, operational resilience, and progressively greater infrastructure independence.
9. MusicBat must never become the gatekeeper it was created to eliminate.
10. The software must demonstrate these principles through observable, testable behavior.

## Architectural application

Developers and AI agents must use these principles when proposing, implementing,
reviewing and verifying changes. Preserve approved behavior and historical evidence.
Reuse existing identity, catalog, rights, payment, listening and recovery functions
before introducing another workflow or source of truth. Any additional dependency
or administrative handoff should have an explicit service purpose and maintenance
cost rather than silently duplicating an existing function.

Discovery, licensing, payment collection and technical stewardship confer no career
management authority or ownership. Keep recording ownership, composition ownership,
licensing authority and collection instructions distinct. Require documented authority
for the actual use; do not infer someone else's permission from an uploader's claim.
Apply necessary rights, security and payment-verification controls with a documented
reason. Do not use those controls to impose unrelated exclusivity, career control or
unnecessary barriers to participation.

Show accurate terms before acceptance or purchase. Preserve agreement versions,
rights decisions, transaction allocations and legitimate entitlements, with authorized
access, linked corrections and the approved retention/withdrawal rules. Automation
must retain reviewable evidence and recoverable failures; it must not fabricate
consent, clearance, successful delivery or payment settlement.

Preservation and infrastructure independence guide engineering and retained-earnings
planning. This principle does not create a new budget, reserve percentage, transfer,
provider migration or automatic spending instruction. Evaluate reliability, recovery,
data portability and recurring dependency costs with evidence when proposing work.

## Demonstrating the principles

For a relevant change, identify the affected principle, the observable outcome and
the existing or necessary verification. Prefer behavior checks over assertions that
merely search this document for words. Representative verification paths already in
the repository include:

| Principle | Observable behavior | Existing verification |
| --- | --- | --- |
| 2–4, 6 | Recording and composition authority remain distinct; acceptance and use clearance cannot be forged by another account. | `scripts/musicbat-rights-declarations.test.mjs`, `scripts/musicbat-final-licensing.test.mjs` |
| 4, 6 | Purchases preserve the 85/15 base allocation and separately disclosed buyer processing; streaming uses its separate approved QCMR framework. | `scripts/musicbat-purchase.test.mjs`, `scripts/musicbat-final-licensing.test.mjs` |
| 5, 7 | Recovery is durable and idempotent; ordinary withdrawal preserves completed purchases and their records. | `scripts/musicbat-mcp-recovery.test.mjs`, `scripts/musicbat-final-licensing.test.mjs` |
| 6, 7, 10 | Retained agreement bytes match the served body and digest; private account records require current authority; listening claims require evidence. | `scripts/verify-agreement.mjs`, `scripts/musicbat-personal-accounts.test.mjs` |
| 8, 9 | Proposed dependencies, restrictions and recovery changes explain their service purpose, artist impact and preservation implications. | Review evidence and relevant recovery/security checks; this is not a claim of an automated earnings or governance test. |

These references identify verification mechanisms, not proof that hosted acceptance,
rights clearance, processor settlement or production recovery has occurred. Report
actual executed outcomes separately from source inspection and historical reports.

## Authority and change boundary

This is architectural guidance, not an amendment to any business agreement or a
grant of rights. It does not change the approved 85% artist / 15% platform purchase
allocation, approved QCMR framework, direct-licensing agreement, artist-protective
terms, or historical financial records. It does not authorize redesign, merge,
deployment, agreement activation, live payments, DNS or infrastructure changes.

When an implementation or instruction demonstrably conflicts with these principles,
record the exact behavior, evidence, affected principle and impact. Distinguish a
verified conflict from an unknown, an incomplete feature or a proposed improvement.
Report the discrepancy without automatically changing approved business rules.
Obtain the owner's explicit direction before changing those rules or this foundation.
Do not treat historical documentation as current operating authority where newer
owner-approved rules are established.

The initial bounded alignment review is recorded in
[Golden Foundation alignment, October 30, 2026](golden-foundation-alignment-2026-10-30.md).

## Final governing principle

MusicBat’s success is measured not solely by company revenue, but by how faithfully the platform serves the musicians whose work makes that revenue possible.
