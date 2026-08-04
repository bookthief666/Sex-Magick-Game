# Claude Opus Handoff — Milestone 1 Integrated Runtime Review

## 1. Recommended Claude model

Use the strongest Claude Opus model currently available.

This is an adversarial review of a gameplay-authoritative timing change in a tightly coupled browser arcade game. The work requires lifecycle reasoning, animation-loop analysis, hidden-tab behavior, score-integrity review, and careful distinction between tested facts and remaining risks.

## 2. Exact task

Review the integrated refresh-rate-independent simulation runtime now loaded by the development branch's production entry point.

Determine whether the implementation is safe to retain as the foundation for subsequent movement, collision, obstacle, scoring, and leaderboard work.

Do not redesign the game, migrate frameworks, or broaden the patch. Identify blocking defects, subtle lifecycle regressions, untested interactions, and the smallest corrections required.

## 3. Repository URL

`https://github.com/bookthief666/Sex-Magick-Game`

## 4. Current branch

`develop/sex-magick-2.0`

## 5. Exact source commit SHA

`8a81070d96bad7a05c93c18c5306217a1b80aa2b`

Inspect this exact commit. Report the SHA actually inspected before giving findings. Do not use a cached or older prototype checkout.

The handoff document itself may exist in a later commit, but the code under review is exactly the SHA above.

## 6. Relevant files and functions

### Integrated entry point

- `index.html`
  - closing runtime script tags
  - original `Game.gameLoop()` retained in source but replaced at runtime before the `Game` instance is constructed
  - `startGame()`
  - `restartGame()`
  - `togglePause()`
  - `returnToMenu()`
  - `gameOver()`
  - `updateGameObjects()`
  - `drawScene()`

### Fixed-step runtime

- `tools/fixed-step-clock.js`
  - `FixedStepClock.constructor()`
  - `reset()`
  - `advance()`
  - `snapshot()`

- `tools/fixed-step-prototype.js`
  - despite the historical filename, this is now the integrated runtime module
  - `ensureClock()`
  - `resetFixedStepTiming()`
  - `runFixedSimulationStep()`
  - `scheduleFixedStepFrame()`
  - replacement `Game.prototype.gameLoop()`
  - `__SEX_MAGICK_TIMING__`

### Automated tests

- `tools/test-fixed-step-clock.js`
- `tools/browser-fixed-step-test.mjs`
- `tools/run-browser-fixed-step-test.mjs`
- `.github/workflows/qa.yml`

### QA evidence

- `docs/qa/m1-fixed-step-prototype.md`
- `docs/qa/m1-fixed-step-results.md`
- `docs/qa/test-matrix.md`

## 7. Verified facts

1. `main` remains at `d3760aaea9c7322d48e471389a67c4e579743e2a`; the live itch.io build has not been changed.
2. The development `index.html` loads `tools/fixed-step-clock.js` and `tools/fixed-step-prototype.js` after all game classes are defined and before `DOMContentLoaded` creates the `Game` instance.
3. The runtime replaces `Game.prototype.gameLoop()` before the instance exists.
4. Authoritative simulation runs at `1000 / 60` ms per step.
5. Catch-up work is capped at five simulation steps per rendered frame.
6. Frame gaps greater than 250 ms reset the accumulator and advance zero gameplay steps.
7. Excess accumulated full steps beyond the cap are dropped and recorded.
8. Rendering remains tied to browser `requestAnimationFrame`.
9. The existing movement constants, score rules, obstacle rules, level thresholds, and collision code were not retuned in this milestone.
10. A tracked `fixedStepRafId` prevents manual pause/resume or restart calls from starting an additional RAF chain while one is already pending.
11. Deterministic scheduler tests pass at 60, 90, 120, and 144 Hz.
12. Integrated headless Chrome tests execute the actual game classes with optional external services blocked.
13. Controlled ten-second results:

| Mode | Render schedule | Simulation frames | Score | Remaining obstacles |
|---|---:|---:|---:|---:|
| Fixed-step | 60 Hz | 601 | 1 | 4 |
| Fixed-step | 90 Hz | 601 | 1 | 4 |
| Fixed-step | 120 Hz | 601 | 1 | 4 |
| Fixed-step | 144 Hz | 601 | 1 | 4 |
| Original baseline | 60 Hz | 601 | 1 | 4 |
| Original baseline | 120 Hz | 1201 | 5 | 3 |
| Original baseline | 144 Hz | 1441 | 7 | 4 |

