# Milestone 12 — Physical Fold Performance Evidence Results

**Date:** 2026-08-04  
**Branch:** `develop/m12-physical-performance-evidence`  
**Base checkpoint:** `be8238de505f58b071db4c9cad1c5ceaac0863b6`  
**Tested implementation head:** `dcc0e4c914cc0da39d2164f0b850f65bbae35eeb`  
**Fast Gameplay QA:** `30976375802` — success  
**Draft pull request:** #5

## 1. Milestone boundary

Milestone 12 converts the Milestone 11 Fold performance launcher into a local evidence protocol that can validate repeated physical reports and refuse to choose a render DPR when the evidence is incomplete or fails provisional limits.

It does not alter:

- Gate, Gnosis, Void, or scoring
- player physics or input-buffer candidates
- collision geometry
- obstacle grammar or reachability policy
- Monas availability
- leaderboard behavior
- the protected `main` branch
- itch.io deployment

No physical Galaxy Z Fold 6 benchmark was collected during this milestone. Automated fixtures validate the capture and decision machinery only.

## 2. Provenance defect corrected

The Milestone 11 launcher placed `perfSession` in the game URL, but the exported report did not preserve that value. Filenames alone therefore could not reliably prove which preset, posture, requested DPR, repeat, or session produced a report after files were renamed or copied.

The Milestone 12 same-origin capture surface now annotates every explicit capture with:

```text
schemaVersion
protocol
source
sessionId
preset
repeat
requestedDpr
expectedProfile
```

The protocol identifier is:

```text
m12-fold6-performance-v1
```

The harness stops the active probe, obtains its snapshot, attaches the provenance block, downloads the JSON after a user action, and adds the same object to the in-memory comparison. The capture does not change gameplay or transmit the report.

## 3. Controlled physical matrix

The six required presets are:

```text
closed-css
closed-2x
closed-native
open-css
open-2x
open-native
```

The measurement protocol requires:

```text
minimum eligible repeats per preset:  3
preferred repeats per preset:         5
minimum frame samples per run:        1,800
asset mode:                           offline
maximum suspension gaps:              0
maximum ignored transition callbacks: 5
```

A complete minimum matrix therefore contains 18 eligible physical runs. Five repeats produce a preferred 30-run matrix.

## 4. Eligibility and exclusion behavior

A loaded report remains visible but is excluded from recommendation evidence when it has one or more of these defects:

- unsupported report mode or version
- protocol mismatch
- unknown preset
- missing session ID
- missing or invalid repeat index
- preset/profile mismatch
- preset/requested-DPR mismatch
- fewer than 1,800 retained frame samples
- asset mode other than offline
- one or more suspension gaps
- more than five ignored transition callbacks
- page hidden at export
- missing p95 or p99 frame percentile
- duplicate report content
- duplicate protocol/session/preset/repeat identity

Legacy Milestone 11 exports may still be inspected, but their missing M12 provenance prevents them from participating in a render recommendation.

The FNV-1a fingerprint is deterministic duplicate-detection evidence only. It is not a cryptographic signature, device attestation, or anti-tamper guarantee.

## 5. Repeat aggregation

Eligible repeats are grouped by preset. The analyzer uses medians for central tendency and median absolute deviation for repeat spread.

Each preset reports:

- eligible and total report counts
- unique repeat depth
- effective DPR distribution
- frame p50, p95, and p99 distributions
- draw and game-loop callback p95 distributions
- long-frame and critical-frame rates
- dropped simulation milliseconds per minute
- repeat p95 median absolute deviation
- individual threshold checks

This structure prevents one unusually good or bad repeat from becoming the sole recommendation basis.

## 6. Provisional thresholds

The current policy is intentionally conservative and provisional:

```text
frame p95 median:                    <= 20 ms
frame p99 median:                    <= 28 ms
critical-frame-rate median:          <= 0.5%
dropped simulation median:           <= 50 ms/minute
repeat frame-p95 MAD:                <= 2.5 ms
```

These thresholds are development hypotheses. They are not release gates until physical distributions, perceptual results, device heat, battery impact, and acceptable product tradeoffs are reviewed.

## 7. Recommendation refusal and selection

For each posture, the analyzer first requires complete CSS, 2×, and native evidence. Its outcome is one of:

```text
insufficient-evidence
no-sustainable-candidate
provisional-recommendation
```

