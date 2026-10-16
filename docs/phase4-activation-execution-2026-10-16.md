# Phase 4 minimum activation packet — October 16, 2026

Baseline `e60c051d31d57a487d58e9b980cb48e0c902306f`, including original
`d5287cd` hosted inventory and original Phase 1–3 ancestry. No completed
application suite, browser check, onboarding or backup was repeated.

The graph was checked directly: `d5287cd` and Radio repair `202e5d4` are parallel
children of `1433110`, merged by `221dcc3` with both original parent commits.
`e60c051` descends from that merge, and all requested checkpoints descend from
original Phase 3 `b671d84`. They were not assumed to be a linear sequence.

Machine-readable packet: `ops/phase4-activation.json`. Null resource IDs,
mechanisms and price fields are **unknown**, not absent, free or approved.
This packet does not execute, deploy, unpause, bind secrets or modify billing.

## Exact access handoff

The user has authorized read-only inspection of **Kris's workspace**, ID
`tea-da1njsjl550s739b50m0`. Do not ask again for workspace selection or a new API
key. Render is connected in the main ChatGPT conversation. This cloud task's
available tools contain no Render connector or tool-search function, and its
machine has no Render CLI authentication or injected Render API authentication.
These are access-path observations, not a claim that the user's connection is
missing. Requests to Render's pricing and API documentation returned HTTP 403;
current service/billing state was not retrieved.

The missing capability is a read through that **existing connection**, scoped
to the authorized workspace. The agent must own these calls and reconcile their
results; the user should not shuttle messages, locate prior evidence or provide
another workspace authorization. The required operations are:

1. Complete paginated service inventory, including suspended services. A null or
   truncated response must be diagnosed, never treated as zero services.
2. Existing Stage 4 service ID/name/type, suspension state/reason, region,
   instance count, plan, linked repository/branch/last deployed commit,
   automatic-deployment setting and build/start-command suitability. Inspect
   commands privately; do not paste commands containing inline credentials.
3. Attached disk ID/mount/size, service associations and restart persistence.
   A disk on another service is not an available shared Radio volume.
4. Environment-variable **names and presence only**, linked environment-group
   names, ingress/private-network reachability and existing TLS/reverse proxy.
5. Last deployment state, existing worker/cron/service dependencies, current
   billing quote and incremental charges for resume/disk/scheduling/relay.

These are reads only: do not resume a service, change its plan/disk, alter
workspace settings or trigger a build. No new workspace authorization is needed.
The Render service is still unidentified; the paused **Site** flag recorded
in prior inventory is not proof of a suspended **Render** service.

The optional `scripts/phase4-render-inspect.mjs` provides the same GET-only,
workspace-locked inventory when API authentication is already injected. It is
not a request for another key and does not replace the existing connector.
It records service/disk/plan metadata, never raw commands or credential values;
`--service srv-ID` enables variable-name/presence inspection only after matching
that ID to the workspace inventory. It stops on malformed/null results,
foreign workspace/service identity, stalled pagination or access denial.
No response body or token is logged on errors. Plan metadata is not a price quote.

Its request/response contract was checked against Render's official generated
CLI API client, source `render-oss/cli` at
`e77c0ac02276e216eaf49e9fb6bf4c1cd7f32bd2`:
`GET /v1/owners/{ownerId}`, `GET /v1/services?ownerId=...`,
`GET /v1/disks?ownerId=...`, `GET /v1/services/{serviceId}/env-vars`.
This is source inspection, not proof of actual API access. Full command values,
logs, deployments, environment groups and billing still need the private
connector inspection; this helper deliberately does not dump them.

## Work independent of Render, completed here

- Verified the working and remote branch still point to `e60c051`; both requested
  commits are ancestors and the checkout was clean before preparing this packet.
- Preserved the existing owner-only Site, project
  `appgprj_6ad26204823c81918260d33e13429074`, at
  `https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site`.
  No second environment or public deployment was created.
- Traced exact source settings, Radio startup/binding/disk constraints,
  recovery entrypoint and Stripe operations into the activation packet.
