# Milestone 6 Results — Compositional Reachability and Timing Robustness

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `a2acfd98f43a711eb979630767f88b56b32b44f0`  
Final implementation workflow run: `30910168271`

## Scope

Milestone 6 extends the isolated-pattern reachability work from Milestone 5 into complete pattern-family sequences and long multi-cycle runs.

The milestone adds:

- deterministic full-cycle generation through the actual policy-patched pattern scheduler
- a finite incoming-state cloud containing position, velocity, and cooldown variation
- state-set propagation across every pattern boundary
- exact witness replay over complete sequences
- deterministic sequence digests
- distributed jump-timing perturbation across the beginning, middle, and end of each witness
- a real-browser compositional integration gate

This milestone is diagnostic and QA-only. It does not alter the production gameplay loop, scoring, progression, Gnosis, leaderboard calls, pattern definitions, collision behavior, or the published itch.io build.

`main` remains unchanged.

## Implementation

Primary modules:

- `tools/compositional-reachability.js`
- `tools/compositional-robustness.js`

Permanent validation:

- `tools/test-compositional-reachability.js`
- `tools/compositional-browser-test.html`
- `tools/run-browser-compositional-test.mjs`
- `.github/workflows/qa.yml`

Dependencies:

- `tools/obstacle-grammar.js`
- `tools/reachability-policy.js`
- `tools/player-reachability.js`

Version manifest:

| Layer | Version |
|---|---:|
| Grammar | 1 |
| Reachability policy | 1 |
| Isolated solver | 1 |
| Composition solver | 1 |
| Robustness policy | 1 |

## Incoming-state cloud

Each hard sequence begins with 27 incoming states distributed around the first safe-gap center:

- vertical offsets: `-16`, `0`, `+16` pixels
- vertical velocities: `-4`, `0`, `+4`
- cooldowns: `0`, approximately half cooldown, and one frame below the Rite-specific maximum

This replaces the single centered, zero-velocity, zero-cooldown origin used by the isolated Milestone 5 matrix.

The cloud is finite and representative. It is not a proof over every continuous incoming state.

## Sequence generation and digest

The composition solver uses the actual `PatternScheduler` after Reachability Policy version 1 is installed. Therefore the generated sequence includes:

- seeded family and pattern selection
- mirrored/base variants
- measured Monas overrides
- deterministic fallback metadata
- policy version

The sequence digest is an FNV-1a 32-bit debug checksum over pattern serial, pattern ID, variant, step, normalized top ratio, policy version, adjusted flag, and fallback flag.

Representative one-cycle digests:

| Rite | Seed | Digest | Gates |
|---|---:|---|---:|
| Hexagram | `0x12345678` | `fnv1a32:2ab99f49` | 25 |
| Hexagram | `0xdecafbad` | `fnv1a32:8e732e7a` | 27 |
| Monas | `0x12345678` | `fnv1a32:53f31ffe` | 41 |
| Monas | `0xdecafbad` | `fnv1a32:59405640` | 34 |

The digest supports regression detection. It is not a cryptographic integrity mechanism or anti-cheat proof.

## State propagation

The solver propagates player states through a complete:

```text
safe → pressure → recovery → pressure → climax → recovery
```

cycle.

At each simulation frame it:

1. checks every horizontally overlapping gate using the existing breathing and collision model
2. explores legal jump and no-jump successors
3. applies the exact Rite physics model
4. deduplicates states using vertical position rounded to `0.5` pixel, velocity rounded to `0.25`, and exact cooldown
5. applies deterministic beam pruning with vertical-band preservation
6. records surviving state ranges at each pattern boundary

Any accepted final route is replayed separately through the unpruned model and must retain at least eight additional pixels of safe-gap clearance.

## Hard one-cycle matrix

The permanent matrix covers:

- both Rites
- seeds `0x12345678` and `0xdecafbad`
- phone hard: `390 × 844`, mobile cooldown, speed `8.5`, gap `110`
- Fold-open hard: `884 × 1104`, desktop cooldown, speed `8.5`, gap `110`
- breathing phases `0` and `31`
- one complete six-pattern family cycle
- 27 incoming states per case
- eight-pixel witness margin

Total cases:

| Classification | Count |
|---|---:|
| Robust candidate | 0 |
| Technically reachable but fragile | 16 |
| Invalid | 0 |

All 16 cases:

- retained at least one state through all six pattern boundaries
- produced an exact replay witness
- retained at least eight pixels of additional clearance
- preserved deterministic sequence digests

However, only one initial-state identity survived to the final winning state set in 15 cases. One Monas phone case retained two initial-state identities. This is evidence of a narrow viable incoming-state corridor under the present search and pruning policy.

## Distributed timing perturbation

The robustness layer evaluates:

- the exact base witness
- global early/late shifts of every jump by one, two, and three simulation frames
- single-jump early/late shifts by one, two, and three frames
- evenly distributed single-jump samples across the entire witness

Within the 60-case matrix budget, eight witness jumps are sampled per run. The sampler is required to include both the first and last jump, preventing the budget from being consumed only by the opening segment.

Engineering heuristics currently classify a route as a `robust-candidate` only when:

- at least 70% of distance-one cases survive, and
- at least 45% of all tested perturbations survive

These thresholds are provisional engineering criteria. They have not been validated against human players or device input-latency distributions.

Observed one-cycle perturbation survival:

