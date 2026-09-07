# D-041 — The Rite of Monas: the opposite rite

Date: 2026-08-13
Status: Accepted

## Decision

MONAS is unsealed and becomes a genuinely different game, not a reskin:

1. **Hold to glide.** Lift applies while the input is held; release and the glyph
   sinks. HEX taps; MONAS holds.
2. **Coherence, not risk.** Passing near the **centre** of a gap pays, and flying
   smoothly pays. This is the exact inverse of HEX, where grazing the edge pays most.
3. **The Warp Surge.** A full Coherence meter spends itself on speed — the corridor
   *opens*, the warp starfield streaks, and score doubles for six seconds.

## What the seal actually was

One line in `gate-slice-runtime.js`:

```js
Game.prototype.startGame = function startGateSlice(...args) {
  if (this.gameMode !== 'HEX') return undefined;   // <- the seal
```

Returning without calling the original meant pressing RITE OF MONAS did nothing at
all. Unsealing is one delegation, because every other Gate slice override already
guards on `gateSliceState`, which a MONAS run never creates — so MONAS falls through
to the original loop, and this milestone layers a rite on top of that rather than
carving one out of the Gate slice.

## Why *this* design, and not just "MONAS but floatier"

The M17 reachability solver already models both rites, so the question could be
measured instead of guessed. Under an identical stress sequence on a small phone,
**HEX clears through BINAH and MONAS fails a band earlier, at CHESED.** MONAS's
gravity of 0.18 with 0.98 damping cannot dive onto a low gate in the time available.

That is not a defect to compensate for. It says what MONAS *is*: a rite that cannot
make violent corrections, and therefore should not be scored on making them. HEX
rewards the sharp late dive at the edge of a gap. MONAS rewards the line you commit
to early and hold.

**A correction worth recording.** My first pass at this measurement used a brutal
synthetic sequence (gate ratios alternating 0.1 → 0.9) and reported *both* rites
failing every band from GEBURAH up, which reads like a fairness emergency. It is not:
under realistic gate placement every band solves 4/4 for both rites. The harsh
sequence is harsher than anything the game spawns. The comparative result survives;
the alarming absolute one was an artifact of my own test input.

## Coherence

`scoreCoherence({ gap, offset, reversals })` pays for two things:

- **Centred**: 1 at the gap's centre line, falling to 0 in the outer fifth. Measured
  as a fraction of the gap, so tighter later bands are not quietly harder to score.
- **Smooth**: direction reversals while approaching. Two corrections are free;
  beyond that the bonus decays, so a sawtooth that happens to end up centred is worth
  less than a line held steady.

Ten points fill the meter and open a surge, which spends the meter back to zero.
Coherence does not accumulate during a surge — the surge *is* the spending of it.

## The bug the browser test did not catch, and now does

The surge draws its streak from `voidMode`, which is `WarpStar`'s branch in
`drawScene()`. My first implementation set `voidMode` at the start of
`updateGameObjects()` and cleared it before returning — but the game loop calls
`updateGameObjects()` and *then* `drawScene()`, so the flag was always false by the
time the renderer read it. **The surge would have had a HUD and no visual.**

Leaving the flag set has its own hazard, which is why it was cleared in the first
place: the loop runs `if (this.voidMode) { this.voidTimer--; if (this.voidTimer <= 0)
this.endVoidMode(); }`, and `endVoidMode()` assigns `this.gameSpeed =
this.preVoidSpeed` — a field a MONAS run never sets, so `gameSpeed` would become
`NaN`. Holding the timer above zero for the surge's length keeps that path from
running, and the surge clears the flag itself when it ends.

I found this by reading my own test rather than by the test failing: the check I had
written (`game.__monasSawVoid !== false`) was vacuously true and asserted nothing. It
now samples `voidMode` exactly where the renderer reads it, and separately asserts
`gameSpeed` stays finite throughout and afterwards.

## Evidence

- `test-monas-runtime.js`: glide clamps in both directions, a held second gains
  height and a released second loses it, a graze scores under 0.05 while the centre
  scores over 0.95, edge-flying never fills the meter, the meter opens exactly one
  surge, and a surge ends exactly once.
- `browser-monas-test.mjs` drives the shipped path — the menu button, `startGame()`,
  the real `Player.update()` and `updateGameObjects()`, and the pillars the game
  spawns for itself:
  - held flight climbs 500 → 261, released flight sinks 500 → 636
  - centred flight through real gates records perfect passes; **edge flight through
    the same gates earns 0 Coherence and never surges**
  - a surge opens, widens the corridor 260 → 303, is `voidMode`-visible at draw time,
    keeps `gameSpeed` finite, and ends on its own
  - HEX is untouched: still Gate slice, no Monas state, holding does not glide, and
    the Coherence meter stays hidden
- 40 fast suites and 13 browser suites green.

**`browser-m11-performance-budget-test` fails on this container and it is not this
change.** It fails 3/3 at HEAD, 3/3 at `bad4d59`, 3/3 at `682006d` and 2/2 at
`9d060d5` — the last of which passed 3/3 earlier the same day on a different
container. The host is idle (load 0.35) with no leaked browsers or stale servers; the
fold-closed segment reaches its full 120 frame intervals and only the fold-open
transition starves, which is consistent with this container being unable to drive a
2321px backing store at DPR 2.625 fast enough. Recorded rather than explained away,
and CI is the arbiter.

## What is still open

MONAS runs the original score-based levelling; it does not have a band table of its
own, and its own reachability envelope under *glide* physics is not yet solved — the
solver models the original impulse profile, not held lift. Both are follow-up work,
and until then MONAS is a second rite to play rather than a validated competitive
ladder. The Rite board (D-040) ranks HEX runs only.
