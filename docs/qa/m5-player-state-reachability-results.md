# Milestone 5 Results — Player-State Reachability and Runtime Guard

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `34c0b1330515c3e40da7343efb1e28bb957949f9`  
Final implementation workflow run: `30906325023`

> **Superseded safety-margin interpretation:** The 252/252 result remains evidence that exact witnesses replayed under the Milestone 5 constant `110`-pixel gap model. It does **not** establish eight pixels of retained safety under the production per-gate breathing timeline, where spawned gaps can vary approximately from `100` to `120` pixels. The former production-facing eight-pixel safety claim is withdrawn until witnesses are generated against the real per-gate gap sequence. No pattern retuning follows from this correction.

## Scope

Milestone 5 replaces the Milestone 4 assumption that a bounded gap-position delta is sufficient evidence of fairness with a player-state reachability model that uses the actual Hexagram and Monas step rules.

The milestone:

- models the current player physics and collision window
- searches jump/no-jump schedules for named obstacle patterns
- replays every accepted witness route through an unpruned simulation
- reproduces impossible original Monas routes
- introduces measured corrections for five Monas patterns
- installs a deterministic runtime fallback for any future unverified pattern
- versions local pattern evidence with the reachability policy that produced it

It does not change scoring, level thresholds, the Void, Gnosis, leaderboard requests, or the published itch.io build.

`main` remains unchanged.

## Exact modeled rules

The solver in `tools/player-reachability.js` models the current development runtime's per-step order:

1. If a jump is requested and cooldown is zero, apply the Rite's jump impulse and reset cooldown.
2. Apply Rite-specific gravity and damping.
3. Clamp downward speed to the current maximum.
4. Update player vertical position.
5. Apply the current top clamp and bottom-death boundary.
6. Decrement jump cooldown.
7. During every frame of horizontal pillar overlap, require the effective player hitbox to remain inside the moving safe gap.

Modeled constants:

| Contract | Hexagram | Monas |
|---|---:|---:|
| Jump impulse | `-7.5` | `-7.2` |
| Gravity per step | `0.45` | `0.18` |
| Velocity damping | `1.0` | `0.98` |
| Maximum fall speed | `11` | `11` |
| Mobile cooldown | `8` | `8` |
| Desktop cooldown | `5` | `5` |

Shared geometry:

- player radius: `16`
- collision inset: `4`
- effective collision half-size: `12`
- pillar width: `45`
- pillar breathing: `sin(frame × 0.05) × 5`
- top clamp and bottom boundary use `1.5 × player radius`
- spawn cadence remains `max(20, floor(140 / (speed / 3)))`

The browser parity test drove 180 actual `Player` updates for each Rite and compared every step against the solver model under the same accepted-jump schedule.

## Search and witness policy

The solver performs a deterministic beam search over player state:

- vertical position
- vertical velocity
- cooldown
- accumulated jump witness

Jump and no-jump successors are explored whenever legal. States are deduplicated with a quantized key and bounded by a deterministic beam. An accepted route is not trusted merely because it survives the beam search: its complete jump schedule is replayed through the non-pruned model and must pass every collision-window frame.

Historical Milestone 5 classification under the constant-gap model:

| Classification | Requirement within that model |
|---|---|
| `verified` | exact witness replay succeeds with at least 8 additional pixels of safe-gap clearance |
| `marginal` | replay succeeds with 4 or 0 additional pixels but not 8 |
| `invalid` | no replayed witness survives with zero additional margin |

The eight-pixel value was additional to the existing 12-pixel effective hitbox half-size. These labels remain valid descriptions of the historical constant-gap test output only; they are not production breathing-gap safety labels.

## Original defect reproduced

The Milestone 4 normalized transition envelope did not establish dynamic reachability.

At the hard Fold-open case:

- viewport: `884 × 1104`
- Rite: Monas
- speed: `8.5`
- gap: `110`
- low anchor: `0.22`
- breathing phase: `0`

The original `monas.return-flow` route was classified `invalid`.

The wider audit also found invalid original cases involving:

- `monas.mercurial-wave`
- `monas.lunar-sweep`
- `monas.return-flow`
- `monas.serpent-current`
- `monas.caduceus-wave`

The failure was not caused by the fixed-step runtime or collision overlay. It resulted from combining tall-viewport pixel travel, Monas damping, maximum speed, minimum gap, and the original vertical pattern amplitudes.

## Corrected Monas definitions

The runtime policy in `tools/reachability-policy.js` retains every Hexagram pattern unchanged and applies measured Monas overrides:

```text
monas.mercurial-wave
[0, -0.072, -0.128, -0.064, 0.032, 0.096, 0.048]

monas.lunar-sweep
[0, -0.063, -0.126, -0.072, 0.018, 0.09, 0.036]

monas.return-flow
[0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

monas.serpent-current
[0, -0.072, -0.12, -0.048, 0.048, 0.108, 0.036, -0.036, 0]

monas.caduceus-wave
[0, -0.07, -0.126, -0.042, 0.07, 0.112, 0.028, -0.056, 0]
```

