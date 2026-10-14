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
