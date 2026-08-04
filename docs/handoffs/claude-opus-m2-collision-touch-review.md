# Claude Opus Review Handoff — Milestone 2 Collision and Touch Runtime

## Review target

Repository: `bookthief666/Sex-Magick-Game`  
Branch: `develop/sex-magick-2.0`  
Exact tested implementation head: `ebd43083f688cfafee0aacf7a5bcf4524b4ffcb9`  
Base branch: `main`  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`

Do not review an unpinned moving branch. Check out the exact tested implementation head above.

## Role

Act as an adversarial senior game-engine, browser-input, Canvas 2D, and QA reviewer. Your task is to find correctness defects, fairness regressions, lifecycle hazards, and cross-browser risks—not to praise the implementation or propose broad redesigns.

## Context

SEX MAGICK is currently a single-page Canvas game. Milestone 1 replaced render-frame-authoritative gameplay with a capped 60 Hz fixed-step runtime. Milestone 2 addresses:

1. mismatch between visible pillar silhouettes and rectangular collision geometry
2. invisible lower-40-percent-only mobile touch input
3. duplicate jump haptic ownership
4. death transitions occurring inside multi-step fixed-step catch-up

The live itch.io build and `main` are unchanged.

## Primary files

Review these in full:

- `index.html`
- `tools/fixed-step-clock.js`
- `tools/fixed-step-prototype.js`
- `tools/collision-runtime.js`
- `tools/test-collision-runtime.js`
- `tools/browser-collision-test.mjs`
- `tools/run-browser-collision-test.mjs`
- `tools/browser-fixed-step-test.mjs`
- `.github/workflows/qa.yml`
- `docs/qa/m2-collision-touch-results.md`

## Intended invariants

### Collision

- The player collision box is the visual radius inset by `CONFIG.HITBOX_OFFSET`.
- Pillars have canonical top, bottom, and gap rectangles.
- Overlap requires penetration; edge contact alone is safe.
- Top pillar artwork must never enter the safe gap.
- Bottom pillar artwork must never enter the safe gap.
- Rendering and collision use the same `top`, `gap`, `x`, and `w` values.
- A collision during a multi-step catch-up causes exactly one death transition.
- Once death changes the state, no later step in that same catch-up performs gameplay work.

### Touch input

- Any non-control touch during active gameplay requests a jump regardless of vertical position.
- Buttons, labels, inputs, links, and role-button elements do not request jumps.
- Gameplay touches prevent default behavior to suppress synthetic mouse duplication.
- Control touches are not prevented, preserving click synthesis.
- The legacy lower-40-percent handler is stopped in capture phase.
- The visual mobile instruction does not intercept touch.

### Feedback

- `Player.jump()` owns accepted-jump SFX and haptic feedback.
- `Game.playerJump()` dispatches to `Player.jump()` once and emits no second haptic.
- Cooldown-rejected input emits no outer haptic.

### Debugging

- `H` toggles the overlay.
- `?hitboxes=1` or a hash containing `hitboxes` enables it at load.
- Overlay rendering must not mutate simulation state.

## Automated evidence already obtained

The final workflow run against the tested implementation head passed:

- syntax checks
- deterministic fixed-step tests
- deterministic collision, rendered-edge, and input tests
- 60/90/120/144 Hz fixed-step Chrome integration
- collision and touch Chrome integration at 390 × 844

The browser collision test verified:

- safe gap is non-colliding
- top and bottom penetration collide
- exact boundary contact is safe
- upper-screen touch jumps once
- pause-button touch does not jump
- gameplay touch is prevented
- control touch is not prevented
- debug API is active
- five-step catch-up produces one death and one obstacle update
- final state is `gameover`

These tests are evidence, not proof. Look for untested failure modes.

## Required adversarial questions

Evaluate each question explicitly.

1. Can the dynamic collision-module bootstrap race with `DOMContentLoaded`, the `Game` constructor, or a user starting a run immediately?
2. Can the capture-phase `touchstart` listener break scrolling, accessibility activation, synthetic click generation, pause/resume, settings controls, or browser gestures?
3. Does `Element.closest()` correctly exclude nested SVG/icon content inside controls in all target browsers?
4. Can pointer events, stylus events, touch-action CSS, or hybrid touchscreen laptops bypass or duplicate the intended policy?
5. Does stopping immediate propagation on a control touch suppress any required third-party or game listener?
6. Are all drawn pillar path points—including stroke width, joins, shadows, and warning fills—truthful relative to collision geometry?
7. Can breathing animation or viewport resize make `top`, `baseTop`, gap rectangles, and artwork disagree for a frame?
8. Does using `window.innerHeight` in pillar collision ever disagree with `canvas.height`, itch.io iframe sizing, browser UI collapse, device pixel ratio, or Fold posture changes?
9. Can zero-height or clamped pillar rectangles create false positives or unreachable gaps?
10. Does the strict-overlap edge policy create tunneling or inconsistent near-miss outcomes at higher game speeds?
11. Can multiple fixed steps in one render cross an obstacle without detecting collision because only discrete positions are tested?
12. Can `gameOver()` side effects or state values permit a second death inside one catch-up?
13. Does overriding `Game.prototype.playerJump` affect keyboard, mouse, touch, pause, restart, or future Rite-specific feedback?
14. Is `Player.jump()` definitely the correct sole owner for feedback, including cooldown and future accessibility settings?
15. Can the debug overlay leak into production, affect performance, corrupt Canvas state, or throw when the game is not playing?
16. Are the tests overly coupled to implementation details or capable of passing while the shipped path is broken?
17. Are external-service blocking and mobile emulation hiding any load-order, iframe, or input failures that would appear on itch.io?
18. What additional physical-device tests are mandatory before release?

## Scope constraints

Do not recommend:

- framework migration
- broad art redesign
- leaderboard replacement
- scoring redesign
- new monetization systems
- unrelated code cleanup

Only recommend changes necessary to make collision, input, feedback, and fixed-step death transitions correct and release-safe.

## Required response format

Return:

1. **Verdict:** approve, approve with non-blocking concerns, or request changes
2. **Blocking findings:** ordered by severity, each with exact file/function references
3. **Non-blocking findings**
4. **Invariant analysis:** collision, touch, feedback, debug, fixed-step death
5. **Test gaps:** exact additional automated tests
6. **Physical-device matrix:** minimum release tests
7. **Minimal patch plan:** smallest safe changes only
8. **Merge recommendation:** whether Milestone 2 may remain accepted on the development branch

For every finding include:

- failure mechanism
- user-visible consequence
- reproducible scenario
- affected browsers/devices
- smallest credible correction
- regression test that should accompany the correction
