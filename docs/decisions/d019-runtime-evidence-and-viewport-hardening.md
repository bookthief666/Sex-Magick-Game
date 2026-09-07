# D-019 — Separate session evidence and viewport composition from unresolved Gate design

Date: 2026-08-04  
Status: Accepted on stacked development branch

## Decision

Freeze the Milestone 8 Gate experiment at `develop/sex-magick-2.0` and perform direction-independent runtime hardening on a separate stacked branch:

```text
develop/m9-runtime-hardening
```

Create dedicated modules for:

- viewport/device composition
- complete-session Gate evidence

Do not change Gate, Gnosis, Void, score balance, input physics, obstacle patterns, Monas, progression, leaderboards, or deployment behavior as part of this milestone.

## Context

The first owner Gate-slice report was useful but incomplete. The playtest harness reconstructed its session from the latest 20 locally stored runs, so earlier high-retry activity was lost. The same report also contained one `zone: unsafe` event counted as a successful clear. Physical Fold-closed feedback established that the real `368 × 869` viewport required treatment as a distinct composition target.

These are evidence and presentation defects. They can be corrected without deciding whether the current Gate hypothesis survives later human testing.

## Rationale

Direction-independent hardening is valuable under every plausible product path:

- current Gate slice refined
- Gate system materially redesigned
- Gate system removed in favor of a focused runner
- later Monas or challenge-route expansion

A separate branch and stacked draft PR prevent the new work from silently rewriting the frozen M8 checkpoint or further enlarging PR #1.

## Consequences

### Evidence

- session totals are retained independently of the 20-run persistence cap
- run snapshots are deduplicated by `runId`
- unsafe classifications cannot increase Gate clears or score
- unsafe crossings remain separately observable
- Gate visibility duration and movement-toward-Gate are recorded
- movement-toward is treated as a proxy, not proof of intent

### Viewport

- Fold 6 closed and open are explicit profiles
- the real recorded Fold-closed viewport is a first-class automated case
- presentation behavior is controlled by CSS variables and profile classes
- controlled playtests can force a profile through the URL
- gameplay physics and obstacle geometry remain unchanged

### Architecture

- `tools/collision-runtime.js` remains unchanged
- new responsibilities live in `tools/viewport-runtime.js` and `tools/gate-evidence-runtime.js`
- V2 playtest evidence is local-only and uses schema version 2

## Claim boundary

M9 automated success establishes that the modules execute and the reported integrity defects are corrected under the tested model.

It does not establish:

- physical readability or comfort
- conscious player intent
- Gate comprehension
- fun or replayability
- preferred input buffer
- release readiness

## Branch and review policy

- PR #1 remains the draft mainline 2.0 proposal.
- PR #2 is stacked on `develop/sex-magick-2.0` and contains only M9 changes.
- Neither PR may be merged into `main` or deployed without a later owner decision and release gate.

## Next work permitted under this decision

Direction-independent work may continue with:

- DPR-aware canvas adaptation
- asset manifest and loading hardening
- audio codec/fallback selection
- local critical fallback assets

Gate tuning, onboarding, Monas, additional Sephiroth, leaderboard work, solver expansion, and deployment remain deferred.
