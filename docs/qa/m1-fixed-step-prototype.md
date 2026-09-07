# Milestone 1 — Fixed-Step Simulation Prototype

Status: branch-only prototype; not production-integrated  
Date: 2026-08-04  
Branch: `develop/sex-magick-2.0`  
Prototype source commit: `f40a7c3b6288bdaf8f41c2b337e494e7f6d57ba7`

## Purpose

Correct the P0 competitive and gameplay defect where movement, obstacle travel, spawning, timers, and score opportunity advance once per rendered frame. The target is a stable 60 Hz authoritative simulation that renders independently at 60, 90, 120, or 144 Hz while preserving the existing approximate 60 Hz feel.

This milestone intentionally does not modify `index.html`. It provides a reversible A/B prototype that patches the real `Game` class after page load through a same-origin playtest harness.

## Files added

- `tools/fixed-step-clock.js`
  - reusable fixed-step accumulator
  - 60 Hz default step
  - five-step catch-up cap
  - 250 ms background/suspension reset threshold
  - dropped-time and suspension diagnostics
- `tools/fixed-step-prototype.js`
  - replaces `Game.prototype.gameLoop` only in the playtest frame
  - moves gameplay-authoritative loop work into fixed simulation steps
  - prevents parallel RAF chains with one tracked pending request
  - exposes `window.__SEX_MAGICK_TIMING__` snapshots
- `tools/test-fixed-step-clock.js`
  - deterministic scheduler tests
- `tools/fixed-step-playtest.html`
  - A/B selector for unmodified baseline versus fixed-step prototype
  - phone, Fold, landscape, and desktop viewport presets
  - error/rejection logging
  - timing snapshots

## Authoritative behavior moved to fixed steps

The prototype advances these existing systems at 60 simulation steps per second:

- `frames`
- hit-stop countdown
- random gameplay-loop glitch trigger cadence
- Void countdown and exit
- tunnel offset used by the existing game loop
- `updateGameObjects()` and therefore:
  - pillar spawning
  - obstacle movement
  - collision checks
  - gate scoring
  - Orb movement and collection
  - Pentagram movement and collection
  - player gravity, damping, velocity, and position
  - jump cooldown
  - particle lifetime updates that currently occur inside `updateGameObjects()`
  - level threshold checks

The score formula remains unchanged:

- passed pillar: `+1`
- Orb: `+5`
- Void Pentagram: `+10`

## Cosmetic behavior intentionally still render-timed

The prototype does not yet migrate every visual-only update inside `drawScene()`, including some star, background-particle, flash, shake, and glitch decay behavior. Those effects may still animate differently at different render refresh rates, but they do not currently alter collision, scoring, obstacle generation, or player physics.

Before production integration, review whether any render-timed effect creates unacceptable visual intensity or obscures hazards at high refresh rates.

## Scheduler policy

- Fixed step: `1000 / 60` ms.
- Maximum catch-up: five simulation steps in one rendered frame.
- Long suspension: a raw frame gap greater than 250 ms resets accumulated time and performs no catch-up burst.
- Excess accumulated whole steps after the cap are dropped while preserving the fractional remainder.
- Backwards or duplicate timestamps produce a zero delta.
- A tracked RAF identifier prevents pause/resume or rapid restart from starting a second scheduling chain.

## Automated validation performed

Environment:

- Node.js `v22.16.0`

Commands:

```bash
node --check tools/fixed-step-clock.js
node --check tools/fixed-step-prototype.js
node --check tools/test-fixed-step-clock.js
node tools/test-fixed-step-clock.js
```

Result:

```text
fixed-step-clock: all tests passed
```

Verified by the deterministic test:

- approximately 600 simulation steps over ten seconds at simulated 60 Hz
- approximately 600 simulation steps over ten seconds at simulated 90 Hz
- approximately 600 simulation steps over ten seconds at simulated 120 Hz
- approximately 600 simulation steps over ten seconds at simulated 144 Hz
- a five-second suspension produces no catch-up simulation steps
- a 150 ms stall executes no more than five steps and records dropped time
- backwards timestamps produce no simulation step

## Not yet verified

The following require an actual browser and are not claimed as passing:

- dynamic script injection against the real page in Chrome, Safari, or Firefox
- top-level lexical access to `Game`, `GameState`, `CONFIG`, `GlitchFX`, and `game` in every target browser
- exact jump-arc equivalence with the original 60 Hz build
- obstacle travel and spawn equivalence in real gameplay
- pause/resume and rapid restart behavior under real RAF scheduling
- hidden-tab behavior in each browser
- mobile and Fold touch behavior
- audiovisual behavior at high refresh rates
- score-opportunity equivalence during real runs

## Manual A/B procedure

Serve the repository over HTTP rather than opening files directly:

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/tools/fixed-step-playtest.html
```

For both `Unmodified branch baseline` and `Fixed-step prototype`:

1. Record browser, OS/device, display refresh rate, viewport, and Rite.
2. Start Hexagram and compare one-jump apex, fall time, and input response.
3. Observe obstacle travel over ten seconds.
4. Count pillar spawns over sixty seconds where practical.
5. Pause for five seconds and resume.
6. Switch tabs for ten seconds and return.
7. Restart at least ten times and watch for accelerated or duplicate loops.
8. Enter and exit Void; record real duration.
9. Repeat with Monas.
10. In fixed mode, capture the timing snapshot and retain it with console errors and a screen recording.

## Promotion acceptance criteria

Do not integrate the prototype into `index.html` until:

- the patch injects and runs without console errors in desktop Chrome
- a 60 Hz browser run remains recognizably equivalent to baseline movement
- 60 and 120+ Hz jump apex time, fall time, obstacle travel, spawn cadence, and Void duration differ by no more than approximately ±2%
- a ten-second hidden-tab interval causes no lethal catch-up burst
- pause/resume and fifty restarts do not create parallel RAF loops
- both Rites remain playable
- score events remain unchanged
- independent Claude Opus review identifies no blocking lifecycle or timing defect

## Rollback

The production game has not been changed. Remove these four prototype files, or close the draft PR, to return to the exact shipped baseline.
