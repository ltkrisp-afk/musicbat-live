# Independent Cloudflare migration — controlled execution checkpoint

Date: 2026-10-18
Source: `repair/85-15-authoritative-2026-10-18`
Migration branch: `migration/independent-cloudflare-2026-10-18`

## Verified
- GitHub repository `ltkrisp-afk/musicbat-live` is accessible with write permissions.
- Default branch is the authoritative repair branch.
- `.openai/hosting.json` binds the application to Sites project `appgprj_6aaa2f4673e88191b504cf941f475802` and declares D1 `DB` and R2 `BUCKET`.
- `package.json` uses vinext, wrangler and Cloudflare tooling; no root `wrangler.toml` or `wrangler.jsonc` was found.
- `docs/final-acceptance-2026-10-18.md` documents tested sandbox purchase, webhook, download, withdrawal and 85/15; independent hosting and unattended due-job processing are not verified.
- Owner-provided Cloudflare Workers & Pages screenshot shows no projects in the selected account.

## Required before deployment
1. Confirm the exact Cloudflare account ID, existing D1 database ID, R2 bucket, and the live domain's current DNS/hosting destination. Do not assume Sites D1/R2 bindings reference resources in the owner's selected Cloudflare account.
2. Inventory environment variables, secrets, authentication provider headers, webhook routing, persistent storage, cron support, and required database schema/migrations without displaying secret values.
3. Prepare a standalone Wrangler configuration and a compatible Cloudflare runtime entrypoint, adapting Sites-specific authentication explicitly. Do not use untrusted identity headers as a substitute for real authentication.
4. Deploy to a new nonproduction route within the owner's verified account only after access and bindings are established; do not overwrite production or create duplicate databases.
5. Verify browser Radio, distinct artist/listener accounts, test-mode checkout and signed webhook, 85/15 accounting, purchased download, withdrawal, and native unattended recovery with a synthetic due fixture.
6. Record commit, deployment revision, bindings, test evidence, and rollback instructions. Plan a separately approved production DNS cutover only after acceptance.

## Stop conditions
- No verified Cloudflare account/credentials or mismatched D1/R2 identity.
- Any possibility of using live Stripe keys during acceptance.
- Any unverified auth boundary, payment entitlement, or data migration.
- Never delete GitHub history, D1, R2, Sites projects, or existing live domain records to force migration.

## Status
Migration plan documented. **No Cloudflare deployment, DNS cutover, or production changes performed.**
