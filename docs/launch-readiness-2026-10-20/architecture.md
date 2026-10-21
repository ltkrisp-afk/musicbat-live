# Launch architecture and authority boundaries
Recorded 2026-10-21 UTC (October 20 Pacific). Governed by [ZRP-001](https://github.com/ltkrisp-afk/musicbat-live/blob/11f7119fb2bb8ff49a513fc72cb54d09b7c6dcf9/docs/zipper-reconciliation-protocol-2026-10-20.md), [release plan](https://github.com/ltkrisp-afk/musicbat-live/blob/c19f0cb3c38cffc1d6235bb2b78315a75771a1c6/docs/musicbat-final-release-readiness-2026-10-20.md), and [v20 reconciliation](https://github.com/ltkrisp-afk/musicbat-live/tree/bd3e3311b59a43a33c47527d6241fe84685c8beb/docs/zrp-001-v20).

[Q sheet](README.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [evidence](evidence.json)

## Verified mapping
| Surface | Source | Runtime/data evidence |
| --- | --- | --- |
| Production Musicbat-Minimum-Loop | Sites3d0b7e98bfc3180c37a4d90395ffcaaf5806efbe, v16 | appgprj_6aaa2f4673e88191b504cf941f475802; https://musicbat.audio; Worker c98ec7ba-2ff3-402a-a361-f9f59cd17331 |
| Stage4 Sandbox | Sitesa9bc1ad45a47e3cc45f04c6119d536bfac384cb2, v20 | appgprj_6ad26204823c81918260d33e13429074; Worker10628f2f-7aa8-455a-bfc6-7dd979d75d53 |
| Authoritative source | repair/85-15-authoritative-2026-10-18 | Pre-audit HEADbd3e3311b59a43a33c47527d6241fe84685c8beb; tested runtime dd46fe9f8ae4baf50249e48b802e545368ca6fcd |

Both manifests declare D1 DB/R2 BUCKET. Physical resource UUIDs, R2 object inventory and platform migration ledger are not exposed by these reads. No copying resources or data occurred.

Production has eight user tables: artist_accounts,hangers,listens,purchases,radio_feedback,stripe_events,track_keeps,tracks. Five original tracks are active; two are sale-enabled at300 cents; all five rights_attested=1, but checkbox state is not full rights review. Public catalog returns seller_ready=0. Bounded purchases read is empty. No newer playback permissions, artist authority/audit, purchase account ownership or checkout recovery tables exist in the overview.

Stage4 has the current permission/channel/artist/account-audit/recovery tables. Account-bound receipt/download and scoped artist APIs remain the tested security reference. No account IDs, cookie hashes, credentials or provider request headers are published by this audit.

## Payment and delivery
Production config: MUSICBAT_STRIPE_MODE=test; MUSICBAT_CHECKOUT_PAUSED=1 in env revision11; base URL production. STRIPE_SECRET_KEY entry is secret/masked. No STRIPE_WEBHOOK_SECRET entry returned. Secret null values are redaction, not proof of missing keys. Effective deployment revision10 requires reconciliation before relying on current config.

Sandbox config revision6 matches deployment. Read-only owner readiness endpoint returned authenticated=true,livemode=false,webhook_secret_configured=true,purchases_paused=false. Existing settlement170/30 cents and buyer processing37 remain accepted. Production has the85/15 formula and buyer gross-up too, but that source inspection is not live settlement evidence. Test Connect account IDs and receipts must never be copied into live commerce.

Webhook fulfillment must preserve signature, mode, amount, destination, fee and idempotency verification, and account ownership must be established before Checkout. Current recovery implementation deliberately rejects live mode; changing a single Stripe flag would leave recovery unsupported. Do not remove that guard casually.

## Radio
Production old MusicBatPlayer requests catalog asset URLs; the route is deliberately410. No channel gateway exists in that source. The secure fix is compatible channel delivery, not restoring unrestricted originals.

Stage4 uses configuredRadioService in channel and audio routes. Both test flags force D1 exclusively. Outside this mode it selects RADIO_SERVICE or configured private service. A real service/runtime and authorized catalog are therefore an unresolved release dependency; no existing live service was demonstrated. CatalogBoundRadio/membershipBoundRadio, direct recording/composition permission, expiry, territory and withdrawal gates remain required. Statutory delivery stays disabled. A one-artist launch must use proven direct permissions, not tone approvals.

Retrofutura, physical push/turn dial, persistent shared audio and category scheduling are preserved in Stage4. Production still has older UI; preservation at cutover means bringing the verified interface without replacing it.

## Operations
Native custom domain and SSL statuses active. HTTPS production page and catalog observed. Worker log access works, with privacy-reduced audit projections. No continuous alerting/response SLA or current D1/R2 restore drill was evidenced. Source archives are not backups of mutable purchases/audio. Saved versions establish source rollback candidates only, not safe schema rollback; older versions can reintroduce security flaws. No destructive down migration or restore was attempted.
