# Persistent MusicBat playback repair

Continues from GitHub development commit `8b3fa2d9de359625fbe405719f96d7fcb678f958`, preserving the newer tuning/request-queue work.

The previous Radio tab owned the audio element. Closing that tab removed the player, stopped sound and removed volume controls.

The application root layout now owns one persistent player. Play/Pause, Volume and Mute remain in a control bar across MusicBat views. The Radio screen's Retrofutura console controls this same player. Internal artist and return links use client navigation, preserving the root layout rather than reloading the document. Signal callbacks attach to the current screen without owning or restarting playback.

The lifecycle regression mounts the real React provider/player with a mock HTML media boundary, starts playback, adjusts volume and mute, replaces Radio with Discovery, an artist page and Manage Songs, and opens the membership dialog. It verifies one audio element/ref, the same source, unchanged volume/mute, no extra pause/load, and callbacks bound to the current screen.

Checks: 126 automated tests pass, zero failures; TypeScript and build pass; lint zero errors and one existing unused-variable warning; diff whitespace check passes. The media-element mock proves React lifecycle behavior, not real browser audio decoding or actual route-loader behavior. Linux audible playback was user-confirmed before this change; updated browser continuity is not claimed as observed.

This change does not keep audio alive through a full document reload, external Stripe checkout, account sign-in/out, closing the tab, or a deliberate fail-closed authorization/network interruption. Membership dialogs and internal application navigation do not require such reloads. Existing rights checks, paid membership checks and stale-authority silence remain in place.

No production deployment, live payment activation or remote migration performed. Continue from the development branch; preserve completed checks. Do not restart the project or repeat backups without a concrete reason.
