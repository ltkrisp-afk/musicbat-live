# Exact MusicBat release operations — prepared, not executed

Existing Site: `appgprj_6aaa2f4673e88191b504cf941f475802`; preserve public audience, DB and BUCKET.
Baseline version 13: `appgprj_6aaa2f4673e88191b504cf941f475802~appgver_2632241454e08191a6f53d65bff4a5e7`, source `706082ad960574dd1f67f84bab61667dabfb0897`.
Release source is the successor of `5fa1ad766a9c64af98c27eaf604547a478a0da51` containing this document. Obtain its exact hash with `git rev-parse HEAD`.

Nothing here authorizes production operations or real Stripe transactions. Do not run remote Wrangler against build-time placeholder database IDs. Sites owns the existing hosted database and applies the committed Drizzle migration profile before Worker publication. Use the native Sites deployment path, not an additional `wrangler d1 migrations apply`. No replacement Site, DB or bucket.

## Local commands

Run in the release checkout:

```bash
node --import ./scripts/register-typescript.mjs --test scripts/musicbat-release-migration.test.mjs scripts/musicbat-stripe-mode.test.mjs scripts/musicbat-release-pause.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Do not repeat these passing checks unless inputs change. To regenerate transition sources only if their prepared working trees are absent:

```bash
node scripts/prepare-v13-transition.mjs maintenance /workspace/scratch/05dda3e0055a/maintenance-v13
node scripts/prepare-v13-transition.mjs rollback /workspace/scratch/05dda3e0055a/rollback-v13
```

The maintenance source is original version 13 plus a write pause, with original migrations. The rollback source is original version 13 plus the pause, the immutable release migration history and an appended `0010_v13_preserving_rollback`. Preparation creates only local source commits. Never deploy the rollback source unless the release schema upgrade has completed; inspect actual applied migration state after a failed deployment.

## After explicit production approval

1. Confirm the live baseline is still version 13. Obtain a native source credential with `sites_create_source_repository_write_credential({"project_id":"appgprj_6aaa2f4673e88191b504cf941f475802"})`. Do not print its token. Reconcile any active automatic publish-on-push window before pushing; preparation must never trigger publication.
2. Set only `MUSICBAT_RELEASE_PAUSED=1` through `sites_update_environment_variables({"project_id":"appgprj_6aaa2f4673e88191b504cf941f475802","set_values":[{"key":"MUSICBAT_RELEASE_PAUSED","value":"1","is_secret":false}]})`, preserving all other entries. Then publish the prepared **maintenance source**, keeping its original migration profile. Environment revisions take effect on deployment, so stage the pause before publishing maintenance. This blocks new mutable API handlers, including Connect readiness updates and webhook writes. Stripe retries 503 deliveries. Allow in-flight operations to finish; suspend any administrative imports or separate writers. Verify every mutable endpoint returns 503 and no new database writes occur before the schema boundary. Keep download GETs available.
3. Take a current database restore point at this boundary, once. This is the release-time data boundary, not a repeat of completed source backups. Retain a row inventory and original purchase/event financial snapshots. Reads used for this preparation were kept only in memory and are not a restore point.
4. Configure the approved live Stripe/rate keys and private-radio origin/token or service binding. Keep the pause set. Provision the private runtime on persistent storage, load existing original audio securely, and publish only reviewed rights/catalog evidence and actual membership provenance. No grants are inferred by the migration.
5. Open/synchronize the approved release source through the Sites source helper, then package the exact pushed commit. Credential JSON goes to hidden stdin only:

```bash
node /root/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/scripts/site-workflow.mjs --project-id appgprj_6aaa2f4673e88191b504cf941f475802
```

Opening input: `{"credential":<native returned credential>}`. Use the returned `checkout_path`; transfer the exact approved release Git tree there without overwriting unrelated uncommitted work. Packaging input: `{"credential":<credential>,"source":<complete opening result>,"commands":[["node","/root/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/scripts/build-site.mjs"]],"archivePath":"/workspace/scratch/05dda3e0055a/musicbat-production-release.tar.gz"}`. Reuse a matching successful build if unchanged. Never expose credentials or use them in shell arguments.
6. Use the exact returned helper values in `sites_save_site_version({"project_id":<result.project_id>,"commit_sha":<result.commit_sha>,"archive":<result.archive>})`, then `sites_deploy_site_version({"project_id":<same ID>,"version_id":<save result.id>})`. Use returned IDs unchanged. A pending result requires `sites_get_deployment_status` with its returned deployment ID; do not start a second deployment.
7. Confirm applied identities `0000–0004` unchanged; only `0005_v13_signal_compatibility`, `0006_purchase_processing`, `0007_playback_permissions`, `0008_shared_radio_engine`, `0009_artist_controls` are pending at the version 13 baseline. Do not apply candidate `0004_bat_radio_energy_feedback` or `0005_wandering_enchantress` to production. Reconcile every archive row and exclusion; do not require zero exclusions. Verify purchase amounts/splits unchanged, processing defaults zero, owners/assets unchanged and rights grants absent unless separately reviewed.
8. Run read-only acceptance while paused. Then open writes in a controlled acceptance window under the approved release, complete authentic live artist Connect onboarding and check its readiness. An absent/unready account continues blocking purchase creation. Do not fabricate or relabel a sandbox account, or create a second Dashboard account without linking it through the artist's authenticated onboarding. Real purchase/refund is a separately authorized acceptance action, not implied by deployment approval. Stage `MUSICBAT_RELEASE_PAUSED=0` and redeploy the same saved release version to apply the environment revision for controlled acceptance; the unchanged migration ledger skips applied migrations. Resume normal traffic only when acceptance passes.

### Production environment delta

`MUSICBAT_STRIPE_MODE=live`; `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as secrets; `MUSICBAT_PROCESSING_BPS` and `MUSICBAT_PROCESSING_FIXED_CENTS` as verified integers; preserve `MUSICBAT_BASE_URL=https://musicbat.audio`. `MUSICBAT_RELEASE_PAUSED=1` during cutover, unset or `0` after acceptance. Private runtime requires `RADIO_RUNTIME_ORIGIN` plus secret `RADIO_RUNTIME_TOKEN`, or a verified private service binding. The runtime itself requires `MUSICBAT_RADIO_DATABASE`, `MUSICBAT_RADIO_ASSETS`, secret `MUSICBAT_RADIO_GATEWAY_TOKEN` matching the gateway, and optional `MUSICBAT_RADIO_PORT` (5180 default). The runtime listens on loopback; a secured HTTPS private ingress or service adapter must reach it. Do not point the Worker at unreachable localhost or ephemeral disk.

