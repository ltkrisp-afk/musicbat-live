# Phase 3B persistent radio runtime

## Scope and verification

This change resumes `329dfb8f0ed22a38e0d7666da3e57e0cb40283fa` in an isolated checkout. The latest recovery ZIP was materialized and its embedded bundle hash matched `3c37e45e613ecb98edf9c6733eba199923d1ca756a379cdab7eefb037ccb9e66`. The verified GitHub branch `ltkrisp-afk/musicbat-live:bat-radio-shock-room` was `ed3c566c5eba7166da7be65ace12c8cf334a4037`, an ancestor of the recovery commit. Both histories are retained in `preserved/github-bat-radio-shock-room` and `preserved/phase3b-329dfb8`. No force push, deployment or production modification occurred.

The runtime and real HTTP playback boundary are implemented and tested. **Browser Play, decoded/audible output, measured listener drift, and hidden-tab behavior remain UNVERIFIED.** Retrofutura remains blocked. Passing server tests is not a substitute for the browser gate.

## Implemented architecture

- `radio/runtime.ts`: persistent Node SQLite authority, WAL, foreign keys and serialized transactions; continuous scheduler independent of listeners; source import, withdrawal and membership lookup.
- `radio/server.ts`: private HTTP sidecar. The executable binds loopback only. Private requests require a server token of at least 32 characters and trusted gateway identity/territory; listeners cannot supply entitlement through JSON.
- `lib/private-radio-service.ts`: optional explicit private HTTP backend for the existing application gateway. HTTPS required outside explicit loopback tests; redirects rejected; bounded requests; token retained server side. Existing `RADIO_SERVICE` binding has priority. No configured service means no playback.
- Existing application `/channel` and `/channel/audio` routes use the same gateway and service adapter tested over HTTP.
- Authoritative source rows and scheduler catalog are on the same database. Approved uploads do not create these records or infer grants. Import requires recording and composition evidence, reviewed contract restrictions, lawful-copy provenance, immutable audio hash/size/type, metadata and duration evidence. PCM WAV duration is checked against file bytes; MPEG/FLAC duration requires an independently reviewed evidence reference.
- Each delivery checks current source status, grant, assignment, channel territory and immutable bytes. Range/HEAD, suffixes and If-Range are supported. Rights and membership are rechecked after asynchronous storage access; stale decisions fail closed.
- Asset hashes become scheduler source revisions. Changing an asset invalidates the current performance. A revision-qualified authority ID avoids old media URLs being reused on zero-elapsed cancellation.
- Explicit reviewed direct-contract repeat gaps and rolling count limits are enforced independently of statutory rules. `null` means the privileged reviewer explicitly found no modeled repetition limits. Contracts with other unsupported terms must not be imported as unrestricted.
- The legacy `/api/musicbat/audio/:assetId` radio endpoint returns 410. Catalog/upload asset IDs and stored files remain intact. Paid purchase download handling and historical purchase snapshots are untouched.
- The existing shared player joins Free Radio on first connection, times out stuck requests, unloads on missing/expired authority and hidden tabs, and rejoins the persisted channel. No individual track, seek, replay or Next commands are accepted.
- Statutory live playback remains unconditionally disabled. No registration or reporting was presumed verified.

## Run and import in an isolated environment

Use Node 24 with the lockfile dependencies installed, including TypeScript. The main application's existing build remains separate from the Node sidecar.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:radio:browser
```

The browser test requires Playwright and its matching Chromium executable. Optional explicit paths: `MUSICBAT_PLAYWRIGHT_MODULE`, `MUSICBAT_CHROMIUM_PATH`. The browser test uses the exact mounted SharedRadioPlayer with the real gateway, private HTTP service, disk database and generated PCM test signals; commerce and the rest of the MusicBat page are not part of that harness.

Set private server environment outside source control:

- `MUSICBAT_RADIO_DATABASE`: absolute writable SQLite filename; no in-memory fallback.
- `MUSICBAT_RADIO_ASSETS`: private asset root; do not expose as static/public files.
- `MUSICBAT_RADIO_GATEWAY_TOKEN`: independent random secret, at least 32 characters.
- `MUSICBAT_RADIO_PORT`: optional loopback port, default 5180.

`npm run radio:import -- /absolute/reviewed-manifest.json` imports a version 1 JSON object with `sources`, `channels` and `memberships` arrays. Each source is `{track,asset}` following exported `ScheduledTrack`/`ReviewedAsset` types. Each channel is `{id,config}` following `SharedChannelConfig`, with `gate:null`. Each membership is `{id,plusUntil,evidence}`. Source imports are atomic per record. Existing channel configuration/timeline is preserved rather than reset. Repeating an import is not a mechanism for revising established channel policy.

`npm run radio:start` starts the sidecar and scheduler. Listener-facing application configuration is an existing private `RADIO_SERVICE` binding, or explicitly configured `RADIO_RUNTIME_ORIGIN` and `RADIO_RUNTIME_TOKEN`. An HTTPS private reverse proxy/network path to the sidecar must exist before that production configuration can be used. None was created in this task.

## Verification evidence

The automated suite includes preserved policy, engine, commerce and upload tests plus new runtime and real HTTP tests. It covers simultaneous listeners, all three category levels, channel switching, reconnect, continuous ticks, disk restart, withdrawals, stale byte ranges, source hash/duration mismatch, false evidence, direct repetition limits, membership expiry during media reads, unauthorized users/territories, forged headers, cross-origin mutations, empty catalogs and damaged ledgers. Existing multi-writer SQLite concurrency tests remain passing.

Two old legacy-endpoint tests were updated to assert 410 and intact stored uploads. Their earlier range/withdrawal coverage now runs against the real shared runtime. The previous versions remain in the preserved Git history and input recovery archive. No failing check was skipped to obtain a passing count.

Test media is generated by `e2e/fixtures.mjs`, not real artist recordings. Synthetic permissions and membership evidence apply only to these generated fixtures.

## Exact remaining blockers

1. Browser verification environment: no Chromium executable is installed. The official Playwright Chromium download returned an invalid/truncated ZIP. The available cloud browser rejected `http://terminal.local:5178` with `net::ERR_BLOCKED_BY_CLIENT`. Therefore the authored browser suite could not run. A permitted browser executable with network access to the isolated server is needed. No browser check is counted as passed.
2. Real artist playback: no authoritative reviewed production rights/asset manifest was supplied. Import requires actual recording/composition permissions, applicable contract terms, lawful copies, reviewed durations, immutable hashes and current withdrawal status. Upload attestations and Library audio alone cannot substitute. Production D1/R2 and membership data have not been fetched or changed here. The completed local authority uses its own reviewed-source SQLite records and private files; it is not an authenticated live D1/R2 bridge.
3. Production wiring/authentication: private routing, secret configuration, current membership provenance and enforcement of trusted hosting identity headers require verification in the target hosting environment before deployment. The local HTTP fixture uses server-owned opaque cookies and generated memberships; it does not prove production login or billing configuration.

GitHub remains at its verified earlier commit. Nothing was pushed: publishing to an auto-deploying branch without inspecting/controlling its deployment behavior would exceed this task's no-production-change scope. The recovery bundle contains complete history and preserved refs for a later non-destructive synchronization.
