# MusicBat recovery and Stage 4 evidence — October 17, 2026

Status: recovery investigation and local verification executed; hosted Stage 4 acceptance is incomplete. This report distinguishes source, deployment, data, local fixtures, browser execution and genuine Stripe evidence. No production change is authorized by this report.

## Exact application identities

The complete owned Sites inventory returned exactly two entries, with no next page:

| Purpose | Existing project | Address | Saved version / source |
| --- | --- | --- | --- |
| Public original application, titled Musicbat-Minimum-Loop | `appgprj_6aaa2f4673e88191b504cf941f475802` | https://musicbat.audio | v16 / `3d0b7e98bfc3180c37a4d90395ffcaaf5806efbe` |
| Isolated owner-private Stage 4 sandbox | `appgprj_6ad26204823c81918260d33e13429074` | https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site | v1 / `b42f746879862ee6b716e4de1c5269d856c5c6b1` |

`https://musicbat-minimum-loop.ltkrisp.chatgpt.site` is the platform address returned for the production project's deployment, not a third owned application. A Sites/output title, its custom domain, its repository and its local source checkout are different identifiers. No additional hosting project, database or application was created during this recovery.

Production deployment `appgdep_6ad38010c47881918c6ca916b53b4f8e` succeeded at `2026-10-17T14:03:46.665356Z`, using saved version `appgprj_6aaa2f4673e88191b504cf941f475802~appgver_d95b0fb2a0ac81918af7a196a05566b0`, environment revision 10. The currently configured production environment is revision 11; its sandbox key is masked by the platform, not readable here. Do not confuse a masked value with an absent key.

Sandbox deployment remains `appgdep_6ad26321b0fc8191b9ee83fb9243e832`, saved version `appgprj_6ad26204823c81918260d33e13429074~appgver_008abf007024819192ab231adeef10e5`. Its configuration remains revision 1, test mode and release paused. It has no Stripe API/signing secret entry, Radio origin/token or attached automation. No sandbox deployment was performed during this recovery.

## Preserved source and the previous merge

The previous turn merged PR #2 into the Cloudflare Radio development branch, then PR #1 into `engineering/phase4-acceptance-2026-10-16`, before the user's later instruction to freeze unverified merges. These events are acknowledged, not hidden or undone by rewriting history:

- Mobile change: `f40e9d1eafaa98751cbe8ae85b5f1fb6de8f98f4`.
- PR #2 merge: `0a85df3aacb5f455ea336b62e012a523389a7d9c`.
- Combined Phase 4 merge: `ceb34a998ada5d9b8b54a01eaad55dc098db46d9`.
- Subsequent browser-verification-only commits: `e82d11614a778a8ccf1736ec36c38bae99a825a1`, then workflow correction `6d22b34c193752437fc015af7412d38192c2568f`.

GitHub independently returned the combined development branch SHA after the merge. Comparing original Phase 2 `0683cdfe6869468076fbcdff6602ef2b41b13435` against `ceb34a9` returned ahead=21, behind=0 and that original Phase 2 SHA as the merge base. Comparing `f40e9d1` against it returned ahead=2, behind=0 and `f40e9d1` as the merge base. Original history and the mobile changes are therefore reachable through the combined development branch. Existing branches and original-history recovery materials were not removed, rewritten or duplicated.

Earlier temporary checkouts were removed by automated workspace maintenance. The existing sandbox source was reopened through its supported Sites source repository at `/workspace/sites/musicbat-stage4-sandbox-2026-10-16`, exactly `b42f746`. The production source was opened separately for read-only inspection at `/workspace/sites/musicbat-production-inspection`, exactly `3d0b7e9`; that checkout remains clean.

For local verification, the 18 changed GitHub blobs from original Phase 3 to the combined development commit were imported into a local sandbox recovery branch. Every imported blob's actual Git object SHA was checked against GitHub before writing it. This is an exact source projection for testing, not a claim that the Sites repository has the original GitHub commit ancestry. The sandbox manifest continues to identify only the sandbox. No GitHub default branch or production source was changed by this recovery.

