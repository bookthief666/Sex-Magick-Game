# Claude Opus Handoff — Milestone 1: Refresh-Rate-Independent Simulation

## 1. Recommended Claude model

Use the strongest Claude Opus model currently available in the paid Claude account.

This task requires deep analysis of a tightly coupled, single-file game loop, preservation of current 60 Hz feel, identification of hidden timing interactions, and adversarial regression review. Do not delegate the core review to a faster model.

## 2. Exact task

Audit the current browser game timing model and produce a narrowly scoped implementation plan and preferably a unified diff that converts gameplay simulation from frame-dependent updates to a refresh-rate-independent fixed-step model.

The patch must preserve the current game’s approximate 60 Hz feel while making real-time behavior materially equivalent at 60, 90, 120, and 144 Hz.

Do not rewrite the game, migrate frameworks, or replace the entire `index.html` file.

## 3. Repository URL

`https://github.com/bookthief666/Sex-Magick-Game`

## 4. Current branch

`develop/sex-magick-2.0`

## 5. Exact source commit SHA

`40976d2c922e9964a19c094511b0d3a5c0ee06c5`

Analyze this exact commit. Do not rely on an older local copy or memory of the project. Report the SHA you actually inspected before giving recommendations.

## 6. Relevant files and functions

### Primary production file

- `index.html`

### Existing QA material

- `docs/audit/sex-magick-2.0-audit.md`
- `docs/qa/test-matrix.md`
- `tools/runtime-harness.html`

### Highest-relevance functions and systems in `index.html`

- `Game.gameLoop(currentTime)`
- `Game.updateGameObjects()`
- `Game.drawScene(currentTime)`
- `Game.getCurrentGap()`
- `Game.checkLevel()`
- `Game.startVoidMode()` / `Game.endVoidMode()`
- `Game.applyScreenFlash()`
- `Game.applyGlitchEffect()`
- `Game.adjustForScreenSize()`
- `Player.update()` / `Player.jump()`
- `Pillar.update(speed)`
- `Orb.update(speed)`
- `Pentagram.update(speed)`
- `Particle.update()`
- `Star.update()`
- `WarpStar.update(speed, isVoid)`
- `GlitchFX.apply(ctx, currentTime)`
- frame-count-based spawn conditions and cooldowns
- frame-count-based visual animation expressions using `game.frames`

## 7. Verified facts

1. The game is a single-file HTML/CSS/JavaScript canvas application.
2. `requestAnimationFrame` calls `Game.gameLoop`.
3. The simulation increments `this.frames` once per rendered frame.
4. Player gravity, position, obstacle movement, collectible movement, particle decay, spawn cadence, cooldowns, Void duration, hit stop, and multiple effects are advanced by frame count rather than elapsed time.
5. Core constants appear tuned around roughly 60 updates per second:
   - Hexagram gravity: `0.45` per update
   - Hexagram jump impulse: `-7.5`
   - Monas gravity: `0.18` per update
   - Monas velocity damping: `0.98` per update
   - initial obstacle/game speed: `2.9` pixels per update
   - pillar spawn base: `140` frames
   - Void duration: `300` frames
6. The current score is affected by how rapidly obstacles and pickups are generated and traversed in real time.
7. The game has a shared global leaderboard integration, so refresh-rate-dependent score opportunity is a competitive integrity problem.
8. Pause stops scheduling the next active loop; resume calls `gameLoop()` again.
9. Hidden-tab behavior, long frame gaps, and duplicate-loop prevention are not explicitly hardened.
10. Runtime gameplay has not yet been claimed as verified; static findings are documented separately.

## 8. Problem statement

At higher display refresh rates, the current game performs more simulation updates per real second. This can increase gravity, obstacle movement, spawn frequency, timer expiration, visual effect decay, Void timing, and score opportunity. At lower or throttled rates, the opposite occurs.

A naive multiplication of every update by a variable delta may introduce unstable collision behavior, nonlinear damping differences, tunneling, large hidden-tab jumps, or changes to the carefully tuned 60 Hz feel.

We need the smallest robust correction that supports deterministic-enough arcade behavior without prematurely restructuring the entire game.

## 9. Constraints

