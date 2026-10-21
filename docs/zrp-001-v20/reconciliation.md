# Gate 0 and source/deployment reconciliation

Recorded 2026-10-21T01:43:55Z. [Protocol](https://github.com/ltkrisp-afk/musicbat-live/blob/11f7119fb2bb8ff49a513fc72cb54d09b7c6dcf9/docs/zipper-reconciliation-protocol-2026-10-20.md). 
Records: [Q sheet](q-sheet.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [machine evidence](evidence.json).


## Exact source relationship — VERIFIED PASS, MB-009 CLOSED for v20

`a9bc1ad45a47e3cc45f04c6119d536bfac384cb2` is a real Git **source commit in the Sites repository**. Local Git resolves it as a commit, message “Update Site source,” parent `2bc1d2efb8dc390f14d0d2691042de00b29bd5e5`, author/committer time **2026-10-20T19:43:29Z**, tree `887c65c000dedb6a33b1d76f163f25caf21a4ca7`. It is neither a build digest nor a GitHub code-commit alias.

The GitHub fix [`dd46fe9f8ae4baf50249e48b802e545368ca6fcd`](https://github.com/ltkrisp-afk/musicbat-live/commit/dd46fe9f8ae4baf50249e48b802e545368ca6fcd) has parent `2e2904c72e283892f8f1cafe12f0dfaabf275ee7`, time **2026-10-20T19:43:15Z**, tree `51bdda1c6584afc7b287a74ac3a0e5acfa9543f3`. GitHub's Git commit/tree APIs returned the complete, non-truncated recursive tree. It was compared with `git ls-tree -r a9bc1ad45a47e3cc45f04c6119d536bfac384cb2` from the selected Sites checkout.

Results: **298 files in each source**, **294 identical path/blob/mode matches**. All **256 code/support files outside docs and the hosting manifest** match, including all application, authentication, Radio, test, migration, dependency and workflow files. No executable file drift was found. Full differences are in [evidence.json](evidence.json).

| Difference | GitHub fix tree | Sites v20 tree | Classification |
| --- | --- | --- | --- |
| .openai/hosting.json | Production identity appgprj_6aaa2f4673e88191b504cf941f475802 | Sandbox identity appgprj_6ad26204823c81918260d33e13429074 | Intentional environment-specific target boundary |
| docs/stage4-icloud-purchase-verification-2026-10-20.md | Present | Absent | GitHub-only later evidence |
| docs/stage4-substitute-listener-auth-2026-10-20.md | Present | Absent | GitHub-only evidence |
| docs/stage4-v15-pause-checkpoint-2026-10-18.md | Present | Absent | GitHub-only checkpoint |
| docs/stage4-sandbox-configuration.md | Absent | Present | Sites-only historical configuration document |
| docs/evidence/musicbat-paid-radio-2026-10-18.jpg | Absent | Present | Sites-only historical evidence |
| docs/evidence/musicbat-withdrawn-download-2026-10-18.jpg | Absent | Present | Sites-only historical evidence |

These seven path differences include three files unique to each repository and one differing common file. Different repository histories, manifests and documentation explain both commit and tree SHAs. The code relationship is reconciled without pretending the whole trees are identical.

**Deployment safeguard:** the authoritative GitHub branch's hosting manifest still identifies production. It must not be published directly as a sandbox source or used as implicit production authorization. The inspected Sites checkout has the correct sandbox manifest. This records a known environment boundary, not a new production deployment instruction; no manifest was changed.

## Environment/source matrix

| Surface | Verified identity/revision | Evidence and limits |
| --- | --- | --- |
| Authoritative GitHub branch | repair/85-15-authoritative-2026-10-18; runtime fix dd46fe9f8ae4baf50249e48b802e545368ca6fcd; pre-records head c9db2087d8549e980f7a5462b1e5fc5e0d749666 | GitHub branch/commit and non-truncated tree API |
| Sites source repository | a9bc1ad45a47e3cc45f04c6119d536bfac384cb2; tree 887c65c000dedb6a33b1d76f163f25caf21a4ca7 | Local Git object and native saved-version metadata |
| Existing Stage 4 live sandbox | appgprj_6ad26204823c81918260d33e13429074; v20 | Native get_site/get_site_version |
| Saved version | appgprj_6ad26204823c81918260d33e13429074~appgver_09bde474757c8191867058dcc35593ac | source.commit_sha=a9bc1ad45a47e3cc45f04c6119d536bfac384cb2 |
| Deployment | appgdep_6ad7c47a62e881918f12314663a45e9d; succeeded | Native deployment metadata; final update 2026-10-20T19:44:58.883288Z; earlier recorded success 19:44:06.653105Z. These are metadata observations, not two deployments |
| Archive artifact | sha256:2d8b7faadfe55bc8c0777722868a643c705c40b6c27f2468bbc7025162620f06 | Saved version: 131 files, 2222080 bytes; this digest is distinct from either source SHA |
| Observed Worker revision | 10628f2f-7aa8-455a-bfc6-7dd979d75d53 | Prior hosted request logs in [committed acceptance](https://github.com/ltkrisp-afk/musicbat-live/blob/c9db2087d8549e980f7a5462b1e5fc5e0d749666/docs/stage4-security-acceptance-2026-10-20.md); not a Git commit |
| Runtime environment | revision 6; base URL exact sandbox; Stripe=test, Cloudflare Radio=test, release pause=0 | Fresh native environment read, values whitelisted; credentials not disclosed |
| Storage/migration | D1 DB; R2 BUCKET; migration 0015 effects present | Fresh D1 purchase columns and ownership-audit table/row; prior successful R2 download. Resource UUIDs and platform migration execution ledger are not exposed by the bounded reader |
| Protected production | appgprj_6aaa2f4673e88191b504cf941f475802; Musicbat-Minimum-Loop; musicbat.audio | Fresh read-only Site mapping; latest saved version reported 16. Production deployed source, database and behavior were not audited or modified in this execution |

Runtime fee configuration remains 290 bps plus 30 fixed cents, with the accepted order's buyer-funded gross-up recorded at 37 cents. This does not claim every possible processor fee schedule is covered.

## Test-to-runtime relationship

[Development CI](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39485881177) and [browser CI](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39485881278) both completed successfully on **dd46fe9f8ae4baf50249e48b802e545368ca6fcd**. Job 118846039667 contains raw summary lines at **2026-10-20T19:45:33.226Z**: tests 266, pass 266, fail 0, skipped 0; TypeScript, lint and build steps succeeded. Browser job 118846040639 also recorded 266/266, eight shared-Radio checks and four actual-application checks, plus a successful responsive-console step/artifact. These run against isolated CI fixtures and Chromium, not hosted Stripe or physical Safari.

The full source comparison ties that tested code to Sites v20, with the sandbox manifest exception explicit. Hosted account/download/authorization evidence then verifies the deployed security boundaries. Existing purchases and tests were not rerun merely to align SHA strings.

## Historical claims still open

MB-007 internal callback cause and MB-008 original scheduler invoker attribution remain separate from MB-009. Completing source provenance does not invent missing historical request receipts. Migration 0015 schema effects are VERIFIED; exact platform migration-row IDs/timestamps/index introspection remain unavailable, not falsely reported as retrieved.