The original local-only documentation checkpoint `6079b8d` is not the verified remote checkpoint for this recovery. Its previous scratch repository is no longer present. The original application history is preserved through the native development ancestry described above; do not claim an independent push or recovery of `6079b8d` itself.

## Audit of f40e9d1 and production

The `f40e9d1` diff changes only responsive inline styles in `components/retrofutura-radio.tsx`: wrapping, clamped padding/font/dial sizes, min-width and box sizing. It retains the three Genre/Subgenre/Style windows, woodgrain/metal presentation, push dial, turn buttons, keyboard/wheel handlers, membership and Free Radio controls. It changes no music, rights, artist ownership, sale pricing, Stripe handling or allocation logic. This source inspection alone does not prove browser usability.

Neither existing deployed source SHA equals this repair or the combined merge. The production repository's actual v15→v16 diff contains exactly one changed file: `app/api/musicbat/audio/[assetId]/route.ts`. It replaces track-addressable audio responses with unconditional HTTP 410 for GET and HEAD, directing users to `/channel/audio`.

However, the same deployed production source still renders `MusicBatPlayer` with `src={current.audio_url}` in `app/musicbat-loop.tsx`. All five current production track rows still point to those legacy audio URLs. This is a demonstrated source-level player/endpoint incompatibility introduced in production v16, separate from f40e9d1. Read-only direct HTTPS probes from this environment returned HTTP 403 for both the home page and an audio path; they did not establish an actual browser-visible 410. The deployed code comparison supplies the incompatibility evidence.

Production D1 still contains the five active song records: It's A lie, Surfin' Baghdad, New Way Down, Punk Rock Blues and Unity. These are catalog-presence observations, not fresh verification of each R2 object or checksum. Production has eight user tables; sandbox has 28, including recovery/evidence/rights tables. The sandbox tracks and artist_accounts tables are empty. No production catalog, identity, database row or audio object was copied or modified. In particular, per-Site user IDs cannot be copied into the sandbox as if they authenticated there.

Production is frozen under the user's explicit instruction. Restoring unrestricted legacy audio would conflict with the private authorized-Radio boundary; it was not used as a quick playback workaround. Correct deployment requires a compatible player, authorized Radio service and schema together, followed by explicit production authorization. No incomplete production patch or rollback was published.

## Executed automated verification

On the exact combined application source projected into the existing sandbox checkout:

- `npm test`: **211 tests, 211 passed, 0 failed, 0 skipped, 0 cancelled**, 32335.82801 ms.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, no reported lint errors/warnings.
- `npm run build`: exit 0, all five Vinext build environments completed.
- `git diff --check`: passed.
- New mobile browser script: JavaScript syntax check passed.

The previous 209 passing tests were preserved; the two additional existing tests exercise slow-client stream backpressure/listener cleanup and disconnect cancellation. The suite includes the connected upload/Radio/signed-fixture purchase/download/withdrawal/restart lifecycle, identity separation, rights, radio signals, duplicate events, concurrency and ambiguous payment races. SQLite and generated WAV audio are real local execution; Stripe, hosted identity and R2 remain fixtures in these tests.

GitHub's combined merge had a successful regression check. Separate CI is running against the browser-test additions; outcomes below must be filled from terminal run evidence, never inferred from a committed workflow.

## Browser verification

The current managed Work runtime has no supported control-browser capability; no ad hoc local browser or preview server was installed. Instead, the existing repository browser harnesses are being executed in a separate normal GitHub Actions runner, using generated fixtures and loopback-only endpoints. This is actual Chromium fixture-application integration, not authenticated hosted acceptance.

The browser job runs shared Radio playback/concurrency/reconnect/withdrawal tests, the actual Vinext application playback/control/navigation checks, and additional 320/375/390/768/1280-pixel console/wordmark/dial checks with screenshots. It uses no hosted identity, secret, production data or Stripe charge.

The initial verification workflow failed validation before starting a job because `runner.temp` was referenced in job-level env, where the runner context is unavailable. That workflow defect was corrected in `6d22b34` by setting the runtime module path within a runner step. No assertions were removed. The failed initial run is retained: https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39056904530 . Corrected browser run: https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39056980818 .