- Corrected the stale Events permission row in the existing restricted-key
  document: automatic recovery calls `GET /v1/events` and needs Events Read.
- Checked the retained $2 test-scenario arithmetic: artist 170 cents, base
  platform 30, buyer processing 37, Checkout total 237, application fee 67.
  The processing rate remains a scenario, not a verified Stripe fee contract.
- Prepared a deterministic 30-second generated PCM WAV for an isolated upload:
  `.sites-runtime/stage4-prepared/musicbat-stage4-generated.wav` (960,044 bytes).
  The JSON packet records its SHA-256, generator and inactive permission/identity
  placeholders. This is a generated fixture, not a backup or a licensed musician
  recording. Nothing was uploaded, enrolled, sold or granted automatically.
- New inventory-helper tests: **5 passed**, zero failures/skips. They exercise
  GET-only requests, redaction, owner/service boundaries, pagination, malformed
  data and error-body secrecy. Changed-file ESLint passed. The actual CLI
  preflight correctly stopped before any API request because no authentication
  was injected. No live Render/Stripe result is inferred from fixture tests.

The previous 211-test suite, four actual-app browser checks and eight isolated
Radio browser checks remain the application baseline; no application code was
changed here. No hosted schema or production data was queried.

## Activation order and approval boundary

| Step | Concrete action on the existing sandbox | What blocks it / approval needed |
| --- | --- | --- |
| 1 | Identify existing Render service, disk and dependencies using the reads above. | Existing connector tool access/results, not a new workspace or key. |
| 2 | Quote resume, compute, persistent disk, relay and recovery costs using actual service IDs. Record currency and recurring/metered charges. | No current quote is available; no numeric price is invented. Any paid activation/change requires explicit approval. |
| 3 | Prepare the exact source revision for the existing owner-only Site, retaining its project identity. | Any Site publication is a hosted deployment and requires explicit approval for this isolated target. Do not publish to musicbat.audio. |
| 4 | Securely reuse the existing Stripe test/restricted key; privately verify platform and permissions. | Existing secure binding path needed; do not rotate keys or request values in chat. Sandbox binding changes require approval. |
| 5 | Resume/configure the existing persistent Radio host with reviewed assets and authenticated HTTPS transport. | Known service/disk/ingress and quote; resume/config/bind-address changes need approval. No paid host is provisioned here. |
| 6 | Configure the narrow webhook relay through supported owner-only Site service authorization. Preserve raw bytes and Stripe-Signature. | Establish actual supported service authorization first; no forged visitor headers. Approval for this specific externally reachable webhook route, endpoint registration and secure signing-secret binding. The full Site stays owner-only. |
| 7 | Provide protected invocation of runCheckoutRecovery against the existing Site DB, with unattended execution and logs/readback. | Supported D1 execution path, scheduler/worker host and quote. Deployment/scheduling authorization required; no local SQLite substitute. |
| 8 | Stage actual artist/listener identities, deliberately map the existing Connect account, upload authorized test audio, review grants and export/import immutable Radio bytes. | Actual sessions and rights evidence. Sandbox data writes require activation authorization; do not manufacture ready flags or infer grants from an upload checkbox. |
| 9 | Approve an acceptance window and set MUSICBAT_RELEASE_PAUSED=0 on this Site only. | Explicit sandbox activation authorization, after configuration/transport readiness. Paused handlers return 503, including signed webhooks; successful settlement cannot be demanded while this flag remains 1. |
| 10 | Run the evidence sequence below, then return the sandbox to its approved paused/running state while retaining unfinished recovery obligations. | Functional prerequisites above; no real card, live key or production request. |

The current authorization covers the read-only workspace inspection. Steps
that write settings, hosted data, endpoint registrations or deployments remain
proposed; their specific resource IDs, paths and costs must be filled from the
inventory before asking for activation approval.

## Exact service and credential requirements

