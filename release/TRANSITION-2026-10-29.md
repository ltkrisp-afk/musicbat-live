# Production transition rehearsal and rollback procedure

PREPARATION ONLY. No remote commands have been executed. This document does not
authorize a migration, deployment, payment configuration change or activation.

The fresh read-only export was rehearsed with scripts/rehearse-v13.mjs using
an isolated in-memory SQLite database. Source counts: 5 active tracks, 38 listens,
2 Hangers, 5 feedback rows, 5 Keeps, 0 artist accounts, 0 purchases, 0 Stripe events.
All original columns, identifiers, audio paths, timestamps, owners and archived
choices survived upgrade and compatibility rollback. No public permissions were
invented. Empty production account/purchase tables cannot prove preservation of
nonexistent transactions; separate synthetic tests cover accounts, old paid
allocations, new 85/15 purchases and rollback/failure preservation.

After separate owner release authorization:

1. Identify the exact deployed version/source, environment revision, database
   migration journal and R2 binding. Check the rehearsed export against a fresh
   export; stop on a changed schema or unknown migration. Compare original
   0000–0004 migration hashes with release/v13/baseline. Do not reapply them.
2. Pause writes through the supported maintenance release/configuration. Obtain
   restorable provider-native D1 and R2 recovery evidence; source Git is not an
   audio/database backup. Verify restore scope and record recovery identifiers.
3. Repeat the read-only export rehearsal with those paused current rows; validate
   all protected rows and counts, including new records since this rehearsal.
4. Apply only missing registered additive migrations in journal order, using
   the hosting provider's supported transactional migration operation. The new
   0019 schema adds integration evidence and does not activate any feature.
   Never manually insert a license, signer, ownership grant or live credential
   to make a smoke test succeed.
5. Deploy only the separately approved source and configuration. Compare catalog
   identifiers/paths, historical purchase snapshots, entitlement ownership and
   recorded processor modes. Review radio runtime/channel/rights prerequisites.
6. Run hosted separate-account upload, purchase/download, withdrawal, membership,
   signed webhook, settlement/evidence and mobile playback acceptance. Unpause
   only when the concrete release gates and actual license records pass.

Rollback:

- On a migration failure, rely on the transaction rollback and verify original
  rows before retrying. Do not continue with a partially migrated schema.
- After migration but before unpause, keep maintenance active and restore the
  prior compatible service source only after its query compatibility is checked.
  Use release/v13/rollback-signals.sql only for its documented signal compatibility
  projection; it preserves original archives and financial/rights evidence.
- After new transactions exist, do not restore an old full database snapshot or
  drop new tables. Keep writes paused and use a compatible maintenance/forward
  repair retaining every new purchase, consent, settlement and entitlement.
- If provider recovery is necessary, reconcile all post-checkpoint financial,
  consent and object-storage changes before resuming. A source-only rollback
  cannot safely reverse a database transition or paid transaction.

Remaining external evidence: a real provider recovery/restore rehearsal, final
hosted acceptance and separately approved production configuration. This local
rehearsal does not claim remote D1 migration or R2 restore execution.
