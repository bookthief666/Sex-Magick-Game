# D-027 — Extend the difficulty curve to KETHER and give walls motion and width, inside the verified envelope

Date: 2026-08-12  
Status: Accepted

## Decision

Extend `BANDS` past GEBURAH with four new Sephiroth, give each named pattern its
own wall motion and gap character, and cap the Void so no configuration — band or
Void — can exceed the reachability envelope the solver has proven.

## Context

The 2026-08-12 Fold 6 pilot cleared 507 gates. **196 of them — 38.7% of all play —
happened past GEBURAH, where `BANDS` simply stopped.** Runs of 81, 78, 64, 64 and
53 gates all finished on a permanently flat curve at speed 6.2 and gap 145.

The owner's own words were that the game "could definitely be really good if it
takes some ideas from flappy bird or other games to add variety … maybe with
moving walls, or different types of walls". The measurement and the impression
agree, and the measurement explains the impression: the game was not short of
mechanics, it was short of escalation.

## What changed

### The curve now reaches the top of the Tree

Four bands continue the ascent, using level artwork that already existed:

| Band | Gate | Speed | Gap |
|---|---|---|---|
| CHESED | 48 | 6.9 | 138 |
| BINAH | 68 | 7.5 | 132 |
| CHOKMAH | 92 | 8.0 | 127 |
| KETHER | 120 | 8.5 | 122 |

KETHER sits exactly at the audited speed ceiling of 8.5, and its 122 px gap stays
at or above `CONFIG.MIN_PILLAR_GAP` even at the bottom of the ±10 px breathing
that `getCurrentGap` applies.

### Walls move per pillar, and patterns have a character

`Pillar.update` drove every wall from one global sine at a fixed ±5 px, so the
whole field breathed in lockstep. Motion is now per pillar: amplitude and gap
scale are declared by the named pattern, and phase is derived per spawn.

Motion and scale are **properties of the pattern, not per-spawn rolls**. That
gives each pattern a recognisable character — `hex.staircase` runs tight and
perfectly still, `hex.lightning-flash` swings hardest through the narrowest gap,
`monas.still-point` earns its name — and it leaves the seeded random stream
untouched, which is what keeps the existing 252-case audit valid.

Phase comes from hashing `(seed, spawnIndex)` rather than from the scheduler's
random stream, for the same reason: consuming the stream would shift every
downstream pattern choice.

### The Void no longer escapes the proof

`VOID_SPEED_MULTIPLIER` was applied uncapped. **Even at GEBURAH that already
reached 9.3, past the audited ceiling of 8.5**, and the Void's gap floor of 100
sat below the game's own `CONFIG.MIN_PILLAR_GAP`. Extending the bands would have
taken it to 12.75 against a 100 px gap.

Void speed is now capped at 8.5 and its gap floored at 110. The Void stays a
sharp escalation in the low bands — MALKUTH still jumps 2.9 → 4.35 — and
saturates at the hardest provably clearable configuration rather than running off
into difficulty nobody has shown is survivable. This corrects a pre-existing
overreach as much as it prevents a new one.

## Why this is safe

The whole design rests on one geometric fact: **a gap of width G whose top swings
by ±A always contains the static corridor of width G − 2A, at every instant.** So
if the solver can clear a static corridor of G − 2A, the moving gap is clearable
at any amplitude up to A and — critically — at *any phase*. The guarantee is
phase-independent, which is what makes per-pillar phases safe.

`resolveMotionAmplitude` enforces exactly that invariant, clamping whatever a
pattern requests so the remaining corridor is never narrower than
`VERIFIED_STATIC_GAP`. Gap narrowing is clamped against the same floor rather than
forbidden. Both therefore scale themselves: motion is dramatic in the wide early
bands and settles toward stillness as the gap tightens near KETHER, and narrowing
simply stops being applied once a band has nothing left to give. That behaviour
falls out of the safety rule instead of being tuned in separately.

**110 is measured, not chosen for roundness.** Re-running the audit at tighter
gaps drops six cases to marginal at 105 (minimum clearance 4.63 against the
required 8) and produces outright invalid cases at 96. It is the genuine floor of
the verified envelope, and it equals `CONFIG.MIN_PILLAR_GAP`.

## Evidence

- **1008 new reachability cases**, covering all four new bands at their own speeds
  and at the bottom of the gap breathing, on both the phone and fold-open
  geometries: `{ verified: 1008, marginal: 0, invalid: 0 }`, every case at margin
  8. Asserted permanently in `tools/test-player-reachability.js`.
- The pre-existing 252-case audit at speed 8.5 / gap 110 still passes unchanged,
  which matters because that scenario **is** the floor the runtime clamps to.
- A new browser integration test drives a real 20 000-frame run and checks every
  pillar the game actually builds. A representative run: 293 pillars, 14 patterns,
  **102 distinct phases** (lockstep is gone), 104 distinct amplitudes, 8 gap
  scales, 224 moving and 69 still, **narrowest gap exactly 110**, and the run
  reaches band 7 with the HUD reading KETHER.

## Claim boundary

Proven: every shipped pattern is clearable at every shipped band configuration,
and the moving and rescaled walls never leave less corridor than the solver has
verified.

Not established: that the new bands are *enjoyable*, that the escalation is paced
well, or that motion reads clearly on a physical screen. The audit proves a path
exists; it says nothing about whether finding it is fun. That needs a Fold block
at both postures.

Also not attempted: **double-gap walls.** They break the solver's single-corridor
model, and shipping an unvalidated wall type into a game whose entire engineering
identity is "we prove obstacles are clearable" is the wrong trade. They need
solver support first and are deferred to their own change.

## Architecture consequence

`tools/obstacle-variety-runtime.js` owns motion and wall geometry and is the only
place the safety clamps live. `tools/collision-runtime.js` and `index.html` were
**not** touched — the sanctioned `buildPillarRects` change in the M17 plan was for
double-gap walls, which are deferred, so it was not needed.

`GRAMMAR_VERSION` moves to 2. The random stream is unchanged, but the emitted spec
and the resulting pillar geometry are not, and the version is carried in every
run's seed derivation.

## Deployment

None. `main` remains protected, PR #1 remains draft, and itch.io remains unchanged.
