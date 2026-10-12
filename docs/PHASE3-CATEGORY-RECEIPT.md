# MusicBat Phase 3 — offline category radio

October 12, 2026

## Provenance and preservation

Starting commit: 4f6effb44166a586124d1633e7554e47d0f3c79f.
Original archive: /workspace/scratch/5060026a43a8/musicbat-integrated-evidence-2026-10-12.tar.gz.
Verified SHA-256: 8fce42bb43c22d5730bb3a64203be4c4da1089b0e8c3f6607db0f8f0545bb1cc.
Git fsck passed. The existing isolated directory already had uncommitted Phase 3 compliance and React changes when this continuation began. Those changes were copied into /workspace/scratch/b0aecd743396/phase3-category-continuation and reviewed; the original directory and archive were left unchanged. This commit includes that inherited work and this clarification. It does not assert the original engineering directory was clean.

## Product contract

Free Radio is continuous noninteractive discovery. Optional $3/month Radio Plus selects Genre → Subgenre → Style categories. The engine selects recordings. Votes and Keeps record signals without requesting or guaranteeing playback. Directly licensed interactive functions require their own authorization; membership is not a rights grant.

## Implemented offline

- Category command parser rejects track requests, seeking, replay, embedded votes and unknown fields.
- Synthetic category scheduler resolves a reviewed, existing shared channel. It does not create listener-specific channels and does not infer legal eligibility from genre selection or catalog size.
- Free Radio and Radio Plus can be evaluated as noninteractive statutory simulations, subject to independent gates.
- Recording/composition permissions, territory, eligibility, review, withdrawal and expiry are checked independently.
- Channel-scoped complete history applies rolling three-hour album/artist/compilation restrictions and consecutive caps; counts repeats conservatively and includes overlapping transmissions. These stricter simulation rules do not claim to implement statutory exceptions or waivers.
- No compliant track means silence/no selection, with rejection reasons. No bypass fallback.
- Separate statutory delivery route returns 503 for GET, HEAD and POST without reading media. All statutory live evaluations are denied. The existing asset/range endpoint remains direct-license-only.
- Radio catalog action tunes a genre rather than selecting the displayed recording. Radio seek control replaced with read-only progress. Buy, voting, Keeps and artist permissions remain.
- Reviewed inherited React lint fixes and resolved remaining lint failures.

## Verification

36 tests passed, including all 28 baseline tests; none failed or skipped.
TypeScript, ESLint, production build and Git diff whitespace check passed.
Testing is synthetic/offline; no real transmissions, new license filings or production changes occurred. Existing installed dependencies were reused; a fresh dependency install is unverified.

## Boundaries still requiring verification

This is an offline scheduler/policy foundation, not a completed statutory service. Category navigation is tested through the policy API. The recovered UI has genre/energy controls; a complete rotary Genre → Subgenre → Style presentation and entitlement integration are not present in this baseline and were not invented or restyled here. No new billing was implemented.

Live shared channel delivery, persistent transactional channel ledger, server-controlled clock, channel switching behavior, protection against scanning/copying, simultaneous metadata, lawful source/ephemeral copies, program restrictions, reporting and royalty operations still require implementation/integration and independent verification. `requirementsEnforced` and synthetic evidence are fixtures, not proof that those controls operate. Future activation requires a separate reviewed implementation; no environment variable activates statutory playback in this commit.

The current direct-license asset endpoint must not be repurposed for statutory use. Removing visible radio seek/track controls alone does not prove legal noninteractivity. Free/paid tier classification and the combined service must be independently reviewed, including the statutory definition covering specially created programs, and all composition and recording rights.

## Primary references reviewed

- https://www.govinfo.gov/content/pkg/USCODE-2024-title17/html/USCODE-2024-title17-chap1-sec114.htm — §114(d)(2), (h)(7), (h)(13), other rights preserved.
- https://www.soundexchange.com/service-provider/licensing-101/ — statutory eligibility, reporting and performance complement guidance.

No production modification, deployment or GitHub push was performed.
