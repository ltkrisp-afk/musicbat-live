# Initialize development D1 without changing remote resources

Baseline: `62831f7`. The development Vite binding uses database name `site-creator-d1`, placeholder UUID `00000000-0000-4000-8000-000000000000`, binding name from `.openai/hosting.json` (`DB`), and persistence directory `.wrangler/state`.

Two gaps were found: no local CLI migration configuration/command existed, and the Drizzle journal omitted `0011_radio_plus_subscriptions.sql`. The journal now registers all twelve existing SQL files. No existing SQL migration was rewritten. Adding the journal entry alone does not initialize D1 or run a production migration.

`wrangler.local.json` targets the same placeholder database as Vite and sets `migrations_dir` to `drizzle`. `npm run db:local:migrate` uses the already-installed Wrangler with fixed `--local --persist-to .wrangler/state --config wrangler.local.json` arguments. It rejects all supplied arguments, disables dotenv loading/metrics/log files in its child process, does not pass Stripe credentials, and has no remote fallback. It neither deletes local state nor seeds artist/purchase records.

The command checks that SQL files match the journal, applies only outstanding Wrangler migrations, and checks the resulting local D1 database for all 26 required tables and all 12 migration records. Existing schemas without a Wrangler migration ledger are refused rather than replayed. For that refusal, preserve the database and inspect its existing ledger before any further migration; do not delete files to bypass the guard.

## Linux commands

Stop the development server using Ctrl+C in its terminal before applying migrations. In a terminal at `/home/musicbat/musicbat`, run:

```bash
git fetch origin musicbat-acceptance-restored-2026-10-13 && git merge --ff-only FETCH_HEAD
npm run db:local:migrate
```

Success reports `localOnly: true`, `migrations: 12`, `requiredTables: 26`, and table names including `artist_accounts`, `purchases`, `stripe_events`, `artist_profiles`, `artist_pages`, `radio_plus_enrollments`, `radio_plus_events`, and `radio_plus_invoices`. Then restart the existing real development command (`npm run dev`), not the offline simulated acceptance server. No Stripe credential editing is needed for this migration.

## Verified in the Work checkout

- Applied 0000–0011 to actual local Miniflare D1 using Wrangler; all 26 required tables and 12 ledger entries verified.
- A second execution reported no migrations to apply and verified the same tables.
- Three focused migration tests passed: journal completeness/fresh schema; 0011 upgrade preserving historical paid-purchase and artist rows; local configuration identity and rejection of remote arguments.
- Changed-file ESLint, TypeScript and diff whitespace checks passed.
- An attempted Work dev-server HTTP check could not connect to port 5186 while startup showed dependency optimization. HTTP clearance of the reported Linux 503 remains unverified; the schema checks above succeeded through actual local D1.

The user's Linux database is separate: initialization there remains pending until the above command returns its verification summary. No production resource, existing migration SQL, Stripe credential or unrelated application behavior was changed. Completed security tests and backups were not repeated.

References: https://developers.cloudflare.com/d1/reference/migrations/ and https://developers.cloudflare.com/d1/wrangler-commands/
