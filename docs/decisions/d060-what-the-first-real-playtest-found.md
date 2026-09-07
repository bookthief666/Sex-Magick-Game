# D-060 — What the first real Fold 6 playtest found

**Date:** 2026-08-21
**Status:** Accepted. Three fixes from one physical session; the AEGIS change is
a deliberate difficulty change made by the owner. Not a release authorization.

## Context

M36 put the gallery in the repository and the owner played the result on a Fold 6
in the open posture — the first time this build has been played on the physical
target by a human, and the gate every decision since D-047 has deferred to.

The game ran. The art rendered. Three things came back, and all three were real.

## 1. The lag is not the renderer, and D-054's DPR policy is answering a question this device does not ask

Two probe captures (`?perfProbe=1&perfPanel=1`), same posture, same play, one at
`renderDpr=1` and one at native:

| | `renderDpr=1` | native (2.625) |
|---|---:|---:|
| backing pixels | 477,225 | 3,288,832 |
| draw p50 / p95 | 1.4 / 2.4 ms | 1.6 / 2.4 ms |
| frame p50 / p95 / p99 | 16.7 / 16.8 / 16.8 ms | 16.7 / 16.7 / 16.8 ms |
| classification | `watch` | `over-observed-budget` |

**6.9× the pixels cost 0.2ms at p50 and nothing at p95.** Frame intervals are
pinned to 16.7ms across p50/p95/p99 in both runs. The device is holding a locked
60fps at full native resolution with every M34/M35 layer drawing, and the GPU is
nowhere near saturated.

D-054 introduced an adaptive render-DPR policy to fix "reported lag" on Fold
hardware. On this device, at this posture, that policy is spending fidelity to
buy performance that was never scarce. **No change is made to it here** — one
posture on one device is not grounds for retiring a policy, the cover posture and
the closed posture are still unmeasured, and D-054's own evidence came from
somewhere. But its premise is now contradicted where it matters most, and that
belongs on the record.

What the owner actually felt lives in the tails: max frame 83.3ms, max draw
76.1ms, three long tasks totalling 198ms, and `droppedSimulationMs: 100` — the
fixed-step clock losing 100ms of simulation outright. Thirteen long frames in
11,184. **0.12% of frames, and that 0.12% is the entire complaint.**

### The cause, and M36's part in it

`startup.assets` reads `loaded: 75, fallback: 0`. Before M36 every one of those
failed on this device and became a cheap procedural canvas. They are now real
photographs. `asset-resilience-runtime.js` set `image.decoding = 'async'`, but
that is only a hint for the `<img>` render path: a bitmap that has loaded and
never been decoded is decoded **synchronously on the main thread** the first time
`ctx.drawImage()` touches it. Seventy-five images, one decode apiece, each landing
the first time its level's art appears — mid-run, at a level transition. The three
long tasks in the native capture fired at 193136 / 193228 / 193786 ms, inside
650ms of each other, which is what a transition looks like.

So M36 fixed the gallery and introduced the hitches. That is the honest shape of
it.

**Fix:** `loadImageAttempt` now awaits `image.decode()` before resolving, moving
the cost onto the loading screen where a progress bar already sets the
expectation. The existing attempt timer still bounds it, so a decode that hangs
is bounded exactly like a fetch that hangs. A decode that *fails* resolves anyway
with the loaded image — the browser will simply decode it the old way later — so
this can never turn a usable image into a fallback.

**Not established:** that this removes the hitches. It is a fix for a cause the
evidence points at, and the same probe re-run on the same device is what settles
it. The memory shape also changes: 75 bitmaps are now decoded at load rather than
gradually, which raises peak image memory earlier even though the eventual
steady state is the same.

## 2. AEGIS did not cover the most common death in a gravity game

Reported as: the ward rings are visible, the player crashes, and the game ends
anyway.

Confirmed, with an exact cause. Two paths call `gameOver()`:

