# MusicBat engineering continuity

Permanent architectural guidance: read
[MusicBat Golden Foundation](docs/governance/MUSICBAT_GOLDEN_FOUNDATION.md)
before proposing or changing MusicBat behavior. Apply its ten principles and
record observable verification for affected behavior. Report verified conflicts
without automatically changing approved business rules or agreements. The foundation
does not authorize production actions. The initial alignment findings are in
`docs/governance/golden-foundation-alignment-2026-10-30.md`.

Use the existing corrected 85/15 development source. The obsolete GitHub default
`bat-radio-shock-room` at `61fc95f` contains executable 90/10 code and must not
be used for development, acceptance, or deployment. Continue from
`repair/85-15-authoritative-2026-10-18` (base `5a1bda3`).
The resumed sandbox checkout is `/workspace/sites/musicbat-stage4-sandbox-2026-10-16`.
The owner changed GitHub's default to the authoritative branch and deleted the obsolete
branch; both were verified through GitHub. This does not itself update a deployment. Each cloud task is isolated;
do not create a Git worktree unless the user explicitly requests one. Do not
restart onboarding or create redundant backups.

Read `docs/cloud-engineering-continuation-2026-10-16.md` for the verified source,
checks, and remaining Phase 4 prerequisites. See
`docs/radio-timeout-repair-2026-10-16.md` for the resolved development WebSocket
failure and application browser verification. Run timing-sensitive browser
checks sequentially after builds/regressions to avoid CPU contention. Preserve the existing architecture,
artist rights, free Radio, optional $5/month Radio Plus, and 85/15 base purchase
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

Before each new hosted acceptance run, verify the selected sandbox project,
deployed source/version, browser control and account role, and the active
generated fixture's recording permission and station review. Check remaining
validity covers the planned run; renew only the exact authorized fixture through
its guarded review control when needed. Preserve withdrawals, completed payments,
recovery evidence and transaction history. Do not reset verified records or use
production recordings as fixtures. Distinguish browser service failures from
application failures. Record PASS/FAIL/BLOCKED/NOT RUN, actual UTC observations
and evidence references. Never label responsive Chromium as physical Safari.
