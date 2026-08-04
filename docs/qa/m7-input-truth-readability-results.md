# Milestone 7 Results — Input Truth, Readability, and Review Corrections

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Opus review target: `1d374dea03941426ecd224330275aa05668b7d86`  
Player-facing implementation head with full legacy QA: `d086658e959288ff2136203ee602a1c62261aae1`  
Full legacy QA workflow run: `30917555952`  
Diagnostic implementation and one-time audit head: `2c9f209f5b5acee8f6dd883bac5bce6eeeda99d5`  
One-time Milestone 7 audit workflow run: `30918191676`

## Scope

Milestone 7 is the final foundation milestone before the Hexagram Gate/Gnosis/Void vertical slice.

It addresses the highest-value findings from the independent Opus 5 whole-project review:

- accepted taps could be silently discarded during jump cooldown
- gameplay-critical player and hazard colors could converge
- reduced-motion and low-flash controls did not exist
- a major phone/Fold posture change resized the active game without a safe transition
- the reachability correction policy could fail open
- Milestone 6 called an eight-pixel safety-retention rate ordinary survival
- the published initial-state diversity count was corrupted by state deduplication
- the solver used a constant 110-pixel gap while production gate gaps can approach 100 pixels
- heavy reachability audits ran on every development push

This milestone does **not** alter score rules, Gnosis, Void, Tree-of-Life order, Rite availability under normal loading, leaderboard calls, pattern definitions, or the published itch.io build.

`main` remains unchanged.

## Input truth

The existing collision runtime now owns a bounded jump-intent policy.

Default development contract:

| Input condition | Result |
|---|---|
| Cooldown is zero | Jump fires immediately |
| Cooldown has 1–3 steps remaining | One jump intent is queued |
| Queued intent reaches the first legal step | Jump fires once |
| Another tap arrives while one intent is pending | Tap is coalesced; no second latent jump |
| Cooldown has more than 3 steps remaining | Input is rejected with a quiet cue and visible `WAIT` feedback |
| Pending intent cannot fire in its bounded window | Intent expires with `MISSED` feedback |
| Pause, death, restart, or new Player instance | Pending state is cleared by lifecycle replacement or non-playing state |

The default buffer is three simulation steps, or approximately 50 ms at the authoritative 60 Hz simulation rate. It is bounded to a maximum of six steps and can be varied in development through:

```text
?inputBuffer=0
?inputBuffer=3
?inputBuffer=4
?inputBuffer=6
```

The runtime exposes local, non-persisted input counters:

```text
window.__SEX_MAGICK_COLLISION__.getInputStats()
```

Counters distinguish:

- immediate jumps
- queued inputs
- queued inputs that fired
- rejected inputs
- expired inputs
- coalesced duplicate taps

The accepted jump remains a single feedback path. It still owns the jump impulse, cooldown, accepted-jump sound, haptic response, and accepted-jump particles.

## Gameplay-authoritative contrast

Milestone 7 separates collision truth from atmospheric color motion.

Gameplay-authoritative colors are now stable:

| Element | Stable treatment |
|---|---|
| Player core | high-luminance near-white |
| Hexagram aura | cyan |
| Monas aura | gold |
| Lethal pillar silhouette | fixed pink/red |
| Level accent | subordinate inner ornament only |

Hue cycling, level accents, occult geometry, backgrounds, tunnel effects, trails, and other atmospheric channels remain available. The change does not sterilize the visual identity; it reserves a stable contrast channel for the player and lethal geometry.

Jump-particle density was reduced from 10/12 particles to 4/5 particles, and to zero under reduced motion.

## Accessibility and intensity controls

Two runtime settings are added to the existing Settings screen:

- `STILLNESS (REDUCED FX)`
- `VEIL (LOW FLASH)`

The first launch also displays a dismissible visual-intensity notice.

Reduced motion:

- honors `prefers-reduced-motion` as the default when no saved choice exists
- suppresses random simulation glitch events
- suppresses runtime glitch/flash triggers
- reduces trails and glow
- removes accepted-jump particles
- removes long CSS animation and transition durations

Low flash:

- caps runtime screen-flash intensity
- shortens flash duration
- reduces warning-overlay intensity

The settings are stored locally under narrow, gameplay-only keys. No account or device identity is added.

## Major-resize safety contract

