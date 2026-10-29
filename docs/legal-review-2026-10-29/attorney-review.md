# MusicBat attorney-review package — October 29, 2026

Decision: READY FOR ATTORNEY REVIEW; NOT APPROVED FOR EXECUTION OR RELEASE.

The complete proposed contract is `legal/direct-licensing-agreement-draft.md`, version `draft-2026-10-29.1`. It includes sixteen substantive sections and Schedules A–F (parties, recording/composition rights, authorized uses and compensation, payees, supporting authorizations, withdrawal/retention/optional services). It replaces no executed agreement and grants no present rights. MusicBat manages the discovery and sale of authorized music, not the musician's career.

## Decisions and professional approvals still required

1. **Contracting operator and notices (owner facts, counsel confirmation).** Supply the actual legal operator, entity/individual capacity, business and notice addresses, rights contact, and actual designated copyright agent. Do not name an unformed LLC. Approve governing law and court venue based on the actual business and parties; the draft does not invent them.
2. **Rights scope and authority (music counsel).** Approve recording and composition grants for the actual free/paid listening controls, reproduction, permanent downloads and prior-purchaser redelivery. Verify actual authorizations, co-owners, publishers, samples/covers, territories, PRO agreements and required notices. Identify rights MusicBat cannot obtain from a particular uploader. PRO/IPI metadata and a checkbox never prove clearance.
3. **Compensation beyond purchases (owner and affected licensors, counsel).** Execute per-use streaming/promotional audio terms, including payer, payee, revenue base and treatment of composition rights. No streaming rate, membership royalty allocation or zero-rate grant has been supplied. Affected public uses stay disabled until agreed. Purchases remain 85/15; fees paid by buyers, subject to legal/provider approval.
4. **Payments and customer terms (payments/consumer counsel).** Approve the precise buyer processing charge and method restrictions, tax treatment, settlement timing, refunds/chargebacks and consumer redownload remedies. Confirm allocation includes all necessary purchase rights without an undisclosed deduction from the artist's 85%. Verify recipient/collection authority and beneficiaries' instructions; current implementation is a designated payee, not automated multi-party payouts.
5. **Risk and enforcement (counsel and owner).** Approve the scoped, reciprocal indemnities, consequential-loss exclusions, assignment, withdrawal survival, and dispute provisions. The draft deliberately sets no aggregate monetary cap; approve that position or expressly negotiate one. Confirm capacity and electronic assent enforceability, especially entities/representatives/minors.
6. **Operational legal duties (counsel/operator).** Confirm DMCA registration/published agent, repeat-infringer process and notices; applicable nonblanket-license reporting/assessment duties; privacy notice, retention periods/criteria, exports and lawful deletion/holds. Direct licensing does not itself establish a safe harbor or eliminate nonwaivable duties. No blanket/statutory license has been adopted by this draft.

These are specific approval and activation particulars, not missing drafting sections. Track schedules require actual party-specific facts and signed authority; fabricated entries cannot complete them.

## Primary authorities checked

- U.S. Copyright Office, Musicians: https://www.copyright.gov/engage/musicians/ — distinguishes recording/composition rights.
- 17 USC 114(d)(3)(C): https://uscode.house.gov/us/usc/t17/s114/ — interactive performances require composition-performance authorization as well as master rights.
- 17 USC 115: https://www.copyright.gov/title17/92chap1.html — voluntary/individual permissions and nonblanket provisions; evaluate actual applicability.
- 37 CFR 210.25: https://www.copyright.gov/title37/210/37cfr210-25.html — notices of nonblanket activity.
- Copyright Office section 512 guidance: https://www.copyright.gov/512/ — notice/counter-notice and designated-agent obligations.

These sources support review issues, not a conclusion that MusicBat's catalog or contract is legally cleared.

## Implementation and activation boundary

The review endpoint returns the complete draft with HTTP 503 when no approved version exists. The existing blue underlined control opens that draft in the same closeable scrollable agreement dialog. Draft display never enables acceptance or upload. An active approved agreement remains a separately stored immutable version. Migration 0017 seeds no terms, activates nothing and alters no historical catalog rows. Draft-prefixed versions are blocked at the database current-version pointer and application queries.

The existing mandatory checkbox and optional opening behavior remain. New uploads require a versioned declaration: legal identity/capacity; recording owners and controlled shares; per-composition writers/publishers/shares; PRO status, details and applicable IPI/CAE; existing restrictions; supporting private evidence references; payment recipient/collection/allocation declarations. These are structured declaration fields with narrative ownership schedules, not an automated title adjudication or numerical share-verification engine. A reviewer must reconcile the supplied shares, documents, use restrictions and signed schedules.

Consent, track and declaration are committed atomically. The server derives accepting account and timestamp; immutable declaration records link to the acceptance and track. The authenticated `license-records` view provides the signer's retained terms, declaration and review records, paginated by track ID and inaccessible to another account.

Shared/external/uncertain rights, PRO affiliations/unknown status, or declared restrictions trigger a hold. New held uploads have sales and radio disabled. Artist actions cannot clear the hold. Database triggers block sale/radio enabling and insertion/reactivation of playback grants during a hold. Authorized reviews are append-only decisions with reviewer, time and evidence; a clearance decision removes the hold but does not enable sales or create a playback license. New hold decisions disable offers/radio and withdraw playback permissions. There is no new public review-approval endpoint and no approval seeded by migration.

Private evidence must be supplied and reviewed through an access-controlled operator channel before clearance. The declaration reference field is not a new document-upload system. Existing playback requires independent reviewed permissions; signed compensation and use-specific schedules must be checked before any such permission is issued. No unapproved compensation is inferred from acceptance.

## Release requirements remaining after review

Issue an approved non-draft version only after completing the activation particulars and signed schedules. Separately authorize activation and production release. Reconcile this PR with the older deployed source/database and prepare an additive production-targeted migration. Do not deploy the whole development branch as a shortcut. Conduct browser and hosted integration acceptance on that targeted candidate, including actual cleared use scope, mobile dialog/keyboard behavior, processor evidence, withdrawals and retained purchases. Production and sandbox were not touched by this work.
