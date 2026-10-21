# Current architecture and authority boundaries

Recorded 2026-10-21T01:43:55Z; source dd46fe9f8ae4baf50249e48b802e545368ca6fcd, Sites a9bc1ad45a47e3cc45f04c6119d536bfac384cb2, v20. 
Records: [Q sheet](q-sheet.md) · [causal ledger](causal-ledger.md) · [architecture](architecture.md) · [reconciliation](reconciliation.md) · [correction lineage](correction-lineage.md) · [machine evidence](evidence.json).


## Source and data map

| Boundary | Actual source / schema | Authority enforced |
| --- | --- | --- |
| Platform identity | app/chatgpt-auth.ts, Sites Dispatch authenticated headers | Stable user ID and email from platform; null when unauthenticated. Dispatch owns signin-with-chatgpt, signout-with-chatgpt and callback |
| Artist management / Shock Room | app/api/musicbat/route.ts: rotunda, shock-room, catalog-export, checkout-cleanup; POST management actions | Artist ID or active track_authority; private analytics never authorized by a hidden tab |
| Payout management | app/api/musicbat/stripe/connect/route.ts | Authenticated artist profile/owned tracks; account selected by userId, not visitor-supplied artist ID |
| Download purchase creation | app/api/musicbat/purchase/route.ts POST | Stable buyer account required; persisted before external Checkout call; price/rights/account checks retained |
| Purchase persistence | db/schema.ts purchases; drizzle/0015_purchase_account_ownership.sql | Nullable legacy buyer_account_id; immutable financial snapshots; account lookup index in declared migration |
| Paid settlement / refunds | app/api/musicbat/stripe/webhook/route.ts and stripe/stripe.ts | Signed Stripe event and provider evidence; never derives or replaces account ownership from browser cookie or receipt email |
| Receipt/list/download | purchase/route.ts GET; purchase/[purchaseId]/download/route.ts GET | buyer_account_id equals platform stable ID; account-owned purchased R2 snapshot persists after withdrawal |
| Legacy claim | purchase/route.ts explicit recover_legacy_purchase | Original buyer credential + paid provider receipt proof + matching authenticated email; write-once ownership audit and guarded null-only assignment |
| Public catalog / WebMCP | route.ts default/tracks; app/musicbat-loop.tsx | Public response omits private stats; browser/WebMCP handler calls the same server API. Catching denial in UI does not grant server access |
| Raw upload asset URL | audio/[assetId]/route.ts | Closed GET/HEAD 410; no legacy direct-download fallback |
| Radio channel/audio | lib/configured-radio-service.ts and app/api/musicbat/channel/** | Both test flags select sandbox D1 exclusively; missing sandbox resources fail closed. Not changed for account security |
| Recovery maintenance | app/mcp/route.ts; stripe/stripe.ts; lib/sandbox-recovery-probe.ts | Exact sandbox origin/base URL, test key/mode, owner stable ID; bounded pass/leases. Existing linked hourly cloud task, not a native Cron Trigger |
| Sandbox fixture controls | app/api/musicbat/sandbox/acceptance/route.ts; sandbox/recovery-probe/route.ts | Existing owner/test/site gates; not an alternate listener download-owner assignment route |

## Current deployed configuration

Project appgprj_6ad26204823c81918260d33e13429074; existing D1 binding DB and R2 BUCKET; environment revision 6. MUSICBAT_BASE_URL equals the sandbox origin, MUSICBAT_STRIPE_MODE=test, MUSICBAT_CLOUDFLARE_RADIO=test, MUSICBAT_RELEASE_PAUSED=0. Buyer processing settings remain 290 bps/30 fixed cents. Secrets are configured privately; their values are not part of these records.

The source selector chooses sandboxD1Radio under the observed flags even if a regular service binding/private runtime is present. This is configuration/source reconciliation, not a fresh playback test.

## Observed schema/data

Fresh bounded D1 reads show purchases.buyer_account_id and purchase_ownership_audit with purchase_id/account_id/evidence_type/processor_session_id/claimed_at. The iCloud purchase's stable account matches its one audit row. This verifies 0015's required ownership schema/data effects. The tool does not expose SQLite index definitions or the provider's migration bookkeeping; those are not claimed independently retrieved.

Eight purchase records: two paid. The accepted iCloud order retains base200 / artist170 / platform30 / processing37 cents and its original Session. The old paid fixture is still null-account and has no claim audit. Eight recovery jobs are completed, all leases clear and errors null. Nothing was reset.

## Actor pseudonyms

Stable identity pseudonyms are the first 16 hexadecimal SHA-256 characters of the stable ID, solely for cross-referencing these records:
- Artist/original owner A: `sha256:e932c7789a9e8bbc`.
- Separately authenticated iCloud listener B: `sha256:abcae718c5da273d`.
These identities differ; the same human controls both. Neither raw stable IDs, cookies, buyer hashes, credentials nor unrelated receipt emails are published.

## Alternate-path review and limits

The confirmed extra analytics exposure in the public tracks response was corrected. Rotunda/export/cleanup, Connect, raw audio and MCP were inspected for alternate active paths relevant to these incidents. Their existing checks are identified above; no additional bypass was demonstrated, and no speculative repair was made.

Other-artist isolation and missing/null identity are covered by actual-handler CI regressions. This does not claim a hosted second artist was provisioned, a real token was forced to expire, or every unrelated endpoint was penetration tested. Existing reviewed recording rights, withdrawn-track state, Retrofutura, tuning dial and financial processing remain unchanged.
