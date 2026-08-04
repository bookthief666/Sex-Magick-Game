# Fable 5 Review Handoff — Milestone 6 Compositional Reachability and Timing Robustness

## Review target

Repository: `bookthief666/Sex-Magick-Game`  
Branch: `develop/sex-magick-2.0`  
Pull request: `#1`  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `a2acfd98f43a711eb979630767f88b56b32b44f0`  
QA workflow run: `30910168271`

Use Fable 5 at its strongest available reasoning setting. Perform an adversarial software-engineering, numerical-method, game-physics, fairness, and test-design review. Do not merely summarize the milestone and do not treat green CI as a formal proof.

Do not edit `main`, merge the PR, deploy to itch.io, or propose a broad rewrite without first establishing a concrete defect or measurable limitation.

## Project status

The project has completed six development-branch milestones:

1. refresh-rate-independent fixed-step simulation
2. canonical collision geometry and full-screen mobile input
3. fast retry and local identity-free run telemetry
4. seeded named obstacle grammar
5. isolated player-state reachability and runtime fallback policy
6. compositional state propagation and timing-robustness diagnostics

The published build and `main` remain unchanged.

## Primary files for this review

### Milestone 5 foundation

- `tools/player-reachability.js`
- `tools/reachability-policy.js`
- `tools/test-player-reachability.js`
- `tools/reachability-browser-test.html`
- `docs/qa/m5-player-state-reachability-results.md`

### Milestone 6 implementation

- `tools/compositional-reachability.js`
- `tools/compositional-robustness.js`

### Milestone 6 validation

- `tools/test-compositional-reachability.js`
- `tools/compositional-browser-test.html`
- `tools/run-browser-compositional-test.mjs`
- `.github/workflows/qa.yml`
- `docs/qa/m6-compositional-reachability-results.md`

### Runtime context

- `tools/obstacle-grammar.js`
- `tools/fixed-step-prototype.js`
- `tools/collision-runtime.js`
- `index.html`

## Commands

Run these from the repository root when execution is available:

```bash
node tools/test-player-reachability.js
node tools/test-compositional-reachability.js
node tools/run-browser-reachability-test.mjs
node tools/run-browser-compositional-test.mjs
```

Chrome or Chromium is required for the browser runners.

## Milestone 6 intent

Milestone 5 verified each named pattern from a single centered, zero-velocity, zero-cooldown origin. Milestone 6 asks a harder question:

> Can complete seeded pattern sequences remain reachable when position, vertical velocity, and cooldown propagate across pattern boundaries, and how tolerant is one selected winning jump schedule to small timing errors?

The implementation deliberately separates:

- **technical reachability:** at least one exact machine witness survives
- **robust-candidate:** the selected witness survives provisional perturbation thresholds
- **human comfort:** not claimed and still requires real-player evidence

## Current evidence

### Incoming-state cloud

Each hard case starts from 27 states:

- y offset: `-16`, `0`, `+16` pixels around first-gap center
- velocity: `-4`, `0`, `+4`
- cooldown: `0`, approximately half, and one below the Rite-specific maximum

### Hard matrix

The permanent matrix covers:

- Hexagram and Monas
- seeds `0x12345678` and `0xdecafbad`
- phone hard and Fold-open hard
- speed `8.5`
- gap `110`
- breathing phases `0` and `31`
- one full six-pattern family cycle
- eight-pixel additional witness margin

Result:

| Classification | Count |
|---|---:|
| Robust candidate | 0 |
| Technically reachable but fragile | 16 |
| Invalid | 0 |

All 16 cases produced exact replay witnesses. In 15 cases only one of the 27 initial-state identities survived into the final winning set; one case retained two.

### Two-cycle endurance

At phone hard conditions, breathing phase 31, seed `0x0badf00d`:

- Hexagram: 55 gates, 12 pattern boundaries, 93 jumps, 8.310-pixel minimum clearance
- Monas: 91 gates, 12 pattern boundaries, 81 jumps, 8.099-pixel minimum clearance

Both witnesses replayed exactly.

### Timing perturbation

The distributed robustness layer evaluates:

- base witness
- global early/late shifts of all jumps by ±1, ±2, and ±3 frames
- individual early/late shifts by ±1, ±2, and ±3 frames
- evenly distributed individual-jump samples spanning first through last witness jump

The 60-case matrix budget samples eight jumps across each witness and guarantees first/last coverage.

