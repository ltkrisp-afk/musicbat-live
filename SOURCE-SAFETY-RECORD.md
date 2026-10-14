# MusicBat current source checkpoint — persistent playback repair

Current GitHub development commit: 128ac277f3052990bddc09a04972240245f4cf60
Repository: https://github.com/ltkrisp-afk/musicbat-live
Branch: musicbat-acceptance-restored-2026-10-13
Exact tested source tree: cafb1539eb8746452363b8f611a1dcf80e2e1a16
Continues from 8b3fa2d9de359625fbe405719f96d7fcb678f958 and preserves Work's request-queue/tuning fix.

Fix: root layout owns one persistent audio element and visible Play/Pause, Volume and Mute controls. Internal artist/return links use client navigation. The Radio tuning console observes the same persistent player; screen callbacks do not own playback.

Evidence: 126 automated tests pass, zero failures. TypeScript/build pass. Lint zero errors and one existing warning. The new React lifecycle test verifies one audio element, unchanged source/volume/mute and no extra pause/load across screen replacement and membership dialog.
The media boundary is mocked in that lifecycle test: updated browser decoding and actual route-loader continuity remain unverified.
Previously user-confirmed Linux Radio sound/playback, controls and simulated song purchase/download are retained as historical passes, not repeated or reclassified as proof of this new change.
Last user-provided Linux update confirmed 8e4d157. The latest Linux commit after that is not independently verified here.
Actual Stripe sandbox enrollment, production configuration and remote migrations remain unverified/untouched.

Recovery branch: musicbat-recovery-2026-10-12
New bundle: recovery/musicbat-persistent-radio-recovery-2026-10-13.bundle
Bundle HEAD: 953751e29fe28a969fc213af61c0ec78169807cf
Bundle HEAD and current GitHub commit have the same exact tested source tree.
Size: 467605 bytes
SHA-256: fd80b1efc363f7943e3b8d16f8ec40af798e192206df8f832cac579cdd7787e4
Git blob: bd440c38b01a9606345374eb11ce60bb262bd20a
Bundle verification, import/tree verification and git fsck pass. GitHub blob SHA matches the local bundle Git hash.
Original and previous bundles remain preserved.

No competing branch was created. Continue from the current development HEAD, preserve newer work, and use guarded updates. Do not restart the project or repeat completed tests/backups without a concrete change requiring them.
This implementation preserves audio during internal application navigation and membership dialogs. Full reloads, external checkout, account changes, tab closure and authorization/network failure remain legitimate playback boundaries.
See docs/persistent-radio-2026-10-13.md in the development source.

## Historical checkpoint text — not the current development pointer

# MusicBat Radio Plus checkpoint — October 13, 2026

Repository: https://github.com/ltkrisp-afk/musicbat-live
Development branch: musicbat-acceptance-restored-2026-10-13
GitHub commit: 8e4d157e3245172bfd8d4979a0986125ff1653a0
Exact tested source tree: 77182e6d46a4a3e5705740a2e522d455d3655f78

Radio Plus enrollment, invoice verification, renewal, failed-renewal handling, cancellation, expiry, replay protection and membership enforcement implemented in test mode.
The local preview begins with Free access. Join confirms recurring $3/month terms and opens an isolated subscription payment simulator.
Subscription redirects grant no membership. Test grants never authorize a non-test deployment.
The button is About Radio Plus when enrollment configuration is unavailable.

Checks: 120 tests pass; TypeScript and build pass; lint zero errors, one pre-existing warning.
Browser enrollment UNVERIFIED: Chromium unavailable; download failed.
Actual Stripe sandbox UNVERIFIED: no sandbox credentials used or webhook endpoint registered.
Production, live payments, remote migrations and hosting unchanged.
Existing user-reported Linux acceptance passes are preserved, not repeated as proof of new enrollment.
User browser purchase history after withdrawal remains pending.

