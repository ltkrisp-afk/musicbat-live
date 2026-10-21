# Production versus accepted sandbox
Recorded 2026-10-21 UTC (October 20 Pacific). Governed by [ZRP-001](https://github.com/ltkrisp-afk/musicbat-live/blob/11f7119fb2bb8ff49a513fc72cb54d09b7c6dcf9/docs/zipper-reconciliation-protocol-2026-10-20.md), [release plan](https://github.com/ltkrisp-afk/musicbat-live/blob/c19f0cb3c38cffc1d6235bb2b78315a75771a1c6/docs/musicbat-final-release-readiness-2026-10-20.md), and [v20 reconciliation](https://github.com/ltkrisp-afk/musicbat-live/tree/bd3e3311b59a43a33c47527d6241fe84685c8beb/docs/zrp-001-v20).

[Q sheet](README.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [evidence](evidence.json)

## Gate0
Native saved-version/deployment metadata identifies production v16 at3d0b7e98bfc3180c37a4d90395ffcaaf5806efbe, deployment appgdep_6ad38010c47881918c6ca916b53b4f8e, succeeded2026-10-17T14:03:46.665356Z, env revision10. Latest configured env11 is newer and cannot be treated as proven active. Production source inspection checkout is clean at that exact commit.

Sandbox v20 sourcea9bc1ad45a47e3cc45f04c6119d536bfac384cb2, deployment appgdep_6ad7c47a62e881918f12314663a45e9d, succeeded2026-10-20T19:44:58.883288Z, env6. Local source remains clean at that SHA. Its full code-to-GitHub relationship is already reconciled under MB-009; no duplicate tree audit was needed. All source reads in this audit were local Git/working files tied to the native source SHAs. No source credential or publication window was opened.

## Evidence interpretation
- Production HTTP200 catalog and five D1 tracks contradict “empty catalog.” The browser first loaded0/0 because source player exhausts410 media. Worker at2026-10-21T02:20:24.960Z request0ccaa80e10559e4f3fa08fc4e8ddbec1 returned410; catalog request3a131465cab65f550bf3adf2ecf8b43a returned200 at02:21:02.577Z.
- Sandbox503 request71e4e248cf4bcbd4c924d646eec525d0 at02:11:55.829Z has an actual D1 network stack. Later requests including509afad9b9c82da4e11980061d380129 at02:21:52.673Z returned200. Browser snapshot says channel-review-missing; fresh D1 confirms expired review. This is not a browser-control error and does not prove a code regression. Canceled requests do not establish server failure.
- Sandbox owner diagnostic establishes current Stripe test authentication and signing-secret configuration without exposing them or creating payments. Production has no equivalent new diagnostic; live provider identity was not exercised.
- Migration rehearsal creates only an empty in-memory SQLite database from production0000–0005. Stage4 signal migration applies there; Stage4 processing migration fails duplicate-column. This establishes a precise cutover incompatibility, not data-preservation correctness. A full current-row/financial rehearsal remains required before release.
- Domain inventory reports musicbat.audio active/SSLactive. This does not prove all DNS or provider account settings.
- Physical iPhone/Safari and independent physical-browser tests are NOT TESTED. Cloud UI controls worked this run; no viewport emulation capability was advertised. Existing Chromium/responsive CI evidence remains valid within its scope.

## Historical scope
Accepted purchase/account/artist security evidence and266-test CI are retained at [the security report](https://github.com/ltkrisp-afk/musicbat-live/blob/c9db2087d8549e980f7a5462b1e5fc5e0d749666/docs/stage4-security-acceptance-2026-10-20.md) and [ZRP Q sheet](https://github.com/ltkrisp-afk/musicbat-live/blob/bd3e3311b59a43a33c47527d6241fe84685c8beb/docs/zrp-001-v20/q-sheet.md). Existing [CI run](https://github.com/ltkrisp-afk/musicbat-live/actions/runs/39485881177) tests exactdd46fe9 runtime. No source change justified rerunning it.

The prior credential scan in docs/security-exposure-audit-2026-10-18.md covers its recorded9795cc3 history scope; it is not relabeled as a fresh all-history scan at today's HEAD. Current repository ignore/secret handling and environment redaction are preserved. No new credential leak found in inspected audit paths, but no new dependency advisory scan was performed.

The old purchase is a test fixture, quarantined and inaccessible, not a reason to rerun transactions or guess ownership. Old scheduler attribution and callback causes stay documented without reopening them. Current production security/delivery/recovery differences are independent active launch risks.
