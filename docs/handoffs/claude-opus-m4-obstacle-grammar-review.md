# Claude Opus Review Handoff — Milestone 4 Deterministic Obstacle Grammar

## Review target

Repository: `bookthief666/Sex-Magick-Game`  
Branch: `develop/sex-magick-2.0`  
Pull request: `#1`  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `d9786fca34d84d27c1691016ae726a7f671756d1`  
QA workflow run: `30902145938`

Review the strongest available Claude Opus model should perform an adversarial engineering, game-design, and fairness analysis of Milestone 4. Do not merely summarize the code or accept passing tests as proof of player fairness.

## Files in scope

Primary implementation:

- `tools/obstacle-grammar.js`
- `tools/fixed-step-prototype.js`

Permanent validation:

- `tools/test-obstacle-grammar.js`
- `tools/obstacle-grammar-browser-test.html`
- `tools/run-browser-obstacle-grammar-test.mjs`
- `.github/workflows/qa.yml`

Adjacent systems whose wrapper order and state must be considered:

- `index.html`
- `tools/fixed-step-clock.js`
- `tools/collision-runtime.js`
- `tools/run-telemetry.js`

Evidence:

- `docs/qa/m4-deterministic-obstacle-grammar-results.md`
- `docs/decisions/decision-log.md`

## Intended behavior

The implementation replaces independent random normal-pillar placement with a per-run seeded pattern scheduler while retaining:

- the fixed 60 Hz authoritative simulation
- existing pillar spawn cadence
- current gap progression
- current pillar speed and breathing motion
- existing collision and score rules
- existing Orb value and probability
- existing level, Void, and leaderboard behavior

It introduces:

- separate Hexagram and Monas pattern catalogs
- named safe, pressure, recovery, and climax families
- a fixed family cycle
- deterministic mirrored variants
- maximum normalized consecutive top-ratio delta of 0.18
- exact replay for the same grammar version, seed, Rite, viewport, gap values, and Orb probability
- local pattern evidence linked by the existing local run ID

## Evidence already produced

The integrated Chrome test verified:

- 72 Hexagram spawns for seed `305419896`
- exact 72-spawn Hexagram replay
- 72 distinct Monas spawns under the same seed
- Hexagram maximum normalized transition delta `0.180`
- Monas maximum normalized transition delta `0.160`
- family cycle `safe > pressure > recovery > pressure > climax > recovery`
- exact pattern/telemetry run-ID linkage across three runs
- one pending RAF callback
- no forbidden identity fields in persisted pattern evidence

All earlier fixed-step, collision/touch, and telemetry/fast-retry tests remained green.

## Required adversarial questions

### 1. Dynamic solvability

The code constrains consecutive gap-top ratios, but does not simulate player trajectories.

Determine whether a 0.18 ratio delta can still create impossible or unreasonable transitions when combined with:

- available vertical range on 390 × 844, Fold-open, desktop, and other supported viewports
- Hexagram gravity `0.45`, jump impulse `-7.5`, maximum fall speed, and cooldown
- Monas gravity `0.18`, damping `0.98`, jump impulse `-7.2`, and cooldown
- current game-speed progression up to `8.5`
- shrinking gaps down to `110`
- pillar width and spacing
- player radius and collision inset
- input latency and fixed-step catch-up

Propose the smallest credible automated trajectory test. State clearly whether it should use exhaustive search, dynamic programming, reachability intervals, scripted input search, or another method.

### 2. Speed and spacing semantics

Pattern ratios do not encode horizontal time directly; existing spawn cadence varies with game speed.

Check whether the cadence formula and pillar velocity keep the time between gates sufficiently stable. Identify any speed ranges where the same vertical transition becomes disproportionately difficult.

### 3. Pattern-boundary integrity

Each pattern begins at the prior ratio. Confirm that:

- mirrored variants preserve that invariant
- clamping cannot hide a larger intended transition or produce degenerate repeated gates
- recovery patterns actually move meaningfully toward center from edge anchors
- repeated family cycles cannot create unintended monotonous or pathological sequences