The corrected browser run `39056980818` passed 8 shared-Radio checks, 4 actual-application checks and 5 width checks (17 total). Later run `39057421077` also passed physical Genre/Subgenre/Style tuning through a signed local subscription fixture. These are genuine Chromium executions with simulated subscription payments, not genuine Stripe webhook evidence.

Screenshot inspection showed that layout visibility alone missed a defect: the fixed bottom player could cover the mobile knob. Stronger hit-testing reproduced it in run `39057567452`, failing with `persistent player obscures the dial at viewport 320`. That failure was retained rather than weakening the assertion.

At the owner's explicit direction on October 17, the development repair `eb0720dbc633ef924779aea0abb675d4c3d15b4a` removes the detached bottom bar and its Open Radio link. Playback controls are displayed inside the Retrofutura console between channel position and the genre windows. The root-owned audio element remains mounted, preserving playback, mute and volume across navigation. The console header, woodgrain, glass windows and physical tuning knob are preserved. No future design or interaction changes are authorized by this correction; bring those proposals to the owner before implementation.

Post-correction local results: 211 tests passed, zero failures/skips/cancellations (33132.698233 ms); TypeScript, lint, production build and diff whitespace checks passed. Browser run `39099741903` completed successfully: 8 shared-Radio checks, 4 actual-application checks and 6 mobile/physical-dial checks, 18 total with zero failures. It verifies control placement between channel position and genre windows, removal of the bottom bar, real knob hit-testing at 320/375/390/768/1280 pixels, one live audio element across navigation, and mute/volume/pause/resume. Chromium 151.0.7922.34 used generated audio and signed local subscription fixtures. No Stripe API payment was created. Screenshot inspection confirmed the controls are inside the existing woodgrain/metal console at 320 and 1280 pixels.

Regression CI run `39099741848` also completed successfully: 211 tests passed, zero failed (33561.603458 ms), TypeScript, lint and production build passed. Browser artifact `12125848499` has ZIP SHA-256 `f178c50b6223bec4dd1641a0ca94b704606f570e1dec6a2a12b697048d7a0286`; it was downloaded and its hash matched. Screenshots and JSON are retained in that GitHub Actions artifact.

Independent GitHub ref retrieval confirmed repair branch `repair/mobile-player-occlusion-2026-10-17` at `eb0720dbc633ef924779aea0abb675d4c3d15b4a`. The Phase 2 comparison returned merge base `0683cdfe6869468076fbcdff6602ef2b41b13435`, ahead 27, behind 0. Every GitHub application blob matched the local sandbox projection, excluding the intentionally different Site manifest. No default-branch update or repair merge was performed.

## Genuine Stripe sandbox evidence and remaining gates

The already-connected Stripe integration returned exactly MusicBat.audio sandbox, context `acct_1UHA0OLKJHBmA7Jw`, livemode=false. No repeated account-selection or key-generation request was submitted.

Fresh read-only Stripe retrieval confirmed historical PaymentIntent `pi_3UQw4cLKJHBmA7Jw0F0cEpwp`: succeeded, livemode=false, received 237 USD cents, application fee 67 cents, destination `acct_1UQrXtLKJHXYfqXB`, purchase metadata `8006e921-f76f-4eae-a6b5-e7cce99ae819`. Historical Checkout line-item retrieval independently returned existing prices of 200 and 37 cents. Thus the destination amount is 170 cents; the documented base split is 170/30, with 37 cents collected separately for processing. This does not verify actual processor cost, final settlement, a new payment, fresh webhook delivery or hosted download authorization.

No new checkout was created. The connected tool's operation discovery did not expose an expiration write operation; that is not proof of a particular API-key permission error. More importantly, the hosted application has no runtime API/signing-secret bindings, and connector authorization is not exported as `STRIPE_SECRET_KEY`. The masked key on production cannot be read or transferred through these tools. No evidence justifies replacing an existing key.

There are also unresolved internal engineering gates: the current Radio source adapter supplies private R2 bytes and D1 permission checks but remains dependent on the synchronous Node/SQLite scheduling service. Its source explicitly says D1 requires an asynchronous atomic state-machine adaptation. That migration and hosted unattended recovery integration have not been completed; they must not be disguised as external authentication problems or declared done after a source merge.

