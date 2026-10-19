# Stage 4 recovery and listener checkpoint — 2026-10-19

## Scope and exact revisions

Existing Sandbox only: `appgprj_6ad26204823c81918260d33e13429074`.
GitHub HEAD inspected: `2a4151faa6afcdd1d431e644654bcfa4461ead06` on
`repair/85-15-authoritative-2026-10-18`.
Sandbox v19 source: `2bc1d2efb8dc390f14d0d2691042de00b29bd5e5`.
Deployment `appgdep_6ad68f4742a08191b12cd6bfa62d6de5` remains succeeded,
environment revision 6. This update is evidence only; no application deployment.

## Recovery: historical PASS preserved; new due-job run BLOCKED

At approximately 2026-10-19 22:15–22:17 UTC, the owner-only recovery plugin and
an independent Sites D1 read agreed: **seven completed jobs**, zero pending,
retrying, running, review or exhausted jobs; all leases clear and errors null.
The database response included all seven rows, with no pagination or omitted cells.

Fixed fixture `acceptance-unattended-recovery-2026-10-18`:

| Field | Fresh value |
| --- | --- |
| state | completed |
| attempts | 2 |
| next_attempt_at | 1792375518100 |
| lease_until | 0 |
| updated_at | 1792375508026 = 2026-10-19T02:05:08.026Z |
| last_error | null |
| purchase_status | refunded |

The earlier committed receipt in `unattended-recovery-acceptance-2026-10-18.md`
records the scheduled task invoking one bounded pass, processed=1, changing this
fixture from retrying/attempts=1 to completed/attempts=2 after its due time.
That is an existing evidence-backed historical PASS, not a new execution observed
in this follow-up. The fixture is zero-value terminal-order cleanup with no real
Stripe charge, refund or download entitlement.

Fresh task inspection found an operational discrepancy: existing task
`Automation_e4c8eb10aa34819191f7a80f4875f0e8` was disabled, last_run_time
`2026-10-19T19:00:05.136520Z`, last update `2026-10-19T19:01:08.925643Z`.
No reason or actor for disabling it is exposed; none is inferred.
The same task was resumed with **only is_enabled=true** at
`2026-10-19T22:16:22.370750Z`; a subsequent read confirmed enabled=true.
The existing hourly schedule, prompt, sandbox target and authorization were retained.
The API returned next_run_time=null; a future execution time is not claimed.

This remains a ChatGPT cloud schedule invoking the Cloudflare-hosted sandbox,
not a native Cloudflare Cron Trigger. No manual run-now, recovery endpoint,
MCP recovery invocation, new schedule, fixture reset, job edit or purchase occurred.

The available published queue function returns an existing fixture unchanged.
Its INSERT OR IGNORE/early-return design cannot requeue the completed singleton.
There is no due existing fixture for a new processing demonstration. Do not reset
attempts/timestamps or invent an alternative database writer to fabricate proof.
Fresh automatic due-job acceptance is therefore **BLOCKED** until a legitimate
new sandbox recovery job becomes due or a separately reviewed repeatable synthetic
fixture facility is available. Re-enabling the task alone is not such a PASS.

Worker log retrieval with the maximum 100-event page returned only
`2026-10-19T22:14:31.142Z` through `22:16:26.114Z`; it did not include the
historical 02:05 run. This API has no historical page/end-time control. This is
a retrieval limitation, not proof that the historical execution did not occur
or that its logs expired. Current D1 confirms completion, but alone cannot
attribute that completion to an invoker.

## Separate listener: BLOCKED, execution prepared

Clarissa has not signed in or completed a purchase in this follow-up. No owner
identity is substituted. The prepared procedure is in
`stage4-clarissa-listener-acceptance.md`.

Fresh catalog preflight found track 1 withdrawn, Radio and sales disabled; track 2
active and Radio enabled, but sales disabled. There is currently no purchasable
fixture. These states were preserved. No production music or original recordings
will be used. No message/invitation was sent to Clarissa and no credential requested.

Required inputs for execution are Clarissa's participation through the supported
distinct-account sign-in flow and an owner-prepared fresh generated purchase-tone
listing using existing sandbox upload/artist controls. The existing fixture
generator and test Connect association are documented in the runbook. This is
preparation, not a purchase/download PASS.

No Stripe purchase, Radio test, allocation test or automated suite was repeated.
No production resources, credentials, payment processing, source logic, D1/R2
bindings, prior purchases, withdrawals or recovery rows were modified.
**Full acceptance remains incomplete.**
