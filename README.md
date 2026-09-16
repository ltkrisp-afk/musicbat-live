# MusicBat Minimum Working Loop

A deployable proof of the MusicBat activity engine:

1. An artist adds a direct audio URL and attests their rights.
2. The track enters MusicBat Radio.
3. A signed-in listener plays it for at least 12 seconds.
4. The qualified listener places one bounded Hanger response.
5. The Weight Room updates from distinct listener signals.

The loop uses platform-provided identity and durable D1 storage. It does not depend on Render, Neon, Manus OAuth, or a paid database.

## Commands

- `npm run db:generate` — generate D1 migrations after schema changes.
- `npm run build` — build the production worker.

## Current boundary

This is the smallest operational MusicBat loop. It accepts direct HTTP(S) audio URLs; it does not yet upload or host audio files, collect payments, or expose the broader frozen MusicBat feature set.
