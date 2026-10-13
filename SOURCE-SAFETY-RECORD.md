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