| Rite/seed/scenario/phase | Overall survival | Distance-one survival |
|---|---:|---:|
| Hex `0x12345678`, phone, phase 0 | 14.5% | 22.2% |
| Hex `0x12345678`, phone, phase 31 | 14.5% | 22.2% |
| Hex `0x12345678`, Fold, phase 0 | 14.5% | 16.7% |
| Hex `0x12345678`, Fold, phase 31 | 12.7% | 22.2% |
| Hex `0xdecafbad`, phone, phase 0 | 43.6% | 61.1% |
| Hex `0xdecafbad`, phone, phase 31 | 23.6% | 38.9% |
| Hex `0xdecafbad`, Fold, phase 0 | 12.7% | 11.1% |
| Hex `0xdecafbad`, Fold, phase 31 | 16.4% | 27.8% |
| Monas `0x12345678`, phone, phase 0 | 16.4% | 22.2% |
| Monas `0x12345678`, phone, phase 31 | 20.0% | 27.8% |
| Monas `0x12345678`, Fold, phase 0 | 20.0% | 27.8% |
| Monas `0x12345678`, Fold, phase 31 | 23.6% | 27.8% |
| Monas `0xdecafbad`, phone, phase 0 | 12.7% | 16.7% |
| Monas `0xdecafbad`, phone, phase 31 | 43.6% | 61.1% |
| Monas `0xdecafbad`, Fold, phase 0 | 10.9% | 16.7% |
| Monas `0xdecafbad`, Fold, phase 31 | 18.2% | 22.2% |

The highest observed route still fell below both robustness thresholds.

## Two-cycle endurance

A separate deterministic endurance check propagates through two complete family cycles on phone hard conditions at breathing phase 31.

| Rite | Seed | Digest | Gates | Boundaries | Final states | Surviving initial identities | Jumps | Minimum clearance |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Hexagram | `0x0badf00d` | `fnv1a32:53cdfa2b` | 55 | 12 | 472 | 1 | 93 | 8.310 px |
| Monas | `0x0badf00d` | `fnv1a32:8d47292a` | 91 | 12 | 560 | 1 | 81 | 8.099 px |

Both witnesses replayed successfully. Their robustness was not promoted to a human-comfort claim.

## Browser integration

The real-browser gate loaded the actual game runtime, installed policy, isolated solver, composition solver, and distributed robustness layer in the same page.

Final Chrome output:

```text
PASS compositional reachability browser integration
MODE composition v1 robustness v1
HEX DIGEST fnv1a32:2ab99f49
HEX GATES 25
HEX BOUNDARIES 6
HEX INITIAL STATES 27
HEX SURVIVORS 295
HEX MIN CLEARANCE 8.112
HEX ROBUSTNESS technically-reachable-fragile
HEX PERTURBATION RATE 0.200
HEX COVERAGE 3/40 FIRST 0 LAST 39
MONAS DIGEST fnv1a32:53f31ffe
MONAS GATES 41
MONAS BOUNDARIES 6
MONAS INITIAL STATES 27
MONAS SURVIVORS 343
MONAS MIN CLEARANCE 8.446
MONAS ROBUSTNESS technically-reachable-fragile
MONAS PERTURBATION RATE 0.440
MONAS COVERAGE 3/35 FIRST 0 LAST 34
```

The browser test uses a 30-case budget, yielding three evenly distributed sampled jumps per witness while still requiring first/last coverage.

All previous deterministic and browser suites remained green.

## Acceptance status

Accepted for the development branch:

- complete seeded family-cycle generation through the installed runtime policy
- 27-state incoming cloud
- propagation of position, velocity, and cooldown across pattern boundaries
- exact replay of full-sequence witnesses
- eight-pixel additional clearance
- deterministic sequence digests
- 16/16 hard one-cycle cases technically reachable
- two-cycle endurance witnesses for both Rites
- distributed timing perturbation spanning first through last witness jump
- honest classification of all tested cases as fragile rather than robust
- no regression in Milestones 1–5

No gameplay retuning was accepted in this milestone.

## Critical limitations

This milestone does not establish human comfort or exhaustive fairness.

1. The 27-state incoming cloud is finite, not continuous.
2. State quantization and beam pruning can discard useful future states and create false negatives.
3. State deduplication can collapse paths from different initial states when their current quantized state is identical.
4. The selected final witness is optimized primarily for terminal target proximity, not maximum perturbation robustness.
5. Robustness measures one selected witness per case rather than searching for the most tolerant witness.
6. Sixty perturbation cases sample eight jumps across a run; not every jump is individually perturbed in the matrix.
7. Global and single-jump shifts do not model all correlated human input-error distributions.
8. Breathing phases `0` and `31` are representative, not exhaustive.
9. Two one-cycle seeds and one two-cycle seed are limited coverage.
10. Touch event latency, display presentation latency, missed taps, duplicate taps, and real-player adaptation are not modeled.
11. The 70%/45% robustness thresholds are provisional.
12. Phone-to-Fold remapping during an active sequence remains unimplemented and untested.
13. Local client evidence remains unsuitable for authoritative leaderboard validation.

## Decision produced by the evidence

The next change should not automatically flatten the obstacle patterns or increase gap size.

The current solver chooses one technically valid witness and then measures its tolerance. A different witness-selection objective may find substantially more tolerant routes through the same geometry. Therefore pattern retuning should wait until independent review determines whether to:

- optimize witness search for robustness
- expand or change the incoming-state representation
- replace beam pruning with a safer reachable-set formulation
- revise the perturbation distribution and thresholds
- or alter the gameplay patterns themselves

## Rollback

To remove Milestone 6 while retaining Milestones 1–5:

1. Remove `tools/compositional-reachability.js`.
2. Remove `tools/compositional-robustness.js`.
3. Remove `tools/test-compositional-reachability.js`.
4. Remove `tools/compositional-browser-test.html`.
5. Remove `tools/run-browser-compositional-test.mjs`.
6. Remove the corresponding syntax, deterministic, and browser steps from `.github/workflows/qa.yml`.

Because Milestone 6 does not load in the production entry point, rollback does not require a gameplay-runtime patch.

No deployment or merge was performed.