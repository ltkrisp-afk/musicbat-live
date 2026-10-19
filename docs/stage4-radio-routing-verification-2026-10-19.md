# Stage 4 Radio isolation and D1 concurrency verification — 2026-10-19

## Scope and revisions

Only the existing Stage 4 Sandbox project `appgprj_6ad26204823c81918260d33e13429074` was deployed. Production, original recordings, Stripe logic/settings, 85/15 accounting, recovery, purchases, withdrawals and Retrofutura components were not changed by this repair.

| Revision | GitHub | Sites source |
| --- | --- | --- |
| Reported v16 baseline | `8bb87d6959a0583c96361acb818a12bc76e7955a` | `4946d337ad750e05707623efc48237985483cef5` |
| Shared routing and redacted diagnostics | `bf1efe83308c8390dd2925efeb73a1e755a89be5` | `08057483b226ddc17228143d965ea1c8f286ed1c` |
| Final tested runtime, v19 | This document's commit contains the three subsequent concurrency files | `2bc1d2efb8dc390f14d0d2691042de00b29bd5e5` |

Deployment `appgdep_6ad68f4742a08191b12cd6bfa62d6de5` succeeded at `2026-10-19T21:45:47.615070Z`, environment revision 6. Saved version ID: `appgprj_6ad26204823c81918260d33e13429074~appgver_bfb5bbdb884c819182401b7cfa442488`. Hosted Worker script version: `1d89b2e5-4af3-4733-ba85-5d135e1b1fd2`.

## Configuration and service selection

The inspected sandbox had both `MUSICBAT_CLOUDFLARE_RADIO=test` and `MUSICBAT_STRIPE_MODE=test`, D1 `DB`, R2 `BUCKET`, no configured private Radio origin/token, and no declared Radio service binding. The actual selected implementation before correction was already sandbox D1. The unsafe precedence was a confirmed isolation defect, but is not evidence that the historical request used a private service.

Both channel routes now use `configuredRadioService`. Both test flags select D1 exclusively, even if a regular service or private runtime is configured. Missing sandbox DB/R2 returns 503 with missing binding names; authentication remains enforced. Regular routing outside this mode is preserved.

## 503 evidence and smallest correction

The original request `fedd9f689d4de47ac7559e995963716d`, `GET /api/musicbat/channel`, `2026-10-19T18:55:11.338Z`, returned 503. Its retained event contains no exception stack because the route caught the error. Its exact exception remains unconfirmed.

Fresh authenticated reproduction captured two failures using newly added, redacted server diagnostics:

* `2026-10-19T19:39:22.136Z`, request `680adffaa9416058d5577e6e53c51822`: `engine.connect`, `malformed JSON`; stack starts at `D1DatabaseSession._sendOrThrow`, then D1 Radio commit and bounded transaction retry. The invalid JSON expression is the intentional optimistic conflict guard, not malformed tone data.
* `2026-10-19T19:45:18.678Z`, request `eaf0816c930066b2a386364a26a30683`: `engine.connect`, `channel-ledger-incomplete`, in the D1 advance path. Sequential D1 reads can straddle another request's boundary commit.

Clock-only forward updates previously invalidated a full-row guard. Channel reads now allow monotonic clock advancement while retaining exact config/revision/ledger guards, reject backwards clocks, and write `max(last_clock, new_clock)`. A provisional ledger mismatch now uses the existing four-attempt retry budget. Persistent incomplete history still fails closed and is never rewritten. No player, scheduling algorithm, financial state machine or UI rewrite was performed.

## Regression evidence

Two interleaving tests were first observed failing before correction: clock-only contention exhausted the malformed-JSON guard; a boundary between channel and history reads threw `channel-ledger-incomplete`. Both pass with the correction. Backwards-clock and permanently incomplete-ledger controls continue failing closed as intended. Actual config conflicts still exhaust the four-attempt budget without partial history writes.