These corrections reduce high-amplitude Monas motion and lengthen the return-to-center route. The seeded pattern selection, family order, spawn cadence, Orb probability, scoring, and progression rules remain unchanged.

## Hard reachability matrix

The permanent deterministic matrix evaluates:

- all 16 named patterns
- every supported mirrored/base variant
- anchors `0.22`, `0.50`, and `0.78`
- phone hard case: `390 × 844`, mobile cooldown, speed `8.5`, gap `110`
- Fold-open hard case: `884 × 1104`, desktop cooldown, speed `8.5`, gap `110`
- Fold breathing phases `0` and `31`

Constant-gap adjusted cases:

| Historical classification | Count |
|---|---:|
| Verified | 252 |
| Marginal | 0 |
| Invalid | 0 |

Every accepted case produced a valid exact replay witness under the constant `110`-pixel gap model. The former statement that these cases established eight pixels of production safety is withdrawn because production spawns use a per-gate breathing gap timeline.

Representative patterns are additionally exercised at:

- Fold closed hard: `374 × 882`, speed `8.5`, gap `110`
- desktop hard: `1440 × 900`, speed `8.5`, gap `110`
- desktop mid: `1440 × 900`, speed `5.5`, gap `150`
- phone start: `390 × 844`, speed `2.9`, gap `200`

## Runtime guard

Policy API:

```text
window.__SEX_MAGICK_REACHABILITY_POLICY__
```

Current policy:

- mode: `verified-pattern-runtime-guard`
- version: `1`
- verified pattern IDs: `16`
- Hexagram fallback: `hex.return-to-axis`
- Monas fallback: `monas.still-point`

When the scheduler selects a currently verified pattern, it runs normally. The five measured Monas definitions receive their policy-versioned adjusted ratios.

If a future catalog pattern is absent from the verified verdict set or is explicitly marked invalid, the scheduler deterministically substitutes the Rite's fallback. The fallback is not selected probabilistically.

## Evidence versioning

Pattern evidence continues under:

```text
sex_magick_patterns_v1
```

The schema now records the policy layer that interpreted the grammar:

- `grammarVersion`
- `reachabilityPolicyVersion`
- `reachabilityVerdict`
- `reachabilityAdjusted`
- `reachabilityFallback`
- `rejectedPatternId`

This prevents a local replay record from silently conflating pre-solver and post-solver Monas behavior.

The evidence remains local, bounded, identity-free, and non-authoritative for anti-cheat purposes.

## Browser integration results

The final Chrome integration historically reported:

```text
PASS reachability browser integration
POLICY verified-pattern-runtime-guard v1
VERIFIED PATTERNS 16
HEX PARITY JUMPS 10
MONAS PARITY JUMPS 10
ORIGINAL RETURN FLOW invalid
ADJUSTED RETURN FLOW verified
ADJUSTED MARGIN 8
RUNTIME ADJUSTMENT monas.lunar-sweep
MONAS FALLBACK monas.still-point
EVIDENCE POLICY VERSION 1
```

`ADJUSTED MARGIN 8` describes the constant-gap test harness and must not be cited as a production breathing-gap guarantee.

All prior deterministic and browser suites remained green:

- fixed-step simulation
- collision and touch
- telemetry and fast retry
- deterministic obstacle grammar

## Acceptance status

Accepted for the development branch:

- exact modeled Hexagram and Monas update rules
- exact browser parity under the tested jump schedule
- full pillar-overlap collision-window checks
- deterministic state search
- exact witness replay
- reproduction of an original impossible Monas route
- five measured Monas corrections
- 252/252 exact replay witnesses under the constant `110`-pixel gap model
- deterministic fallback for future unverified patterns
- policy-versioned local pattern evidence
- no regression in Milestones 1–4

Not established by this milestone:

- eight pixels of retained safety under the production per-gate gap timeline
- a mathematical proof over the continuous state space
- reachability from every possible incoming player velocity and cooldown
- proof for every arbitrarily long cross-pattern composition
- human reaction-time or input-latency comfort
- equal subjective difficulty between Rites
- active fold/unfold remapping of already-spawned pillars
- mobile Safari, desktop Safari, or Firefox parity
- physical-device performance of the solver-derived routes
- leaderboard authenticity or anti-cheat validation

The search uses deterministic quantization and beam pruning. Exact witness replay protects accepted routes from search false positives, but search pruning can still produce false negatives. The current matrix starts each isolated pattern centered in its first gate with zero vertical velocity. Long-sequence and incoming-state coverage remain unresolved diagnostic work, not a prerequisite for the next human playtest.

## Rollback

To remove Milestone 5 while retaining Milestones 1–4:

1. Remove the `bootstrapReachabilityPolicyRuntime` block from `tools/fixed-step-prototype.js`.
2. Remove `tools/reachability-policy.js`.
3. Remove `tools/player-reachability.js` only if deterministic QA is also being retired.
4. Retain the Milestone 4 grammar and pattern evidence unchanged.

No deployment or merge was performed.