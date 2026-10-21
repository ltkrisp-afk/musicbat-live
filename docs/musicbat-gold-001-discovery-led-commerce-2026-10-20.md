# MUSICBAT-GOLD-001 — Discovery-Led Commerce & Community Architecture

Status: Product-design gold standard; proposed future features, not implementation evidence.
Date: 2026-10-20

## Governing principle
**Let the music earn the attention. Let the listener decide what happens next.**

Discovery journey: **Hear → Discover → Save → Remember → Connect → Support**.
Support is voluntary; free listening is a complete experience.

## Product tiers
- **Free programmed radio:** Broad genres such as Pop, Country, Rap, and Rock; listeners discover music without required purchases or membership.
- **My Discoveries (free, per account):** Save or pass on musicians/recordings; private, durable account-owned collection, portable across sign-ins. Saving does not request, queue, or prioritize a recording for playback. Passing does not necessarily exclude the artist from shared radio rotation.
- **MusicBat Community ($3/month, proposed):** Deeper exploration of subgenres, moods, and programmed channels, plus voting and participation in future programming. Membership is not a prerequisite for saving artists or purchasing recordings.
- **Optional artist support:** Singles and bundles (illustrative $2/$5/$10 offers), with verified 85% artist / 15% platform accounting where applicable. A purchase is not required to enjoy radio or join Community.
- **Artist rotunda/discovery space (future design):** Artist profiles and community connection without turning the programmed radio into an on-demand catalog.

## Architectural separation
1. Programmed radio scheduler determines playback; avoid turning saves, votes, channel choices, or personalized settings into track-specific requests.
2. Account-owned discovery preferences are stored separately from radio scheduling and purchase entitlements; stable account IDs, authorization, privacy, and deletion controls.
3. Community voting influences editorial decisions or future programming, not immediate track playback.
4. Artist profiles and purchases are separate from the radio playback license and must honor applicable rights.

## Design acceptance questions
- Does the feature improve genuine discovery or strengthen a voluntary listener–artist relationship?
- Is the free listening experience complete and respectful?
- Does it avoid pressure tactics, manufactured urgency, or forced purchases?
- Does it preserve fair exposure for emerging artists?
- Is listener privacy protected, with durable account ownership?
- Does it preserve noninteractive programmed-radio boundaries? Legal review of the actual service and rights is required; genre selection alone does not determine licensing status.
- Can the feature run reliably with minimal ongoing manual administration?

## Execution order
Finish and verify existing production release-candidate corrections first. Then specify, legally review, build, and test My Discoveries, Community, genre/subgenre programming, voting, and the artist rotunda as separately scoped future work. Do not deploy to production or enable live payments without explicit owner approval.

## Brand alignment
MusicBat — A Discovery of Sound.
The hook is discovery. The reason to stay is the music.
Let the music do the talking.
Free to listen. $3 to explore deeper and participate. Optional purchases to support artists.