When all three presets have enough eligible repeats, the analyzer chooses only the highest-DPR preset that passes every provisional threshold.

It does not infer that native DPR is preferable merely because it is sharper, or that CSS 1× is acceptable merely because it is faster. Subjective sharpness, visible stutter, touch latency, heat, and battery drain remain separate owner observations.

## 8. Deterministic validation

The deterministic suites cover:

- median and median absolute deviation
- canonical object serialization
- stable FNV duplicate fingerprints
- complete 18-report matrices
- incomplete repeat matrices
- explicit recommendation refusal
- highest-sustainable-DPR selection
- duplicate content and identity rejection
- legacy report exclusion
- profile mismatch exclusion
- requested-DPR mismatch exclusion
- suspension-gap exclusion
- minimum-sample enforcement
- repeat-instability rejection
- six-preset harness construction
- local-only capture and comparison privacy contracts

All deterministic contracts passed in run `30976375802`.

## 9. Browser integration fixture

The Chrome test rendered a controlled 18-report matrix:

```text
6 presets × 3 repeats = 18 reports
```

The fixture deliberately made `open-native` exceed the provisional p95, p99, critical-frame, and dropped-simulation limits. All other fixture groups were within policy.

The successful result was:

```text
accepted reports:                 18
rejected duplicates:              1
eligible run segments:            18
excluded run segments:            0
complete posture recommendations: 2
fold-closed recommendation:       closed-native
fold-open recommendation:         open-2x
browser exceptions:               0
browser storage keys:             0
external network requests:        0
```

Those two recommendations prove that the analyzer can select different highest-sustainable DPR tiers for different postures. They do not describe the physical Fold 6.

## 10. CI defect found and corrected

The first integrated M12 head `c8e6dfe45e7030892b418a7a7b8803981bb12671` failed workflow `30976313572` in the inherited Milestone 11 harness test.

The test required the exact old page title:

```text
PERFORMANCE BUDGET PLAYTEST
```

Milestone 12 had deliberately superseded that page with:

```text
PHYSICAL PERFORMANCE EVIDENCE
```

The correction did not change runtime behavior. The inherited test now accepts the superseding title and validates the actual button-generated query parameters, six preset identities, analyzer script, and local-only privacy boundary.

The corrected implementation head `dcc0e4c914cc0da39d2164f0b850f65bbae35eeb` passed the complete stacked suite in workflow `30976375802`.

## 11. Complete stacked validation

Every inherited and M12 step passed:

- syntax checks
- deterministic M1–M12 contracts
- fixed-step Chrome integration
- collision/input/touch Chrome integration
- fail-closed-policy Chrome integration
- Gate-slice Chrome integration
- M9 evidence/Fold Chrome integration
- M10 render/offline-asset Chrome integration
- M11 performance-budget/Fold-transition Chrome integration
- M12 physical-evidence analysis Chrome integration
- telemetry/fast-retry Chrome integration
- obstacle-grammar Chrome integration

## 12. Physical owner protocol

For each of the six presets:

1. Use the matching physical closed or open posture.
2. Select repeat 1, 2, and 3 at minimum.
3. Play normally for at least 60 seconds after probe warm-up.
4. Avoid app switching, notification shade, split screen, and system overlays.
5. Return to the same-origin harness and use `Capture active run`.
6. Keep the downloaded JSON.
7. Record perceived sharpness, visible stutter, heat, battery drain, and touch latency separately.
8. Load all reports into the harness and review exclusions before reading any recommendation.

Five repeats per preset are preferred when time allows.

## 13. Claim boundary

Milestone 12 establishes a bounded, repeat-aware, local evidence protocol and an analyzer that can decline to recommend a DPR.

It does not establish:

- physical Fold 6 performance
- sustainable native DPR
- GPU-memory pressure
- thermal throttling
- battery cost
- Samsung Internet behavior
- Safari behavior
- broad Android compatibility
- device identity or report authenticity
- final performance thresholds
- Gate comprehension, balance, fun, or replayability
- release readiness

## 14. Milestone disposition

Milestone 12 is accepted as the physical performance evidence gate implementation.

PR #5 must remain draft. No branch is authorized for merge into `main`, and no itch.io deployment is authorized. The next performance conclusion must come from the owner-operated physical matrix, not from the synthetic fixture.