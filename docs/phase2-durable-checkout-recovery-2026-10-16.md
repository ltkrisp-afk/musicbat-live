# Phase 2 — durable recovery and automatic retries

## Baseline and scope

Continued directly from Phase 1 `5773f2c0b9e7ee31a29f2f73ea7c64d0bee3594d`, without another audit, repository clone, backup, hosted inspection or real purchase test. Local branch: `phase2-durable-checkout-recovery-2026-10-16`. Checkout: `/workspace/scratch/musicbat-player-fix`. No remote is configured here, so no GitHub/Linux synchronization is asserted.

Development and Stripe sandbox only. No deployment, production environment/schema changes, live keys/charges, pricing changes or automatic refunds. The Phase 1 implementation remains the baseline; inline cleanup now delegates to the same leased engine used by the automatic runner.

## Durable operation

Additive migration `0014_checkout_recovery.sql` adds:

- `checkout_recovery_jobs`: purchase ID, state, attempt budget, next due time, expiring lease/token, last error, observed Stripe status, scan cursor and update time.
- `checkout_payment_evidence`: verified event ID, purchase/Session association, processor creation second and whether the event snapshot was paid. No raw webhook, credential or customer payload is retained.
- Transactional triggers enqueue withdrawal/ambiguous-creation work and resolve jobs when a payment/refund is recorded. New draft work has a two-minute grace period to avoid competing with the ordinary creation request. A first withdrawal or a late Session association makes existing work immediately due. Repeated withdrawal does not reset attempts/backoff or revive exhausted jobs.
- Existing unresolved work is registered on upgrade. No existing financial amounts or historical purchase status is rewritten by the migration.

**Migration not applied to hosted or operator databases in this task.** Isolated test databases exercised upgrades and runtime behavior. Apply it through the existing local migration workflow before running this source against an older development database.

`runCheckoutRecovery` claims each job with one conditional `UPDATE ... RETURNING`. A durable random token and a 120-second lease fence purchase/job writes. Concurrent workers and inline requests share this ownership protocol. Abandoned leases become claimable. Each background job's processor calls have a 45-second abort budget; inline withdrawal attempts at most three jobs with five seconds of network work per job, leaving the remainder queued. SIGTERM/SIGINT abort active network work and stop further claims; a hard crash leaves a lease that another process can recover.

Each pass defaults to 10 jobs, capped at 50. Automatic polling is five seconds; due timestamps, rather than the polling timer, control actual attempts. Backoff begins at five seconds, doubles with deterministic bounded per-purchase jitter, and caps at one hour. Ten unsuccessful/crashed claims exhaust the budget. Exhaustion stays visible and is not silently reset by another withdrawal. An operator must investigate review/exhausted work; no automatic refund, silent permission restoration or unrestricted retry-reset endpoint is included.

## Stripe reconciliation and safe outcomes

Only sandbox credentials are accepted by recovery. No Checkout creation endpoint is called by recovery.

1. Retrieve a known Session from Stripe. Open unpaid withdrawn Sessions are expired. Each expiration attempt has a purchase/attempt idempotency key; every attempt first checks authoritative state. This avoids repeatedly replaying a cached Stripe failure while preserving safety after a lost expiration response: the next GET sees an already-expired Session and sends no second expiration.
2. If Session association was lost, discover it through Stripe's paginated Session list using the server-created purchase metadata and bounded creation window. The cursor survives restarts. Validate purchase identity, currency and total before associating. Never recreate a Session or replay an aged creation key. Missing/incomplete discovery retries within budget; multiple matches enter review.
3. Before granting recovered paid access, freshly verify Session identity/mode, total, processing metadata, PaymentIntent fee/destination and expanded latest Charge refund status. Full verified refunds remain inaccessible; partial refunds retain the existing eligibility behavior. Missing or inconsistent financial/refund evidence enters review.
4. Use durable signed-webhook evidence or authenticated Stripe event evidence to order payment against withdrawal. Every permission/cutoff decision is rechecked inside the fenced purchase write, so withdrawal can commit during a Stripe request without granting stale authorization.
5. Clearly earlier payments can become paid/downloadable. Later, same-second, unknown-cutoff or missing-evidence races remain `payment_review`, retaining assets. Existing paid/refunded records are never overwritten by a stale worker. A later verified earlier paid webhook can resolve a reviewed purchase, and duplicate events remain idempotent.
6. Recovery never changes sale permissions, amount/artist/platform/processing fields or the 85%/15% calculation. Withdrawal blocks new Checkout through the existing Phase 1 atomic eligibility checks while cleanup is pending, reviewing or exhausted.

