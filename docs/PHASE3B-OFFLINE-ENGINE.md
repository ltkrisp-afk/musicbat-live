# Phase 3B offline shared-radio engine

Baseline: a848191bbe80a704dd1b9ef3684e977ea4256249. Retrofutura was a conversational design specification; no missing interface recovery was attempted.

## Implemented

SharedRadioEngine is an offline, media-free scheduling engine with an injected trusted server clock and a real synchronous SQLite connection. Apply migration 0008 only to an isolated test database. BEGIN IMMEDIATE serializes scheduling, ledger updates, scheduling decisions and listener session changes; failures roll back the entire operation. Missing storage throws; no memory fallback exists. SQLite adapters should set a bounded busy timeout; exhausted contention fails closed and callers may retry the whole operation.

Pre-established shared channels hold reviewed categories, territory, mode, catalog-depth threshold and synthetic eligibility evidence. Catalog snapshots contain reviewed rights, artist/album/compilation identifiers and validated duration. Existing upload attestations do not populate this catalog or create rights. Administrative provisioning is separate from listener commands; no self-service licensing approval or channel creation API is introduced.

Listeners submit only null for Free Radio or Genre → Subgenre → Style for Radio Plus. Server authority supplies listener identity and membership expiry. Never construct ListenerAuthority from an untrusted request body. Membership does not grant music rights. Channels are shared, never created for one listener. Vote, Keep, seeking, replay and track IDs are not tune commands.

Each snapshot exposes the same persistent performance sequence, start/end and offset derived from the server clock. Reconnect and channel switching preserve the shared history. A trusted scheduler calls tick; listener pauses and disconnections do not move channel boundaries. Late ticks record a silence gap rather than pretending music was transmitted during a server interruption. This is a scheduler timeline, not proof of audible delivery or actual listened time.

Rights and channel review are rechecked on every advance. Missing grants, territory/mode mismatch, withdrawal, expiry during playback and removed/changed catalog entries deny or truncate a synthetic performance. Expired membership prevents Plus reconnection. Interrupted elapsed history remains in the ledger; zero-duration cancellations create no fabricated play. Sequence and audit high-water marks detect missing ledger tails and decision records. This is integrity validation, not cryptographic tamper evidence against an administrator who rewrites every table.

Direct and statutory permissions stay separate. Direct grants are not subjected to statutory-only limits unless their contracts require additional restrictions (contract-specific rules are not modeled). Statutory simulations retain the baseline rolling album/artist/compilation and consecutive restrictions, including repeats and overlapping windows. All prerequisite evidence remains mandatory. Complete persistent history is retained without automatic pruning. Tiny pools go quiet; no rejected track fallback exists. Synthetic eligibility and requirementsEnforced fixtures do not establish real service compliance.

Navigation reports dormant categories from reviewed catalog depth and Plus locks. Availability is not a guarantee that the next scheduling decision can choose a track. Retrofutura controls consume this navigation and server snapshots: walnut presentation, brushed aluminum dial/face, three smoked-glass windows, original neon pink and lime. Wheel/buttons/arrow keys turn the dial; pushing sends a category command and opens the next level. Controls contain no audio transport or individual recording requests. Integration tests exercise engine-to-dial traversal and render the component using real engine snapshots.

## Verification

55 tests passed, including the original 36; 0 failed, skipped, cancelled or TODO. New coverage includes disk persistence across connection restart, eight independent concurrent SQLite writers, switching/reconnects, gaps, rights withdrawal/expiry, rolling limits, incomplete ledgers, audit/storage failures, membership expiry, category depth, dial traversal and server-rendered presentation. TypeScript, lint, production build and whitespace checks pass. Tests are synthetic and offline.

## Remaining boundaries

- No production SQLite deployment adapter, Cloudflare D1/Durable Object adapter, public channel endpoint, authenticated transport, continuous scheduler worker, stream segmentation or server-to-browser audio synchronization is connected. SQLite transaction semantics must not be assumed for D1.
- The Retrofutura component is implemented and tested through its engine contract; it is not mounted into or substituted for the existing musicbat-loop player. That older player still schedules locally and is not claimed to be synchronized by this work. Wiring it to an authoritative server transport remains unfinished.
- Browser pointer/keyboard acceptance and visual screenshot QA were not run. SSR integration, TypeScript and build verification are not browser acceptance.
- Real rights evidence, service eligibility, lawful copies, reporting, royalties, scanning/copy controls, simultaneous metadata and operational retention remain unverified. No legal qualification or statutory activation is claimed.
- This engine does not automatically start or transmit music. Statutory delivery continues returning 503. No production database migration, deployment, GitHub push or public transmission was performed.

Run offline verification with node --test scripts/musicbat-*.test.mjs, node_modules/.bin/tsc --noEmit, npm run lint, and npm run build. Dependencies reused from the preserved engineering environment; fresh install reproducibility remains unverified.
