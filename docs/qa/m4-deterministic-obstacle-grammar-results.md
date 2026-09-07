# Milestone 4 Results — Deterministic Obstacle Grammar

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `d9786fca34d84d27c1691016ae726a7f671756d1`  
Final implementation workflow run: `30902145938`

## Scope

Milestone 4 replaces independent random pillar placement with a seeded, named obstacle grammar while preserving the existing simulation clock, spawn cadence, gap progression, pillar movement, collision rules, scoring values, level thresholds, Void behavior, and leaderboard calls.

`main` and the published itch.io build remain unchanged.

## Prior behavior

The original spawn path created one independent `Pillar` whenever the existing frame cadence elapsed. Each pillar selected its vertical position independently with `Math.random()`. Rotation, ornament, mobile warning, Orb chance, and Orb phase were also random. There was no sequence memory, named pattern, run seed, deterministic replay, transition constraint, or pattern evidence.

## Integrated runtime

`tools/fixed-step-prototype.js` now bootstraps:

- `tools/collision-runtime.js`
- `tools/run-telemetry.js`
- `tools/obstacle-grammar.js`

The obstacle runtime installs once through:

```text
Game.prototype.__obstacleGrammarRuntimeInstalled
```

Runtime diagnostics are exposed through:

```text
window.__SEX_MAGICK_PATTERNS__
```

## Seed and replay policy

Each run receives a deterministic 32-bit pattern seed derived from:

- the current local run ID
- the selected Rite
- obstacle grammar version 1

The seed is not an account identifier and is never transmitted.

For QA or local reproduction, the next run seed can be forced through:

```text
?patternSeed=<integer>
```

or:

```javascript
window.__SEX_MAGICK_PATTERNS__.setNextSeed(seed)
```

Given the same grammar version, seed, Rite, viewport height, gap values, and Orb probability, the scheduler reproduces the same:

- pattern IDs and variants
- vertical ratios
- pillar tops
- Orb decisions and Orb phases
- pillar ornament indices
- warning decisions
- pattern-family order

## Pattern-family pacing

The scheduler advances through this fixed family cycle:

```text
safe → pressure → recovery → pressure → climax → recovery
```

A family can contain multiple named patterns. Seeded selection chooses among the available patterns and optional mirrored variants while avoiding an immediate repeat when the family has alternatives.

### Hexagram vocabulary

Hexagram emphasizes regular, stepped, axial, and quadrantal movement:

- `hex.axis-hold`
- `hex.gentle-step`
- `hex.staircase`
- `hex.ascending-triad`
- `hex.return-to-axis`
- `hex.square-breath`
- `hex.cross-quadrants`
- `hex.lightning-flash`

### Monas vocabulary

Monas emphasizes wave, orbit, return-flow, and serpentine movement:

- `monas.soft-orbit`
- `monas.still-point`
- `monas.mercurial-wave`
- `monas.lunar-sweep`
- `monas.return-flow`
- `monas.orbit-settle`
- `monas.serpent-current`
- `monas.caduceus-wave`

This is the first mechanical distinction in obstacle sequencing between the two Rites. It does not yet change their score formula, progression thresholds, or resource economy.

## Transition envelope

Gap positions are expressed as normalized ratios within the usable vertical pillar range.

Current bounds:

| Contract | Value |
|---|---:|
| Minimum top ratio | 0.22 |
| Maximum top ratio | 0.78 |
| Maximum consecutive ratio delta | 0.18 |

Every named pattern begins at the preceding gate's ratio. This prevents a hidden discontinuity when one pattern ends and another begins.

The ratio maps responsively into the current viewport and current gap size. New pillars therefore use the active phone, Fold, or desktop dimensions rather than fixed pixels.

### Critical limitation

The 0.18 envelope is a geometric pacing constraint, not a proof of dynamic solvability. It does not by itself establish that every sequence is beatable under:

- Hexagram gravity and jump impulse
- Monas gravity, damping, and jump impulse
- every game speed
- every gap size
- every screen posture
- real human input latency

Formal trajectory checks, physical playtesting, and strongest-available Opus review remain required before release.

## Spawn-cadence preservation

The existing cadence remains authoritative:

```text
max(20, floor(PILLAR_SPAWN_BASE / (gameSpeed / 3)))
```

The grammar intervenes only on frames where the legacy game would have spawned a normal pillar. No pillar is generated at frame zero, and Void mode continues to suppress normal pillar spawning.

The prior `updateGameObjects()` remains responsible for:

- obstacle movement
- collision
- gate score
- Orb collection
- Void collectibles
- particles
- level checks
- object cleanup

The grammar temporarily suppresses only the legacy random pillar creation while invoking that existing update path.

