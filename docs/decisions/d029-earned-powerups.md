# D-029 — Power-ups unlocked by ascent and earned by challenge, not found on the floor

Date: 2026-08-12  
Status: Accepted

## Decision

Add two power-ups whose *type* is unlocked by how far the player has climbed and
whose *charges* are earned by completing challenges. The shield spends itself; the
breaker gets a button. Unlocks persist, charges reset every run.

## Context

The owner's original wishlist asked for "items that give you a shield, and another
one that lets you destroy the next wall coming up". The refined ask was that
power-ups arrive **incrementally** — as the player levels up, gains points, and
completes challenge sections.

That maps onto systems that already exist rather than needing new ones.
`completeVoidState` is literally "took on a challenge section and completed it";
`BANDS` is literally "levelled up further". As with M18, nothing new needed
measuring — only a new consumer.

## Design

### Two ladders, deliberately separate

**Bands unlock the type.** AEGIS (shield) unseals at YESOD, DISSOLUTION (breaker)
at GEBURAH, and higher bands raise the cap — AEGIS 1→3, DISSOLUTION 1→2.

Gating the breaker at GEBURAH is the load-bearing choice. A new player meets the
Gate, the Void and the risk bands before they are handed a tool that skips walls,
so the curve M17 built survives a first encounter intact.

**Challenges earn the charge.** Surviving a Void grants one. Every 25 gates cleared
in a run grants one. The second path exists because the pilot recorded **under one
Void survival per run** — without it, charges would be too rare to read as a
system at all.

Awards route to whichever unlocked power-up has the most room, so a player sitting
on a full shield starts accumulating breakers rather than wasting the reward.

### Spending, and why they differ

**AEGIS is automatic** because a crash cannot be planned for. It absorbs one lethal
collision, dissolves whatever pillar the player is inside — otherwise the very next
frame kills them again — and registers as an impact.

**AEGIS does not cover the Void.** The Void is the wager. Letting a shield cover it
would remove the stakes the pilot showed are working, and it is the same principle
D-027 applied when capping the Void's difficulty rather than letting it escape the
proven envelope.

**DISSOLUTION is a button** because destroying a wall is a deliberate act. It
removes the nearest unmarked pillar ahead of the player and **grants no gate-clear
credit** — you skipped the wall, so you do not score it, which also stops the
button being used to farm the M18 missions that count gates.

### The button does not steal a jump

M2 made the entire screen a jump surface, so a new tappable control is exactly the
kind of change that could resurrect "input feels ignored". It does not, and not by
luck: `collision-runtime.js:22` defines `CONTROL_SELECTOR` and the touch handler
calls `isControlTarget` to `stopImmediatePropagation` before jumping. **Any
`<button>` was already exempt.** No change to the input path was needed or made.

The browser suite asserts this directly — it dispatches a real `touchstart` at the
button and requires the player's velocity to be unchanged.

### Layout

The button sits bottom-left at 46×46, above the 44px the touch-target policy
requires. The M18 missions HUD moved up to clear it, since at fold-closed it spans
`calc(100vw - 92px)` — nearly the full width.

Both hide under `visualQa=1`, for the same reason M18's HUD does: charge counts are
per-run state and would make signature screenshots non-deterministic. The whole
runtime requires `?gateSlice=1`, so the standard visual states cannot be affected
at all.

### Install order is a correctness requirement

The shield wraps `Game.prototype.gameOver` and must see `__gateSliceVoidActive`
**before** the Gate slice's own wrapper clears it. The runtime therefore gates its
readiness on `root.__SEX_MAGICK_GATE_SLICE__`, guaranteeing it installs last and
wraps from the outside. Installed in the wrong order, the shield would silently
start covering Void deaths — the one thing it must never do.

### No solver work

A shield only prevents a death; a breaker only removes a wall. Neither can make a
sequence harder, so nothing can fall outside the envelope M17 proved. The
reachability audit is untouched.

## Evidence

- 21 fast deterministic suites pass, including a new power-up suite covering caps,
  monotonic unlock (a bad run cannot revoke the ascent), award routing, milestone
  thresholds firing once per crossing, per-run reset, and the persistence boundary.
- A real 20 000-frame browser run reached **KETHER**, cleared 182 gates, survived a
  Void, earned 5 charges and filled both power-ups to cap — all from play, not from
  test affordances.
- The browser suite confirms the shield absorbs and dissolves the blocking pillar,
  **refuses to absorb inside the Void**, that the breaker removes a wall while
  granting no gate or score credit, and that tapping it does not jump the player.
- Cross-screen passes at `chromium-small-phone`, `chromium-fold-cover`,
  `chromium-fold-inner` and `chromium-desktop`: button ≥44×44, topmost at its own
  centre, below the play corridor, and not overlapping the missions HUD.

### Two things that are not clean, stated plainly

**`browser-m11-performance-budget-test` fails in the development sandbox.** It is
not caused by this work: it fails identically at `a25592a` (M17) and `fd410e7`
(M18), and it *passed* at `a25592a` earlier in the same session. The failure is a
timing race — the test resizes past the 10% threshold that triggers
`installResizePauseContract`, then races the pause handler while waiting for 30
frames. It is load-dependent, pre-existing, and green in CI.

**The visual signatures could not be checked against the committed baselines**, for
the reason recorded in D-028: this sandbox runs Chromium 1194 against a Playwright
pinned to 1217. M19 was verified differentially against a worktree at `fd410e7`
instead — **21 of 21 signatures byte-identical across `chromium-small-phone`,
`chromium-fold-cover` and `chromium-fold-inner`, none changed.** Unlike the M18
comparison, not even the flaky desktop gate states intruded, because the three
geometries measured here are the stable ones.

## Claim boundary

Proven: unlocks and charges behave correctly under real play, the shield respects
the Void, the breaker grants no credit, the button is reachable and does not steal
input, and nothing renders under visual QA.

**Not established: that the economy is tuned.** `GATES_PER_CHARGE = 25`, the caps,
and the two unlock bands are first estimates. The 20 000-frame probe filled both
power-ups to cap, which suggests charges may arrive *too* freely in a long run —
the most likely thing to be wrong, and exactly what a human session would reveal.

Also not established: whether a bottom-left button is comfortable to reach
one-handed on the Fold's inner display, or whether players notice the shield firing
at all.

## Architecture consequence

`tools/powerup-runtime.js` owns power-ups entirely. `gate-slice-runtime.js`,
`collision-runtime.js` and `index.html` are unchanged; `missions-runtime.js`
changes only in CSS, to make room.

## Deployment

None. `main` remains protected, PR #1 remains draft, and itch.io remains unchanged.
