# D-030 — Make a playtest measure what is on disk, and delete the button nobody pressed

Date: 2026-08-12  
Status: Accepted

## Decision

Two things, in this order.

**Serve playtests with caching off, and stamp every report with the build that
produced it.** New `tools/serve-playtest.py`, and a `runtime` fingerprint block in
the V2 report.

**Remove the DISSOLUTION button entirely.** Both power-ups now fire themselves, and
protection is drawn on the avatar rather than counted in a corner.

## Why the first half exists

The 2026-08-12 ten-minute session returned a complete-looking report describing a
build that did not exist. `missions` and `powerups` — files that had never been
fetched before — loaded fresh, while `gate-slice-runtime.js` came from the
browser's heuristic cache. `python -m http.server` sends no `Cache-Control`, which
invites exactly that.

**M16 and M17 went unmeasured for a second time, and it took three separate
inferences from the event data to notice**: 22 Gate offers on exactly two Y values,
a run holding `bandIndex` 3 at 83 gates, and a direct run of the tree disagreeing
with both.

So the fix is not only the server. Every report now carries a fingerprint read live
from the running constants — entry radius, band count and names, grammar and module
versions. **A future report states its own provenance instead of requiring
forensics.** The browser suite asserts it too, and now runs against
`serve-playtest.py` rather than the caching server, so the test path and the owner's
path are the same path.

Full session analysis: [`docs/playtests/m19-fold-open-results.md`](../playtests/m19-fold-open-results.md).

## Why the button is gone

`dissolves: 0` with `dissolveAttemptsWithoutCharge: 0`. Across a whole session the
control was **never touched, not even while empty**.

D-029 reasoned that destroying a wall is a deliberate act and therefore deserved a
deliberate input. That reasoning was wrong in context: in a game where the entire
screen is a jump surface, a corner button asks the player to switch input modes
during the exact moments they are least able to. The owner's verdict was direct —
"there should not be any other buttons... they should just activate automatically
when the user needs them."

**M19's button is deleted, not demoted.** A cross-screen assertion now requires the
power-up layer to contain zero interactive controls and to carry
`pointer-events: none`, so the decision is enforced by the suite rather than by
anyone remembering this conversation.

## How DISSOLUTION decides it is needed

For it to remain a different power-up rather than a second shield, it fires at a
different moment. AEGIS is reactive — it absorbs a hit already taken. DISSOLUTION
is predictive.

Each frame a charge is held, the runtime projects the player forward to the frame
they reach the next pillar and computes the band of heights still available:

- **highest** — jump on every frame the cooldown permits
- **lowest** — never jump, fall, clamped to `MAX_FALL_SPEED`

Anything the player can actually do lands between those bounds. If the pillar's safe
gap falls entirely outside the band, **no sequence of taps clears that wall**, and
it dissolves.

The threshold is deliberately *no input can save them*, not *this looks hard*. A
looser test would steal saves the player would have made, which is the difference
between a rescue and the game playing itself. The projection is capped at 70 frames,
because the gap breathes and walls move — a longer horizon would condemn walls that
are still perfectly survivable.

With both held on a doomed approach, DISSOLUTION resolves first, keeping AEGIS back
for a hit that could not be seen coming. **Neither fires inside the Void**, for the
reason D-029 established: the Void is the wager.

## Making protection visible

The owner asked for it plainly: "the avatar should maybe start glowing or generate
an actual visual thin neon shield". A count in the corner was not read during play.

One thin ward ring now orbits the sigil per held AEGIS charge, shattering when a hit
is absorbed. The colour had to dodge three reservations — hazard `#ff2f6d`/`#ff003c`,
Hexagram `#00e5ff`, Monas `#ffd700` — so the ward is violet `#c9b4ff`: it reads as
protective, cannot be mistaken for danger, and leaves the Rite auras legible for the
later in-run transformation. A unit test asserts it collides with none of them.

Announcements now name what was earned and what it does, rather than saying a charge
appeared. Dissolving walls burst in the same violet, so the effect is attributable to
the power-up rather than to the Gate.

Rings, bursts and announcements all suppress under `visualQa=1`, as the HUDs already
do, because charge count is per-run state that would make signature screenshots
non-deterministic.

## Evidence

- 21 fast suites pass, including new unit coverage of the reachable-band projection:
  the band only widens with time, respects terminal velocity, is lowered by a pending
  cooldown, and the doom verdict flips exactly once at the frame the gap becomes
  reachable.
- The browser suite confirms a clearable wall is **not** consumed, an unreachable one
  dissolves on its own, DISSOLUTION resolves before AEGIS, neither fires in the Void,
  three charges draw three rings, the layer holds no controls, and a tap over that
  corner still jumps.
- Cross-screen passes at all four reference geometries.
- Visual signatures verified differentially against `dc881a8`.

## Claim boundary

Proven: the predicate fires only on genuinely unavoidable walls, the visuals render
and suppress correctly, and no new input surface exists.

**Not established: that any of this reads during play.** Whether a violet ring is
noticed mid-flight, and whether an auto-dissolving wall registers as a rescue rather
than as confusion, are questions only a human session answers.

**Also unchanged: the economy.** 11 earned against 1 spent says supply is too high,
but retuning against a legibility bug would tune the wrong variable. `GATES_PER_CHARGE`,
the caps and the unlock bands are untouched until a session shows what the player does
when they can actually see what they hold.

## Architecture consequence

`tools/powerup-runtime.js` still owns power-ups entirely; it wraps
`Player.prototype.draw` from outside, so `collision-runtime.js` needs no knowledge of
them. `gate-slice-runtime.js` gains `getFingerprint()` and nothing else.
`index.html` is unchanged. The missions HUD offset added in M19 to clear the button is
reverted.

## Deployment

None. `main` remains protected, PR #1 remains draft, and itch.io remains unchanged.
