# MusicBat Linux offline acceptance

Baseline: `cf8734c3836cf22749be6f47d6593df2a716f02c`. This development adapter preserves the existing MusicBat UI and uses its catalog, permissions, purchase, settlement and download handlers.

## Start on Linux Mint

Use Node 24 (tested: 24.19.0) and pnpm 11.25.0. In the checkout containing this change:

```bash
cd /home/musicbat/musicbat
node --version
pnpm --version
# Install only if dependencies are missing:
npm run install:ci
# Stop any previous server on 5173 before starting this one.
unset STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
npm run dev:acceptance
```

Open **http://localhost:5173/__local** on that workstation. Choose **Musician** or **Patron**. Use separate browser profiles for simultaneous sessions, or revisit `/__local` to change roles. The ordinary sign-in link opens the same local identity chooser.

No `.env`, Stripe account, database migration, Radio token or production file is required. Do not run remote migrations or deploy. Existing application environment is bypassed for intercepted MusicBat APIs. If either Stripe credential exists in the process environment, startup refuses. The adapter binds to `127.0.0.1`, accepts loopback Host/address only, strips supplied authentication headers and issues random HttpOnly session cookies. This local fixture is not a production authentication system.

## What the fixture provides

- Musician: `local_musician`; owns three generated 30-second WAV tones, artist identity, management and sale consent.
- Patron: `local_patron`; no song ownership or management authority. Existing artist onboarding remains available as designed; a patron can deliberately become an artist by completing it.
- Both identities receive test-only Radio Plus entitlement. Free Radio remains available and does not count interactive signals.
- Existing private Radio runtime with catalog-bound permissions, reviewed generated-audio grants, and Free/Rock/Punk/Hardcore/Jazz channels. Empty branches remain dormant. Minimum artist count of one is explicitly a test fixture.
- $2 song price; $1.70 artist and $0.30 platform allocation; test processing rate 290 basis points + 30 cents. These are fixture rates, not verified production rates.
- Local checkout page clearly marked **Offline purchase simulation**; success invokes the real signed webhook settlement handler against an in-memory processor. Cancellation returns without payment. No external processor request occurs. Replay remains idempotent.
- Purchase buyer tokens stay with the authenticated local session. `/__local/history` lists that session's stored purchases and authorized download links using the existing purchase-status handler.

The application retains its existing Stripe wording before the clearly labeled simulator. Test files are generated tones, not actual musicians' songs. No fixture permissions authorize production audio. Storage is isolated in memory plus a temporary Radio directory and resets when the process restarts. Newly uploaded audio does not receive automatic playback review or admission to Radio. The three generated fixtures are the reviewed Radio test pool. Ctrl+C stops the server; no backup is created.

## Browser acceptance still required

Automated handler tests are not observed browser acceptance. Perform and record the following on the Linux workstation:

1. Patron: Artists/Discovery and stable artist links; follow/unfollow. Confirm Manage Songs and Shock Room are unavailable.
2. Musician: open Manage Songs, edit own title/classification, navigate Add Track to the existing upload form. Confirm stranger-owned tracks cannot be managed.
3. Radio: start playback with a browser gesture; turn dial, push to explore Rock → Punk → Hardcore, return to broader paths, test Jazz, Free Radio and dormant branches. Confirm audible audio, station windows, navigation and playback recovery.
4. Patron: in Plus, allow the qualifying listening interval, then test ▲/▼/Keep and their persistent state. Free Radio must reject counted responses. Observe musician Shock Room afterward.
5. Patron: buy a fixture song, review the displayed fee and total, choose simulated payment, observe the existing return confirmation and download. Inspect `/__local/history`. Test cancellation separately. Never enter card data.
6. Musician: withdraw that purchased song. It must leave future sales and Radio eligibility while the Patron's purchase history and download survive. Revisit the same Patron session to check this; signing in again creates a fresh isolated session.
7. Record actual observations, console/network failures and results for each identity. Do not label browser acceptance complete until these interactions have been observed.

## Checks

```bash
npm test
npm run typecheck
npm run lint
```

This Work session has no supported browser-control access to the Linux workstation; browser acceptance remains pending. No deployment, live Stripe activation or production data changes are part of these commands.

## Engineering verification in Work

- `npm test`: 113 passed, zero failures, including three new local acceptance tests.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors; one pre-existing unused-variable warning in `musicbat-release-migration.test.mjs`.
- `npm run build`: passed; no deployment performed.
- Vite development configuration loaded the offline adapter successfully through `loadConfigFromFile`; it was closed after this configuration check. This is not an observed browser launch.
- The initial parallel full test run timed out in the real HTTP Radio test; that test passed alone. `npm test` now runs serially and the complete suite passes.
- Tests exercise role separation, management rejection, catalog-bound Radio and audio, quoted purchase allocation, signed settlement/replay, device/session download authorization, retained paid downloads and purchase history after withdrawal.
- Workstation browser acceptance remains **UNVERIFIED**. The startup command and adapter have been prepared here; the Linux workstation's updated checkout and browser interactions have not been observed from this session.
