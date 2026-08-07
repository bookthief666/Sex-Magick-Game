# Claude Opus Review Handoff — Milestone 5 Player-State Reachability

## Review target

Repository: `bookthief666/Sex-Magick-Game`  
Branch: `develop/sex-magick-2.0`  
Pull request: `#1`  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `34c0b1330515c3e40da7343efb1e28bb957949f9`  
QA workflow run: `30906325023`

Use the strongest available Claude Opus model for an adversarial engineering, numerical-method, game-design, and fairness review. Do not treat a green matrix as a formal proof or merely summarize the implementation.

## Files in scope

Primary solver and policy:

- `tools/player-reachability.js`
- `tools/reachability-policy.js`

Integration:

- `tools/obstacle-grammar.js`
- `tools/fixed-step-prototype.js`
- `tools/collision-runtime.js`
- `index.html`

Permanent validation:

- `tools/test-player-reachability.js`
- `tools/reachability-browser-test.html`
- `tools/run-browser-reachability-test.mjs`
- `.github/workflows/qa.yml`

Evidence:

- `docs/qa/m5-player-state-reachability-results.md`
- `docs/qa/m4-deterministic-obstacle-grammar-results.md`
- `docs/decisions/decision-log.md`

## Why this milestone exists

Milestone 4 constrained consecutive normalized gap positions to `0.18`, but explicitly did not prove dynamic solvability.

The exact player-state solver subsequently reproduced impossible original Monas cases on a Fold-open viewport at maximum speed and minimum gap. The implementation now applies measured corrections to five Monas patterns and installs a deterministic fallback for any future pattern that is not in the verified verdict set.

## Current evidence

The hard deterministic matrix covers:

- all 16 pattern IDs
- base and mirrored variants
- anchors `0.22`, `0.50`, `0.78`
- `390 × 844`, speed `8.5`, gap `110`, mobile cooldown
- `884 × 1104`, speed `8.5`, gap `110`, desktop cooldown
- two breathing phases for the Fold-open case

Result:

- 252 verified
- 0 marginal
- 0 invalid
- every accepted route replayed exactly
- every accepted route retained at least eight pixels of additional clearance

The browser integration also verified:

- 180-step Hexagram parity under a mixed accepted/rejected jump schedule
- 180-step Monas parity under the same schedule
- original `monas.return-flow` remains reproducibly invalid in the hard Fold-open case
- adjusted `monas.return-flow` is verified at eight-pixel margin
- all 16 verdicts are loaded
- an adjusted runtime pattern is produced
- an invalid pattern deterministically falls back to `monas.still-point`
- pattern evidence records reachability policy version 1

## Required adversarial questions

### 1. Update-order fidelity

Compare `advancePlayerState()` with the real `Player.jump()`, `Player.update()`, obstacle collision order, top clamp, bottom death, cooldown decrement, and fixed-step loop.

Identify any frame-order mismatch involving:

- collision before or after movement
- cooldown reset and decrement on the accepted-jump frame
- top clamp velocity reset
- bottom-death threshold
- hit stop
- pause/resume
- Void mode
- catch-up frames

A one-frame mismatch is consequential.

### 2. Collision-window calculation

Audit `computeGateCollisionWindow()` against the real pillar constructor and `Pillar.update()` order.

Confirm whether the first and last overlapping ages are correct for strict rectangle penetration, including:

- player hitbox left/right edges
- pillar width
- pillar spawn at `window.innerWidth`
- obstacle movement before collision
- exact-edge-safe semantics
- floating-point speed and integer frame conversion

Produce a counterexample if the formulas are off by one frame.

### 3. State quantization and beam pruning

The search deduplicates states with:

- rounded vertical position
- velocity rounded to half-unit increments
- exact cooldown

It then applies deterministic beam pruning.

Assess:

- false-negative risk
- whether two states sharing a key can have materially different future reachability
- whether beam scoring over-prioritizes immediate gap-center proximity
- whether an interval, lattice, dynamic-programming, or exact discrete formulation would be safer
- whether the current 1,000/2,500/5,000 beam widths are evidence-based

Accepted witnesses are replayed exactly, preventing false-positive acceptance from quantization. Confirm that statement and identify any exception.

