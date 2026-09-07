# D-018 — Implement the Gate hypothesis as a quarantined opt-in slice before release validation

Date: 2026-08-04  
Status: Accepted for development experiment only

## Decision

Implement the Hexagram Gnosis/Gate/Void hypothesis behind the explicit development query:

```text
?gateSlice=1
```

Do not replace the ordinary branch game, merge the draft PR, or deploy the slice. Preserve both input-buffer candidates. Keep all Gate behavior in a dedicated module rather than expanding `tools/collision-runtime.js`.

## Context

The independent Opus review and subsequent adjudication concluded that the project had built substantial fairness infrastructure without implementing the core player-facing wager loop. The preferred sequence was to complete the R-1 physical input test first.

The owner later explicitly directed development to continue while currently having access only to one Samsung Galaxy Z Fold 6. That direction authorizes implementation of the slice, but it does not convert missing human evidence into acceptance evidence.

## Rationale

A quarantined implementation lets the owner experience and measure the actual design hypothesis without altering the control build or live release. It is more informative than another solver milestone and remains reversible because it is loaded only by query.

The quarantine must be real:

- no normal-mode behavior change without the query
- Hexagram only
- Monas sealed inside the slice
- global leaderboard hidden
- no LootLocker guest session, fetch, or submission
- local bounded evidence only
- no deployment

## Consequences

The slice now contains:

- four ordered bands
- marked risk zones
- Gnosis earned through risk-zone clears
- Gnosis decay after repeated center clears
- a physical Gate with enter-versus-bypass resolution
- banking
- lethal transformed Void
- local score-source and decision evidence
- a local playtest harness

The implementation is eligible for owner and formative playtesting, not for release.

## Claim boundary

Automated acceptance means only that the state transitions, browser integration, local-only boundary, and pre-existing regressions pass.

It does not establish:

- fun
- comprehension
- fair Gate placement
- correct input-buffer value
- correct balance constants
- replayability
- audience appeal
- release readiness

The primary human design signal remains Gate entry rate between 25% and 75%, considered together with comprehension, intentionality, reported feel, and voluntary replay.

## Architecture consequence

`tools/gate-slice-runtime.js` owns the experiment. No new Gate responsibility may be added to `tools/collision-runtime.js`.

Before expansion beyond this slice—especially Monas, additional Sephiroth, or broader progression—the collision/input/accessibility/presentation god-module must be decomposed.

## Deployment

None. `main` remains protected, PR #1 remains draft, and itch.io remains unchanged.
