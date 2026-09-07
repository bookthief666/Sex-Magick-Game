# Milestone 1 Results — Refresh-Rate-Independent Simulation

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Initial integrated runtime commit: `f65b17a3d4857508f2b956dc288c9bde25972e9d`  
Runtime semantic cleanup: `86eb41d054bfec95ba620ed38eeeb89e9ad78a34`  
Browser harness cleanup hardening: `aedaf5300554c6e59794d8c6e836067ceda3c8d0`  
Deterministic timing-fixture correction: `a046c68a4dcf44eb840b162c190ae2c1681418ee`

## Scope

Milestone 1 replaces render-frame-authoritative gameplay timing with a capped 60 Hz fixed-step simulation on the development branch.

The existing score formula, movement constants, obstacle rules, collision rules, level thresholds, Gnosis/Orb values, Void values, and Rite physics were not redesigned in this milestone.

`main` and the published itch.io build remain unchanged.

## Production-path integration

`index.html` now loads the following modules after the existing game classes are defined and before `DOMContentLoaded` creates the `Game` instance:

- `tools/fixed-step-clock.js`
- `tools/fixed-step-prototype.js`

Despite the retained historical filename, the second module now identifies itself as `fixed-step-runtime` and installs only once through `Game.prototype.__fixedStepRuntimeInstalled`.

## Runtime policy

- authoritative simulation step: `1000 / 60` milliseconds
- maximum catch-up work: five simulation steps per rendered frame
- frame gap treated as suspension: greater than 250 milliseconds
- excess catch-up time: dropped and recorded rather than processed without bound
- render frequency: remains browser-controlled
- score calculation: unchanged
- pause/resume and restart: one tracked pending `requestAnimationFrame` chain

## Deterministic scheduler results

The pure scheduler test passed for:

- 60 Hz
- 90 Hz
- 120 Hz
- 144 Hz
- capped catch-up after a 150 ms stall
- five-second suspension reset
- backwards timestamps
- dropped-time accounting

## Headless Chrome A/B results

The browser integration test executes the actual `index.html` game classes. Optional external services are blocked so results do not depend on Google Drive, jsDelivr, Google Fonts, Tailwind CDN, or LootLocker.

The player update and death behavior are neutralized only for controlled timing measurement. Random Orb generation is disabled in this specific timing fixture because an Orb pickup deliberately applies three frames of hit stop; leaving it random made an exact baseline frame-count assertion nondeterministic. Orb and hit-stop behavior remain unchanged in the game and require separate gameplay tests.

Obstacle spawning, travel, gate-score events, and the real game-loop lifecycle continue to execute.

### Ten-second controlled run

| Mode | Render schedule | Authoritative simulation frames | Score | Remaining obstacles |
|---|---:|---:|---:|---:|
| Fixed-step | 60 Hz | 601 | 1 | 4 |
| Fixed-step | 90 Hz | 601 | 1 | 4 |
| Fixed-step | 120 Hz | 601 | 1 | 4 |
| Fixed-step | 144 Hz | 601 | 1 | 4 |
| Original baseline | 60 Hz | 601 | 1 | 4 |
| Original baseline | 120 Hz | 1201 | 5 | 3 |
| Original baseline | 144 Hz | 1441 | 7 | 4 |

This confirms both sides of the defect:

1. The original game performs more gameplay work and produces more score opportunity as render frequency rises.
2. The fixed-step runtime preserves the existing 60 Hz step count while keeping simulation and score opportunity constant at 90, 120, and 144 Hz.

## Lifecycle results

Passed:

- fifty rapid pause/resume cycles retained exactly one pending RAF callback
- fifty consecutive restarts retained exactly one pending RAF callback
- a pending callback firing while paused terminated the chain without rescheduling
- resume created exactly one new RAF chain
- a simulated one-second background gap advanced zero gameplay steps
- suspension reset count incremented once
- the game resumed with one pending RAF callback

## Responsive results

Passed in headless Chrome emulation:

- 390 × 844 phone viewport: canvas matched viewport
- 884 × 1104 Fold-open viewport: canvas remapped after resize
- both Rite controls remained present

These checks establish layout mechanics only. They are not a substitute for physical Samsung Fold 6 touch, posture, thermal, or audiovisual testing.

## Automation

The repository now runs on every development push and pull request:

- timing-script syntax checks
- deterministic scheduler tests
- actual headless Chrome integration tests

The browser runner retries Chrome profile deletion so cleanup cannot hide or replace a gameplay assertion failure. The timing fixture removes Orb randomness so refresh-rate assertions measure the same deterministic gate-and-obstacle scenario on every run.

## Acceptance status

Accepted for the development branch:

- fixed-step simulation architecture
- 60 Hz compatibility baseline
- 60/90/120/144 Hz simulation consistency
- bounded catch-up
- suspension policy
- pause/resume and restart RAF invariants
- production-path loading from `index.html`

Still required before itch.io release:

- subjective movement and game-feel comparison on physical 60 and 120 Hz displays
- real Hexagram and Monas jump-arc tests
- Orb pickup and hit-stop equivalence across refresh rates
- real collision and death transitions during catch-up
- Android Chrome smoke test
- Samsung Fold 6 closed/open posture and touch test
- desktop Safari and Firefox smoke tests
- mobile Safari smoke test
- visual-effect intensity comparison across refresh rates
- audio transition testing
- real itch.io iframe test

## Rollback

Revert commit `f65b17a3d4857508f2b956dc288c9bde25972e9d` to remove the runtime script loading from `index.html`. The scheduler, tests, audit, and QA harness may remain without affecting the shipped game.