**Site bindings:** existing `DB` and `BUCKET`; sandbox `MUSICBAT_BASE_URL`;
`MUSICBAT_STRIPE_MODE=test`; `MUSICBAT_RELEASE_PAUSED=1` until the approved test
window; verified `MUSICBAT_PROCESSING_BPS` and
`MUSICBAT_PROCESSING_FIXED_CENTS`; existing sandbox `STRIPE_SECRET_KEY`;
genuine endpoint `STRIPE_WEBHOOK_SECRET`; HTTPS `RADIO_RUNTIME_ORIGIN` and
server-only `RADIO_RUNTIME_TOKEN`. No live credential is acceptable for this run.

**Stripe operations:** reuse platform `acct_1UHA0OLKJHBmA7Jw`; verify test mode
and existing artist `acct_1UQrXtLKJHXYfqXB`. Checkout create/read/list/expire,
Accounts read, PaymentIntent/Charge/Refund read and Events read are required
by this lifecycle. The hosted artist ID must be deliberately associated; the
historical `local_seedy` string is not a hosted sign-in identity. Creating
replacement accounts or increasing permissions speculatively is not required.
Subscribe the genuine test endpoint to the five events in the JSON packet,
including charge.refunded. Incoming events still require local signature checks;
Events API access is used for missed-event reconciliation, not signature bypass.

**Radio host:** Node 24.19.0, pnpm 11.25.0 and the frozen source dependencies.
Existing startup is `pnpm radio:start`. Set absolute durable
`MUSICBAT_RADIO_DATABASE` and `MUSICBAT_RADIO_ASSETS` paths on the verified disk;
`MUSICBAT_RADIO_GATEWAY_TOKEN` must match the Site's server-side
`RADIO_RUNTIME_TOKEN` (at least 32 characters). Existing startup listens on
127.0.0.1, port 5180 unless MUSICBAT_RADIO_PORT is set. It does **not** automatically
honor Render's PORT or bind 0.0.0.0. A checked reverse proxy in the same host or
an approved targeted bind adaptation is required; an internal Render hostname
alone is not reachable from the Cloudflare Site. Do not weaken bearer checks.
Keep one scheduling authority with durable SQLite/assets; do not enable
multi-instance scheduling against independent ephemeral files.

**Recovery:** existing `checkout:recover` is an operator for an existing local
SQLite file and is not a hosted D1 worker. Reuse the core function against the
actual Site DB through a supported protected execution path. Source defaults:
10 jobs/pass, maximum 50, 120-second lease, 10 attempts with durable backoff.
Do not choose a polling/cron frequency or monthly cost before the available
host/scheduler is identified. Verify a real unattended pass and persisted
readback; retain review/exhaustion states rather than automatically granting
uncertain payments. A protected D1 adapter/scheduler is still missing, not
silently implemented by adding this packet.

**Catalog:** actual artist ownership, R2 object and SHA-256, sale consent and
reviewed recording/composition permissions with reviewer, territory, validity,
mode and withdrawal evidence; matching Radio source/category/channel records;
private immutable bytes on disk. Use `radio-catalog-import.mjs` with an explicit
reviewed catalog manifest; its output alone does not establish the Site's D1
boundary records or channel establishment. Never repurpose generated fixture
grants as permission for a musician's real recording.

## Required hosted acceptance evidence

Record the exact deployed source and sandbox IDs; artist upload/permission
records and original/R2/Radio byte hashes; browser advancing playback and
responsive controls; test Checkout/PaymentIntent/session/event IDs and
livemode=false; a genuine signed webhook and duplicate replay with one
settlement; immutable 85/15 base allocation plus separately recorded processing;
buyer-authorized matching download and stranger/pending denial; a second open
Session expired on withdrawal; denied new sales/Radio with paid history and
prior purchased download retained; an interrupted hosted recovery obligation,
lease/restart/readback and eventual expiration or explicit payment review.

No hosted acceptance row is passed by this packet. The next engineering action remains the existing connector's complete Render
inventory read, performed by the agent once its tool capability is exposed. No additional key or
workspace authorization has been requested after the user's clarification.
