# MusicBat artist-to-radio integration — October 12, 2026

This isolated change connects the artist's controls to the recovered application and private radio authority. It is not a verified live deployment or a browser-tested end-to-end user experience. Nothing was deployed, restarted in production, pushed to GitHub, or changed in production storage.

## Verified source and preservation

Resumed from Phase 3B commit `578306165ad8bea4b9b611c40b9004a5ee81b93e`. The original runtime bundle matches SHA-256 `e7932881b977eb6afb7e203bbf181f8895ed65164194bc5bb5f7d7560b8134ca`. Its history includes `329dfb8f0ed22a38e0d7666da3e57e0cb40283fa` and the earlier recovered source. Original backups remain untouched and the prior runtime recovery archive is included in the new recovery package.

The existing architecture is retained: authenticated application, D1 catalog, R2 uploads/purchase delivery, private persistent SQLite scheduling authority, shared transport and player. Additive migration `drizzle/0009_artist_controls.sql` is included, tested locally, and **not applied to production**.

## Artist experience and authority

- One authenticated account can listen, upload, and create an artist/band profile. The trusted authentication account ID owns uploads; a typed band name cannot claim another account's catalog. Authentication is inherited from the existing hosting identity boundary; live hosting header enforcement was not tested here. This verifies account association, not independent proof of the person's underlying copyrights.
- My Music opens the Minimal Rotunda. Upload success now takes the musician there. It reads all owned or explicitly delegated tracks, including withdrawn/deleted records, rather than filtering them out with the public active catalog.
- Controls edit title, genre, subgenre, style and energy, request radio participation, enable/stop sales with separate consent and price, withdraw the track, and delete it from the catalog. Owner-appointed verified accounts may represent individual tracks. Only owners can grant/revoke representatives.
- Mutation authorization is checked server-side. New management writes and their audit entries use an atomic D1 batch; authority is rechecked within writes so a representative revoked after the initial lookup cannot mutate the track. Cross-origin mutations are rejected.
- Upload registration, profile association and upload audit are atomic. Failed registration removes its new audio object. Existing audio objects and purchases are not deleted by track deletion.
- Remove from Radio leaves sales independent. Whole-track withdrawal/deletion stops radio and new sales. Deleted rows are tombstones and cannot be restored through the controls. Returning a withdrawn track to Radio does not silently restore its withdrawn grant: current reviewed rights must be supplied again.
- Artist consent/audit, historical transactions and their captured delivery files are retained. Existing catalog IDs and ownership are preserved; no legacy track was reassigned based on its display name.

## Classification and radio connection

Genre → Subgenre → Style is stored as structured columns. Genres use the existing accepted list; child labels are bounded artist-entered text, and Style requires Subgenre. This is structural validation, not a complete curated genre ontology or independent review of an artist's proposed labels. Later corrections are allowed. The legacy primary-genre action clears incompatible descendants.

`radio/catalog-import.ts` and `scripts/radio-catalog-import.mjs` bridge explicitly exported catalog rows and downloaded immutable assets into the existing reviewed private authority. Registration preserves the numeric catalog ID, category hierarchy, reviewed recording/composition permission, contract restrictions, duration evidence and immutable asset hash. It rejects withdrawn catalog consent. **This is an isolated reviewed import path, not an automated authenticated live D1/R2 replication service.** It never invents rights from a checkbox.

Management changes synchronize withdrawals/classification to the private authority when configured. If that sidecar is unavailable, the committed catalog change remains authoritative; every application channel/media request independently checks current catalog consent and reviewed permission. Ineligible sources are removed from persistent scheduling on recheck. Classification corrections change the runtime source revision, invalidate stale media authority, and feed existing shared channel pools and navigation. They do not automatically invent reviewed channels or grant Radio Plus membership.

Audio requests must match the same assigned channel/performance before and after asynchronous access. Listener responses start against the server-assigned performance; a fabricated performance key cannot start a listening session. Qualification requires elapsed time and the same current authority. This does not establish that a human audibly heard the audio; browser decoding and listening are separate verification gates.

