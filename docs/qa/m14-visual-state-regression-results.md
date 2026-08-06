# Milestone 14 — Deterministic Visual-state Regression Results

**Branch:** `develop/m14-visual-state-regression`  
**Base:** `0d95db0cf4c7ef577f6a30dae1048ce53336c331` (`develop/m13-cross-screen-automation`)  
**Accepted implementation and visual-baseline head:** `303af1463d2005118c46881a4a21693dc8bd59d3`  
**Enforcement workflow:** `M14 Visual-state QA`, run `31066670034`  
**Independent successful jobs:** `92505705332` and rerun `92506226199`  
**Status:** Accepted as deterministic visual-state and retry-transition regression infrastructure; keep stacked PR draft and unmerged.

## Scope

Milestone 14 adds deterministic visual-state construction, exact screenshot signatures, and deeper automated state-transition coverage. It does not alter Gate, Gnosis, Void, score balance, player physics, input-buffer behavior, collision geometry, obstacle grammar, Monas, leaderboard semantics, `main`, or the published itch.io build.

The branch adds:

- `tools/visual-state-runtime.js`
- `tests/visual-state.spec.ts`
- `tests/retry-transition.spec.ts`
- `tests/visual-baselines/m14-signatures.json`
- the `M14 Visual-state QA` GitHub Actions workflow

## Named visual states

The query-gated controller exposes seven canonical states behind `?visualQa=1`:

1. `gameplay`
2. `menu`
3. `death`
4. `retry`
5. `gate-offer`
6. `gate-bank`
7. `void`

Ordinary sessions do not install or invoke the controller.

## Exact visual reference matrix

Exact SHA-256 screenshot signatures are committed for seven states across four representative Chromium geometries:

- small phone — `320 × 568`
- Galaxy Z Fold 6 cover profile — `368 × 869`
- Galaxy Z Fold 6 inner profile — `884 × 1104`
- desktop — `1920 × 1080`

This produces **28 exact visual signatures** stored in:

```text
tests/visual-baselines/m14-signatures.json
```

The baseline is intentionally tied to the pinned Playwright Chromium/Linux CI environment. Firefox and WebKit remain part of structural state coverage but are not governed by the Chromium PNG hashes.

## Broader automated state matrix

The full workflow runs 70 tests across ten projects:

- Chromium small phone
- Chromium Android phone
- Chromium modern phone
- Chromium Fold cover
- Chromium Fold inner
- Chromium tablet
- Chromium laptop
- Chromium desktop
- Firefox desktop smoke
- WebKit mobile smoke

Required results for each successful enforcement job were:

```text
47 passed
23 intentionally skipped
70 total
```

The skips are deliberate project scoping. For example, exact Gate/Void signatures run only on the four visual-reference geometries, while the production retry transition runs across all ten projects.

## Strict repeatability evidence

The accepted baseline commit `303af1463d2005118c46881a4a21693dc8bd59d3` passed twice independently without code, dependency, workflow, or baseline changes between runs:

### Enforcement pass 1

- Workflow run: `31066670034`
- Job: `92505705332`
- Result: success
- All 28 signatures matched
- Production retry transition passed across all ten projects

### Enforcement pass 2

- Same workflow run, explicit independent job rerun
- Job: `92506226199`
- Result: success
- All 28 signatures matched again
- Production retry transition passed across all ten projects again

The second run uploaded:

- Playwright report artifact: `8954163405`
- test results and 28 PNGs artifact: `8954163834`

## Deterministic controls

Exact visual comparison required explicit control over every changing channel discovered during implementation:

- query-gated `visualQa=1` controller
- offline procedural assets
- forced CSS-pixel render density with `renderDpr=1`
- fixed wall clock
- deterministic per-page and per-state random seeds
- frozen RAF queue
- disabled CSS animations and transitions
- muted audio, SFX, and haptics
- suppressed score submission
- blocked LootLocker requests
- MutationObserver locks for leaderboard, track, FPS, audio, and upload text
- `document.fonts.ready`
- synchronous viewport and render refresh
- four consecutive matching geometry samples
- unrecorded warm-up rendering before recorded screenshots
- stable canonical player, pillar, Gate, bank, and Void geometry