## Randomness isolation

Gameplay-authoritative obstacle decisions use the per-run seeded generator.

The runtime still constructs one legacy `Pillar` and consumes the legacy Orb-related global random draws before replacing the authoritative values. This limits unintended changes to unrelated global `Math.random()` consumers such as visual effects.

Seeded fields include:

- pattern and mirrored variant
- vertical ratio
- Orb presence and Orb phase
- pillar rotation
- inner ornament
- mobile warning

Cosmetic particles, screen effects, and other unrelated visuals remain non-deterministic.

## Pattern evidence

Pattern evidence is stored locally under:

```text
sex_magick_patterns_v1
```

It is separate from the Milestone 3 run-summary schema, but every record is linked by the same local run ID.

Retention:

- latest 20 completed pattern runs
- maximum 300 spawn events per run
- oldest runs and events pruned first
- active pattern run kept in memory

Each spawn event records:

- local run ID through its parent record
- seed and Rite
- frame and score
- spawn index
- pattern serial, ID, base ID, family, and variant
- pattern step and length
- normalized top ratio and mapped pixel top
- current gap
- Orb presence

It does not record or transmit:

- LootLocker player IDs
- session tokens
- names or email
- user agent
- IP address
- device or advertising IDs

## Debug interface

Pressing `P` toggles the local pattern panel.

It can also be enabled with:

```text
?patterns=1
```

The panel displays:

- seed and Rite
- spawn count and family cursor
- last pattern ID and family
- step within the pattern
- vertical ratio and Orb decision
- recent pattern-run count

## Deterministic test results

Passed:

- pattern catalog completeness for every family and Rite
- pattern boundary anchoring
- transition-envelope validation
- same-seed, same-Rite exact replay
- different-seed divergence
- Hexagram/Monas grammar divergence
- seeded generator range
- 300 generated gates per Rite within ratio and viewport bounds
- family-cycle order
- no consecutive climax families
- mirrored pattern materialization
- responsive phone/Fold vertical mapping
- preserved spawn-rate formula
- no frame-zero spawn
- Void suppression
- 20-run retention
- 300-event retention
- malformed storage fallback
- absence of account and device identifiers

## Integrated Chrome results

The browser test loaded the real production path at a 390 × 844 emulated viewport, blocked optional external services, and executed three complete synthetic pattern runs:

1. Hexagram with seed `305419896`
2. Hexagram replay with the same seed
3. Monas with the same seed

Verified results:

| Contract | Result |
|---|---|
| Hexagram gates generated | 72 |
| Hexagram replay gates | 72 |
| Monas gates generated | 72 |
| Same-seed Hexagram replay | Exact match |
| Same-seed Rite divergence | Passed |
| Hexagram maximum delta | 0.180 |
| Monas maximum delta | 0.160 |
| Allowed envelope | 0.180 |
| Family cycle | `safe > pressure > recovery > pressure > climax > recovery` |
| Pattern evidence runs | 3 |
| Run telemetry summaries | 3 |
| Pattern/telemetry run IDs | Exact match |
| Pending RAF callbacks | 1 |
| Forbidden persisted fields | 0 |
| Debug panel | Passed |

The previous fixed-step, collision/touch, and telemetry/fast-retry suites remained green.

## Acceptance status

Accepted for the development branch:

- named Hexagram and Monas pattern catalogs
- seeded deterministic pattern scheduling
- exact same-seed replay
- preserved normal-pillar spawn cadence
- bounded vertical transitions
- explicit safe/pressure/recovery/climax pacing
- responsive top mapping
- deterministic Orb and pillar decisions
- local pattern evidence linked to local run telemetry
- bounded identity-free retention
- one RAF chain and no prior-milestone regression

Not yet accepted for release:

- proof of dynamic solvability
- physical 60/120 Hz playtesting
- Hexagram versus Monas difficulty equivalence
- high-speed and minimum-gap endurance runs
- Fold closed/open and live fold-transition tests
- mobile Safari and desktop Safari/Firefox testing
- real input-latency testing
- subjective quality of family pacing
- Orb-economy effects from deterministic placement
- leaderboard replay or validation semantics

## Rollback

To remove Milestone 4 while retaining Milestones 1–3:

1. Remove `bootstrapObstacleGrammarRuntime` from `tools/fixed-step-prototype.js`, introduced by commit `057908a95249d573f7e8543eee0c495f5983a9b2`.
2. Remove `tools/obstacle-grammar.js`.
3. Remove `sex_magick_patterns_v1` only if local QA history should also be discarded.
4. The deterministic and browser tests may remain without affecting gameplay if they are removed from the required workflow.