Observed overall survival ranged from approximately `10.9%` to `43.6%`. Distance-one survival ranged from approximately `11.1%` to `61.1%`. None passed the provisional requirements of 70% distance-one survival and 45% overall survival.

## Required adversarial review

### 1. Composition timeline fidelity

Audit the relation among:

- `generatePatternSequence()`
- `buildGateWindows()`
- `solveComposition()`
- `replayCompositionWitness()`
- real `Pillar` spawn/update/collision order
- real `Player.jump()` and `Player.update()` order

Determine whether sequence gates are placed at the correct absolute frames when multiple patterns are concatenated. Look specifically for:

- first/last overlap off-by-one errors
- breathing phase reset versus continuous phase
- collision-before-movement versus movement-before-collision discrepancies
- gap or speed transitions that the solver treats as constant but the game changes during the sequence
- score/level transitions that alter game speed or gap while the modeled sequence is in flight
- Void mode or hit stop changing gate timing

Provide a concrete counterexample for any mismatch.

### 2. Initial-state cloud adequacy

The 27-state cloud is representative but finite.

Assess whether:

- `±16` pixels is a credible position range
- velocities `-4`, `0`, `+4` miss important near-terminal or high-momentum states
- three cooldown values adequately represent legal entry conditions
- the cloud should be defined relative to available clearance rather than fixed pixels
- incoming states should be propagated from a warm-up pattern instead of manually seeded

Design the smallest stronger incoming-state test that remains computationally practical.

### 3. State-key soundness

The composition key rounds:

- y to `0.5` pixel
- velocity to `0.25`
- cooldown exactly

It does not include:

- initial-state identity
- witness history
- current pattern identity
- proximity to future optimal jump windows

Audit whether two states that share a key can differ materially in future robustness or evidence provenance. Determine whether replacing the existing state with the lower immediate target score can discard a much more tolerant future path.

State whether exact final witness replay prevents false-positive acceptance despite this merging, and identify any exception.

### 4. Beam-pruning bias

`pruneStates()` preserves vertical bands and then ranks by immediate target proximity, velocity magnitude, and cooldown.

Assess whether this objective:

- overvalues centering in the next gate
- undervalues velocity states useful two or three gates later
- suppresses less jump-dense routes
- reduces incoming-state diversity
- creates the observed one-initial-state survival result artificially
- makes route fragility a search artifact rather than a geometry property

Recommend a better objective or reachable-set representation. Consider dynamic programming, Pareto frontiers, interval sets, viability kernels, backward reachability, mixed forward/backward search, or a robustness-aware beam.

### 5. Winner-selection defect risk

The solver selects one final state using terminal target proximity and then measures that witness's robustness.

This may find a technically valid but unnecessarily fragile witness even when a more tolerant witness exists in the surviving set.

Determine whether this is the most important current limitation. Propose a minimal algorithm to select or search for a witness that maximizes:

- perturbation survival
- minimum clearance
- jump-window width
- fewer critical jumps
- lower jump density
- resilience across incoming states

State whether gameplay patterns should remain unchanged until this search is improved.

### 6. Boundary evidence

Audit `boundaryResults` and determine whether it captures enough information to compare sequence health.

Consider adding:

- quantized-state count before and after pruning
- incoming-state identity counts before and after each pattern
- y/velocity/cooldown covariance or Pareto frontier
- minimum clearance distribution
- number of legal jump choices
- entropy or effective diversity
- the earliest boundary where diversity collapses

Identify the smallest useful diagnostic set.

### 7. Perturbation construction

Audit `tools/compositional-robustness.js`.

The current budget includes:

- six global shifts
- evenly distributed individual-jump shifts
- first and last witness jump

Assess:

- whether global shifting all jumps is meaningful when jump cooldown changes accepted inputs
- whether deduplicating shifted jump frames changes the intended perturbation
- whether a fixed number of sampled jumps biases short versus long witnesses
- whether sampling by jump index should instead sample by time, gate, pattern family, or criticality
- whether correlated local timing drift should be modeled
- whether missing, duplicate, and extra taps should be included
- whether display/input latency should be modeled as a distribution rather than fixed frame shifts

Produce an improved but bounded test policy.

### 8. Provisional thresholds

The current `robust-candidate` thresholds are:

- distance-one survival ≥ 70%
- overall survival ≥ 45%

These are explicitly heuristic.

Assess whether the thresholds have any defensible interpretation. Recommend a calibration plan using human playtests, physical devices, and logged local run evidence. Do not invent empirical certainty.

