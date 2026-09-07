# D-026 — Correct Gate fairness and clear-classification truth before building on the slice

Date: 2026-08-12  
Status: Accepted

## Decision

Act on the first human playtest of the Gate slice by fixing three defects in
`tools/gate-slice-runtime.js` before any new gameplay content is built:

1. Make the entry aperture the circle the player aims at.
2. Replace fixed two-position Gate placement with seeded, reachability-bounded placement.
3. Classify a gate clear from the frame of closest approach rather than after the pillar is marked passed.

Retire the R-1 input-truth protocol as answered. Leave every balance constant alone.

## Context

D-018 set the acceptance signal for the Gate hypothesis at a Gate entry rate
between 25% and 75%, considered together with comprehension, intentionality,
reported feel, and voluntary replay. Fifteen milestones shipped before anyone
supplied that evidence.

The 2026-08-12 Fold 6 owner pilot supplied it. Gate entry rate was 46.4% across
28 offers. Comprehension, intentionality, feel, and voluntary replay were all
affirmative. **The D-018 signal is met and the Gate hypothesis survives.**

The same session also produced 507 gate clears of instrumented evidence, which is
what exposed the defects below. Full analysis:
[`docs/playtests/m8-fold6-owner-pilot-results.md`](../playtests/m8-fold6-owner-pilot-results.md).

## Rationale

### The entry aperture did not match the art

Entry required the player's centre within 31 px of the offer's centre, while the
offer was drawn as a 52 px ring. Miss distances were cleanly bimodal: five banks
between 31.08 and 41.95 px, then nothing at all until 82.17 px. The near group is
a distinct population of failed entries, not declines — one missed by 0.08 px.

The aperture is now 44 px, drawn as the bright circle, inside a 60 px outer glow.
Every near bank from the pilot resolves as an entry; every far bank still banks.
Corrected for this defect alone, the pilot's intent rate was 64.3%.

### Placement was a two-position alternation

`gateSerial % 2` placed every Gate at 0.36 or 0.64 of canvas height. All 28 pilot
offers landed on exactly two Y values. Placement is now drawn from a run-seeded
stream, constrained to a corridor, separated from the previous Gate, and bounded
by what the player can physically reach in the frames the offer is visible. The
reach rate is taken from the pilot rather than guessed: the owner closed 289.65 px
of vertical error in 133 frames.

### Clears were classified after the fact

`handleClearedPillars` read `player.y` once a pillar was already marked passed. At
fall speeds up to `CONFIG.MAX_FALL_SPEED` that samples the player well below where
they actually threaded the gap, misattributing the risk zone of every clear and
therefore biasing all Gnosis accrual. Pillar geometry breathes, so the stale read
also paired a late player position with a late gap position.

Every live pillar now carries a snapshot of the player's position and the gap
geometry at the frame of closest horizontal approach, and classification uses it.

## Consequences

**The four "unsafe crossings" in the pilot were a symptom of the third defect, not
a collision failure.** Zero of the 507 credited clears had negative clearance; the
harness withheld credit correctly and the base collision test runs on the true
rect every frame during overlap. Fixing the sampling should drive that count to
zero.

**The input-buffer question is closed.** The pilot recorded 1768 immediate inputs
and zero buffered, rejected, expired, or coalesced ones. The buffer never engages
in ordinary play, so the 3-versus-6 comparison has no measurable difference to
decide. Three frames is the release value and
`docs/playtests/r1-input-truth-protocol.md` is retired as a prerequisite.

**The Gate is a skill challenge, not a wager.** The player moved toward the Gate on
every offer where movement was possible. Banking is overwhelmingly a failure to
reach, not a choice to decline. This is a legitimate outcome — closer to a trick
system than to a bet — but the in-game telegraph still reads
`ENTER TO WAGER / PASS TO BANK`, and the design language should be brought in line
with the evidence in a later change.

## Claim boundary

These are fairness and measurement corrections. They do not establish fun,
comprehension, balance, or release readiness, and they are not tuning.

Specifically **not** changed, pending re-measurement on corrected instrumentation:

- the `risk-bottom` zone, which drew only 3.2% of pilot clears
- the near-miss threshold, which fired on 1.2% of pilot clears
- the 10x / 3x wager-to-bank ratio
- band speed and gap constants
- obstacle pattern definitions

The expected post-fix entry rate is 60–65%. If a follow-up block lands far outside
that, the aperture change is wrong and should be revisited before anything else.

## Architecture consequence

Unchanged from D-018: `tools/gate-slice-runtime.js` owns the Gate. Nothing was
added to `tools/collision-runtime.js`. `index.html` is untouched.

`chooseGateY`, `sampleIntervals`, and `samplePillarApproaches` are exported as pure
functions so the corrections carry direct unit coverage rather than relying on the
browser integration test.

## Deployment

None. `main` remains protected, PR #1 remains draft, and itch.io remains unchanged.
