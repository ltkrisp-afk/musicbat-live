# MusicBat public payment candidate

Prepared from published source 706082ad960574dd1f67f84bab61667dabfb0897, preserving its Radio. This branch is a payment-only release candidate, separate from development, and is NOT deployed. Its parent can be the development checkpoint for source preservation; its contents intentionally match the published application plus the documented repair.

Read public-launch-plan-2026-10-15.md. Central operational checkpoint remains the existing MusicBat Command Center. No production action is authorized by this branch.

Checks:
```
node --test --test-concurrency=1 scripts/musicbat-*.test.mjs
./node_modules/.bin/tsc --noEmit
npm run build
```

prepare-hosted-artist-link.mjs only emits SQL; it cannot connect or apply it. Do not apply the SQL, migration, hosted settings or deploy without explicit founder approval. Never merge the whole development tree into the working public Radio.
