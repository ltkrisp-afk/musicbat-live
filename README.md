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