A viewport change larger than 10% in either width or height pauses an active run and presents:

```text
POSTURE SHIFT
TAP TO RESUME
```

Milestone 7 does not attempt active remapping of the player, spawned pillars, velocity, or breathing phase. Pausing is the bounded safety contract for the upcoming vertical slice.

## Fail-closed reachability policy

The production bootstrap now records policy status through:

```text
window.__SEX_MAGICK_POLICY_BOOTSTRAP__.getSnapshot()
```

Normal path:

```text
waiting-for-grammar → loading-policy → ready
```

If the grammar or policy script times out, fails to load, or loads without completing installation:

- the runtime installs a fail-closed guard
- Hexagram remains available
- the Monas menu button is disabled and marked `SEALED`
- an active Monas run pauses rather than scheduling an unverified catalog
- the failure is exposed in the bootstrap snapshot and console

This closes the Milestone 5 production hazard where a missing policy could silently permit the uncorrected Monas catalog.

## Opus review diagnostics

New QA-only modules:

- `tools/m7-review-diagnostics.js`
- `tools/test-m7-review-diagnostics.js`
- `tools/run-m7-review-audit.js`

They provide:

- actual witness inter-jump spacing distributions
- buffered and unbuffered witness replay
- separate margin-0 collision survival and margin-8 safety retention
- per-gate production-style gap breathing
- bounded provenance-mask helpers
- optional independent per-initial-state audits

### Witness spacing

Across the 16 hard Milestone 6 cases, cooldown-tight consecutive-jump intervals represented:

```text
0.0% to 18.18%
```

No witness contained an interval below its Rite/device cooldown.

This confirms the Opus mechanism—an early shift of a cooldown-tight jump can delete the jump under the old input model—but rejects the stronger estimate that approximately half the witness transitions were cooldown-tight.

### Constant-gap comparison

The original Milestone 6 geometry used a constant 110-pixel gap.

| Measurement across 16 cases | Observed range |
|---|---:|
| Unbuffered, margin-0 collision survival | 32.73%–74.55% |
| Three-step buffer, margin-0 collision survival | 38.18%–80.00% |
| Unbuffered, margin-8 safety retention | 10.91%–43.64% |
| Three-step buffer, margin-8 safety retention | 10.91%–49.09% |

The former published `10.9%–43.6%` range was therefore an eight-pixel **safety-retention** range, not ordinary collision survival.

Three-, four-, and six-step buffers produced the same range in this bounded machine audit. The development default remains the smallest successful candidate: three steps.

### Production-style breathing-gap comparison

The live game computes its gate gap as the current base gap plus a sinusoidal value of up to ±10 pixels. At nominal minimum gap 110, spawned gates can therefore approach 100 pixels.

With per-gate breathing gaps modeled:

| Measurement across 16 cases | Observed range |
|---|---:|
| Unbuffered, margin-0 collision survival | 20.00%–69.09% |
| Three-step buffer, margin-0 collision survival | 29.09%–74.55% |
| Unbuffered, margin-8 safety retention | 0.00%–5.45% |
| Three-step buffer, margin-8 safety retention | 0.00%–5.45% |

Interpretation:

1. The short input buffer improves collision survival in affected cases.
2. The old margin-8 rate materially understated actual survival.
3. The Opus estimate of widespread cooldown-tight witnesses was too high.
4. Per-gate gap breathing is a larger safety-margin issue than input buffering.
5. Current patterns must not be flattened from the old Milestone 6 percentages.
6. Any future safety guarantee must generate its witness against the real per-gate gap timeline rather than replaying a constant-gap witness against different geometry.

The breathing-gap audit intentionally replays the existing constant-gap witness. Its near-zero eight-pixel safety result demonstrates model mismatch; it is not a claim that the breathing-gap geometry lacks another safer witness.

## Initial-state provenance correction

Milestone 6 reported one surviving initial-state identity in most cases. That value cannot be interpreted as a narrow incoming corridor because state deduplication retained only one representative identity when several histories converged to the same quantized state.

Milestone 7 deprecates that inference.

The diagnostic layer includes a 31-bit provenance mask and an independent initial-state audit path. A future solver revision must either:

- union provenance masks when states merge, or
- solve each initial state independently

before making any claim about incoming-state diversity.

The old identity count proves neither a narrow corridor nor a wide corridor.

