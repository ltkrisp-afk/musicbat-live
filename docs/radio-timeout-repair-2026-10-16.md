# Radio timeout diagnosis and development repair — October 16, 2026

Continuation baseline: `1433110dfe236fc54cb21da21dac2ccfa286917a` on
`engineering/phase4-acceptance-2026-10-16`. Original Phase 1–3 history is
preserved. No onboarding, backup, deployment or original source reconstruction
was repeated.

## Cause and scope

The prior Chromium timeout was reproduced in the isolated Radio browser stack,
not in a short playback check of the actual application. Instrumenting that
stack exposed more than 12,000 browser exceptions in roughly twenty seconds:
`WebSocket closed without opened`, preceded by a refused Vite WebSocket
connection. Exceptions began before playback and continued during clicks. The
unmodified test had collected those errors silently until its final assertion.

`e2e/local-stack.mjs` used Vite middleware mode with `hmr: false` and
`ws: false`, while its pages still loaded Vite's development browser client.
The client attempted an unavailable WebSocket transport and repeatedly reported
failed-connection exceptions. Chromium/renderer CPU activity increased and
Playwright could not reliably finish clicks. This is a development fixture
transport failure; it is not evidence that Stripe, D1 or the application's
Radio engine timed out.

The targeted fixture repair creates its HTTP server before Vite and supplies
that listener as `server.hmr.server`. HTTP and WebSocket traffic now use the
same owned loopback server/ephemeral port. Middleware routes, authenticated
Radio gateway, disk-backed runtime, permission checks and immutable media
remain unchanged. No browser errors are suppressed and playback assertions
are not relaxed. With the same system Chromium, all eight existing browser
checks completed after this change.

A separate, reproducible stream-writer defect explained the Node listener
warnings: every `write(false)` registered both `drain` and `close`, but only
the event that fired removed its once-listener. A 32-chunk slow client retained
32 close listeners; disconnect retained a drain listener. Two new regression
tests failed before the repair. `radio/server.ts` now removes both listeners
when either wait completes, including an already-destroyed response. Both tests
pass. This listener leak was **not established as the cause of the Chromium
click timeout**. The change is committed development code; no deployed
sidecar or production service was modified.

## Actual application evidence

The existing `pnpm dev:acceptance` command ran the actual Vinext application,
root persistent player, screens, artist route and existing offline acceptance
adapter. Identities, reviewed PCM recordings, SQLite/object storage and purchase
processor remain isolated fixtures; this is neither hosted D1/R2 nor Stripe
sandbox evidence. No payment was created.

Initial readiness was checked before browser execution. The first instrumented
page render took 7.4 seconds; a warm render took 129 ms. The identity endpoint
returned promptly. A separate probe before the server was ready received
connection refused; it was retried after readiness, not called a playback bug.

Chromium `154.0.8037.57` completed four application checks:

1. Load authorized Free Radio, request `/api/musicbat/channel/audio`, and decode
   a nonzero PCM waveform through a browser AudioContext/analyser after a real
   Play gesture. This verifies decoded signal, not human-perceived sound or
   physical iPhone playback.
2. Mute/unmute, set volume to 0.35, pause and resume using the actual controls.
3. Switch Discover Artists, Manage Songs, Add Track, Shock Room and Radio;
   navigate to the real client-side artist route and back with Open Radio.
   The original audio DOM element and volume survive; playback advances.
4. Reject unauthenticated Radio with HTTP 401; require zero browser page/console
   errors, no unexpected failed requests, successful media delivery and no API
   error responses in the authenticated page.

The strengthened final application run passed **4/4** in 21.205 seconds,
including Chromium startup. Its 34 completed API requests took at most 164 ms;
observed API response statuses were 200 and 206. There were no browser page or
console errors. Normal aborted media/navigation requests were recorded as
`net::ERR_ABORTED`, not counted as API failures. The previous application run
also passed 4/4 (16.829 seconds; API maximum 73 ms).

