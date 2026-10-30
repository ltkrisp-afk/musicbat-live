# MusicBat — Original Legal Framework Integration Proposal
Status: PROPOSED / NOT EFFECTIVE / NOT ACTIVATED
Baseline: Direct Licensing Agreement 2026-10-29.3 (preserve bytes and digest)
Scope: PR #5 nonproduction legal/business alignment. No merge or deployment.

## Governing architecture
MusicBat is a musician-first marketplace and discovery platform. Artists retain copyright, control and independence. Separate authorizations apply to (1) marketplace hosting and digital downloads, (2) free discovery and paid radio membership, (3) optional future sync opportunities, and (4) optional artist historical recognition. One rights/provenance record may support these distinct use gates, but information reuse never creates an implied license or agency.

## A. Marketplace Terms of Service — original drafting requirements
- State the platform's intermediary services without claiming that marketplace status eliminates direct copyright liability.
- Grant only a limited, nonexclusive, geographically and temporally scoped license to store, reproduce, transcode, cache, display and deliver recordings and covered compositions for specifically enabled services. Permit necessary service-provider sublicenses only; do not infer promotional or sync rights.
- Operational permission must not negate separately owed artist compensation; avoid an unqualified 'royalty-free' formulation.
- Preserve ownership, lawful withdrawal, accrued payment obligations, and existing purchaser entitlements.
- Separate customer-facing purchase terms and legally required refunds/tax disclosures.
- 85% Artist / 15% MusicBat of download base price, not of membership revenue; buyer-paid processing only where lawful and provider-compliant.
- Designated verified recipient distributes beneficiary shares under signed instructions; platform does not promise automated multiparty payouts.

## B. Radio Membership Addendum — original drafting requirements
- Optional $5/month membership for enhanced platform features, cancellation/renewal and required consumer disclosures; membership is not purchase of a particular recording or a substitute for required licenses.
- Free discovery and member streaming require independently cleared master/composition rights for actual technical transmission and interaction behavior. Do not assume PRO or statutory-license exemptions.
- QCMR must use actual settled qualifying receipts with documented tax, refund, fee, chargeback and period treatment.
- Aggregate streaming rights-holder pool capped at 25% of QCMR, with any funding/eligibility conditions preserved from the existing agreement.
- Per-recording allocation: pool * verified eligible units for that recording / total eligible units, subject to approved rounding, zero-unit, dispute, hold and carry-forward rules.
- Up/down votes may influence discovery/rotation only unless a separately approved and documented royalty formula expressly includes them; they cannot expand the total pool.
- Exclude self plays, free plays and unverified playback; require server-linked listening/delivery evidence, rights gates and auditable ledger.

## C. Artist Representations, Warranties and Rights Clearance
- Require truthful identification of all master/composition owners, splits, administrators, publishers, PROs, samples, covers, collaborators and restrictions.
- Require documented authority for 100% of rights necessary for each enabled use, not a blanket claim that every uploader personally owns 100% or belongs to no PRO.
- Distinguish rights ownership, licensing authority and payout authority.
- Unresolved claims, disputed shares and missing authorizations disable the affected use, not unrelated cleared uses.
- Include proportionate warranties, notice/cooperation and indemnification provisions for qualified counsel review. Do not claim indemnification extinguishes MusicBat's own legal liability.
- Record versioned affirmative acceptance, signer identity/capacity, server timestamp, completed schedules, evidence references and withdrawal/complaint history.

## D. Distinct future business extensions
- Sync: interest/metadata flag alone is not a sync license. Require separate master and composition sync clearances, intended media, term, territory, exclusivity, fee, beneficiary instructions, approvals and executed transaction terms. No general agency appointment.
- Artist legacy: retain lawful audit/provenance records; public historical recognition requires separate scoped consent; promotional name/image/audio/testimonial reuse requires specific permission. Withdrawal of sales rights does not erase lawful accounting records or imply continuing marketing rights.

## E. DMCA and disputes
- Separate operational policy for designated agent registration/publication, compliant notice and counter-notice intake, expeditious handling, repeat-infringer policy, preservation/retention and escalation. An uploader checkbox alone is not safe-harbor compliance.
- Claims and disputes must produce rights-use holds, auditable status transitions and lawful restoration where appropriate.

## F. Required conflict and implementation audit BEFORE adoption
1. Compare every proposal against all clauses and Schedules A–F of 2026-10-29.3; produce a clause-level conflict matrix, including scope/territory/term, payout recipient, purchase entitlements, radio interaction, PROs and sync exclusion.
2. Verify actual UI, API, D1 schema, processor reconciliation, consent records and radio engines against each proposed legal rule.
3. Add focused tests for authorization boundaries, disputed rights, zero units, allocation rounding, reversals, cancellation, withdrawal, historical consent, and DMCA workflow.
4. Prepare a new proposed version and diff; never mutate the accepted baseline or its integrity digest. No text is effective until owner approval, professional review of unresolved legal issues and separately authorized activation.
5. Flag unsupported attorney-review claims and 25 MiB upload cap discrepancy; do not silently alter business rules.
6. Preserve existing 85/15 purchases, $5 membership and 25% QCMR ceiling; no production, DNS, Stripe, deployment or PR merge authorization.

This document is an original internal design specification, not legal advice or an executed contract. Do not copy competitor terms verbatim.