## CI proportionality

Per-push QA is now divided from heavy reachability analysis.

### Fast gameplay QA — every development push and pull request

- syntax checks across runtime, solver, and test files
- fixed-step deterministic contracts
- collision and input-truth deterministic contracts
- local telemetry deterministic contracts
- obstacle-grammar deterministic contracts
- Milestone 7 diagnostic contracts
- fixed-step Chrome integration
- collision/input/touch Chrome integration
- telemetry/retry Chrome integration
- obstacle-grammar Chrome integration

Target timeout: eight minutes.

### Reachability and composition audit

Runs:

- manually through `workflow_dispatch`
- weekly
- when pattern, physics, policy, solver, or relevant audit files change

It contains:

- isolated reachability matrix
- compositional perturbation matrix
- Milestone 7 diagnostic contracts
- bounded Opus review audit
- real-player reachability Chrome integration
- compositional Chrome integration

This preserves the safety apparatus without blocking ordinary creative iteration.

## Validation

### Full legacy gate at player-facing implementation head

Commit:

```text
d086658e959288ff2136203ee602a1c62261aae1
```

Workflow:

```text
30917555952
```

Passed:

- all six previous deterministic suites
- all six previous Chrome integration suites
- new input/readability runtime loaded without regression
- fail-closed policy bootstrap loaded without regression

### Milestone 7 audit gate

Commit:

```text
2c9f209f5b5acee8f6dd883bac5bce6eeeda99d5
```

Workflow:

```text
30918191676
```

Passed:

- all syntax checks
- fixed-step deterministic contracts
- collision and input-truth deterministic contracts
- telemetry deterministic contracts
- obstacle-grammar deterministic contracts
- Milestone 7 diagnostic contracts
- bounded 16-case review audit
- fixed-step Chrome integration
- collision/input/touch Chrome integration
- telemetry/retry Chrome integration
- obstacle-grammar Chrome integration

## Acceptance status

Accepted for the development branch:

- three-step bounded input buffer as the initial physical-playtest candidate
- explicit queued/rejected/expired input feedback
- local input diagnostic counters
- stable player and hazard contrast channels
- reduced-motion and low-flash settings
- first-launch visual-intensity notice
- pause-on-major-resize contract
- fail-closed Monas policy behavior
- separate survival and safety-margin terminology
- deprecation of the Milestone 6 initial-identity inference
- production-style per-gate gap diagnostics
- fast and heavy QA separation

Not accepted:

- any obstacle-pattern retuning
- any claim that a three-step buffer is human-optimal
- any claim that margin-0 machine survival proves human comfort
- any claim that the existing breathing-gap witness retains eight pixels of safety
- any new scoring, Gnosis, Void, Tree-of-Life, leaderboard, or deployment behavior

## Physical acceptance still required

Before the Gate vertical slice is treated as player-ready:

- compare input buffers 0 and 3 on physical Android
- verify no surprising delayed jump
- verify queued/rejected cues are noticeable but not distracting
- verify stable player/hazard contrast against several background images
- verify reduced motion and low flash on a physical device
- verify Fold closed and Fold open posture pause
- verify pause/resume text and controls after posture change
- verify haptic and audio behavior
- test at 60 Hz and 120 Hz display settings

## Rollback

- Revert `c55043ed116ec74c208ae341f51c98dafd33b2f2` to remove input buffering, stable gameplay contrast, accessibility controls, and resize pause.
- Revert `d086658e959288ff2136203ee602a1c62261aae1` to remove fail-closed policy loading and reduced-motion random-glitch suppression.
- Remove `tools/m7-review-diagnostics.js`, `tools/test-m7-review-diagnostics.js`, and `tools/run-m7-review-audit.js` to remove the review diagnostics.
- Restore the prior `.github/workflows/qa.yml` and remove `.github/workflows/reachability-audit.yml` to return to the single heavy per-push workflow.

No rollback touches `main` or the live itch.io build.

## Next milestone

The next player-facing milestone is the Hexagram-only Gate vertical slice:

```text
precise flight
→ voluntarily clear risk zones
→ accumulate Gnosis
→ summon a visible Gate
→ enter to wager or bypass to bank
→ survive a lethal transformed Void
→ convert the wager or lose it
→ retry immediately
```

No further solver expansion or pattern retuning should precede that slice.
