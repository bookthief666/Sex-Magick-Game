# D-024 — Use deterministic visual-state construction and separate transition truth from screenshot truth

**Date:** 2026-08-05  
**Status:** Accepted on stacked development branch

## Decision

Add a query-gated deterministic visual-state controller and exact Chromium screenshot-signature baseline for representative small-phone, Fold-cover, Fold-inner, and desktop geometries. Preserve broader Firefox, WebKit, phone, tablet, laptop, and desktop structural state checks without claiming that exact Chromium/Linux image bytes are portable to every browser or operating system.

Test the real production retry transition independently from the canonical retry screenshot. The lifecycle contract must execute `game.restartGame()` and verify state, score, overlay, and visible-layer restoration. The screenshot contract may render a normalized post-retry frame only after the real transition is separately protected.

## Rationale

Milestone 13 proved objective loading, layout, touch-target, canvas, and real-browser smoke contracts, but it could not detect regressions where a valid state still rendered with displaced HUD, altered overlay composition, missing Gate geometry, or a visually incorrect post-retry frame.

Direct screenshots of the live runtime were not sufficiently deterministic. The implementation process exposed asynchronous leaderboard text, cold viewport settlement, repeated RNG wrappers, font readiness, dynamic rendering, and restart lifecycle timing as independent sources of image drift. Exact regression testing is useful only when those channels are controlled explicitly rather than hidden behind a broad pixel tolerance.

The retry transition also demonstrated that behavioral truth and screenshot truth are related but distinct. A stable picture does not prove that the actual restart path works, and executing the complete restart lifecycle inside every screenshot introduces timing noise unrelated to the desired reference frame.

## Consequences

- `?visualQa=1` remains a QA-only entry condition.
- Ordinary sessions do not install or invoke the visual controller.
- Seven canonical states are named: gameplay, menu, death, retry, Gate offer, Gate bank, and Void.
- Twenty-eight exact SHA-256 signatures are committed for four Chromium reference geometries.
- The accepted baseline must pass at least two independent enforcement runs on the same code, dependency, workflow, and baseline inputs before adoption.
- Firefox and WebKit continue structural state testing but do not inherit Chromium/Linux exact hashes.
- Dynamic text, wall clock, randomness, animation, audio, haptics, LootLocker, fonts, viewport state, canvas state, and warm-up rendering are controlled in the QA path.
- Every named state must satisfy its own renderer preconditions; `menu` may be the first request on a fresh controller and establishes a valid player without a prior harness priming step.
- `visualQa=1` installs a parser-time local-only leaderboard preflight, and the browser contracts fail if any LootLocker request is initiated.
- The production restart path is tested across all ten Playwright projects independently of the canonical retry screenshot.
- Baseline updates require an explicit reviewed commit; the test must never silently update hashes.
- A green visual gate does not establish subjective art quality, physical-device performance, Gate comprehension, fun, or release readiness.

## Accepted evidence

Implementation and baseline head:

```text
303af1463d2005118c46881a4a21693dc8bd59d3
```

Workflow:

```text
M14 Visual-state QA
Run 31066670034
```

Independent successful jobs:

```text
92505705332
92506226199
```

Each successful job produced:

```text
47 passed
23 intentionally skipped
70 total
```

All twenty-eight signatures and all ten production retry-transition projects passed in both jobs.

Strengthened invariant enforcement:

```text
Head 4227a754bc9d2983cc6ddc76c51098c416c8aa09
Run 31072483297
Job 92523107905
57 passed
23 intentionally skipped
80 total
```

The strengthened run proved fresh-controller menu-first rendering across all ten projects, asserted zero LootLocker requests and zero page/console errors, and reproduced all twenty-eight accepted signatures without baseline changes.

## Revisit when

- the pinned Playwright browser or Linux runner image changes
- fonts or rasterization packages change
- a supported visual state is added or intentionally redesigned
- a non-Chromium exact baseline becomes valuable enough to justify its maintenance cost
- the visual controller begins obscuring rather than isolating production behavior
- QA dependency audit findings require a Playwright or BrowserStack upgrade

## Full record

`docs/qa/m14-visual-state-regression-results.md`
