# Claude Opus Review Packet — Milestone 3 Fast Retry and Local Run Telemetry

## Review target

Repository: `bookthief666/Sex-Magick-Game`  
Branch: `develop/sex-magick-2.0`  
Tested implementation head: `6ff1bf0eaf277ff1e8da3f59d5a876afdfd125bd`  
Protected production baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`

Do not review `main` as if these changes are already released. They are not. The live itch.io build remains unchanged.

## Role

Act as a principal browser-game engineer, telemetry/privacy reviewer, adversarial QA architect, and competitive-integrity engineer.

Your task is to find correctness, lifecycle, privacy, persistence, input, and future leaderboard-validation defects that the implementation and current tests may have missed.

Do not praise the implementation generally. Prioritize concrete failure modes, reproduction procedures, and narrow corrections.

## Files to inspect

Primary runtime:

- `tools/run-telemetry.js`
- `tools/fixed-step-prototype.js`

Existing systems affected indirectly:

- `tools/fixed-step-clock.js`
- `tools/collision-runtime.js`
- `index.html`

Tests:

- `tools/test-run-telemetry.js`
- `tools/browser-telemetry-test.mjs`
- `tools/run-browser-telemetry-test.mjs`
- `.github/workflows/qa.yml`

Evidence:

- `docs/qa/m1-fixed-step-results.md`
- `docs/qa/m2-collision-touch-results.md`
- `docs/qa/m3-fast-retry-run-telemetry-results.md`
- `docs/decisions/decision-log.md`

## Intended behavior

### Run lifecycle

- A run begins from `menu` or `retry`.
- Every start event is frame 0, score 0, simulation 0 ms, wall offset 0 ms.
- Death finalizes at the microtask boundary so the current simulation step can finish recording score changes.
- A retry flushes pending death finalization before creating a new run.
- Returning to menu finalizes the current run.
- Starting a run while another remains active ends the former as `replaced`.

### Run identity

- Local identifier only.
- Shape: `run_<base36 epoch>_<random suffix>`.
- Uses `crypto.randomUUID()` when available.
- Must never substitute LootLocker identity, username, session token, or device fingerprint.

### Persistence

- Storage key: `sex_magick_runs_v1`.
- Latest 20 completed runs only.
- Current run remains in memory.
- Maximum 200 lifecycle events and 200 score events per run.
- Malformed or unavailable local storage fails safely.
- No network transmission.

### Timing evidence

Persist only the allowlisted fixed-step fields:

- mode
- step duration
- maximum catch-up steps
- suspension threshold
- simulation frames
- score
- pending RAF state
- total steps
- dropped time
- suspension resets
- accumulator

### Fast retry

In `GAME_OVER`:

- `R`, `Space`, and `Enter` restart.
- Non-control touch or primary mouse input restarts.
- Actual controls are excluded.
- Restart uses the existing synchronous `restartGame()` path.
- One pending RAF callback remains before and after retry.

### Debug view

- `T` toggles the panel.
- `?telemetry=1` or a hash containing `telemetry` enables it.
- It is local and non-interactive.

## Automated evidence already obtained

Final QA workflow run: `30899895422`

Passing suites:

1. syntax checks
2. fixed-step deterministic tests
3. collision/input deterministic tests
4. run-telemetry deterministic tests
5. fixed-step Chrome integration
6. collision/touch Chrome integration
7. telemetry/fast-retry Chrome integration

The browser integration verified:

- one pending RAF after start
- one gate score event
- pause/resume lifecycle
- Void entry/exit lifecycle
- death finalization
- one completed persisted run
- a new retry run ID
- retry state `playing`
- retry score 0
- retry frame 0
- exact retry start event at frame 0 and score 0
- one pending RAF after retry
- debug panel visibility
- menu finalization
- no tested forbidden identity fields in persisted JSON
- fixed-step policy values of five catch-up steps and 250 ms suspension reset

## Required adversarial questions

### A. Lifecycle ordering

1. Can death finalization race with a real user retry, restart-button click, menu action, visibility event, or another `gameOver()` call?
2. Can the microtask finalizer end the newly created retry run under any event ordering?
3. Can a score or level event be recorded after the end event?
4. Does `updateGameObjects()` always unwind before the queued death finalization?
5. What happens if `gameOver()` throws after state mutation but before returning?
6. What happens if `Leaderboard.submit()` is slow, throws synchronously, or schedules callbacks that mutate game state?
7. Can a run remain active after navigation to settings, page unload, browser back, or an unhandled exception?

### B. Fixed-step and RAF lifecycle

1. Does the fast-retry path genuinely preserve one RAF on real browsers, or only under the mocked queue?
2. Can a pending old-run callback advance the new run with an inappropriate timestamp or accumulator?
3. Should restart explicitly reset the fixed-step clock even when an old callback is pending?
4. Can an immediate retry after a long game-over pause trigger suspension reset or dropped-time data that belongs to the old run?
5. Does the persisted timing snapshot represent the completed run or merely global clock history since a previous run?

### C. Timing semantics

1. Is `simulationDurationMs = frames × 1000/60` the correct definition when hit stop suppresses frame increments?
2. Should hit-stop steps count as active simulation time, wall time only, or a separate field?
3. Does active duration correctly handle repeated pause calls, page visibility suspension, game-over time, and a run ended while paused?
4. Is browser wall time suitable for future validation, or too manipulable to be useful?
5. Should timing snapshots include per-run deltas rather than cumulative clock counters?

### D. Score-event integrity

1. Is inferring event source exclusively from score delta sufficient when multiple events occur in one simulation step?
2. Can a combined `+6`, `+11`, or `+15` delta conceal its component events?
3. Can collision and scoring happen in the same update, producing a final score different from the leaderboard submission?
4. Can code outside `updateGameObjects()` modify score without being recorded?
5. Should score changes be instrumented at their authoritative source sites before any future server validation?

### E. Persistence and privacy

1. Can local storage writes exceed quota with 20 runs × 400 events?
2. Is event truncation from the beginning acceptable, or could it erase the start event and invalidate the lifecycle?
3. Should malformed storage be repaired or merely ignored?
4. Are ISO timestamps and random run IDs acceptable under the stated privacy boundary?
5. Could the debug API or console expose more data than intended?
6. Is the forbidden-field test meaningful enough, or should the schema be validated through an explicit allowlist recursively?
7. Could prototype pollution or malicious local storage content enter the runtime through parsed prior runs?

### F. Input correctness

1. Does capture-phase fast retry conflict with collision-runtime touch listeners, browser scrolling, itch.io iframe focus, or button click synthesis?
2. Can `mousedown` outside the visible game-over screen restart unexpectedly because the policy checks state rather than screen containment?
3. Should repeat keydown be ignored in the installed listener as it is in the helper?
4. Can Space restart and then immediately trigger the normal gameplay Space handler in the same event?
5. Can touch restart and synthesize a subsequent mouse event that triggers a jump in the new run?
6. Should retry require release/debounce to prevent accidental first-frame jump or multiple restarts?

### G. Dynamic module loading

1. Can telemetry fail to install because the dynamically appended scripts load after a player begins a run?
2. Can collision and telemetry modules load in different orders with incompatible prototype wrappers?
3. What happens if either module returns 404, is blocked by itch.io CSP, or loads from a blob/data origin?
4. Does using `document.currentScript` in the fixed-step bootstrap always resolve the correct relative path?
5. Should the modules be statically loaded from `index.html` before release rather than dynamically bootstrapped?

### H. Test sufficiency

Design missing tests for at least:

- mouse-surface retry
- touch-surface retry
- normal restart-button click
- Space and Enter retry
- repeat keydown
- touch-generated synthetic mouse after retry
- immediate retry before death microtask runs
- restart after a long game-over delay
- run ended while paused
- repeated pause without resume
- malformed but valid-shaped local storage content
- quota-exceeded storage
- private-browsing storage exceptions
- event-cap truncation
- 21-run retention pruning in a browser
- simultaneous score events
- score mutation outside `updateGameObjects()`
- module-load failure
- telemetry loading after a run already started
- Fold resize during game over and retry
- itch.io iframe focus behavior
- Safari and Firefox event ordering

## Required response format

Return:

1. **Verdict:** `ACCEPT`, `ACCEPT WITH REQUIRED FIXES`, or `REJECT`.
2. **P0 findings:** data corruption, new-run termination, duplicate simulation, privacy breach, or release-blocking defects.
3. **P1 findings:** likely lifecycle, score, retry, or persistence errors.
4. **P2 findings:** robustness, diagnostics, maintainability, and test gaps.
5. **Exact reproductions:** numbered steps or minimal test code.
6. **Narrow corrections:** minimal patches; do not propose a framework rewrite.
7. **Additional automated tests:** precise assertions and fixtures.
8. **Leaderboard implications:** what this evidence can and cannot prove.
9. **Release recommendation:** whether Milestone 3 may remain on the development branch and what blocks itch.io release.

For every finding, identify the relevant file, method, and failure mechanism. Distinguish verified defects from hypotheses requiring physical-device or cross-browser testing.