## Preserving rollback

Pause all writers and drain in-flight work. Do not simply redeploy saved version 13 against the upgraded signal tables. Publish the prepared rollback source through the same helper/save/deploy operations above. Its appended `0010` retains upgraded signal tables as `release_*_archive`, restores original table shapes from `v13_*_archive`, overlays latest post-cutover feedback (timestamp then rowid), reconciles active/deleted Keeps, and keeps all purchases, events, additive schema, owners and audio. The journal retains every previously applied identity and records rollback as another migration. Run reconciliation before opening writes.

An original disabled Keep stays disabled unless a post-cutover active Keep explicitly re-enabled it; deleted eligible Keeps stay disabled. Original invalid/self rows remain in the original archives. A migration failure can leave partial schema depending on the hosted runner's transaction boundary: inspect the exact applied ledger/schema first. If incomplete, restore the boundary snapshot only while no post-boundary writes exist. A source-only rollback is not safe. After `0010`, never rerun `0005`; use a new forward repair migration after the actual rollback state is known. Never overwrite post-release sales with an old database.

## Post-deployment acceptance

- Schema/ledger and source provenance match the approved release; archive reconciliation balances; historical financial snapshots and asset identities match the paused boundary.
- Retrofutura renders without redesign; Free Radio is audible via private channel routing; Plus membership and region restrictions work; no legacy audio fallback or forged memberships.
- Authenticated upload/classification and owner/representative management work; withdrawal stops radio delivery, preserves catalog/audit and retains historical paid downloads; Shock Room counts only qualified eligible signals.
- Buyer receives an itemized base price, processing amount and confirmed total. A $2 base has artist $1.70/platform $0.30; at an illustrative verified 290 bps/30-cent rate, processing is $0.37 and total $2.37. This rate is an example until Dashboard confirms it.
- Signed live webhook accepted; test/missing/nonboolean/mixed-mode event or retrieved object rejected; wrong total/destination/application fee rejected; replay does not duplicate settlement; pending/failed sales stay locked.
- Read-only readiness command (private server environment already injected; never paste secrets into command text): `node --import ./scripts/register-typescript.mjs scripts/stripe-readiness.mjs acct_ACTUAL_LIVE_ARTIST_ID`. Replace the account placeholder with the actual public connected account ID. This does not create a transaction or prove webhook delivery/rate correctness.
- Only if separately authorized: reconcile one real completed charge, destination transfer, application fee, Stripe balance fee and delivered download; process a refund with transfer reversal and application-fee refund, verify ledger/access and retained processor costs. No such transaction was performed during preparation.