Hosted Stage 4 cannot pass until the supported existing sandbox runtime secret bindings and genuine webhook delivery path are available, the Radio scheduling/recovery integration is completed, actual per-Site artist/patron identities and rights-reviewed test audio are established, and the full hosted journey executes. Preserve owner-only access; do not silently make the sandbox public to receive Stripe webhooks. No live Stripe, new account/key, price change, production write, remote migration or new hosted resource occurred in this recovery.

## Preservation and release rule

Before a future completed checkpoint is reported, independently read its exact remote branch SHA and verify required ancestry. A local commit, copied tree, merge result, passing fixture suite and hosted deployment are separate facts. For every publication, verify the selected project ID and actual saved/deployed source revision. The public production project must never be the target of sandbox testing.

## Owner-approved layout publication and the blank hosted Radio

This update supersedes the earlier v1-only deployment observation above. The owner requested returning playback controls inside the Radio box, removing the detached bottom bar and its Open Radio link, and preserving the existing Retrofutura presentation. Future design or interaction proposals require owner review before implementation.

The supported source helper committed and pushed the existing sandbox repository to `d243e0342331437e6ef1f08c6db99c6cbde645f2`, packaging the already-tested build. Sites and GitHub are separate repositories: this Sites commit is not claimed to have the original GitHub ancestry. The verified application files match GitHub repair commit `eb0720dbc633ef924779aea0abb675d4c3d15b4a`; the Site manifest retains only the sandbox identity. This publication includes the exact previously merged development source projection documented above, with no schema migration or catalog copy.

Owner-private deployment `appgdep_6ad455e0e69c8191973c519d5ab1a26f` SUCCEEDED at `2026-10-18T05:15:23.321592Z`, environment revision 1. Saved version `appgprj_6ad26204823c81918260d33e13429074~appgver_173a5e106e3081918e3c2bf7a21f7898` (v2), source `d243e0342331437e6ef1f08c6db99c6cbde645f2`, URL https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site . The production project, default branch, live Stripe and access policies were not modified.

A fresh read-only database check during the owner's blank-page report returned zero sandbox tracks (no further page), while production returned five active track records: It's A lie, Surfin' Baghdad, New Way Down, Punk Rock Blues and Unity. The logs of the then-deployed v1 sandbox independently showed repeated authenticated GET `/api/musicbat/channel` responses with HTTP 503, including request `236dd71583d9bee1c3cf7a18bc966e38` at `2026-10-18T05:13:26.309000Z`. The source returns 503 when no private Radio service is bound. This is hosted failure evidence, not expected behavior merely because the page is a sandbox. The UI correction does not supply a catalog, Radio runtime or Stripe bindings, and it must not be reported as fixing hosted playback or completing the purchase loop.

The sandbox is still incomplete: establish an authorized sandbox artist/catalog and private Radio runtime, bind the existing test credential/signing secret through supported secure hosting settings, establish genuine signed webhook reachability without changing owner-only access, then execute the real hosted purchase/download/withdrawal/recovery journey. Missing hosted capabilities and unfinished scheduler/recovery integration remain explicit Stage 4 acceptance conditions. The owner has not been asked to reupload music, generate another key or repeat account authorization as part of this layout correction.

## D1 Radio continuation and current Stripe delivery mismatch — October 17 evening

The owner confirmed cancellation of the other production publishing request. A fresh hosting-history read still returned public production v16 (`3d0b7e9`) and sandbox v2 (`d243e03`); no newer production version was present. Do not treat an interrupted conversation publishing display as a deployment result.

The development continuation addresses a demonstrated missing backend, not a visual redesign. GitHub commit `c533153bd4970355f7e47144e8f8f40d55549cc6` on the existing repair branch adds an asynchronous D1 implementation of the existing scheduler, guarded atomic batches, first-primary reads, bounded conflict retries, durable channel/listener/audit timelines and private R2 delivery. It requires explicit `MUSICBAT_CLOUDFLARE_RADIO=test` and `MUSICBAT_STRIPE_MODE=test`; it is disabled for live mode or missing opt-in. It creates no channels, imported catalog, rights grants, databases, buckets, accounts, prices or migrations. Radio management/feedback and channel routes support the same explicitly selected D1 service. Existing Node/SQLite fixtures remain available and their policy behavior is preserved.