### 9. Breathing-phase coverage

The hard matrix tests phases `0` and `31` for a five-pixel sinusoidal displacement.

Determine whether this coverage can miss an adverse phase. Recommend either:

- a finite phase set justified by the period and collision windows
- an analytical worst-case bound
- phase-independent clearance inflation
- or continuous adversarial phase search

### 10. Sequence coverage

The matrix uses two one-cycle seeds and one two-cycle seed.

Assess how many seeds, cycles, and pattern combinations are needed before tuning decisions become credible. Recommend a staged coverage plan that fits CI time limits and a slower scheduled/offline audit if appropriate.

### 11. Runtime difficulty transitions

The current composition matrix holds speed and gap constant at the hard values. The real game progresses through levels and can change speed/gap between spawned gates.

Design a deterministic sequence model for:

- score-triggered level changes
- speed changes while old pillars remain on screen
- gap changes affecting only newly spawned pillars
- hit stop
- Void entry/exit
- pause/resume

State which effects are required before the solver can describe a real complete run rather than a hard constant-condition stress case.

### 12. Fold posture changes

Active phone-to-Fold and Fold-to-phone remapping remains unimplemented.

Propose a canonical resize contract covering:

- player y and velocity
- current gap positions
- already-spawned pillar x/y geometry
- scheduler normalized ratio
- breathing phase
- canvas dimensions
- collision continuity
- whether gameplay pauses during remapping

Specify the tests needed to prevent resize-created unavoidable death or unintended safe escape.

### 13. Replay manifest

The current sequence digest is non-cryptographic and does not include the entire runtime.

Define the minimum debug replay manifest needed to reproduce a historical run, considering:

- seed and Rite
- grammar/policy/solver/composition/robustness versions
- exact pattern-definition digest
- viewport history
- speed/gap timeline
- fixed-step and collision versions
- breathing phase/timeline
- Orb decisions
- pause/Void/hit-stop events
- input frames

Keep the distinction between debug reproduction and server-authoritative anti-cheat explicit.

### 14. Security and leaderboard boundary

Everything executes on the client. Confirm that no local solver result, sequence digest, or witness can establish leaderboard authenticity.

State the minimum future server-side validation design, but do not implement or select a backend in this review.

### 15. Test and code quality

Review for:

- nondeterminism
- accidental global mutation
- module installation order
- excessive CI cost
- integer/floating-point instability
- memory pressure from witness paths
- poor failure diagnostics
- misleading names or comments
- tests that assert their own implementation rather than the game contract

## Required response format

Return the review in this exact structure:

### A. Verdict

Choose one:

- `ACCEPT M6 AS DIAGNOSTIC FOUNDATION`
- `ACCEPT WITH REQUIRED FIXES`
- `BLOCK — MATERIAL SOLVER OR TEST DEFECT`

Explain the verdict in no more than 250 words.

### B. Confirmed defects

For every confirmed defect provide:

- severity: P0/P1/P2/P3
- exact file and function
- mechanism
- reproducible counterexample or failing test
- minimal correction
- whether it changes existing M6 results

Do not list speculative concerns here.

### C. Risks requiring experiments

For each risk provide the smallest falsifying experiment and expected interpretation.

### D. Findings already handled correctly

Identify important design choices that should remain unchanged.

### E. Robust-witness search recommendation

Provide a concrete minimal algorithm and pseudocode. State its expected computational cost and failure modes.

### F. Perturbation-policy recommendation

Provide an improved bounded policy with explicit case counts and coverage rules.

### G. Fold resize contract

Provide the recommended state-remapping contract and test matrix.

### H. Patch proposal

Only for confirmed critical defects, provide minimal unified diffs or exact replacement functions. Do not rewrite the project.

### I. Next milestone recommendation

Choose one primary next step:

1. improve robust-witness search
2. retune obstacle patterns
3. implement active Fold resize safety
4. begin Gnosis/scoring redesign
5. another step, clearly justified

Rank the remaining steps after the primary recommendation.

### J. Final merge recommendation

State whether PR #1 should remain draft, become ready for human review, or be split. Do not merge it.

## Review discipline

- Distinguish confirmed defects from plausible concerns.
- Do not claim mathematical proof without one.
- Do not claim human comfort from machine schedules.
- Do not treat local evidence as anti-cheat proof.
- Preserve the protected baseline and current branch discipline.
- Prefer tests and minimal patches over broad rewrites.
- Challenge your own preferred solution with at least one counterexample.