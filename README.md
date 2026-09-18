# MusicBat Minimum Working Loop

A deployable proof of the MusicBat activity engine:

1. An artist uploads an MP3, WAV, or FLAC file (up to 25 MiB), supplies a track title and artist/band name, and attests their rights.
2. The track enters MusicBat Radio.
3. A signed-in listener plays it for at least 12 seconds.
4. The qualified listener places one bounded Hanger response.
5. The Weight Room updates from distinct listener signals.

The loop uses platform-provided identity and durable D1 storage for the catalog plus R2 for uploaded audio. It does not depend on Render, Neon, Manus OAuth, or a paid database.

## Commands

- `npm run db:generate` — generate D1 migrations after schema changes.
- `npm run build` — build the production worker.

## Current boundary

This is the smallest operational MusicBat loop. It uploads and hosts audio files and serves byte ranges for Radio playback and seeking. New URL submissions are rejected; any existing catalog entries remain available. File extension and signature checks reject mismatched uploads; files are not transcoded. Purchased downloads and payment collection are not implemented in this loop.


## Purchase preparation

The Radio Buy button snapshots the exact selected track into a durable guest purchase draft. A secure HttpOnly device cookie authorizes status and purchased-download access without forcing ChatGPT sign-in. Repeated sequential taps reuse a draft. Download responses are attachments with the uploaded file's real extension; pending, failed, and refunded purchases cannot use the purchased-download route.

This is preparation, not a working checkout. New drafts are `awaiting_checkout`, have no assigned price or processor session, and never charge or grant a download. The next payment integration must collect artist sale authorization (the existing upload attestation only permits streaming), bind an approved price/currency and recipient, offer Apple Pay/Google Pay before card entry, and mark an order `paid` only after authenticated server-side payment verification. The client must never control paid status or amounts. Wallet checkout must retain the purchase ID, track and asset snapshot even while Radio rotates. After verification, use the purchase status endpoint's download URL to deliver the file, with a download tap as a fallback when mobile browsers require one.

The Radio audio route remains public listening audio; purchase-route authorization is not DRM and cannot prevent capture of an openly streamed recording. This phase does not implement payment verification, artist payouts, receipts, cross-device purchase recovery, pricing, sales authorization, refunds, or wallet checkout.

Validation: `node --test scripts/musicbat-upload.test.mjs scripts/musicbat-purchase.test.mjs`.