- `index.html:1632` — a pillar collision.
- `index.html:1736` — `if (this.y > window.innerHeight - this.r * 1.5) game.gameOver()`, the floor.

`tryAbsorb()` opened with `overlappingPillars(); if (blocking.length === 0) return false`.
A floor death overlaps no pillar, so AEGIS declined, spent nothing, and let the
player die — **while `drawWardRings()` kept drawing a ring per held charge.** The
interface promised cover for the death it did not cover.

This reads as an oversight rather than a decision. The Void exclusion two lines
above carries an explicit comment defending itself; the floor has none. The
mechanism explains the gap: absorb works *by dissolving the blocking pillars*,
which line 590 names as "what stops the very next frame killing them again." A
fall has nothing to dissolve, so the code had no answer and quietly declined.

Fixing it required a rule, because a save with nothing to dissolve leaves the
player past the death line on the very next update. The owner chose: **AEGIS
absorbs the fall and throws the player back up.** `liftFromFloor()` applies the
base game's own jump impulse scaled by 1.35 and places the avatar three radii
clear of the death line in the same breath, so the save does not depend on
whether the death check or the position integration runs first. The announcement
distinguishes the two saves — `THE FALL IS REFUSED` rather than `YOU SURVIVE` —
so a player can tell what their charge bought.

**This is a real difficulty change.** Floor deaths are now survivable while a
charge is held, and floor deaths are common. It was not modelled by anything and
no evidence says it is correctly tuned; it makes the rings mean what they look
like they mean, which is what the owner asked for.

Writing the tests found two further defects in the fix itself, both real:

- `(root.innerHeight || 0)` made the floor line *negative* when no viewport
  height was available, so every non-pillar death would have been claimed as a
  fall and spent a charge. Now an unknown viewport means no floor-death claim.
- `CONFIG?.PLAYER_JUMP_FORCE` threw `ReferenceError` when `CONFIG` was
  undeclared — optional chaining does not protect an undeclared identifier, only
  a null-valued declared one. This sits inside the `gameOver` path, where that
  throw would have taken the death handler down with it. Replaced with the
  `typeof` guard the rest of the codebase uses.

The bounded M31 audit was re-run after the change: 84/84 ordinary, 84/84 surge,
144/144 composition, 0 concerns — unchanged, as expected. That confirms nothing
regressed; it does **not** speak to whether the floor save is balanced, because
the audit models the MONAS corridor and knows nothing about HEX power-ups.

## 3. The ascent banner was flying across the play field

`#sex-magick-ascent-banner` was `position: fixed; top: max(112px, …)`,
horizontally centred, `min-width: min(430px, …)`. On the measured 707×675
viewport that is a slab across roughly 60% of the width, sitting 17% down —
directly over the corridor the player is flying through.

**D-043 already made this decision.** M29 moved this game's transient messages to
the bottom for exactly this complaint. The ritual-ascent banner was authored on
the Antigravity branch, which had never seen D-043, and reintroduced the problem.
This is the same species of collision as the MONAS speed conflict D-058 had to
untangle, and the third instance of it — worth noticing as a pattern rather than
as three unrelated bugs.

**Fix:** the banner is anchored to the bottom toast band at
`bottom: max(206px, …)`, which clears the missions toast (170px), which clears
the powerup toast (120px), which clears both HUDs. The arrival keyframes now rise
into place rather than settling down from above, since it is bottom-anchored. No
other styling changes — the aesthetic is not in question, only the position.

## Consequences

The performance fix is a hypothesis-driven change that needs the same probe re-run
on the same device to confirm. The AEGIS change is a deliberate difficulty change
with no evidence behind its tuning. The banner move is the only one of the three
that is simply correct.

None of this has been played yet. The session that produced these findings is the
first real one; the next one has to confirm all three, and that is a different
kind of evidence from the CI green that accompanies this commit.

**Full record:** this document.
