# D-034 — The gallery, the corridors, and the flash that hid them

Date: 2026-08-13
Status: Accepted

## Decision

Three things M16 removed come back, and none of them disturb the Gate slice:

1. **The background gallery.** The picture on screen rotates through the whole
   ~71-image pool every 4 gates cleared, independent of the band.
2. **Pentagram bonus corridors.** Every 25 gates cleared, pillars stop for five
   seconds and spinning pentagrams fly past at +10 each — the original's
   between-levels bonus, restored alongside the Gate wager rather than instead of it.
3. **The glitch's cadence.** Orbs spawn again outside Gate and Void frames, and
   pentagram pickups now carry the punch orb pickups always had.

Plus the fix that made the first one possible: **`applyBand` finally assigns
`currentLevelIdx`.**

## Why the owner saw no backgrounds changing

`currentLevelIdx` was never assigned anywhere in `gate-slice-runtime.js`. It was
set to 0 at run start and never moved. Everything visual reads that pointer —
`drawLevelArtwork`, `drawScene`'s `tunnelColor`, and M21's accent wash — so all
three were pinned to image 0 for an entire session. D-033 gave image 0 a colour it
had never had, which is why *a* colour appeared while nothing ever changed.

The M23 telemetry is what exposed it. Runs reached bands 7, 5, 4, 2, 2, 2, 1, 1 —
**about 24 band transitions in ten minutes**. After D-033 I had told the owner band
changes were rare and to expect them seldom; the data says one every 25 seconds.
The wrong explanation was mine, and the session record corrected it.

## Why the pentagrams were unreachable

They spawn only inside `if (this.voidMode && this.frames % 10 === 0)`
(`index.html:1768`). The Gate slice's Void branch deliberately sets
`voidMode = false` around the original call so pillars spawn during the wager, which
makes that line unreachable in HEX mode. M16 reused the word "Void" for the wager
and the reward corridor disappeared with it.

The corridor is now its own state, never overlapping a Gate offer or the wager, and
it borrows `voidMode` for the spawn window only — the mirror image of the trick the
Void branch already used. Nothing in `index.html` changed: the `Pentagram` class,
its spin, its +10, its particles and sound were all intact and simply unreachable.

**Cadence is 25 gates, not 5.** The original ran a bonus every 5 levels while levels
advanced every 5 score — roughly every 25 pillars. Gates are this game's pillars
(367 in a ten-minute session, about one every 1.6s), so 25 is the faithful
translation: a corridor every ~40 seconds. An earlier draft used 5 and would have
handed the player a bonus every eight seconds.

## Why the glitch felt underwhelming

It was starved of triggers, not weakened. The override forced
`CONFIG.ORB_SPAWN_CHANCE = 0` and cleared `collectibles` every frame, and orb pickup
was the original's constant source of `triggerOrbGlitch()` + `hitStop` + 20 gold
particles. Without it only the random `frames % 30 && Math.random() > 0.8` path
survived — about once every twelve seconds. Suppression is now scoped to exactly
where it is needed: while a Gate offer is on screen and inside the wager.

## The failure that nearly got this reverted

`browser-m21-aesthetic-test`'s Void assertion started failing intermittently — the
Void measuring 94% lit against 45% expected. Seven runs at the previous commit were
tightly clustered correct; mine flipped roughly half the time. I bisected for a long
time and **the bisects contradicted each other**, because an intermittent failure
makes single runs worthless as evidence. At one point I reverted the entire
milestone rather than ship something I could not explain.

Instrumenting inside `drawVoid` settled it: the field buffer's own corner was
`0/0/0` black in *both* outcomes. The Void was never failing to darken. The
difference arrived after the field blit — `applyScreenFlash` painting the whole
canvas with a `#ffd700` gold flash at intensity 0.3, which is `triggerOrbGlitch()`
firing **because orbs are collectible again**. Restoring the original game's most
frequent effect made an assertion that had been accidentally deterministic into a
coin flip.

So the fix is in the test, and it is a correction rather than a relaxation: the
assertion clears transient overlays before each sample, because it measures the
*field's* Void treatment and a pickup flash from moments earlier is not that. With
overlays settled the Void measures 0.43 deterministically, and the shipped metric
improved to `voidDarkening 0.57` against M23's 0.553.

Two smaller test corrections came from the same root: the artwork assertion was
setting images on `gameLevels` while the gallery draws from `MASTER_POOL`, so it was
measuring a frame with no artwork in it; and a draw-cost failure at 41–56ms
reproduced identically at the previous commit under a host load average of 178, so
it was environmental. Both were confirmed by A/B rather than assumed.

## Evidence

- 24 fast suites and 14 browser suites green, including `browser-m11-performance-budget-test`.
- `browser-m21-aesthetic-test` **3/3 on an idle host**: `voidDarkening 0.57`,
  `perFrameDrawMs 5.43` (M23: 5.29 — unchanged), artwork compositing 200.6 → 142.4
  at alpha 0.6, `gateApertureUnchanged: true`.
- `browser-gate-slice-test` drives the **real** progression path — `game.checkLevel()`
  across boundaries, not hand-set state — and asserts: a 75-entry gallery rotating
  across ≥4 distinct pictures, `currentLevelIdx` advancing, a bonus corridor
  producing 9 pentagrams and **0** pillars, and the Void wager producing **0**
  pentagrams and pillars intact. That last pair is the guarantee the owner asked
  for: the challenge tunnel survives the reward corridor's return.

## What is still open

The 28 M14 visual signatures remain deleted pending a green CI run. Background
images are still hotlinked from Google Drive and the hosting decision is the
owner's. The second game mode is still disabled by the Gate slice and the
leaderboard still runs local-only; both are explicitly deferred, not forgotten.
