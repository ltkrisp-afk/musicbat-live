# MusicBat artist and patron experience — implementation verified, browser acceptance pending

Base: e1f01256080da0a799213fc2ae9c81c4acc43db3, the completed pre-Stripe successor of 5fa1ad766a9c64af98c27eaf604547a478a0da51. Work is isolated on artist-patron-finalization. No production configuration, data, deployment, live payments, remote pushes or repeated backups.

## Already working, reconfirmed only where relevant

Upload ownership and genre/subgenre/style classification; separate sales and Radio consent; representative authority/revocation; metadata synchronization with the private Radio runtime; qualified Radio Plus feedback and Free Radio feedback rejection; withdrawal from playback and new sales; historical purchase/download preservation; genuine Shock Room counts; buyer-confirmed itemized 85/15 purchase quote. Retrofutura source and shared playback controls are unchanged.

## Corrected or added

- Discover Artists is a separate patron entry, with artist search and a Following filter. Follows are authenticated, persisted, reversible and isolated per listener. An artist follow is independent of Radio Keep and voting.
- Stable /{artist-slug} pages list active releases and offer authorized purchases independently of whichever track Radio currently plays. Slugs are stored, survive identity edits and withdrawal, and are backfilled deterministically for existing artists. This inspected source had no artist-slug page implementation to preserve; production URL aliases remain unverified and must be checked before deployment. Current generated slugs are opaque artist identifiers, not vanity names.
- Manage Songs and Shock Room navigation appear only after the server confirms an artist profile, owned uploads, or active representative authority. Patrons may choose Add Track to become artists but receive no controls for others' recordings. Server permission checks remain authoritative.
- Edit Song expands the existing metadata form. Remove Song withdraws from future Radio and sales. Archive Song retains required records/assets. Radio-only withdrawal and separate sales authorization remain available.
- Initial Discovery — First 14 Days explains the introductory observation period and its statistical limits. Each owned recording displays release date, actual response counts and distinct qualified non-owner listeners. With fewer than two such listeners it says “Not enough listener activity yet.” Two or more is explicitly only an observed count, never a claim of statistical significance or success. No engagement is seeded or invented in user-facing data.
- Additive registered migration 0010_artist_discovery supplies artist pages and follows. Historical financial, audio, owner and signal records are preserved. The rollback generator now appends the next unused index, 0011 for this release; earlier generated rollback sources must not be reused with this ledger.

## Verification evidence

10 targeted Node tests passed: 8 artist-loop tests and 2 migration preservation/rollback tests. The connected fixture performs upload → rights review → shared playback → eligible response → simulated itemized purchase → withdrawal → retained paid download. New coverage checks persistent/independent follows, unauthorized management, stable page identity, real distinct-listener counts and retained history across new releases and withdrawal. Migration rehearsal includes historical 90/10 and new 85/15 snapshots, original archives, retained follows/page identities and rollback. TypeScript and the final application build passed. No unrelated suites were rerun.

These are isolated handler/runtime sessions with generated test audio, synthetic users and mocked Stripe, not authenticated browser sessions or real settlement.

## Required unresolved acceptance

No screenshots or working browser preview were produced. The managed environment has no control-browser capability. [Sites SKILL.md](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/SKILL.md) explicitly says: “If `$control-browser` is unavailable, skip browser QA: do not start a preview server, install a browser, or improvise another browser-control path.” This leaves visual verification blocked; the implementation has not been declared visually finished.

Before founder multi-account sign-in or Stripe configuration, use supported browser tooling to open this exact source with isolated owner and patron sessions and generated fixture data. Verify page rendering, owner controls, patron exclusion, navigation, follow/unfollow, upload/edit/remove, Radio withdrawal, continued historical download and itemized purchase presentation. Confirm real existing production artist URL aliases before any approved cutover. Do not use production as a preview or fabricate authentication/rights/membership.

Release order remains: experience → authenticated visual acceptance → Stripe configuration → persistent private Radio routing and remaining readiness → explicit founder approval. Previous unresolved live platform/Connect, webhook, actual processing schedule, real artist onboarding, persistent private Radio hosting and separately authorized real settlement/refund acceptance remain unresolved. Exact operations are in PRODUCTION-COMMANDS.md with the discovery migration and rollback index updated.
