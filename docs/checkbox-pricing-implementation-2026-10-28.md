# Checkbox and $5 pricing implementation — release held

Scope: PR #5, `change/5-dollar-radio-plus-and-license-consent-2026-10-28`, continuing head `bc32c1d6576d87ecc611950e4d8e2175b941517f`. No production or separate sandbox changes.

## Implemented

The existing upload rights checkbox remains in place. Its affirmative text confirms control of recording/composition rights and agreement to the Direct Licensing Agreement. An immediately following blue underlined review control opens the existing accessible dialog component, with a close button, title, version, scrollable full plain text, focus management and Escape support. Opening is optional; affirmative acceptance is mandatory.

The client obtains exact active agreement text and acceptance wording from the server with no caching. Uploads submit affirmative acceptance and the displayed version. The server rejects missing/false/stale acceptance and derives identity from the authenticated account and time from the server. An append-only acceptance record links the account, track, version, affirmative value and timestamp. Agreement versions retain the exact full text and checkbox wording and cannot be updated or deleted. Track insertion and acceptance share one D1 batch; the active version is checked again within that batch. Consent failure rolls back the track and removes its uploaded object.

Migration 0016 deliberately contains no license text and activates no agreement. This implementation remains unavailable for artist uploads until a complete approved agreement is supplied and versioned. Synthetic terms exist only in local test fixtures. No licensing compensation has been invented. This gate must not be deployed as a substitute for the complete agreement.

PR #5's $5 UI, checkout and invoice verification are retained. Full regression testing exposed the old invoice table's `CHECK(amount_cents = 300)`: `INSERT OR IGNORE` silently discarded $5 evidence. Migration 0016 preserves historical $3 rows while accepting $5 records. Invoice writes now ignore only duplicate invoice IDs; other storage/constraint failures roll back entitlement and event writes. The runtime still verifies exactly $5. This does not activate live subscriptions or change Stripe configuration.

The existing 85/15 purchase calculation, artist ownership, radio, catalog behavior and playback code are unchanged by this continuation. Updated radio-related tests change old price expectations only.

## Validation

- Full regression suite: 274 tests passed, zero failed/skipped (final run).
- TypeScript check, lint and production build passed.
- Coverage includes missing/stale consent rejection, account/time spoof resistance, disk reopen durability, immutable terms and consent, mid-upload agreement removal, transaction rollback/object cleanup, no default agreement activation, historical invoice preservation, $5 checkout parameters, paid evidence storage and retry after storage failure, optional review/mandatory affirmation, and existing purchase/withdrawal/85/15 tests.
- Local runtime: Node 24.22.1, pnpm 11.25.0. Repository CI pins Node 24.19.0; local results are not CI or real processor results.
- Browser preview did not become healthy before the Sites preview timeout. Component tests pass, but visual layout, keyboard interaction and hosted browser acceptance remain unverified.
- No real Stripe calls, payment changes, remote migrations, DNS changes, production deployments or sandbox mutations were performed.

## Verified target and release blockers

Read-only Sites metadata and custom-domain inspection positively identify production as `appgprj_6aaa2f4673e88191b504cf941f475802`, Musicbat-Minimum-Loop, https://musicbat.audio. The custom domain and SSL are reported active. Retrieved production source HEAD is `eca7c6fb7383dabcf7149ce95d8fed2cd156e2e9` (version 17).

Production's actual DB overview reports only `artist_accounts`, `hangers`, `listens`, `purchases`, `radio_feedback`, `stripe_events`, `track_keeps`, and `tracks`. It lacks the newer artist/subscription/consent tables.

The production source and PR base differ substantially: the pre-edit comparison already showed 20 changed/added app files and 21 changed/added lib files, including radio, catalog and purchase code. Deploying the full PR branch would introduce changes outside this task's restrictions. Do not treat the repository hosting manifest as proof of runtime equivalence.

Release requires:

1. The complete approved Direct Licensing Agreement and its exact version, with approved checkbox wording and approval provenance. The located requirements document explicitly says it is not an operative license; it cannot be published as one. Streaming/other licensing compensation remains unresolved, not silently zero.
2. Reconciliation or a reviewed targeted transfer onto the actual deployed source, with an additive migration plan that preserves production data. The existing production source has no equivalent subscription implementation; a full branch replacement is not an authorized shortcut.
3. Passing validation of that production-targeted revision, including browser review and payment integration verification. Current subscription implementation remains test-mode gated; $5 fixture results do not establish live enrollment availability.

PR remains draft. No merge, saved release version, or deployment was performed.