Executed post-change local checks: **218 tests passed, zero failed/skipped/cancelled**, 35140.298365 ms; TypeScript, lint, production build and whitespace checks passed. Seven new tests verify behavioral parity with the existing live scheduler, concurrent workers, withdrawal during commit, audit rollback, missing rights/Plus/storage, bounded contention exhaustion, restart from a closed/reopened disk database, and actual local Workerd with D1/R2. The Workerd test verifies authenticated range GET/HEAD and rejection of stale audio after withdrawal. Its identities, bytes and grants are explicit generated fixtures; it is not hosted or genuine Stripe evidence.

An initial Node-to-Miniflare proxy call failed to serialize a Headers object. That was an emulator proxy boundary, not demonstrated production range failure. The test was corrected to execute the service inside the actual local Worker runtime; the range checks then passed without changing production range behavior. The failed harness attempt was not counted as a successful acceptance run.

GitHub regression run `39101035401` completed successfully against c533153: all 218 tests, TypeScript, lint and build passed. Browser run `39101035359` passed the 8 shared-Radio and 4 actual-application checks but failed a mobile geometry assertion. Separate awaited element measurements could straddle a channel-poll update that removes the connection message. The mobile test now measures all three elements in one synchronous DOM snapshot, retaining both placement assertions and knob hit-testing. The corrected browser run `39101209418` completed successfully on GitHub commit `84976c8d1003828275abc5423d27dadcf9cb14ed`: 8 shared-Radio, 4 application and 6 mobile/physical-dial checks passed, 18 total. Regression run `39101209415` also completed successfully, including all 218 tests, TypeScript, lint and production build. The failed attempt is retained. The existing 18-check Chromium harness is retained, including direct knob hit tests and player placement. No browser has yet exercised the D1 backend against the hosted sandbox.

The D1 adapter currently reads complete channel history and fails closed above 10,000 result rows per query; bounded retry exhaustion also fails closed. Scale testing and pagination/state compaction are not claimed complete or silently moved into acceptance. The hosted catalog/channel review import, actual artist identity/audio, unattended checkout recovery integration and authenticated hosted browser acceptance remain unresolved. The new backend source alone is not a completed Radio or purchase journey.

Fresh Stripe account inventory returned the existing **MusicBat.audio sandbox** `acct_1UHA0OLKJHBmA7Jw`, livemode=false. Fresh `GetWebhookEndpoints` returned one enabled test destination, `we_1URbNtLKJHBmA7JwLogNObce`, URL **https://musicbat.audio/api/musicbat/stripe/webhook**, subscribed to checkout completion, async success/failure, expiration and refund events. This supersedes the older empty endpoint inventory above. It targets the public application, not the separate private Stage 4 sandbox. No endpoint, event selection, key or signing secret was changed.

Fresh runtime inspection still shows sandbox environment revision 1 with no Stripe API/signing-secret bindings. Public environment revision 11 has a masked STRIPE_SECRET_KEY; it cannot be read or copied by the exposed hosting tools. The connected Stripe app remains authorized, but its credential is not exported as an application runtime secret. No repeated account selection or key generation was requested.

Stripe's documentation search explicitly states that webhook requests cannot carry arbitrary custom authorization headers and need a reachable HTTPS POST endpoint. Sites private service access requires OAI-Sites-Authorization, and the exposed Sites tools offer no per-route public ingress exemption or masked-secret transfer operation. Therefore a supported narrowly exposed ingress/relay for this existing private sandbox is required before registering a sandbox-specific destination. Keep the current public-application test destination unchanged. Preserve raw bytes and Stripe-Signature, then securely bind the corresponding signing secret and existing test API credential to the sandbox. Do not make the whole sandbox public, create an additional hosting application, rotate keys or use production as a relay without separate authorization.

This is a specific hosting/access limitation, not a need for a different Stripe account. No fresh payment or unsigned success simulation is substituted for the required genuine signed hosted delivery.

### Supported ingress escalation

