# Phase 3B player integration — October 12, 2026

Status: isolated integration bridge implemented; live service integration and browser playback remain UNVERIFIED. Do not start Retrofutura work or deploy this checkpoint as a working radio.

## Preserved baseline

Original committed baseline: a848191bbe80a704dd1b9ef3684e977ea4256249. The reported 55-test additions were uncommitted in /workspace/scratch/f4cf28b68e56/phase3b. That directory and its recovery artifacts were read only. An isolated copy was made, and the unchanged original suite passed 55/55. The preexisting Retrofutura component is retained byte-for-byte solely because existing offline tests import it; it is not mounted or redesigned.

## Implemented changes

- SharedRadioEngine now accepts an execution mode, defaulting to simulation. Live evaluation still rejects statutory recordings unconditionally.
- createRadioTransport connects transactional shared decisions to HTTP Request/Response delivery. It accepts category-only commands and reconnects. Media requests identify only the listener's currently assigned channel and performance sequence. Missing identity, entitlement, territory, source eligibility, expired/stale decisions and failed storage deny delivery. Rights are rechecked after asynchronous media/source reads. Simulation never emits media.
- Mandatory sourceEligible and media adapters are injected dependencies. They are NOT implemented against production D1/R2 by this checkpoint. A callback returning true in a synthetic test is not rights evidence.
- /api/musicbat/channel and /api/musicbat/channel/audio use a private RADIO_SERVICE binding. Listener identity is taken from the existing server authentication boundary; incoming listener/territory headers are discarded. Territory comes from request.cf. Entitlement must be resolved by the private service. Mutation requires a matching Origin. Missing binding or failed transport returns 503, with no legacy fallback.
- Existing MusicBatLoop mounts SharedRadioPlayer, which polls shared snapshots, uses the server offset and performance boundary, rechecks after reconnect, guards stale responses and unloads audio when authority expires or fails. It offers simple Genre → Subgenre → Style selection and Free Radio. No track/seek/replay/Next commands are submitted. Existing commerce and listener feedback callbacks remain attached. Listening qualification uses locally accumulated heard time rather than a late join's channel offset. Performance keys reset listener state even when the recording repeats.
- Browser-local selection and automatic advance are removed from the mounted radio path. Existing catalog energy classification remains available to artists; energy is not silently mapped to a new server category dimension. Upload success no longer claims immediate radio eligibility.
- The older direct-authorized asset endpoint remains unchanged and independently checks permissions. It is not used by the new radio player and is not governed by shared scheduling. This is a remaining transport-boundary review item before production readiness; do not claim all public media endpoints are integrated.

## Verification

66 tests passed; 0 failed, skipped, cancelled or TODO. The original 55 test cases are retained: three source-wiring assertions were updated for the authoritative player; their originals remain in the pre-integration preservation archive. Eleven transport/gateway tests were added. Existing disk restart, eight-writer concurrency, rolling-window, small-catalog, switching, withdrawal, reconnect, membership and ledger tests remain passing. New cases cover live direct decisions/media fixtures, statutory-live denial, stale/forged requests, source-side revocation, revocation during storage read, simultaneous listeners, territory, authentication, missing binding and service failure.

TypeScript --noEmit, lint (zero errors/warnings), production build and git diff --check passed. Tests exercise real SQLite and Request/Response handlers with synthetic media and injected authority. They do not exercise audible browser output, browser drift, network latency acceptance or a production service. Dependencies were reused from the preserved workspace; clean installation remains unverified.

## Remaining engineering gates

1. Implement and verify a compatible persistent private runtime adapter (SQLite connection with transaction semantics or a deliberately adapted Durable Object), continuous scheduler and RADIO_SERVICE binding. D1 must not be treated as synchronous SQLite.
2. Implement sourceEligible/media adapters against authoritative current source rights, withdrawals, territory, lawful copies, immutable asset mapping, reviewed duration/metadata and applicable direct-license contract restrictions. Existing upload attestations cannot seed grants. Close or explicitly authorize legacy media pathways.
3. Resolve trustworthy server membership and production authentication provenance; no entitlement comes from listener JSON.
4. Run local end-to-end browser tests with the real service: audible synchronized clients, pause/resume, channel transitions, offline/hidden tabs, stale requests, withdrawal, media expiry and actual range delivery. The player uses a one-second poll and three-second authority watchdog; buffered bytes cannot be recalled. This is not a segmented statutory broadcast and no drift bound has been verified.
5. Verify operational reporting/licensing separately. Statutory-live remains disabled in the compliance evaluator and statutory endpoint. No statutory activation is authorized.

No deployment, production data migration, external GitHub push or public broadcast was performed. Required next work remains ENGINE → PLAYER INTEGRATION → VERIFICATION; Retrofutura is blocked pending completion of these gates.
