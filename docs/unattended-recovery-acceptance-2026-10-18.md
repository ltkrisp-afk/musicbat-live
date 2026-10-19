# Unattended recovery acceptance — scheduled task passed; native Cron unverified

## Verified deployment and tests

- Authorized branch advanced normally from `9795cc30562fec2ca8ddfc09e70964c3640b1d8f`
  to runtime commit `44e0c75e4d153525d45f3860c539f1bd3f698ed6`.
- Existing sandbox only: `appgprj_6ad26204823c81918260d33e13429074`, version 11,
  Sites source `e81bf7b8ca388cd574ad7b5b47e8c36c2c9ec084`.
- Deployment `appgdep_6ad5383588b48191aa72a5a9d6b68d02` succeeded at
  2026-10-18 21:21:05 UTC, existing environment revision 6.
- Blob comparison across all 282 GitHub files: only `.openai/hosting.json` differs
  for the necessary sandbox project ID. Three extra local files are existing
  evidence/configuration documents. Runtime code matches.
- 245 local regressions passed, zero failures/skips; TypeScript, lint, build passed.
- Both GitHub workflows passed at the runtime commit:
  [browser 39167376840](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39167376840)
  and [development 39167376917](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39167376917).
  Browser pipeline includes 8 Radio, 4 application and 6 responsive/dial checks.
- Repository exposure assessment: see `security-exposure-audit-2026-10-18.md`.

## Existing scheduling mechanism and authorization

The actual installed mechanism is the existing hourly ChatGPT cloud task invoking
the owner-authenticated Site MCP writer, which executes on Cloudflare with existing
D1 and Stripe test bindings. It is not a native Cloudflare Cron Trigger.
The built Wrangler configuration has `triggers: {}` and no scheduled handler.
Do not describe the cloud task as a verified native Cloudflare cron.

Existing linked task: `Automation_e4c8eb10aa34819191f7a80f4875f0e8`.
Schedule preserved: hourly from 2026-10-18 14:00, America/Los_Angeles; enabled.
Last observed automatic invocation at 21:00 UTC read six completed jobs.
Its next scheduled occurrence is 15:00 Pacific / 22:00 UTC.

The saved task prompt now permits exactly one fixed synthetic fixture to be queued
automatically if absent, waits for its actual due time, calls exactly one bounded
recovery pass if a due/unleased job exists, then reads status again. Ordinary
future/leased jobs are not advanced. No run-now action was requested or used.
No manual hosted recovery/MCP recovery invocation was performed during this test.

MCP authorizes the configured sandbox owner and rejects anonymous/other-account,
foreign-origin, live-mode, wrong-site and malformed/oversized requests before writes.
The published new queue-only tool accepts no arguments. Existing read status and
bounded recovery remain available; the unchanged recovery worker uses limit 10.

## Synthetic fixture and required proof

Fixed ID: `acceptance-unattended-recovery-2026-10-18`.
The queue control creates a clearly labeled, zero-value, already-terminal synthetic
order, status `refunded`, no Stripe Session/PaymentIntent, no audio path, no download
entitlement, and a retry job with attempts 1, clear lease and due time 60 seconds in
the future. This represents cleanup retry after a terminal order state was persisted;
it does not represent a real payment/refund or inject a Stripe network outage.

Queueing is idempotent and cannot reset an existing fixture's retry budget. Tests
verify no processor calls, no original paid-order change, no early claim, and final
completion at attempts 2. The previous manually invoked hosted D1 probe separately
verified injected 503 handling, lease expiration, persisted retry and idempotency.

**Current hosted before state:** six completed jobs; `unattended_probe: null`.
The current conversation's saved plugin tool list has not exposed the new queue
control yet. The published Site includes it. The fresh scheduled invocation must
verify tool availability, queue the fixture, retain its retrying snapshot and, after
its due time, invoke the ordinary worker automatically. If the queue control remains
unavailable, report the exact tool-discovery blocker; do not claim a fixture exists.

PASS requires the scheduled task's actual tool evidence showing processed 1 and
the same fixture moving retrying/attempts 1 to completed/attempts 2, last_error null,
lease_until 0, with host timestamps after the due time and all original paid evidence
preserved. Until that occurs, unattended acceptance remains **unverified**.

## Separate-account and preservation status

Separate-account browser acceptance remains blocked by the only available saved
ChatGPT identity being the owner. No MusicBat authentication defect was established.
An authorized distinct test ChatGPT account must be selected through the actual
"Use another account" flow; no fabricated identity or simulated role switch qualifies.

