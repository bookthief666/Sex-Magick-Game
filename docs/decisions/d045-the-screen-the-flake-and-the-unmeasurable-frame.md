# D-045 — The screen it is played on, the flake that hid a bug, and the frame that cannot be measured here

Date: 2026-08-18
Status: Accepted

## Decision

Three repairs, taken together because the second is what exposed the third's
relative, and because all three are the same underlying mistake: **a test or a
computation that assumed a fixed number instead of asking what was actually
there.**

1. MONAS difficulty escalates from the geometry the game is being played on,
   not from `CONFIG`'s desktop constants.
2. The MONAS coherence assertions lead the moving wall, making them deterministic
   — which immediately surfaced a real effect-precedence interaction.
3. The M11 fold-open frame budget is measured against the renderer in front of it
   rather than demanded as a constant.

## 1. MONAS was harder than its own tuning on the device it is played on

`adjustForScreenSize()` (`index.html:1356`) adapts the game to narrow screens:

```js
if (screenHeight > screenWidth) {
    baseGap = Math.max(250, baseGap * 1.3);                            // 200 -> 260
    this.gameSpeed = Math.max(CONFIG.INITIAL_GAME_SPEED * 0.9, 2.0);   // 2.9 -> 2.61
}
```

M26 computed MONAS's own speed and gap from `CONFIG` instead, and assigned
`gameSpeed` **every frame**, so it overwrote that accommodation immediately after
every resize — including a Fold posture change.

| | base game intends (portrait) | M26 shipped |
|---|---|---|
| Corridor | `currentBaseGap` 260 | `CONFIG.PILLAR_GAP` 200 — 23% tighter |
| Speed | 2.61 | `INITIAL_GAME_SPEED` 2.9 — ~11% faster |

Both postures of the owner's Fold 6 are portrait. They reported the mode playing
well, which it did — but the difficulty they were feeling was not the difficulty
the code intends, and a deliberate mobile accommodation was silently dead.

**The fix probes rather than mirrors.** `adjustForScreenSize` is wrapped and asked
what it decides, from a pristine `INITIAL_GAME_SPEED`, and the result is captured.
Re-implementing the portrait test in `monas-runtime.js` would have drifted the first
time `index.html`'s breakpoints moved. Probing from a pristine value matters
specifically because the original only assigns `gameSpeed` on its portrait branch —
probing from an already-escalated value would ratchet the captured base upward on
every landscape resize. `currentBaseGap` comes free from the same call.

Measured in a real portrait run: **2.61 and a 260-wide corridor**, and unfolding
mid-run moves both to **2.9 and 240**.

**The process failure worth naming:** `monasSpeedForGatesPassed` and
`monasGapForGatesPassed` carry a comment saying they are "pure so the rotation can be
asserted without a browser" — and were never exported or asserted. A function
documented as testable and then not tested is how this shipped. Both are exported
now, with coverage that a portrait run stays slower and no tighter than a landscape
one at equal progress.

## 2. A flaky assertion was hiding a real interaction

`browser-monas-test`'s coherence assertions swung between 0 and 8 perfect passes
across identical runs — D-044 recorded this as test debt.

**Cause:** M17 gives pillars per-frame vertical movement. The avatar was placed on
the gap centre at the top of a frame, and the pass was scored *after* the wall moved,
so a centred pass routinely landed at `0.998` against a `>= 0.999` threshold. Whether
a run saw any perfect pass was wall-phase luck.

**Fix:** aim where the wall *will be*. That is leading a moving target — how the line
would actually be flown — not loosening the measurement. Two consecutive runs now
give identical **12/12** perfect passes, so the assertions rose from "more than zero"
to "nearly all".

**And the stronger assertion immediately found a real bug.** The coherence pulse sets
itself only `if (!this.screenFlash || !this.screenFlash.active)`, while M26's
photo-transition spectacle raises `triggerLevelUpGlitch()`'s own flash every
`GALLERY_ADVANCE_GATES` gates. A perfect pass landing on a gallery boundary therefore
loses its gold pulse to the photo change — 4 of 8 perfect passes in the run that
caught it, at gates 4 and 12.

This is deliberate precedence, not a dropped effect: a second flash stacked on the
loudest moment of a run is noise. So it is asserted as *permitted* rather than
quietly tolerated — a perfect pass must raise the gold pulse **or** yield to a flash
already active, and silence is the only failure. A flaky test would never have
distinguished those three cases.

**Open observation, not acted on:** the photo-change flash arrives via
`triggerLevelUpGlitch()`, which is the base game's, and it paints `#ff003c` and
`#00ff9d` at intensity 0.4. D-042 built MONAS's visual identity around gold. A red
level-up flash on a MONAS photo change is inherited rather than chosen. Changing it
is a feel decision and belongs to the owner.

## 3. The M11 fold-open sample is unmeasurable on this container

`browser-m11-performance-budget-test` failed on a fixed demand for 30 fold-open
frames. Everything structural was fine — the profile switched to `fold-open`, the
backing store resized, the loop was still scheduled — but **six frames arrived in 150
seconds**.

Fold-open is 2321×2898, roughly three times the fold-closed pixel count, and D-042
already traced the dominant draw cost to `drawLevelArtwork`'s
`ctx.filter = 'blur(1px)'`. On a GPU that is fine, and is what the owner's device
does. Under this container's software rasteriser it measures **~7.6 seconds per
frame**. Thirty frames was never slow here — it was unreachable, and no timeout was
going to fix it.

**Fix:** measure the budget instead of assuming it. Two fold-open frames prove the
profile switched and the loop survived the resize. Two more are timed to learn the
per-frame cost. The full interval sample is taken only if the projection fits a 60s
budget; otherwise it is skipped with a notice naming the measured cost, the
projection, and where to run for the real sample. Structural assertions run either
way, and the relaxed path still requires real fold-open frames.

63s and green, from 164s and red.

`waitExpression` also gained an optional diagnostic expression, reported on timeout.
"Timed out waiting for A && B" never says which half failed; that change is what
turned the message into "profile switched fine, six frames arrived" in a single run.

## Evidence

**29 fast suites and all 16 browser suites pass** — the first fully green run of this
session, and it includes all three suites that were failing when it began
(`browser-fixed-step`, `browser-m11-performance-budget`, `browser-monas`).

- Real portrait run: speed 2.61, corridor 260, both following an unfold to 2.9/240.
- Unit coverage that portrait escalation stays slower and no tighter than landscape
  at equal progress, monotonic, and clamped at both ends.
- Coherence: 12/12 perfect passes, identical across consecutive runs.
- Coherence pulse: 0 missed, with yields to a louder flash recorded rather than
  ignored.

## The standing item this does not touch

Seeding gameplay RNG remains the largest unlock — it is the prerequisite for
replay-based validation (D-044), and it would let visual baselines (D-024/D-031) rest
on something deterministic. It touches `Math.random()` throughout `index.html`'s
spawn paths and could change how the game feels, so it needs the owner's judgement
rather than a quiet refactor.