14. Fifty rapid pause/resume cycles retained one pending RAF callback.
15. Fifty consecutive restarts retained one pending RAF callback.
16. A pending callback firing while paused terminated the RAF chain; resume created exactly one new chain.
17. A simulated one-second suspension advanced zero gameplay steps and resumed with one pending RAF callback.
18. Headless viewport checks passed at 390×844 and 884×1104.
19. The independent GitHub Actions QA run on commit `8a81070d96bad7a05c93c18c5306217a1b80aa2b` passed syntax, deterministic, and integrated Chrome checks.

## 8. Problem statement

The original game performed one complete gameplay update per rendered frame. High-refresh displays therefore increased gravity updates, obstacle movement, spawning, timers, and score opportunity.

The current solution fixes this by replacing the loop at runtime with a capped fixed-step accumulator. It has passed controlled automated checks, but an independent adversarial review is required before subsequent systems build on it.

Focus particularly on interactions that the existing automation may not expose:

- real `Player.update()` and death transitions
- collision-triggered state changes during a multi-step catch-up frame
- `gameOver()` occurring inside `updateGameObjects()` while additional objects continue updating in the same step
- pause/menu transitions initiated during input or callbacks
- restart after game over
- audio state transitions
- resize behavior while a clock is active
- effect and animation timing split between simulation frames, render frames, and wall-clock time
- missing cancellation of a browser RAF versus logical duplicate prevention
- repeated installation and script-load failure behavior
- game startup if either timing module fails to load
- whether `hitStop` semantics remain equivalent to the original 60 Hz behavior
- whether dropped catch-up time creates exploitable scoring or collision behavior

## 9. Constraints

- Do not modify `main`.
- Review exact commit `8a81070d96bad7a05c93c18c5306217a1b80aa2b`.
- No framework migration.
- No package-manager or bundler requirement.
- No movement retuning, scoring redesign, obstacle redesign, or leaderboard replacement in this review.
- Preserve approximate original 60 Hz game feel.
- Preserve the current score formula.
- Prefer narrow patches or unified diffs.
- Do not replace all of `index.html`.
- Do not claim deterministic replay or anti-cheat guarantees.
- Treat the browser as hostile, but keep this review centered on timing and lifecycle correctness.
- Separate blocking defects from acceptable later improvements.

## 10. Requested output

Return:

1. **Inspected SHA**
2. **Findings** grouped as blocking, important, moderate, and non-blocking
3. **Recommendation**: retain, revise, or revert
4. **Lifecycle analysis** covering start, pause, resume, game over, restart, menu, hidden tab, resize, and script failure
5. **Timing analysis** covering authoritative versus cosmetic timing
6. **Risks** and what existing tests do not prove
7. **Affected files and functions**
8. **Unified diff or precise patch steps** for every blocking or important correction
9. **Additional test procedure**
10. **Unresolved questions**
11. **Confidence level** overall and per subsystem

For each finding include:

- evidence
- player or competitive impact
- severity
- reproduction procedure
- smallest corrective action
- acceptance criteria

## 11. Acceptance criteria for the review

A positive recommendation requires all of the following:

- no unbounded catch-up loop
- no lethal catch-up burst after hidden-tab return
- no duplicate RAF chain after pause/resume or restart
- no refresh-rate-dependent score opportunity in controlled runs
- original 60 Hz authoritative step count remains equivalent
- state changes during simulation cannot cause unintended additional authoritative updates
- real player death and collision transitions are safe under catch-up
- game can fail gracefully or clearly if timing modules fail to load
- no important timing behavior remains accidentally render-frequency-dependent
- the patch remains narrow and reversible

## 12. Test procedure to extend

In addition to the committed automated tests, review and propose tests for:

1. Real Hexagram player physics with deterministic jump input at 60/120/144 render schedules.
2. Real Monas damping and jump physics at the same schedules.
3. Collision on the first of several catch-up steps; verify no later step mutates the ended run.
4. Floor death during catch-up.
5. Game over, immediate restart, and menu return while a RAF callback is pending.
6. Resize during active play without resetting progression speed.
7. Void entry and exact real-time duration.
8. Hit-stop duration equivalence at 60 and 120+ render schedules.
9. Failure to load `fixed-step-clock.js`.
10. Failure to load `fixed-step-prototype.js`.
11. Safari and Firefox smoke tests.
12. Physical Android and Samsung Fold 6 touch/posture tests.

## Required response format

Use these headings in order:

1. Inspected SHA
2. Findings
3. Recommendation
4. Lifecycle Analysis
5. Timing Analysis
6. Risks and Test Gaps
7. Affected Files and Functions
8. Unified Diff or Precise Patch Steps
9. Additional Test Procedure
10. Unresolved Questions
11. Confidence Level