No Radio/UI, payment allocation, recovery state-machine, artist ownership, withdrawal
or purchased-download logic was changed in this integration. Retrofutura, the physical
dial and persistent player remain covered by the browser pipeline. Production,
musicbat.audio, live credentials, webhook destinations and infrastructure are unchanged.

## Follow-up — October 18, 20:15 Pacific onward

This supersedes the pending-execution status above while retaining the original checkpoint.

### Existing scheduled execution: PASS (ChatGPT task, not native Cron)

The recorded scheduled execution in this Work conversation at 19:05 Pacific read
the already-due fixture, invoked the ordinary bounded recovery writer exactly once,
and read back its completion. No manual run-now action was used. Receipt:

| Field | Before | After |
| --- | --- | --- |
| purchase_id | acceptance-unattended-recovery-2026-10-18 | acceptance-unattended-recovery-2026-10-18 |
| state | retrying | completed |
| attempts | 1 | 2 |
| next_attempt_at | 1792359504022 | 1792375518100 |
| lease_until | 0 | 0 |
| updated_at | 1792359444022 | 1792375508026 |
| purchase_status | refunded | refunded |
| last_error | synthetic_terminal_order_retry | null |

The writer returned processed 1. Completion timestamp: 2026-10-19T02:05:08.026Z
(October 18, 19:05:08.026 Pacific), after the due time 2026-10-18T21:38:24.022Z.
This is terminal-order cleanup, not a genuine Stripe outage or refund test.

A fresh independent Sites D1 read of checkout_recovery_jobs returned all seven rows,
no omitted rows/columns or pagination, all completed, clear leases and null errors.
The fixture's completion fields match the execution receipt. Fresh MCP status also
returned seven completed. No recovery writer was called during this follow-up.
The existing task is enabled; last_run_time read back as 2026-10-19T03:01:27.299563Z.

The current Worker-log API returns only the latest 100 events, with no end-time or
pagination control. Current page starts at 02:50:04.917Z; therefore it cannot independently
retrieve the earlier 02:05 execution. Do not describe that receipt as a newly retrieved
Cloudflare historical trace. The saved scheduled tool invocation and D1 state provide
the execution evidence. Native Cloudflare Cron acceptance remains unverified.

### Deployment and regression reconciliation: PASS

GitHub HEAD before this documentation update: cd18d6a4ce837e856a5c0bf7141f33cf891005ef.
Tested runtime remains 44e0c75e4d153525d45f3860c539f1bd3f698ed6; subsequent changes are
documentation only. Sandbox remains version 11, source e81bf7b8ca388cd574ad7b5b47e8c36c2c9ec084.
Deployment appgdep_6ad5383588b48191aa72a5a9d6b68d02 returned succeeded, environment
revision 6. Worker name site---6ad26204823c81918260d33e13429074 and observed script
version 4d139d92-a3ab-41da-abd0-8527d076f4e0 match the selected sandbox deployment.
Both recorded GitHub runs were freshly read and still report success at runtime 44e0c75:
39167376840 and 39167376917. No unchanged suite was rerun: 245 regressions, TypeScript,
lint/build and 18 browser checks are preserved. No redeployment is needed for this record.

### Hosted browser checks and remaining limits

Fresh anonymous hosted browser at the exact Stage 4 URL, viewport 1363 by 936:
Retrofutura console visible; physical push dial 112 by 112 pixels; Genre, Subgenre
and Style windows present. Radio -> Discover Artists -> Add Track -> Radio navigation
retained one audio element. No media error. Anonymous Manage Songs/Shock Room tabs
are absent, upload remains disabled, and the artist setup disclosure still states 85%
with buyer processing charged separately. No form was submitted.

Playback is currently quiet/locked because this browser is signed out and the authorized
tone was withdrawn. Previously recorded real hosted playback and purchased-download
evidence remain valid; this observation does not constitute a fresh playback PASS.

Separate-account acceptance: BLOCKED. The actual OpenAI chooser offers only saved
owner Kris Prater (ltkrisp@gmail.com). The exact remaining action is signing in through
Use another account with an existing authorized distinct ChatGPT test listener identity.
The chooser is retained; no owner account was substituted or new account created.

Responsive automated checks at widths 320, 375, 390, 768 and 1280 remain passed against
matching runtime. A physical iPhone/Safari hosted acceptance result is still missing;
the current cloud browser has no supported viewport-resize/device-emulation control.
Do not relabel desktop observations or local responsive fixtures as physical mobile proof.

No confirmed application defect was established in this follow-up. No runtime/UI,
accounting, D1/R2, infrastructure, credentials, production or live-payment changes made.