These controls belong only to the QA path. They do not change ordinary game execution.

## Retry separation

The first screenshot approach mixed production restart lifecycle work into the visual frame. That made the small-phone retry screenshot vulnerable to lifecycle timing while still leaving the actual restart behavior under-specified.

Milestone 14 now separates two responsibilities:

### Production retry-transition contract

`tests/retry-transition.spec.ts` executes the real `game.restartGame()` path and verifies:

- game-over state exists before retry
- final score is `13` before retry
- state becomes `PLAYING`
- score resets to `0`
- the game-over overlay is hidden
- the visible layer returns to gameplay
- no page exception occurs

This contract runs across all ten browser/viewport projects.

### Canonical retry screenshot

The visual controller renders a normalized post-retry frame after the transition contract has been tested separately. This protects visual regression from lifecycle noise without weakening the real transition check.

## Defects found while stabilizing the visual gate

### Missing current level before menu rendering

The first menu snapshot called the production renderer before a valid current level existed. The renderer correctly failed while reading the level accent. The visual controller now establishes a prepared current level before every forced draw.

### Missing player before menu rendering

The production renderer always draws the player. Menu capture initially occurred before gameplay had created one. The deterministic sequence now initializes gameplay before returning to the canonical menu state.

### Incorrect death-state enum

The first controller draft used `GAMEOVER`; the production enum is `GAME_OVER`. The controller now uses the production value.

### Asynchronous LootLocker menu mutation

The leaderboard failure message could replace the canonical QA text after some screenshots. Visual QA now aborts LootLocker and persistently locks the dynamic text nodes.

### Repeated initialization scripts

Reinstalling the random-seed init script on the same Playwright page caused reloads to consume multiple seeded wrappers. Each page is now seeded exactly once, and each named state receives its own deterministic seed.

### Cold viewport and renderer settlement

The first navigation on some Fold geometries could capture before font, viewport, and canvas state had settled. The harness now waits for fonts, refreshes viewport/render state synchronously, and requires four identical geometry samples before capture.

### Retry lifecycle noise

The real restart transition and screenshot construction were originally conflated. They are now independently tested as described above.

## Existing M13 contracts retained

The M14 workflow continues to verify the inherited M13 contracts, including:

- viewport-profile classification
- horizontal-overflow limits
- canvas viewport coverage
- logical canvas dimensions
- eight-million-pixel backing-store limit
- `44 × 44` CSS-pixel visible-control minimums
- page-level exceptions
- major resize/orientation settlement
- BrowserStack configuration serialization

## Tooling observations

The QA-only dependency installation currently reports six npm audit findings:

```text
4 moderate
2 high
```

Milestone 14 does not claim these have been remediated. They require a separate dependency and tooling audit because upgrading Playwright or BrowserStack dependencies can change the validated browser/runtime matrix.

GitHub Actions also warns that several `actions/*@v4` actions target Node 20 and are being forced onto Node 24 by the current runner image. The test process itself remains explicitly configured for Node.js 22. This warning is not a current test failure but should be addressed in a future workflow-maintenance milestone.

## Claim boundary

Passing M14 establishes that:

- all seven named visual states can be constructed without browser exceptions
- the selected Chromium reference frames reproduce exactly in the pinned CI environment
- production retry behavior satisfies the asserted lifecycle contract across ten projects
- the inherited M13 objective layout contracts remain green

It does **not** establish:

- subjective visual quality or artistic approval
- broad device-market screenshot identity
- GPU, thermal, or battery sustainability
- physical touch latency or haptic quality
- Gate comprehension, fun, or replayability
- compatibility with future browser or font-package versions without baseline review
- release readiness

The physical Fold 6 performance matrix and human gameplay evidence remain separate gates.

## Deployment and branch protection

- PR #7 remains draft.
- No M14 commit was merged into `main`.
- No itch.io deployment occurred.
- Earlier stacked PRs remain separate and unmerged.
