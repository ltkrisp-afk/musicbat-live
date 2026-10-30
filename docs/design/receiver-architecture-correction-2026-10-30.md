# Receiver visual architecture correction — October 30, 2026

Existing PR #5; protected parent `b1ca40b5e106ae6b205b05c2e303cb1a1a7f99ec`.
Local implementation and review only. No merge, deployment or production changes.

## Implemented correction

Replaced the accumulated receiver skins with one cabinet/fascia/control stylesheet.
The component now has a recessed signal fascia and a continuous brushed-metal
control chassis, enclosed by walnut cabinetry, edge trim, cabinet depth and feet.
Removed the old pink/black rounded radio card and its decorative glowing element
from the actual Radio markup. The Radio page has a quiet studio background and
restrained navigation; account and non-Radio navigation retain their existing
presentation. Reused all existing photographic material assets, native controls
and category handlers. No decorative nonfunctional tone/EQ controls were added.

Preserved immediate rotary tuning, push-to-explore, the existing taxonomy,
locked/dormant channel controls and pending-command guard. No changes to the root
audio owner, streaming authority, listening accounting, accounts, rights, financial
rules or agreement. The meter remains honestly labeled output setting; this work
does not implement the separately deferred floating Rotunda or live audio analysis.

Browser inspection found a preexisting server/browser trigonometric serialization
discrepancy in meter SVG coordinates. Fixed coordinate precision and added a
regression that simulates the observed cross-engine rounding difference. A stale
test requiring the removed neon palette now verifies the two receiver fasciae;
its engine hierarchy, entitlement and no-extra-audio assertions remain intact.

## Browser evidence

Actual Radio page inspected in Chrome at `http://terminal.local:4173/`. It renders
the new structure, has one HTML audio element and no horizontal overflow. The
local catalog is empty and playback remains unavailable; this is not production
catalog or hosted authentication acceptance. After the meter fix, a fresh Radio
navigation produced no application-origin error logs in the observed interval.

Generated calibration audition at `/design-preview`: Play -> Pause, volume 25% ->
40%, mute -> zero instrument reading, unmute -> 40%, rotary forward -> Blues and
keyboard ArrowRight -> Classical while playback remained running. Mobile Play
and rotary forward -> Blues also passed. No artist audio or payment was used.

Responsive checks used actual embedded Chrome content viewports, not physical
iPhones/Safari. Measured document content width equals available viewport width:

| Requested frame | Available viewport | Content width |
| --- | --- | --- |
| 320px | 305px (vertical scrollbar) | 305px |
| 375px | 375px | 375px |
| 390px | 390px | 390px |
| 430px | 430px | 430px |
| 768px | 768px | 768px |

Saved screenshots:

- [Desktop calibration audition](../evidence/musicbat-receiver-desktop-2026-10-30.jpg)
- [390px mobile calibration audition](../evidence/musicbat-receiver-mobile-2026-10-30.jpg)

The temporary responsive harness was removed. The first preview startup timed
out and left a stale development lock; selecting the documented managed execution
profile and clearing the stopped preview's lock restored preview. An attempted
full-page actual-Radio screenshot timed out. A subsequent viewport capture could
not be synchronized to the checkout and is not linked as a delivered artifact.
These failures are not counted as browser passes.

## Acceptance boundary

The structural correction and interaction checks are implemented. Compare the
captures with `public/materials/approved-stereo.webp` for owner visual review.
The interface retains fewer controls than that photograph because unsupported
controls must not pretend to function. Final photographic acceptance remains
pending; it is not established by regression tests or this report. Floating
Rotunda/live-VU work remains separately deferred. No production acceptance is
claimed.

## Validation

Final local regression: **323 passed, zero failed/skipped/cancelled**. Typecheck,
lint, production build and agreement integrity passed. Full suite and build used
`CLOUDFLARE_CF_FETCH_ENABLED=false` to disable the previously blocked external
metadata lookup. These are local results, not GitHub Actions or hosted acceptance.
Agreement remains 48,789 bytes with SHA-256
`4fc7e2df7ce5de07f31284c5d733e4aaaf102821cb2cdef52ce0ffb697454e73`.
The initial
full run after the structural change had 321 passes and one obsolete neon-color
assertion failure; that assertion was corrected as described above. The focused
receiver/shared-engine rerun then passed all 36 checks. No test was deleted.
