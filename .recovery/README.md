# MusicBat original Git history — verified recovery checkpoint

This branch preserves the exact original Git commits and their complete ancestry in Git's lossless bundle format. The application source files inherited from the Phase 3 checkpoint are unchanged.

Bundle: musicbat-original-history-2026-10-16.bundle
SHA-256: e3020426db476051863124ff9d5748d843382d65d8973e67d117a90c602386a0
Bytes: 576056

Included original branch heads:
- phase1-checkout-withdrawal-2026-10-16: 5773f2c0b9e7ee31a29f2f73ea7c64d0bee3594d
- phase2-durable-checkout-recovery-2026-10-16: 0683cdfe6869468076fbcdff6602ef2b41b13435
- phase3-integrated-regression-2026-10-16: b671d84e5783820352819fde24e05ac6bd38e92c

Git verified that the bundle records complete history with no prerequisite repository. Credentials and runtime files excluded from Git are not included. A scan of 493 reachable source blobs found no Stripe API/signing-key patterns.

Recovery after downloading this bundle through the authenticated GitHub repository:
```sh
git clone --branch phase3-integrated-regression-2026-10-16 musicbat-original-history-2026-10-16.bundle musicbat-restored
git -C musicbat-restored fsck --full --no-dangling
git -C musicbat-restored rev-parse HEAD
git -C musicbat-restored rev-parse origin/phase1-checkout-withdrawal-2026-10-16
git -C musicbat-restored rev-parse origin/phase2-durable-checkout-recovery-2026-10-16
```

Compare all results to the exact original identifiers above. Recovery must use a new empty directory and does not require overwriting the existing checkout.

This is original-history preservation as a Git bundle stored in GitHub. It is distinct from importing the original commits into GitHub's native branch object graph. The source-only checkpoint's different commit identity is not substituted for the original commits in this bundle.

No production, deployment, Stripe, schema or pricing changes.