The task checked all exposed Sites hosting controls and the supported identity, integration and MCP-server guidance. These offer Site-wide access policy and a private service bearer header, but no webhook-only public ingress control. Searching the plugin catalog for Cloudflare returned no matching plugin in this session. No Cloudflare/Stripe credential environment variables or local secret environment files are available; the only checkout environment file is the non-secret example. No credentials were printed or regenerated.

The smallest platform request is: provide a supported public POST ingress for `/api/musicbat/stripe/webhook` on existing private project `appgprj_6ad26204823c81918260d33e13429074`, preserving raw body and Stripe-Signature and keeping other application routes owner-private; also provide supported secure binding/reuse of the existing MusicBat.audio test API credential. No new application, database, bucket, production modification or key rotation is authorized. The current test destination must remain unchanged until that ingress exists and can be independently verified. Support was subsequently contacted and human escalation was acknowledged; see the October 18 update below. No ingress has been enabled.

The backend source is preserved in GitHub and has not been deployed or enabled on the sandbox; live sandbox remains v2 with only the approved player restoration. Do not claim a hosted backend deployment, real webhook delivery or completed purchase loop from these passing development tests.


### Official Support escalation — October 18, 2026

Following explicit owner authorization, the technical question was submitted through the official help.openai.com Support chat. The ordinary contact form acknowledged receipt of the existing owner contact email. No credentials, recordings, purchase data or secret values were supplied.

AI-assisted Support stated that the published Sites documentation describes Site-wide access and does not describe webhook-only public ingress, route exceptions or managed authenticated forwarding. This is an AI-assisted answer, not human engineering confirmation or a configuration change. The follow-up explicitly requested a human support specialist or Sites team, preserving owner-only access and forbidding resource creation, sharing changes and new Stripe keys.

The authorized Escalate action was completed. The interface confirmed **“Escalation requested”** and **“Escalated to a support specialist; You can expect a response in the coming days. Replies will also be sent via email.”** No case number was displayed. Human confirmation of a supported approach remains pending. The browser conversation was retained for continuation. Screenshot evidence: `docs/evidence/musicbat-support-escalation-2026-10-18.jpg`.

No production, sandbox audience, deployment, Stripe endpoint, key or pricing setting was changed. The 218 passing regression tests and 18 fixture browser checks remain the latest automated evidence; they were not rerun for this documentation-only escalation. Stage 4 hosted payment acceptance remains incomplete.


### Correct sandbox Stripe destination and secret binding — October 17, 11:34 p.m. Pacific / October 18 UTC

The owner explicitly requested a new test webhook destination at the actual published sandbox URL and configuration of its signing secret. Reused the authorized MusicBat.audio sandbox account `acct_1UHA0OLKJHBmA7Jw`, livemode=false. Fresh inventory confirmed only the incorrect public-application destination before creation. Created **`we_1URnfmLKJHBmA7JwHFxEtMFg`**, enabled, API `2026-08-26.dahlia`, URL **https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/api/musicbat/stripe/webhook**, with checkout completion, async success/failure, expiration and charge-refund events. Independent Stripe list confirmed the exact ID, URL and test mode. The old public-application endpoint was not modified or reused.

Transferred the returned signing secret directly in session memory into Sites as secret `STRIPE_WEBHOOK_SECRET`, never printed or written into source or reports. Environment revision advanced from 1 to **2**. Applied it by redeploying the existing saved version 2, source **`d243e0342331437e6ef1f08c6db99c6cbde645f2`**, without source changes, migrations or audience changes. Deployment **`appgdep_6ad4687e9b0881918707d7c534a8bd8e`** returned **succeeded**, environment revision 2, at `2026-10-18T06:34:46.034181+00:00`. This supersedes the prior statement that the sandbox has no webhook secret. Its API credential remains absent.

Read-only D1 inspection confirmed 28 user tables, including purchases, stripe_events, checkout_recovery_jobs and checkout_payment_evidence. Returned columns match the expected Phase 1 withdrawal and Phase 2 recovery fields. Tracks, artist_accounts, purchases, stripe_events, checkout_recovery_jobs and checkout_payment_evidence each returned zero rows with no further page. The viewer cannot inspect migration journals, triggers or indexes: full migration execution is not independently verified from table presence. No migration was run.