Recovery bundle: recovery/musicbat-radio-plus-recovery-2026-10-13.bundle
Bundle HEAD: 7f312d6af6c98dd5d0c3c27abe0777523c793c57
Bundle HEAD and GitHub commit have the same source tree. Commit IDs differ because the bundle retains the original source ancestry, while GitHub's restoration branch uses snapshot ancestry.
Size: 466987 bytes
SHA-256: da844b5caf104b14639ff82700aa3ee75aec28b6770c465e8cffdc68074af92f
Git blob: cf2ca6ac73cba761213596c3f3b0b00b64b0e8df
git bundle verify passed; complete history. Imported bundle source tree matches the exact tested tree; git fsck passed. GitHub blob SHA matches local bundle Git hash.

Restore if needed: git clone recovery/musicbat-radio-plus-recovery-2026-10-13.bundle musicbat-plus-restored
Verify HEAD and source tree against the bundle identifiers above.

Next: update Linux from the development branch and test Join → simulated invoice payment → Manage Radio Plus → cancel renewal → expiry. No production activation is authorized.
See docs/radio-plus-enrollment-2026-10-13.md for test configuration, migration and lifecycle instructions.

## Earlier source preservation record
The pointers below describe the earlier acceptance recovery, not the current development HEAD.

# MusicBat verified source and recovery record
Updated: 2026-10-13 UTC

## Authoritative development source
Repository: https://github.com/ltkrisp-afk/musicbat-live (private)
Development branch: musicbat-acceptance-restored-2026-10-13
Restored source commit: 25de1dbe3418ad0e31d723cf884bdafa017cb1e5
Original acceptance commit: 664591b36d4a1857fffe5d081766d3549bc7135c
Exact source tree: 784743d0aab40dc65bc237171c45153d3c4678ff
All 202 files and file modes match the acceptance source tree.
Restoration is a snapshot commit; original commit ancestry is preserved in the full Git bundle.

## Full-history recovery
Bundle: recovery/musicbat-acceptance-664591b.bundle
Size: 448837 bytes
SHA-256: fe891fb859ec682287282d29baf7510405f5ce865dca219e8071b6af077d21e6
Git blob: a9c809d89e8ee5727daeea62b6de1bd4ba24ef78
git bundle verify passed; complete history; HEAD is exact acceptance commit.
Git fsck passed after import into an isolated bare repository.
GitHub's returned blob hash matches the local Git hash of the exact bundle bytes.
Saved original bundle is also retained in ChatGPT saved files.
Restore: git clone recovery/musicbat-acceptance-664591b.bundle musicbat-restored
Then verify: git -C musicbat-restored rev-parse HEAD

## Earlier recovery
Branch: musicbat-recovery-2026-10-12
October 12 ZIP commit: edda1e4c2550a4394387ac1a8e177e5c7d4a58ce
ZIP: recovery/musicbat-live-experience-recovery-2026-10-12.zip
SHA-256: cd2220ae2b739604785272d9823ddc5d5f4d04928388c5823bcdaeae7680cd00
Drive: https://drive.google.com/file/d/1RMdRn1mVIGvJwtviiaIgC24A9s5KXHbm/view
Archived source commit: 7f71f67d99c4e5467558723a444c16905e4faf10

## Operational rules
Use the authoritative development branch for continued development.
Read existing evidence before diagnosing missing work; search saved artifacts before declaring source unavailable.
Do not reclone or repeat completed backups without a specific need.
Never overwrite or force-push the original or recovery branches.
Preserve purchase records and separate artist rights/permissions from patron controls.
Do not deploy, activate live Stripe, charge real money, or mutate production without explicit production authorization.
Every handoff must identify repository, branch, commit, tests actually run, and concrete blockers.
After meaningful source changes, create a commit and retain a complete verified recovery bundle off the workstation.

## Verification limits
This action verifies source preservation and recovery integrity, not launch readiness.
Linux workstation and phone-local musicbat2 folder have not been accessed in this session.
Live hosting configuration and production data backups are not reverified here.
Default branch bat-radio-shock-room remains ed3c566c5eba7166da7be65ace12c8cf334a4037.
No GitHub Actions workflow files exist in the restored source.
GitHub branch protection is not enabled on the original branch. No supported administrative write tool is exposed here to enable it.
The original branch and production were not modified by these recovery actions.
