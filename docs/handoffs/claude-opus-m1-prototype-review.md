# Claude Opus Handoff — Milestone 1 Fixed-Step Prototype Review

## 1. Recommended Claude model

Use the strongest Claude Opus model currently available.

This review requires adversarial analysis of browser timing, global lexical scope, animation-loop lifecycle, pause/resume behavior, hidden-tab recovery, and a tightly coupled single-file game.

## 2. Exact task

Review the branch-only fixed-step simulation prototype and determine whether it is safe to promote into the production `index.html` game loop.

Identify correctness defects, hidden lifecycle interactions, browser compatibility issues, refresh-rate inconsistencies, and regressions. Return a narrowly scoped patch or precise implementation corrections. Do not rewrite the game or migrate frameworks.

## 3. Repository URL

`https://github.com/bookthief666/Sex-Magick-Game`

## 4. Current branch

`develop/sex-magick-2.0`

## 5. Exact commit SHA

`4978a1c9f87617a66d279caa7db9ba703b873583`

Inspect this exact commit and state the SHA actually reviewed.

## 6. Relevant files and functions

### Prototype and tests

- `tools/fixed-step-clock.js`
  - `FixedStepClock.constructor()`
  - `FixedStepClock.reset()`
  - `FixedStepClock.advance()`
  - `FixedStepClock.snapshot()`
- `tools/fixed-step-prototype.js`
  - `ensureClock()`
  - `Game.prototype.resetFixedStepTiming()`
  - `Game.prototype.runFixedSimulationStep()`
  - `Game.prototype.scheduleFixedStepFrame()`
  - replacement `Game.prototype.gameLoop()`
  - `window.__SEX_MAGICK_TIMING__`
- `tools/test-fixed-step-clock.js`
- `tools/fixed-step-playtest.html`
- `docs/qa/m1-fixed-step-prototype.md`

### Production source interactions

- `index.html`
  - `Game.gameLoop()`
  - `Game.updateGameObjects()`
  - `Game.drawScene()`
  - `Game.startGame()`
  - `Game.restartGame()`
  - `Game.togglePause()`
  - `Game.returnToMenu()`
  - `Game.gameOver()`
  - `Player.update()`
  - frame-count-based spawn, cooldown, Void, hit-stop, particle, and effect behavior

## 7. Verified facts

1. The production source is still unchanged; the prototype is injected only by a same-origin QA harness.
2. The scheduler uses a fixed step of `1000 / 60` ms.
3. Catch-up is capped at five simulation steps per rendered frame.
4. Raw frame gaps greater than 250 ms reset the accumulator and perform no catch-up steps.
5. Excess whole accumulated steps after the cap are dropped; fractional remainder is preserved.
6. The prototype advances gameplay-authoritative work through the existing `updateGameObjects()` once per fixed step.
7. Render-only work inside `drawScene()` remains render-timed.
8. The existing score formula is unchanged.
9. A tracked RAF identifier is intended to prevent parallel scheduling chains.
10. Deterministic Node tests passed for simulated 60, 90, 120, and 144 Hz; long suspension; capped catch-up; and backwards timestamps.
11. Browser runtime behavior has not yet been claimed as verified.
12. The game declares `Game`, `GameState`, `CONFIG`, `GlitchFX`, and `game` as top-level lexical bindings in a classic script; the injected classic script assumes those bindings are accessible to a later dynamically inserted script.

## 8. Problem statement

The original game updates its simulation once per RAF callback, causing physics, spawning, timers, score opportunity, and difficulty to scale with display refresh rate.

The prototype corrects that through a fixed-step accumulator, but it may contain subtle issues involving:

- dynamic script access to top-level lexical declarations
- manual `gameLoop()` calls during start, resume, and restart
- an already pending RAF during rapid pause/resume or game-over restart
- clock reset semantics and lost diagnostic counters
- state changes during a multi-step catch-up frame
- game over occurring inside `updateGameObjects()`
- drawing after state changes
- hidden-tab and mobile browser scheduling behavior
- high-refresh cosmetic effects that still update inside `drawScene()`
- first-frame equivalence with the prior 60 Hz implementation
- dropped-time policy and leaderboard fairness

## 9. Constraints

- Do not modify `main`.
- Do not assume the live itch.io build has changed.
- No framework migration.
- No build-system requirement for this milestone.
- Preserve the current approximate 60 Hz feel.
- Preserve score events and score values.
- Keep collision checks on every authoritative simulation step.
- Prevent duplicate RAF chains.
- Prevent lethal catch-up after background suspension.
- Do not convert the entire game to variable-delta physics.
- Keep the eventual production patch narrow and reversible.
- Do not rewrite the full `index.html` for convenience.
- Clearly separate blocking defects from optional refinements.

## 10. Requested output

Return:

- findings
- recommendation: promote, revise, or reject
- risks
- affected files and functions
- unified diff against commit `4978a1c9f87617a66d279caa7db9ba703b873583`, or precise patch steps
- browser compatibility assessment for Chrome, Safari, Firefox, Android Chrome, and mobile Safari
- lifecycle analysis for start, pause, resume, game over, restart, return to menu, resize, and hidden-tab return
- timing analysis for 60/90/120/144 Hz
- test procedure
- unresolved questions
- confidence level by subsystem

## 11. Acceptance criteria

A recommended production integration must satisfy all of these:

- approximately 60 authoritative updates per real second at 60, 90, 120, and 144 Hz
- no unbounded catch-up
- no hidden-tab death burst
- no parallel RAF chains after rapid pause/resume or restart
- no stale accumulator inherited between runs
- first-frame behavior is intentional and documented
- Monas damping remains equivalent because existing updates still run at fixed 60 Hz
- collisions and score checks occur once per fixed step
- state changes during catch-up cannot create extra gameplay updates after death
- long stalls and dropped time are observable in diagnostics
- dynamic injection works in target browsers, or a safer harness-loading method is supplied
- production integration does not depend on QA files at release time unless explicitly justified
- no new console errors
- score formula remains unchanged
- patch remains reviewable and reversible

## 12. Test procedure

### Static and unit checks

```bash
node --check tools/fixed-step-clock.js
node --check tools/fixed-step-prototype.js
node --check tools/test-fixed-step-clock.js
node tools/test-fixed-step-clock.js
```

### A/B browser test

Serve the repository:

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/tools/fixed-step-playtest.html
```

For baseline and fixed modes:

1. Test Hexagram and Monas.
2. Measure single-jump apex time and height.
3. Measure fall time from a known state.
4. Measure obstacle travel over ten seconds.
5. Count spawns over sixty seconds.
6. Measure Void duration.
7. Pause for five seconds and resume.
8. Background the tab for ten seconds and return.
9. Restart fifty times and inspect scheduling diagnostics.
10. Trigger game over during a catch-up frame under CPU throttling.
11. Test 60, 90, 120, and 144 Hz where available.
12. Repeat in Chrome, Safari, Firefox, Android Chrome, and mobile Safari.
13. Capture console, timing snapshots, and screen recordings.

## Required response structure

1. Inspected SHA
2. Findings
3. Promotion Recommendation
4. Blocking Defects
5. Nonblocking Improvements
6. Risks
7. Affected Files and Functions
8. Unified Diff or Precise Patch Steps
9. Browser Compatibility
10. Lifecycle Analysis
11. Test Procedure
12. Unresolved Questions
13. Confidence Level
