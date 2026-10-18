# MusicBat — company-first recovery execution plan
Date: 2026-10-18
Status: IMPLEMENTATION REQUIRED — NOT A DEPLOYMENT CERTIFICATE

## Business objective
Operate one independently hosted, mobile-capable MusicBat music business at musicbat.audio. Artists retain rights, upload recordings, enter Radio, receive discovery, and sell to listeners. The purchase terms are 85% artist / 15% MusicBat, with buyer-paid processing. Stripe is an integration, not the application architecture.

## Single source and boundaries
- Computer: local working copy, development and verification.
- GitHub: ltkrisp-afk/musicbat-live, authoritative default branch repair/85-15-authoritative-2026-10-18.
- Cloudflare: target application runtime, existing D1 and R2 when verified, scheduled jobs, domain.
- Migration work stays on migration/independent-cloudflare-2026-10-18 until verified.
- ChatGPT Sites Stage 4 is historical acceptance evidence, not the company's required permanent runtime.
- Preserve Minimum Loop as the company's application; reconcile improvements rather than starting a replacement.

## Ordered work with objective gates
### Gate 1 — Inventory and reconcile
Compare local Git commit, GitHub default and migration heads, Sites Stage 4 runtime, Minimum Loop runtime, public DNS, Cloudflare account, D1 database ID, R2 bucket and migration history. Produce a table of source commit / deployed revision / hostname / storage identity / auth provider. Stop if an existing resource's ownership or identity cannot be verified. Do not copy live data into a test environment.

### Gate 2 — Independent application build
Build the current MusicBat source for standalone Cloudflare deployment; remove Sites-only runtime assumptions and provide an independently verifiable authentication provider, artist/listener authorization, and persistent identity. Preserve Radio, physical tuning dial, responsive PWA behavior, artist pages, catalog, upload, withdrawal, and purchases. Produce a reproducible build and passing focused regressions.

### Gate 3 — Cloudflare staging
Using verified owner account and existing eligible resources, configure minimum runtime, secrets by name only, D1/R2 bindings, route and native scheduled recovery. Never create duplicate storage or a competing product. If access is blocked, report the one required permission/action and continue source-side tasks. Demonstrate actual staging site loads from Cloudflare with expected build revision and data.

### Gate 4 — Business application acceptance
Using a real browser and two separate identities, verify account creation/login, artist upload and rights, Radio playback, discovery, artist page, listener actions, catalog persistence, and a purchase/download UI path. Include real phone/Safari check where available; Chromium responsive checks alone do not qualify as device acceptance. Do not describe tests as deployed proof.

### Gate 5 — Payment integration
Only after application acceptance, use Stripe test mode to verify signed webhook, 85/15 allocation, buyer processing fee, entitlements, post-withdrawal access, refunds/failed payment behavior. No live charges.

### Gate 6 — Resilience and release
Prove native unattended scheduled due-fixture recovery, retry/backoff, leases, security boundaries, migration rollback, and PWA installability. Reconcile source SHA, Cloudflare deployment ID, data IDs, domain route and rollback. Require explicit owner confirmation before live DNS/payment cutover. No deletion, no force pushes.

## Reporting contract
For each gate: VERIFIED / BLOCKED / NOT RUN, evidence link, exact revision, next action. Never replace actual deployed verification with a test count.

## Current verified facts
- GitHub accessible; default branch repair/85-15-authoritative-2026-10-18.
- package.json uses Vinext, Wrangler and Cloudflare libraries.
- .openai/hosting.json references a Sites project with DB and BUCKET bindings.
- No root wrangler.toml or wrangler.jsonc was found in prior inspection.
- docs/final-acceptance-2026-10-18.md records genuine Stage 4 test purchase and signed webhook; independent Cloudflare deployment not verified; unattended due-fixture execution not verified.
- Migration checkpoint 57b957277cf1ce346dfc9c38f2c68cd41aefd80c.
- GitHub issue #3 contains the migration directive.

## Immediate next engineering action
Inventory Cloudflare-specific and Sites-specific source dependencies and map the existing app entrypoint/build output to standalone Cloudflare deployment. Do not wait for another Stripe test or create a new application.
