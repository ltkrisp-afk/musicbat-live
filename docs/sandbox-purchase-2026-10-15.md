# Real Stripe sandbox purchase, existing artist account

This operator harness executes the existing purchase, webhook and download handlers with real Stripe API requests. It does not change the normal MusicBat server, Radio, source D1 database, R2 objects, original ownership, existing payout record, or hosted environment. It never creates Connect accounts or grants payment from a success redirect.

Start with Node 24 from the existing checkout:

```
node --import ./scripts/register-typescript.mjs scripts/sandbox-purchase.mjs --check
```

The existing ignored `.env.local` is read privately. A missing sandbox key, actual webhook signing secret, processing settings, recovered Unity SHA-256, original owner or verified local account association stops execution and prints nonsecret blockers. Live mode/keys are rejected. `--check` never creates a payment or snapshot. Credentials are not printed, requested, generated or changed. The existing platform/account are GET-verified and the account's stored artist metadata must match local_seedy.

Once ready, omit `--check`. The runner creates a new persistent SQLite snapshot beneath ignored `.wrangler/sandbox-purchase/run-*`. Only that new snapshot maps the existing account from local_seedy to the original owner and authorizes a $2 Unity test sale. This explicit test mapping is audited; it is not a repair to the production artist identity or main development database. Existing records are retained in the snapshot.

The loopback-only harness listens at http://127.0.0.1:5181. Existing MusicBat on port5173 is unaffected. A genuine sandbox webhook relay must forward to http://127.0.0.1:5181/api/musicbat/stripe/webhook; its exact signing secret must match the existing local STRIPE_WEBHOOK_SECRET. Do not use a fabricated signature or assume a Dashboard endpoint can reach localhost. If no relay/signing secret exists, STOP and report that concrete blocker; configure the relay privately before payment.

One browser action opens the application-created Stripe Checkout URL. Complete the Stripe test-card payment on Stripe, then open Verify payment and download. This runner never calls a test simulate-payment route. No automatic card entry. No real card or bank details are needed for sandbox.

Verification requires a signed paid Checkout event, replay returning duplicate:true, one event ledger row, a fresh Stripe GET reporting paid sandbox session with the expected account and application fee, and the original MP3 hash through the actual paid download handler. The evidence JSON is written to the run directory, with no key, webhook secret, raw event or customer details. The platform15% and artist85% refer to the base price, separate from the configured buyer processing amount. The runner verifies Stripe's recorded allocation fields; it does not prove bank settlement or connected-account balance transactions. If transfer/balance proof is required beyond these Stripe fields, it remains a separate read-only verification after payment.

Prepared code tests are not actual Stripe results. Work lacks direct Linux access and local secrets; the genuine transaction remains pending until the Linux run produces evidence.

After authorizing Stripe CLI for MusicBat.audio sandbox (platform acct_1UHA0OLKJHBmA7Jw), use `node --import ./scripts/register-typescript.mjs scripts/sandbox-purchase-relay.mjs`. This launcher validates the active sandbox, obtains the real CLI signing secret privately, and starts real webhook forwarding plus the purchase runner. The signing secret is passed only in process memory; existing .env.local and API keys are unchanged. Missing fee settings use an explicitly announced sandbox-only scenario of290bps+30c; configured values are preserved. The actual listener's secret must match the privately captured secret before the purchase runner starts. All terminal secret values are redacted. A different already-configured webhook secret causes a stop rather than replacement.
