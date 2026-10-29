# Discovery interaction and studio material revision

Design-only branch: design/analog-stereo-preview-2026-10-29. Preserved remote
starting checkpoint: 56fa91e2fc4b6ab802630fbf1edddc1bb4a0b15c. Local equivalent
source: 6464e8e72b1b671fce82109c85407a24d664753c. Working tree began clean.
Original recovery commit, release branch and PR #5 remain preserved. No deploy,
merge, production mutation, payment activation or legal text change.

## Interaction corrections

Removed unrelated FM numbers and station/position needle instruments. The one
remaining instrument is expressly labeled OUTPUT SETTING: the actual player volume
setting after mute, never fabricated audio amplitude or bass/treble energy. Wired
from the same persistent player state; no second audio source or transport is added.
Real bass/treble analysis is unavailable and identified as such. Removed decorative,
nonfunctional tone knobs and EQ faders rather than implying they process audio.

Rotary movement, keyboard arrows and direct category selection invoke the existing
category-only tune handler immediately. Push retains exploration into existing
subgenre/style branches. No track selection, seek, playback authority, listening
progress or financial accounting changes. Locked/dormant choices do not call tune;
a ref guard blocks duplicate requests until the current command finishes. The
existing radio navigation remains authoritative, with no added category/count.
The local calibration audition now derives its genres from the existing artist
upload genre list, replacing its earlier hand-selected synthetic categories.
It clearly identifies its generated audio and does not claim live catalog tuning.

## Materials and comparison

Actual owner-approved image remains the visual authority and comparison image.
Retains reference-based walnut and machined knob assets. Adds optimized
reference-based photographic brushed aluminum, quiet upper-left warmth, satin
wood edge highlights and contact shadows, recessed glass and subtle reflection.
Texture assets are local; no new dependencies, remote fetches or animation loops.
Existing reduced-motion rules and native controls remain.

## Verification

Full suite: 309 passed, zero failures, cancellations or skips (305 existing plus
4 new interaction/authority/instrument tests). Typecheck, lint and build passed.
The first new tests exposed a missing window mock in the test harness; this was
corrected, and all four and the full suite reran successfully. No existing tests
were removed or weakened. Existing standalone design browser script was updated
to expect the meaningful output-setting meter and removed decorative controls;
that script was not rerun in this pass.

Browser evidence: desktop turn forward immediately selected/tuned Blues; actual
volume 0.25 -> 0.20, then mute drove OUTPUT SETTING to zero. Mobile turn likewise
tuned Blues; content width and viewport both 390px; no tone-control dummy buttons.
Desktop/mobile comparisons show native 1440px/390px rendered frames beside the
actual reference. Screenshot service timeouts are infrastructure errors, not test
passes; only completed captures are delivered. No full WCAG certification or new
hosted live payment/upload acceptance claim is made.

Owner visual review remains pending. Current scope is review only.