Final focused D1 suite: **13 passed**. Full automated suite: **262 passed, 0 failed, 0 skipped**, duration 74624.245449 ms. TypeScript, lint and build completed through the Sites workflow before v19 packaging. No source changes followed that run before deployment.

Local execution records: `.sites-runtime/radio-clock-contention-before.log`, `radio-clock-contention-after.log`, `radio-ledger-boundary-before.log`, `radio-ledger-boundary-after.log`, `radio-final-contention-tests.log`. Earlier routing regression suite: 258 passed. One earlier test-loader import failure was corrected before the successful full runs.

## Authorized catalog and hosted observations

Only existing track 2, “Sandbox authorized Radio tone — 2026-10-18 evening”, was used: generated 440 Hz PCM, 90 seconds, active, Radio approved, sale disabled. SHA-256 `19b7f96db5e0b45108662f034ed62218dedb1b7756c750d5eb3e99c94b42dfff`. Recording permission and station review expire `2026-10-20T03:50:29.493Z`, covering this run. Withdrawn track 1 remained withdrawn. No original catalog was required or restored.

Authenticated Chrome owner session was retained; no second listener identity is claimed.

| UTC on 2026-10-19 | Observation |
| --- | --- |
| 21:47:07.191 | Play: one audio element, paused=false, readyState=4, time=11.422549, authority `11456:590` |
| 21:47:19.612 | Playback advanced to 23.764070 before Pause |
| 21:47:42.195 | After Pause and continued polling: paused=true, readyState=4 |
| 21:47:43.221 | Resume then Discover Artists: one audio element, paused=false, readyState=4, time=47.392173 |
| 21:48:03.263 | Return to Radio: paused=false, readyState=4, time=67.548687 |

Authenticated direct channel navigation returned JSON status=playing, trackId=2, revision=11456, sequence=590. Worker request `8095a751583c34eb26b086911430cf0f` at 21:47:20.845 returned channel HTTP 200. Audio request `aae4b6bed9570c226aa6d0c0158e588a` at 21:47:12.877 returned HTTP 206. Both used the v19 Worker script version above. Unauthenticated crawler requests returned 401 as expected, not authenticated playback failures.

The current authorized navigation response contains only the free channel (`category:null`); the physical dial is visibly preserved but disabled with “No deeper categories.” Hosted category tuning is therefore BLOCKED by the currently authorized station choices, not reported as a confirmed application regression. No channels or rights were fabricated to enable it. Routing, rights and Pause also have automated coverage. Physical iPhone/Safari and separate-listener acceptance were not repeated in this Radio repair.

At 21:48:54.127 UTC, playback had crossed the first boundary to authority `11457:591`, paused=false, readyState=4, time=28.284366. At 21:49:43.466 it remained playing at time=77.620502. At 21:49:57.312 the next authority `11458:592` was loading (readyState=0); this immediate loading observation is not by itself counted as successful playback.

A 100-event recent request sample contained 94 channel HTTP 200 responses, two audio HTTP 206 responses and one canceled Radio request, with no Radio 5xx or failure diagnostic. A separate errors-only query also found no server 5xx or `musicbat_radio_failure` in the observed window; canceled requests, a favicon 404 and unauthenticated deployment-crawler 401 responses were distinguished from authenticated playback failures. This is a bounded observed result, not a guarantee of indefinite playback.


At **21:50:11.017 UTC**, the second boundary was verified: authority `11458:592`, paused=false, readyState=4, time=14.212391. Hosted generated-tone playback, Pause/resume and navigation continuity are PASS for this observed run. The reproduced D1 503 failure mechanisms are corrected and no 503 was observed in the final run. Attribution of the original historical request's exact exception remains UNCONFIRMED. Full Stage 4 acceptance is not declared: hosted category tuning is BLOCKED by the current authorized navigation choices; separate-listener and physical Safari were NOT RUN in this scoped repair.
