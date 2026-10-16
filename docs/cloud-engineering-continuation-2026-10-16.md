# Published cloud engineering continuation — October 16, 2026

## Source and environment evidence

The published environment reopened at `/workspace/musicbat-live` with retained
Node 24.19.0, pnpm 11.25.0, dependencies and local state. Its initial source was
`ed3c566c5eba7166da7be65ace12c8cf334a4037` on local branch `work`, matching
GitHub `bat-radio-shock-room`. Git HTTPS authentication succeeded through the
existing platform transport. That older source built and passed its 21 documented
tests; it is **not** the approved Phase 3 engineering revision.

The existing GitHub branch `musicbat-original-history-2026-10-16` retains the
previously verified recovery bundle. No new backup or independent restore was
created. The existing bundle's SHA-256 matched its recorded value
`e3020426db476051863124ff9d5748d843382d65d8973e67d117a90c602386a0`;
`git bundle verify` passed. Original commit objects were imported into this
checkout, preserving original Phase 1/2/3 ancestry. Phase 3 commit
`b671d84e5783820352819fde24e05ac6bd38e92c` and GitHub's recovered checkpoint
`daf7c67d42f051ee7f67d6b0575e1231a1110023` have the identical source tree
`e9219c174bb08f432092dfd40dff50e84bc8e29e`.

Continue on `engineering/phase4-acceptance-2026-10-16`, directly descended from
the original Phase 3 commit. The older-source edits made before the approved
plan was supplied were removed; no purchase logic or product architecture was
changed. This source already preserves 85/15 base purchase allocation, optional
300-cent monthly Radio Plus, free Radio and reviewed artist permission boundaries.
The published filesystem snapshot itself is not claimed to have been updated
by Git operations.

## Radio browser follow-up

The later diagnosis and development repair are documented in
[Radio timeout repair](radio-timeout-repair-2026-10-16.md). That report supersedes
the unresolved-browser limitation below; the original observations remain as
historical evidence. Hosted sandbox acceptance remains separate and pending.

## Executed verification

On the exact original Phase 3 source:

- Frozen pnpm installation: passed; lockfile and dependency declarations unchanged.
- `pnpm test`: **209 passed**, zero failed, skipped or cancelled; 44.167 seconds.
  Includes integrated upload/Radio/purchase/webhook/download/withdrawal/restart
  recovery tests. Stripe, identity and object-storage fixtures are not hosted evidence.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed, no errors or warnings.
- `bash scripts/sites-env.sh -- pnpm build`: passed; no deployment.
- `pnpm dev:acceptance`: started the existing isolated offline adapter.
  `GET /__local` returned 200; musician login returned 303; authenticated artist
  catalog returned `canManage: true`. Fixtures are generated audio and simulated
  payments; no production or existing operator database was migrated.

An additional `MUSICBAT_CHROMIUM_PATH=/usr/bin/chromium pnpm test:radio:browser`
run passed its first PCM audio decode/playback check, then stalled in the
second two-listener check for over a minute. Chromium processes consumed CPU;
the run also reported `MaxListenersExceededWarning` for ServerResponse close
listeners. Terminating its browser ended the runner with exit 1. The remaining
browser checks are **incomplete**, not passed; a cause has not been established.
A bounded diagnostic rerun with the same system Chromium 154 localized another
failure to Playwright's initial `Play Radio` click: the element was visible,
enabled and stable, but performing the click exceeded 30 seconds (exit 1).
The diagnostic copy and log are ignored local files; application/test assertions
were not weakened. Whether this is browser/runtime compatibility or application
behavior remains unresolved. This separate browser result does not establish
App Store/browser acceptance.

Local raw logs remain in ignored `.sites-runtime/phase3-*.log`. CI uses the same
locked install and four checks in `.github/workflows/verify.yml`. A committed
workflow is not proof that GitHub Actions has executed successfully.

## Approved plan continuity

1. Checkout expiration: original `5773f2c0b9e7ee31a29f2f73ea7c64d0bee3594d`.
2. Durable recovery: original `0683cdfe6869468076fbcdff6602ef2b41b13435`.
3. Integrated regression: original `b671d84e5783820352819fde24e05ac6bd38e92c`.
   Prior reviews are retained; this run revalidates execution in the published cloud.
4. **Current gate: hosted Stripe sandbox acceptance.** Validate exact source,
   upload and authorized playback, real test-mode Checkout, signed webhook,
   allocation fields, authorized downloads, withdrawal and interrupted recovery,
   including historical paid download preservation and existing recovery materials.
5. After Phase 4 passes, controlled non-production scale/resilience verification:
   concurrent Radio, purchases, downloads and webhooks; interrupted/retried events;
   withdrawal under concurrency; limits, access controls, bandwidth, R2/D1 behavior,
   measured costs and bottlenecks. Do not infer measured capacity from estimates.

Eventual iPhone App Store distribution remains a product goal, not a verified
capability of this web source or authorization to replace its architecture.

## Later hosted inventory

The concurrently committed
[hosted sandbox inventory](phase4-hosted-sandbox-activation-2026-10-16.md)
identifies an existing owner-only isolated Site. It supersedes the earlier
unknown-target observation below. Activation remains blocked by secure bindings,
private Radio/webhook/recovery prerequisites and this cloud machine's proxy
access denial. See the Radio repair report for the current probe and merge evidence.

## Phase 4 prerequisites observed at initial continuation

No approved sandbox URL is known. `.openai/hosting.json` declares only the
existing project and `DB`/`BUCKET` bindings. Committed hosting observations
identify `musicbat.audio` as production and state every Sites deployment is
production. No separate `workers.dev` or `pages.dev` target appears in the
inspected configuration/documentation. No hosting inspection connector is
available here, so these records are not a fresh live deployment inventory.

The current environment has no Stripe/MusicBat/Radio/Cloudflare variable bindings
and no `.env.local`. The existing `sandbox-purchase.mjs --check` returned
`ready: false`, `noPaymentCreated: true`, reporting missing sandbox key, actual
webhook signing secret, verified processing settings, recovered Unity checksum,
existing local artist/account association and original ownership record. Its
zero exit status is a diagnostic result, **not sandbox acceptance**. It made no
payment; missing prerequisites prevented processor verification. Do not fabricate
or duplicate these records to make the check pass. The local harness is also
not a substitute for full hosted acceptance.

To proceed with hosted acceptance, the owner must authorize a specific isolated
non-production target or provide access to an existing approved target, with
secure sandbox credential bindings, genuine webhook delivery, verified processing
settings, compatible isolated D1/R2/Radio services, reviewed test assets/identity
and unattended recovery execution. Do not enter secrets in chat or commit them.
No public deployment, remote migration, credential mutation, payment, account
creation, production change or load test was performed. Phase 4 has not passed;
Phase 5 has not started.

GitHub REST access through `gh api` returned Forbidden in this environment;
HTTPS Git operations are verified separately. No personal access token is
required merely because the API route is unavailable.


## GitHub persistence

Commit `f512014b3c5f2c620602b821d04bdbcfc3e78206` was pushed successfully to
`engineering/phase4-acceptance-2026-10-16`; a subsequent `git ls-remote` returned
that exact SHA. This verifies HTTPS Git read and write access. Its parent is
original Phase 3 `b671d84`; original Phase 2 ancestry was checked as well. The
push makes original history reachable through this new GitHub branch instead
of substituting the recovered source checkpoint for its commit identity.
Subsequent evidence-only commits may advance this branch. GitHub Actions
execution was not observed because the REST route returned Forbidden.
