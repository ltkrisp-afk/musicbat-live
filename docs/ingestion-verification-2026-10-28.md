# Free core accounts, $5 extensions and 72-hour ingestion

Owner direction, October 28, 2026: musician/artist and customer/listener accounts
have free core participation. Either account can opt into extended Bat Radio
features for $5. The existing monthly billing cadence is retained. No artist
subscription is required to upload, offer eligible songs or receive their share.
New subscriptions use 500 cents; existing enrollment prices and invoice amounts
are retained. The artist/platform base purchase split remains 85/15.

## Source and scope

Prepared from the existing Stage 4 development checkout at
`a9bc1ad45a47e3cc45f04c6119d536bfac384cb2`. Changed source files are reconciled
against `repair/85-15-authoritative-2026-10-18` before publishing this development
branch. This is implementation and local qualification, not a production release.
The production migration-history divergence recorded in the October 21 audit
still requires its own release rehearsal. Do not paste these migrations directly
into production or reapply the owner-supplied `ALTER TABLE tracks ... status`:
the existing catalog already has a lifecycle `status` column.

## State and admission

Migration 0016 adds `track_ingestion` and `ingestion_reports` without backfilling
or relabeling the existing catalog. With both `MUSICBAT_INGESTION_ENABLED=test`
and `MUSICBAT_STRIPE_MODE=test`, the authenticated upload transaction registers a
new ingestion row after R2 upload, recording the object key, SHA-256, byte size,
UTC upload milliseconds and the fixed upload-plus-72-hours review target. There is
no public timer-reset or worker-completion endpoint.

`PENDING → CLAIMED → CHECKED → VERIFIED`; conclusive technical failures become
`FAILED`. CLAIMED is worker lease ownership, not a rights dispute. Missing
objects, missing decoder binaries and timeouts retry with capped backoff. A
crashed worker's five-minute lease can be reclaimed. Completion requires the
current, unexpired claim token. Concurrent workers cannot both claim a job.

The worker checks source size and hash, uses ffprobe to identify actual MP3,
FLAC or WAV audio frames, then decodes the audio with ffmpeg. Header-shaped
garbage is insufficient. Inspection uses temporary private files, bounded
subprocess time/output, restricted file/pipe protocols and no shell execution.
These tools are runtime dependencies; this is not a zero-dependency or zero-cost
implementation. It does not identify ownership, copyright infringement,
plagiarism, artistic quality or streaming fraud.

Only CHECKED tracks with completed technical evidence,
active catalog lifecycle and no operator hold can become VERIFIED/is_payable=1.
Catalog withdrawal/deletion and recording/composition permission review remain
independent. Radio source/delivery boundaries and new purchase admission deny
pending/failed/held ingestion rows. A database insert trigger also guards the
purchase admission race. Radio still requires its existing reviewed permissions,
channel and membership checks. Successful ingestion never manufactures a license.

FAILED creates a durable track report. It does not freeze an artist's entire
Stripe account, change Terms acceptance, refund a purchase or rewrite earnings.
`is_payable` means this ingestion gate passed; Stripe account readiness and
signed payment evidence remain required. A manual payout schedule is not a
funds freeze. Existing paid purchases/downloads and historical allocations remain
under their existing authorization and recovery logic.

## Local computer qualification

Apply the registered migrations to an explicitly selected development database
using the existing local migration workflow, not the production D1 instance.
Keep the configured R2 objects materialized beneath a private local object root
using their exact `tracks/<uuid>.<extension>` keys. The local worker checks them
against the hash recorded at upload. It does not automatically download R2 or
connect a SQLite file to hosted D1.

From the repository, with ffmpeg and ffprobe available on PATH:

```sh
MUSICBAT_STRIPE_MODE=test pnpm ingestion:sweep --db /absolute/development.sqlite --objects /absolute/private-object-root
```

This runs one bounded sweep of up to ten checks and finalizes eligible CHECKED
rows. A local scheduler can invoke this command every five minutes using absolute
paths to the repository, runtime and data. No scheduler has been installed here;
a sleeping/offline computer cannot run it. A hosted unattended implementation
needs an authorized durable worker with an actual D1/R2 adapter and decoder
runtime. The shared sweep accepts injected storage/inspection functions for
that integration, but that hosting and end-to-end delivery are NOT VERIFIED.

The October 28 clarification treats 72 hours as a review target, not a required wait.
Successful technical checks finalize immediately; an elapsed timer never approves
unprocessed audio. The artist dashboard shows elapsed review time and remaining
target time, with distinct failed, held, overdue and completed states. It refreshes
pending statuses every 30 seconds. Rights review remains independent.

Use the clock-injected tests for timing rather than changing only one
timestamp: the schema enforces `deadline = upload + 259200000` milliseconds.
Inspect both the ingestion row and reports. A queue outage must remain unpaid,
and changing a track's catalog lifecycle must not bypass the ingestion gate.

## Executed validation

- Full regression: 274/274 passed, including the eight new ingestion/pricing tests.
- TypeScript: passed. ESLint: passed. Production bundle build: passed.
- Decoder fixtures: real generated WAV, MP3 and FLAC; fake headers rejected.
- Exact deadline, retry, stale lease, concurrency, source replacement, holds,
  withdrawal, purchase admission and legacy invoice preservation exercised.
- Existing full suite includes local Miniflare D1/R2; new ingestion worker tests
  use SQLite/in-memory object fixtures and actual ffmpeg/ffprobe decoding.
- Runtime here: Node 24.22.1. Repository-pinned Node 24.19.0 was not independently run.
- No production migration, deployment, Stripe account modification or real charge.
- Hosted ingestion scheduling, hosted decoder access and physical computer/phone
  browser checks: NOT RUN.

## Continuation: completed code versus hosted operation

The existing implementation was located on GitHub development branch
`development/ingestion-72h-2026-10-28` at `42c974c`. Linux was still at
`5ee7e66`; the earlier grep searched the separate authoritative branch, which
does not contain this new development work. No missing Python agent or guessed
`musicbat.db` should be created. The operator is Node/TypeScript and requires
explicit existing SQLite and materialized R2 object paths. No Stripe key is
needed by the ingestion operator. No crontab is installed.

The hosted Stage 4 database inspected during this continuation has no
`track_ingestion` or `ingestion_reports` table. Hosted ingestion is therefore
not active. Its existing generated Radio track 2 and station review expired
2026-10-20T03:50:29.493Z; track 2 has sales disabled. This explains that
fixture's eligibility failure, not proof of a frozen browser or an expected
testing-mode appearance. Track 1 remains withdrawn and must not be resurrected.
Track 3 remains a distinct active sandbox sales fixture with Radio disabled.
Do not substitute real recordings or change production to work around this.

Remaining operational boundary: a local operator cannot directly inspect hosted
R2/D1 through a guessed filesystem path. Hosted unattended decoding needs the
actual authorized storage adapter and execution runtime. No hosted worker,
production deployment, credential change, permission renewal or charge was made
in this continuation. The dashboard update has been built locally, not deployed.

Continuation verification: 276/276 automated tests passed (44.94 seconds),
including real decoder fixtures and dashboard status rendering. TypeScript,
affected-file ESLint, build and diff whitespace checks passed. These are local
results; neither hosted ingestion execution nor physical phone behavior passed
verification in this continuation.