- Do not modify `main`.
- Work only against `develop/sex-magick-2.0` at the stated SHA.
- No framework migration.
- No package manager or build-system requirement for this milestone unless strictly justified.
- No unrelated formatting or visual redesign.
- Do not replace the whole `index.html` merely for convenience.
- Preserve the current approximate 60 Hz jump arc, obstacle speed, spawn cadence, Void duration, cooldown timing, and visual feel.
- Use a capped accumulator/fixed-step design unless you can demonstrate a safer smaller alternative.
- Prevent a spiral of death after long frame stalls.
- Define behavior after hidden-tab/background suspension.
- Ensure pause/resume and restart cannot produce duplicate RAF loops.
- Separate gameplay-authoritative simulation time from purely visual animation where appropriate.
- Do not claim deterministic replay or anti-cheat guarantees beyond what the proposed change actually provides.
- Keep rollback possible through one focused commit.

## 10. Requested output

Return all of the following:

1. **Findings** — every frame-dependent behavior you found, grouped into gameplay-authoritative and cosmetic timing.
2. **Recommendation** — fixed-step architecture, step size, accumulator rules, catch-up cap, interpolation decision, and hidden-tab policy.
3. **Risks** — especially damping conversion, collisions, spawn cadence, timers, pause/resume, and effect behavior.
4. **Affected files and functions** — exact locations.
5. **Patch** — preferably a narrow unified diff against commit `40976d2c922e9964a19c094511b0d3a5c0ee06c5`; otherwise precise implementation steps with replacement snippets.
6. **Migration table** — each frame-based variable or constant, its current 60 Hz interpretation, and its proposed time-based/fixed-step representation.
7. **Test procedure** — manual and instrumented checks at 60/90/120/144 Hz.
8. **Unresolved questions** — only questions that materially block confidence.
9. **Confidence level** — overall and by subsystem.

Do not return an entire rewritten `index.html` unless you first prove targeted patching is technically impossible.

## 11. Acceptance criteria

The proposed patch is acceptable only if:

- gameplay-authoritative simulation uses a fixed step or an equivalently justified stable method
- real-time jump apex, fall time, obstacle travel, spawn cadence, Void duration, and score opportunity differ by no more than approximately ±2% between 60 and 120+ Hz under controlled conditions
- the current 60 Hz behavior remains recognizably equivalent
- a long frame gap cannot advance the game through an unbounded number of steps
- returning from a hidden tab does not cause a lethal or explosive catch-up burst
- pause/resume does not duplicate the animation loop
- restart does not inherit stale timing state
- Monas damping is converted correctly rather than simply multiplied by delta
- collision checks continue at every authoritative simulation step
- visual-only effects may remain render-timed only when that cannot affect gameplay or scoring
- the exact score formula and score events remain unchanged in this milestone
- the patch is narrow, reviewable, and reversible
- no new console errors or unhandled promise rejections are introduced

## 12. Test procedure

### Controlled timing tests

For Hexagram and Monas, test at 60, 90, 120, and 144 Hz or equivalent browser frame-rate controls:

1. Start from a known player position and velocity.
2. Trigger one jump.
3. Measure apex time, apex height, and return time.
4. Measure obstacle travel over ten real seconds.
5. Measure pillar spawn count over sixty real seconds.
6. Measure Void duration in real seconds.
7. Measure score opportunity over a controlled no-death/autopilot diagnostic run if available.

### Lifecycle tests

1. Start, pause, wait five seconds, resume.
2. Switch to another tab for ten seconds, return.
3. Throttle CPU heavily, then restore.
4. Restart fifty times while observing active RAF scheduling and object counts.
5. Return to menu and start the opposite Rite.
6. Resize and rotate during play.

### Regression smoke test

- launch and loading
- menu and both Rite buttons
- keyboard, mouse, and touch input
- first obstacle
- collision and floor death
- score and Orb collection
- level transition and Void entry/exit
- pause/resume
- death/restart/menu
- personal best
- audio state transitions
- leaderboard failure must not block play

## Required response format

Use these headings in order:

1. Inspected SHA
2. Findings
3. Recommendation
4. Risks
5. Affected Files and Functions
6. Unified Diff or Precise Patch Steps
7. Timing Migration Table
8. Test Procedure
9. Unresolved Questions
10. Confidence Level
