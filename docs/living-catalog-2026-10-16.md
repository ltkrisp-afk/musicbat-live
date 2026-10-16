# Living catalog development report — October 16, 2026

## Source and scope
Existing checkout: `/workspace/scratch/musicbat-player-fix`, branch `prelaunch-security-2026-10-14`, HEAD `fc1f337` plus existing uncommitted Stripe/player development. Those changes were preserved. The separate public-readiness checkout at `2a9fe5e` contains a narrower hosted commerce branch, not the full artist/Radio implementation. No claim that these working trees or Kris's Linux checkout are synchronized. No deployment, live credential access, live charge, pricing change or checkpoint overwrite.

## Inspected before changes
Existing upload validates MP3/WAV/FLAC signatures, caps uploads at 25 MiB, uses random object names and persistent integer track IDs, atomically registers catalog/profile/audit and removes orphan upload bytes on database failure. Artist/representative management exists with authority predicates inside writes, separate Radio/sales controls, current-catalog Radio delivery checks, reviewed playback evidence, withdrawal/deleted tombstones, and purchase snapshots. Signed webhooks and buyer-specific downloads exist. Existing metadata covers title, display artist, Genre → Subgenre → Style, energy and moods.

Missing: structured recording/composition credits, external identifiers, technical/tag extraction, compilation/licensing consent, structured export, and removal of unneeded deleted audio. Prior code retained every archived asset. Ordinary catalog reads and management need further pagination and operational scale measurement.

## Implemented
- Additive migration `0012_living_catalog.sql`, schema and journal; not applied to hosted databases. Adds versioned recording/technical JSON, compilation/licensing flags defaulting off, and account/catalog indexes. Existing IDs, purchase snapshots and prices remain intact.
- Optional album, recording ISRC, composition ISWC, songwriters, publishers and separately declared recording/composition rights holders. Bounded values, normalized identifier syntax, no ownership inference. Identifier syntax checks do not verify registrations or ISWC checksum. Management and audit account identities remain distinct from rights declarations.
- Optional upload fields and later credits editing in Manage Songs. Partial bounded ID3v2.3/2.4 text, WAV RIFF INFO and FLAC Vorbis extraction. Explicit input wins; extracted source tags remain separate. WAV/FLAC duration, sample rate, channels and bit depth where supported. MP3 duration, UTF variants/extended or compressed ID3 tags and all possible broadcast WAV chunks are not fully supported. Missing information stays absent; existing tracks are not falsely backfilled.
- Separate audited compilation/licensing consideration toggles. These are opt-in interest/consent records, not executed licenses. Withdrawal/deletion disables both. No compilation sales or licensing offers exist; future implementations must recheck current consent and obtain project-specific terms and per-song allocations.
- Authenticated cursor-based `?view=catalog-export&after=ID`, maximum 100 recordings per page, private/no-store, versioned JSON and no storage paths. No arbitrary structured import or DDEX adapter introduced.
- Deleted unreferenced audio removed after catalog withdrawal commits; pending, awaiting-checkout and paid snapshots retain delivery bytes. Shared active assets also protected. Deletion can be retried without restoring permissions. Necessary purchase/audit records remain.

## Standards investigation
Official references checked:
- https://ddex.net/standards/recording-information-notification/
- https://rin.ddex.net/recording-information-notification/6-syntax-and-semantics-of-rin-messages/6.6-proprietary-identifiers/
- https://ern-rp.ddex.net/electronic-release-notification-message-suite-part-2-release-profiles/7-rules-common-to-all-release-profiles/7.4-for-resources/
- https://ddex.ddex.net/standards/release-delivery/

RIN concerns recording/contributor information; ERN communicates release/resource availability and deal information. ISRC identifies recording resources; ISWC identifies musical works. The internal stable track key remains independent. Current JSON is an internal interchange foundation, **not DDEX compliant XML**. Future mapping should distinguish recording, embodied musical works, contributor roles/party IDs, release/album, territorial uses/deals, file technical metadata, identifier namespaces and provenance. Inspect current DDEX licensing/profile/schema requirements before implementing a specific adapter. ID3, RIFF INFO and Vorbis fields are source declarations, not rights evidence.

## Verification and remaining limits
Use repository TypeScript test loader: `node --import ./scripts/register-typescript.mjs --test ...`. Plain Node cannot load this repository's TypeScript runtime imports.

Focused tests cover persistence, bounds, ID3/FLAC extraction, explicit corrections, authority, revocation inside writes, Radio exclusion, concurrent shared playback, sales withdrawal while awaiting processor readiness, exact 85/15 ledger, signed webhook, replay/refunds and historical buyer download. Tests use generated audio, isolated SQLite/R2 fixtures and mocked Stripe; no new real Stripe settlement was performed.

Still open before claiming full directive completion:
1. Already-open Checkout sessions can complete after sales withdrawal. Current atomic eligibility prevents new drafts after withdrawal but is not a distributed transaction with Stripe. Needs a durable outbox plus session expiration/reconciliation, including cancellation-versus-payment webhook races and an explicit policy for payments already in flight. Do not remove pending buyer assets prematurely.
2. Cleanup failure or a formerly pending purchase becoming terminal needs durable automatic retries/sweeping, not just repeat deletion requests. Private Radio runtime copies also need a retention-aware cleanup protocol. Already-delivered audio cannot be retracted.
3. Submission consent does not replace reviewed Radio rights, and this change does not bypass lawful-copy/channel gates. Existing sidecar sync is best effort with current-catalog delivery checks; new recordings still require the existing rights/runtime registration process. End-to-end hosted acceptance remains unverified.
4. No compilation allocation engine, licensing marketplace or DDEX importer was added. Project-specific approvals/allocations must be designed before those products operate.
5. Legacy tracks lack newly extracted technical metadata until a deliberate backfill. Browser visual acceptance, hosted migration compatibility/rollout and large-catalog load testing remain unverified.

The existing artist → Radio → purchase → signed webhook → download path remains the release priority. Free artist participation and Free Radio remain; optional $3 listener Radio Plus and 85/15 purchase economics unchanged.

## Final development check results
50 distinct focused tests passed across artist-loop (12), purchase (16), upload (4), website components (9), prelaunch security (4), release migrations (2), and local migrations (3). TypeScript `tsc --noEmit`, ESLint for changed application/schema files and the Vinext/Vite build passed. The older release migration test hard-coded eleven migrations despite the existing twelfth Radio Plus migration; it now checks thirteen and verifies default metadata/consent on legacy rows. No hosted schema was changed. New artifacts and source changes remain in this existing Git-backed working tree alongside the preserved earlier uncommitted work; no commit or deployment was made.