Radio remains noninteractive at the song level. Existing category-only tuning rejects track requests, seek/replay/Next commands and queue manipulation. Statutory playback remains disabled as in the checkpoint.

## Retrofutura preservation

`components/retrofutura-radio.tsx` and `lib/radio-dial.ts` are unchanged from the Phase 3B checkpoint. The preserved console has walnut presentation, brushed aluminum, original neon pink/lime, smoked-glass Genre/Subgenre/Style windows and rotary/push navigation. Its offline presentation contract remains covered by the inherited tests. Prior offline-engine and player-integration receipts were inspected and preserved.

The current shared player is mounted. The analog console remains unmounted and was not replaced, restyled or expanded. Its remaining connection is to supply live player snapshots/navigation and category tuning after browser playback verification. Classification now reaches the runtime data those controls consume.

## Commerce

The recovered source already used 85/15. No 90% payout text was found in tracked source. Display text, pricing calculations and Checkout destination/application-fee fields retain artist 85% / MusicBat 15% of the base price, plus a separately quoted buyer processing charge. Public catalog labeling no longer describes unchecked uploads as rights-cleared, and upload consent alone is no longer reported as radio eligibility.

Separate sale authorization is required. Purchase insertion rechecks current sale rights, owner, asset and price atomically after asynchronous processor-readiness checks. A withdrawal during that preparation cannot create a new purchase draft. Existing signed webhook verification, idempotency and paid download snapshots are retained. Stripe remains test-only; no live payment, processor transfer, refund or payout was performed. Pre-existing Checkout Sessions issued before withdrawal retain their historical authorization/snapshot handling; this change does not implement an external Stripe-session expiration workflow.

## Verification

85 automated tests passed, 0 failed, 0 skipped. TypeScript, lint, production build and whitespace checks passed.

New connected tests execute real application handlers with a SQLite-backed D1 adapter, the real private runtime, generated PCM WAV bytes, and mocked Stripe HTTP responses plus a real signed test webhook. They verify:

1. Upload, owner/profile association, persisted classification, private catalog, corrections and tombstones.
2. Unauthorized accounts, delegated representatives, revocation during mutation and cross-origin rejection.
3. Atomic failed upload cleanup and rejection of invented playback-performance identity.
4. Two concurrent listeners receive the same assigned performance and real generated audio bytes; classification correction invalidates stale audio and changes station availability.
5. Listener qualification/response, separately quoted buyer fee, 85/15 purchase, signed paid webhook, withdrawal, scheduling removal and blocked new checkout.
6. The already-paid original download remains byte-identical after withdrawal.
7. Sale permission changed during processor readiness prevents a new purchase draft.

Inherited real HTTP tests cover gateway/private-server delivery, reconnect, channel switching, continuous scheduling, disk restart, rights, stale ranges and concurrency. New artist tests run handlers/service boundaries directly rather than driving browser clicks. Test evidence uses generated media and fixture rights only; it does not grant permission for real artist recordings.

## Remaining gaps

- Browser interaction: click-through artist forms, actual Play/decoding/audibility, responsive visual layout and measured listener synchronization drift are unverified. The inherited checkpoint recorded unavailable Chromium and blocked local cloud-browser routing. The current Sites workflow supplies no permitted browser-control QA capability, so no new preview/browser server was launched and no browser pass is claimed.
- Real-data wiring: actual reviewed artist recording/composition permissions, asset/duration/contract reviews, live catalog/runtime registration, and authenticated live D1/R2 transfer remain unverified. The provided isolated import path requires reviewed inputs.
- Target environment: migrations, private runtime routing/token, identity-header enforcement and current Radio Plus entitlement provenance need target-environment verification before deployment. Production was deliberately untouched.
- Retrofutura live mounting and a broader curated classification vocabulary remain future work. The approved console is preserved.

## Local recovery

Restore the new bundle's `artist-radio-loop` branch, use Node 24 and the lockfile dependencies, then run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Production migrations and deployment are separate actions and are not authorized by this receipt.