The worker reads at most 100 events of each relevant completion type per evidence lookup. An incomplete/old event history does not prove ordering and leaves review; the worker does not scan without bounds. Stripe's event API retention and second-level timestamps limit recoverable proof. Clock skew and event-generation latency still require hosted acceptance; no subsecond proof is invented.

## Observable status and local automatic runner

States are `pending`, `running`, `retrying`, `completed`, `review` and `exhausted`. Local diagnostics include attempt count, next due time, lease expiry, generic error and last observed Session/payment status. They omit buyer identities, raw events, keys, audio paths and customer data.

After applying local migrations, run against the **explicit existing development SQLite file**. Environment variables must already contain sandbox credentials; they are not accepted as command-line arguments or written by this runner.

```sh
npm run checkout:recover -- --db /absolute/path/to/development.sqlite
```

The default mode continuously processes due jobs until stopped. A single bounded pass:

```sh
npm run checkout:recover -- --db /absolute/path/to/development.sqlite --once
```

Read-only status (does not require credentials):

```sh
npm run checkout:recover -- --db /absolute/path/to/development.sqlite --status
```

Status lists bounded operation details and state counts. The runner refuses missing files or schema and never initializes/migrates/resets a database, loads live keys, deploys, or falls back to production. If loading an existing private env file, Node's `--env-file` can be used before `--import`; never paste a secret into a command argument.

An authenticated artist/representative can also request `GET /api/musicbat?view=checkout-cleanup`. It returns counts, attempt information and next retry by authorized track only, with `private, no-store`. Strangers see no operations; unauthenticated requests receive 401. No unauthenticated worker-driving HTTP endpoint was added.

## Verification and limits

Automated tests use the real handlers/SQLite/worker with mocked Stripe boundaries. New coverage includes file-backed close/reopen, independent worker connections, stale-token fencing, abandoned leases, network/API outages, backoff and exhaustion, persistent Session-list pagination, lost creation responses, payment-order races, duplicate signed webhooks, full/partial refunds, private diagnostics, live-key rejection and a separate Node worker process that completes a local pass and exits cleanly on SIGTERM.

The existing Phase 1 fixture was extracted into a shared module rather than duplicated. Its restart regression now explicitly advances the durable retry schedule, and its expected generic outage reason reflects the new retry engine. Migration count tests include 0014; immutable prior migrations remain unchanged.

Final verification on the completed implementation:

- `npm test`: **207 passed, 0 failed, 0 skipped, 0 cancelled**, including **24 new Phase 2 tests**.
- Focused withdrawal/recovery/migration checks passed; the final full suite includes those checks and the additional bounded-backlog/refund-evidence cases.
- `tsc --noEmit`: passed.
- ESLint on changed application/schema files and recovery/fixture tests: passed, no reported warnings/errors.
- `npm run build`: passed.
- `git diff --check`: passed.

No automated failures remain. No new real Stripe sandbox expiration, event retrieval, refund reconciliation, payment, webhook delivery or settlement was performed. The earlier separately reported Linux sandbox purchase was not repeated. The Work checkout still lacks usable sandbox credentials; no live service was started against Stripe.

Remaining operational limits:

- The automatic local runner is implemented and process-tested. Hosted unattended scheduling, real D1 concurrency/latency, deployment restart behavior and real Stripe permissions remain unverified and **not enabled**. A running local process or separately approved hosted schedule is required for unattended execution; a library function alone is not advertised as an active hosted worker.
- Same-second and missing/insufficient event evidence remain durable review. Review/exhaustion needs deliberate operator investigation; no blanket grant/refund action is provided.
- Session discovery scans one bounded page per attempt and does not recreate Checkout. A large search result, unavailable history, incomplete legacy metadata or multiple matches can require review/exhaustion.
- No automatic deletion of original audio or private Radio copies was added. Uncertain payment obligations retain assets. Independent storage-retention cleanup is outside this Checkout recovery task.
- This remains a distributed interaction with Stripe, not a cross-system atomic transaction. Financial and entitlement writes are fenced locally and revalidated; unavoidable external uncertainty is retained explicitly.

Official references consulted:
- https://docs.stripe.com/api/events/list
- https://docs.stripe.com/api/checkout/sessions/retrieve
- https://docs.stripe.com/api/checkout/sessions/list
- https://docs.stripe.com/api/idempotent_requests

Stop before Phase 3. No deployment or production action is authorized by this report.