Raw local evidence: `.sites-runtime/application-browser-evidence.json`,
`application-browser-final.log`, `browser-investigate.log`,
`isolated-diagnose.log` and `radio-investigation-server.log`. Diagnostics never
printed secret values. Temporary diagnostic scripts were removed after use;
the supported browser regression is `scripts/musicbat-application.e2e.mjs`.

## Resources and timing

The cloud allocation reports four CPU cores and 32 GiB RAM. No memory limit,
OOM or OOM-kill events were recorded; observed memory use during diagnosis was
about 2.2 GB. Local API latency in the successful application runs does not
support an API/database outage or network timeout as the click failure cause.

An isolated browser run after the transport repair passed all **8/8** checks,
including two independent listeners with measured initial drift **15.796 ms**,
genre/subgenre/style tuning, pause/resume, network recovery, withdrawal/stale
range rejection, empty-catalog silence and access-control checks.

A subsequent run overlapped build/type/lint/regression work and failed its
unchanged 350 ms initial-drift assertion at **457.813 ms**. CPU throttling grew
during that overlap. That result is retained as a timing failure under shared
load, not hidden or treated as the original WebSocket flood. Run timing-sensitive
browser verification sequentially after builds/regressions; no production
capacity or Phase 5 load resilience is inferred from these checks.

## Final checks after both repairs

- Targeted stream/HTTP/persistent-player/request-queue regressions: **7/7** passed.
- Full `pnpm test`: **211/211** passed, zero failed/skipped/cancelled,
  124.933 seconds under the overlapping build/browser workload.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed, zero errors/warnings. An earlier lint attempt found two
  require-style-import errors in the temporary ignored diagnostic helper, not
  application code. That one-off helper was removed and lint reran successfully.
- `bash scripts/sites-env.sh -- pnpm build`: passed; no deployment.
- Final sequential `pnpm test:radio:browser`: **8/8** passed, initial drift
  **147.421 ms**, zero browser page errors and no listener warnings. This was
  run after the competing build/regressions finished. Log:
  `.sites-runtime/radio-browser-sequential.log`.
- Strengthened `pnpm test:application:browser`: **4/4** passed as recorded above.
- `git diff --check`: passed.

No tolerance or permission check was weakened. The overlap timing failure
remains documented; this is not a controlled load/capacity certification.

## Repeatable commands

Use Node 24.19.0 and pnpm 11.25.0 in `/workspace/musicbat-live`.
Start `pnpm dev:acceptance` and wait for `GET /__local` to return 200. Then:

```sh
MUSICBAT_CHROMIUM_PATH=/usr/bin/chromium pnpm test:application:browser
MUSICBAT_CHROMIUM_PATH=/usr/bin/chromium pnpm test:radio:browser
```

The application browser command refuses non-loopback origins and requires the
existing offline acceptance marker before login. It uses no real Stripe key,
new account, hosted data or payment. `MUSICBAT_ACCEPTANCE_ORIGIN` may select
another existing loopback acceptance listener. The isolated Radio command owns
and cleans up its private generated-audio stack. Do not overlap timing checks
with CPU-intensive builds. The browser path uses this cloud image's system
Chromium; it does not disable TLS or package integrity verification.

## Phase 4 continuation

Hosted sandbox acceptance is still blocked: the current machine has no
`STRIPE_SECRET_KEY`, genuine `STRIPE_WEBHOOK_SECRET`, verified
`MUSICBAT_PROCESSING_BPS`/`MUSICBAT_PROCESSING_FIXED_CENTS` bindings or existing
`.env.local`. No approved isolated hosted target is available; the recorded
project is production. Earlier missing reviewed Unity audio/ownership/account
records were not fabricated or replaced. A hosted deployment, credentials and
actual signed webhook delivery cannot be substituted by the offline fixture.

The remaining gate is an owner-authorized isolated target with secure test-mode
bindings, reviewed assets/identity, compatible private Radio/D1/R2 and recovery
execution. No public deployment, remote migration, production change, live key,
real charge or Phase 5 load test was performed.