The requested purchase journey could not execute: sandbox has no tracks or connected artist records; STRIPE_SECRET_KEY is absent; MUSICBAT_RELEASE_PAUSED remains 1; owner-private access still lacks verified Stripe ingress. The webhook route explicitly returns 503 while paused, and reconciliation requires runtime Stripe API access. Connected-app authorization is available but is not a runtime credential export. Native API discovery offered endpoint creation/list/retrieval, not a test delivery operation. No unsigned/manual callback, synthetic purchase or connected-app-only charge substitutes for the application journey. No new Checkout, payment, signed delivery, allocation reconciliation or download was verified. Human Support escalation remains pending. A registered endpoint and successful secret deployment are setup evidence, not delivery evidence.

Preserved existing music, artist permissions, Radio design and physical tuning knob; public production, prices and live Stripe untouched. Latest 218 regression tests and 18 fixture browser checks were not rerun for this configuration-only action. Stage 4 remains incomplete.


### Runtime Stripe credential verified — October 18, 2026, 12:12 a.m. Pacific

After the owner entered the existing test API key directly into Sites, a fresh environment read confirmed `STRIPE_SECRET_KEY` is present and marked secret in the exact Stage 4 sandbox, environment revision **4**. Both API and webhook secrets are masked; no value was printed or archived. No key was created or rotated. The unchanged saved v2 was initially redeployed as `appgdep_6ad470855198819181f6eb964942c2ea`, succeeded at revision 4. Private service access to Connect returned the application pause response, HTTP 503, proving that route did not yet authenticate with Stripe.

To obtain runtime evidence without unpausing purchases, added GET `/api/musicbat/stripe/readiness` only. The check is gated to the exact sandbox base URL, request origin and explicit test mode, rejects non-test credentials before any Stripe request, reads `/v1/account` and `/v1/balance` using the existing runtime API helper, verifies expected account and livemode=false, and returns sanitized booleans/status. It never returns balances, secret values or raw Stripe errors and never writes purchase data. It remains behind the unchanged owner-private Sites access boundary; service access supplies no fabricated visitor identity. Production receives no deployment.

Opened the existing Sites remote into `/workspace/sites/musicbat-stripe-readiness` at exact published source `d243e0342331437e6ef1f08c6db99c6cbde645f2`; preserved the separate development checkout and its unshipped D1 changes. The published diff is exactly two files: the read-only endpoint and its regression tests. Built/pushed Sites source **`2d09877a2a1f3edfaca183de84f3e2745a19ed49`**; saved sandbox version 3 `appgprj_6ad26204823c81918260d33e13429074~appgver_7ec81bf703b881918755911597aed120`. Deployment **`appgdep_6ad47146b75c81919ddb32704ef9d001`** succeeded at environment revision 4, `2026-10-18T07:12:16.738552+00:00`.

**Genuine hosted runtime result:** authenticated private service GET returned HTTP **200**, `authenticated=true`, `account_id=acct_1UHA0OLKJHBmA7Jw`, `livemode=false`, `webhook_secret_configured=true`, `purchases_paused=true`. This executes genuine Stripe GET requests from the deployed application using its own secret binding, not the connected Stripe app. Independent hosted Worker log confirmed GET readiness HTTP 200, request **`edc8d8db32074cffc751ae27dbd83cb1`**, timestamp `1792307556882`, Worker version `8c2cdcc0-312b-4d69-9886-d8b082f709a1`.

New regression tests: **3 passed, 0 failed**, covering successful read-only proof with pause retained; wrong host/configuration, live mode/key and missing credential rejected before Stripe; wrong account, wrong returned mode and permission failures rejected with sanitized errors. TypeScript, lint and production build passed. Existing 218-test and 18-browser evidence was not rerun or relabeled as a new aggregate pass.

The API credential prerequisite is now VERIFIED and supersedes prior absent/unverified statements. It does not prove Checkout write permissions, private webhook ingress, signed delivery, payment allocation or a purchased download. Purchasing remains paused. Existing Stripe endpoint and signing secret are unchanged. No production, music, design, permissions, migration or other infrastructure change was made.