### 4. Pillar breathing and collision

Every pillar applies the same frame-phase vertical breathing offset. Confirm whether this means relative gap displacement remains invariant, including pillars spawned on different frames. Examine whether a common global sine offset can still make boundary timing misleading as a player crosses a pillar.

### 5. Resize and Fold posture changes

New pillars map ratios using the current viewport; existing pillars retain their pixel positions under the legacy resize behavior.

Analyze rapid Fold closed/open transitions during an active pattern. Determine whether the sequence remains coherent, whether existing and new pillars can disagree catastrophically, and what minimal remapping policy should be considered.

### 6. Void interruption

Normal pillar scheduling pauses during Void mode, but the scheduler retains its active pattern step.

Decide whether resuming the interrupted pattern is mechanically and aesthetically preferable to restarting with a recovery family. Identify any state discontinuity caused by changed level, gap, or speed during the Void.

### 7. Wrapper composition and load order

The runtime dynamically loads after fixed-step, collision, and telemetry modules and wraps methods already wrapped by those systems.

Verify:

- exact wrapper order for `startGame`, `restartGame`, `gameOver`, `returnToMenu`, and `updateGameObjects`
- whether a delayed or failed module load can produce a half-instrumented run
- whether telemetry and pattern run IDs can diverge during errors, rapid restart, or replacement
- whether install guards are sufficient
- whether another script can call gameplay methods before all dynamic modules install

### 8. Legacy random-consumption compatibility

The grammar constructs a legacy `Pillar`, consumes the legacy Orb roll and optional Orb phase draw, then overwrites gameplay-authoritative fields using the seeded stream.

Check whether the number and order of global `Math.random()` calls truly match the old path for:

- Orb spawned
- Orb not spawned
- mobile versus desktop warning behavior
- exceptions during construction

Determine whether preserving global random-consumption order is valuable enough to justify the complexity or whether cosmetic randomness should be explicitly isolated later.

### 9. Orb economy

Orb probability remains 0.5, but deterministic placement changes distribution and correlation with named patterns.

Analyze whether Orbs can cluster in pressure/climax sequences or become systematically harder/easier to collect. Recommend evidence fields or tests needed before the Gnosis/scoring redesign.

### 10. Evidence and replay trust

Pattern evidence and run telemetry are local and user-editable. A seed enables reproduction but is not proof that the submitted run followed the sequence or used unmodified code.

State precisely what this milestone contributes to future leaderboard validation and what it cannot establish. Do not recommend treating local evidence as authoritative anti-cheat proof.

### 11. Storage and privacy

Review the separate `sex_magick_patterns_v1` ledger:

- maximum size under 20 runs × 300 events
- localStorage quota risk
- malformed or stale schema handling
- run-ID linkage implications
- whether any field expands fingerprinting risk
- whether schema migration or quota fallback is needed before release

### 12. Failure fallback

When deterministic spawn fails, the runtime logs the error and invokes the legacy random spawn for that frame.

Decide whether silently continuing with a non-replayable mixed run is acceptable. Consider whether the run should instead be marked invalid/non-deterministic in local evidence while gameplay continues.

## Requested response format

Return:

1. **Release-blocking defects**, ordered by severity, with file/function references.
2. **Fairness and solvability findings**, distinguishing proof, evidence, and assumption.
3. **Wrapper/load-order findings**.
4. **Determinism and replay findings**.
5. **Privacy/storage findings**.
6. **Minimal corrective patch plan**.
7. **Recommended automated reachability test design** with pseudocode or precise algorithm.
8. **Physical playtest matrix** for Hexagram and Monas across 60/120 Hz, phone, Fold closed/open, and desktop.
9. **Verdict:** accept for development only, accept for release, or reject pending named blockers.

Do not recommend a framework migration unless a specific defect cannot be safely corrected within the current native-module approach.
