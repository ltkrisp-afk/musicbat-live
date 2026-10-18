# MusicBat engineering continuity

Use the existing corrected 85/15 development source. The obsolete GitHub default
`bat-radio-shock-room` at `61fc95f` contains executable 90/10 code and must not
be used for development, acceptance, or deployment. Continue from
`repair/85-15-authoritative-2026-10-18` (base `5a1bda3`).
The resumed sandbox checkout is `/workspace/sites/musicbat-stage4-sandbox-2026-10-16`.
Changing GitHub's default branch and removing the obsolete branch remains pending
repository settings access; do not describe that cleanup as completed. Each cloud task is isolated;
do not create a Git worktree unless the user explicitly requests one. Do not
restart onboarding or create redundant backups.

Read `docs/cloud-engineering-continuation-2026-10-16.md` for the verified source,
checks, and remaining Phase 4 prerequisites. See
`docs/radio-timeout-repair-2026-10-16.md` for the resolved development WebSocket
failure and application browser verification. Run timing-sensitive browser
checks sequentially after builds/regressions to avoid CPU contention. Preserve the existing architecture,
artist rights, free Radio, optional $3/month Radio Plus, and 85/15 base purchase
allocation. Preserve recorded historical financial allocations and downloads.

Use Node 24.19.0 and pnpm 11.25.0. If dependencies require refreshing:

    CI=true bash scripts/sites-env.sh -- pnpm install --frozen-lockfile --store-dir .sites-runtime/pnpm-store

This command preserves the tracked `.npmrc`; `install:ci` writes it. Verify
changes with `pnpm test`, `pnpm typecheck`, `pnpm lint`, and
`bash scripts/sites-env.sh -- pnpm build`. Record executed outcomes and commit
verified changes on a development branch. Distinguish local fixture tests,
GitHub Actions results, hosted integration, and real Stripe test-mode evidence.

Do not deploy production, change live Stripe credentials, or initiate real
payments without explicit approval. Do not create duplicate Stripe accounts,
invent credentials, or print secrets. Use an explicitly selected isolated
sandbox for Phase 4; local offline acceptance is not hosted sandbox acceptance.
