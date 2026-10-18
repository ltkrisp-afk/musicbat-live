# Unattended recovery acceptance — pending scheduled execution

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