### 4. Initial-state limitation

The matrix starts each isolated pattern centered in its first gate with zero vertical velocity and zero cooldown.

Determine how much this limits the verdict. In particular:

- a real player enters the first gate with nonzero velocity
- cooldown can be nonzero
- the preceding pattern can constrain the available state set
- pattern-boundary ratio continuity does not imply velocity continuity

Design the smallest credible end-to-end or compositional test that propagates reachable state sets across family boundaries and multiple cycles.

### 5. Breathing-phase coverage

The hard Fold-open case tests phases `0` and `31`; other cases use representative phase coverage.

Assess whether two phases are sufficient for a sinusoidal five-pixel obstacle displacement. Recommend a finite phase set or analytical bound that prevents a missed adverse phase.

### 6. Human input tolerance

The solver can request a jump on any legal simulation frame. That proves existence of a machine-perfect schedule, not human comfort.

Propose a robustness test that considers:

- ±1, ±2, and ±3-frame jump timing perturbations
- touch sampling and browser event latency
- 60 versus 120 Hz display presentation despite fixed simulation
- mobile cooldown
- Fold posture changes
- distraction from visual motion and breathing pillars

Define a useful distinction between technically reachable, robustly reachable, and human-comfortable.

### 7. Monas corrections

Review the five adjusted definitions:

- `monas.mercurial-wave`
- `monas.lunar-sweep`
- `monas.return-flow`
- `monas.serpent-current`
- `monas.caduceus-wave`

Determine whether the corrections preserve the intended Monas identity or flatten its pattern vocabulary excessively. The browser grammar evidence now reports maximum Monas transition delta `0.096`, compared with Hexagram `0.180`.

Recommend whether difficulty should later come from timing, curved motion, reward placement, stateful momentum, or another Monas-specific mechanic rather than larger vertical jumps.

### 8. Runtime guard correctness

Audit the prototype patching order for `PatternScheduler.choosePattern`, `next`, and `snapshot`.

Confirm:

- the override always runs before authoritative ratios are consumed
- the adjusted pattern preserves seed replay when policy version is fixed
- fallback serial/family semantics remain coherent
- fallback does not accidentally repeat forever
- a missing fallback fails safely
- installation is idempotent
- delayed script loading cannot permit an unguarded first run

### 9. Evidence versioning

Pattern records now include:

- grammar version
- reachability policy version
- verdict
- adjusted/fallback flags
- rejected pattern ID

Check whether replay also requires:

- solver version
- exact pattern-definition digest
- viewport dimensions
- speed and gap sequence
- collision-runtime version
- fixed-step runtime version

State the minimum replay manifest required to reproduce a historical run without trusting mutable client code.

### 10. Security boundary

The solver, verdicts, seed, and evidence all execute on the client. Confirm that this remains debugging and fairness evidence only—not anti-cheat proof.

Identify what a future server would need to validate if the leaderboard becomes competitive.

### 11. Test completeness

Challenge the 252-case count. Identify missing combinations involving:

- every speed/gap transition rather than only hard endpoints
- full-height range
- Fold closed/open transitions
- desktop aspect ratios
- repeated cycles
- Orb hit stop
- level changes during a pattern
- Void interruption and resumption
- resize remapping

Prioritize additions by risk, not by combinatorial completeness.

### 12. Numerical stability

Review float comparisons, `Number.EPSILON`, rounded state keys, breathing sine, and exact-edge collision semantics. Determine whether browser/runtime differences could alter a witness near the eight-pixel threshold.

## Required response format

Return:

1. Executive verdict: `accept`, `accept with required changes`, or `reject`
2. Critical defects, ordered by severity
3. Solver-model fidelity findings
4. Quantization and pruning analysis
5. Collision-window/off-by-one analysis
6. Initial-state and composition limitations
7. Human-tolerance test design
8. Review of the five Monas corrections
9. Runtime-guard and evidence-versioning findings
10. Minimal required patch set
11. Recommended next automated tests
12. Residual risks that require physical playtesting

For every claimed defect, cite the exact file, function, and relevant code path. Distinguish proven defects from hypotheses requiring a test.