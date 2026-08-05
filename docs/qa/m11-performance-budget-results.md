# Milestone 11 — Local Performance-Budget Instrumentation Results

**Date:** 2026-08-04  
**Branch:** `develop/m11-performance-budget`  
**Base checkpoint:** `c67f0d6e5f64234deb509b45b424f15aaff328b0`  
**Tested implementation head:** `c39594eb11a7dee9f7290070ca552bfa860c1695`  
**Fast Gameplay QA:** `30973816676` — success  
**Draft pull request:** #4

## 1. Milestone boundary

Milestone 11 adds an opt-in, local performance-budget probe and a Fold-oriented report workflow. It does not alter:

- Gate, Gnosis, Void, or scoring
- player physics or input-buffer candidates
- collision geometry
- obstacle grammar or reachability policy
- Monas availability
- leaderboard behavior
- the shipped `main` branch
- itch.io deployment

The probe is loaded only when the URL includes:

```text
?perfProbe=1
```

The optional compact overlay is enabled through:

```text
?perfPanel=1
```

Ordinary branch sessions do not load the probe module.

## 2. Implemented evidence surface

`tools/performance-budget-runtime.js` records bounded, in-memory evidence for:

- requestAnimationFrame interval distribution: minimum, mean, p50, p95, p99, and maximum
- measured game-loop callback duration
- measured `drawScene()` duration
- long-frame and critical-frame counts and rates
- fixed-step dropped simulation milliseconds
- fixed-step suspension resets
- frame gaps above the fixed suspension boundary
- Long Task entries where the browser exposes the observer
- navigation timing
- M10 asset-startup timing and fallback summary
- viewport profile
- logical dimensions
- effective DPR
- backing-store dimensions and pixel count
- render mode and asset mode

The default bounds are:

```text
target frame interval:       16.667 ms
long-frame threshold:        25 ms
critical-frame threshold:    50 ms
warm-up:                     120 intervals
samples per metric/segment:  3,600
retained segments:           12
context stabilization:       3 consecutive RAF callbacks
panel update interval:       250 ms
```

Controlled overrides are available only for explicit measurement sessions:

```text
?perfTargetFrameMs=16.667
?perfLongFrameMs=25
?perfCriticalFrameMs=50
?perfWarmupFrames=120
?perfSampleFrames=3600
?perfMaxSegments=12
?perfContextStabilityFrames=3
?perfUpdateMs=250
```

## 3. Stable Fold transition segmentation

The first real active-resize test showed that a single resize can briefly expose this sequence:

```text
fold-closed / old dimensions
fold-closed / new dimensions
fold-open / new dimensions
```

Treating every distinct context key as a permanent segment created an artificial middle segment. The final collector therefore requires the same new context to be observed for three consecutive RAF callbacks before opening a segment.

During that bounded stabilization window:

- frame intervals are not attributed to either stable context
- draw and callback timings are excluded
- fixed-step dropped-time deltas are excluded
- ignored transition callbacks remain explicitly counted
- returning to the original context cancels the candidate segment

The successful Fold transition produced exactly two stable segments and recorded three ignored transition callbacks.

## 4. Deterministic validation

The deterministic suite covers:

- percentile interpolation
- empty and populated summaries
- bounded ring-buffer order and eviction
- omitted and explicit query parameters
- context normalization and key construction
- long and critical frame counting
- fixed-step dropped-time delta accounting
- suspension-reset delta accounting
- Long Task aggregation
- warm-up exclusion
- suspension-gap exclusion
- bounded segment retention
- stable context promotion
- transient context reversion
- provisional budget classifications
- static absence of network and browser-storage APIs from the probe
- six Fold report-launch presets
- local JSON comparison without transmission

All deterministic contracts passed in run `30973816676`.

## 5. Successful Chrome integration

The Chrome integration used:

```text
assetMode=offline
renderDpr=native
perfProbe=1
perfPanel=1
perfWarmupFrames=0
perfSampleFrames=120
perfMaxSegments=4
```

It exercised a live fixed-step game loop, collected real RAF callbacks, injected a deliberate 65 ms busy interval to prove detector sensitivity, and changed the emulated viewport from Fold closed to Fold open during the active session.

### Fold-closed segment

```text
profile:                 fold-closed
logical dimensions:      368 × 869
effective DPR:           2.625
backing dimensions:      966 × 2281
backing pixels:          2,203,446
retained frame samples:  120
frame minimum:           16.6 ms
frame p50:               33.3 ms
frame p95:               33.4 ms
frame p99:               33.481 ms
frame maximum:           100 ms
frame mean:              31.526 ms
draw p50:                0.4 ms
draw p95:                0.5 ms
draw p99:                0.6 ms
draw maximum:            0.9 ms
callback p50:            0.8 ms
callback p95:            1.0 ms
callback p99:            1.0 ms
callback maximum:        3.1 ms
provisional class:       over-observed-budget
```

The classification confirms that the probe detects degraded cadence and injected stalls. It is not a statement about physical Galaxy Z Fold 6 performance.

### Fold-open segment

```text
profile:                 fold-open
logical dimensions:      884 × 1104
effective DPR:           2.625
backing dimensions:      2321 × 2898
backing pixels:          6,726,258
retained frame samples:  31
frame minimum:           116.6 ms
frame p50:               133.2 ms
frame p95:               133.4 ms
frame p99:               133.4 ms
frame maximum:           133.4 ms
frame mean:              125.265 ms
provisional class:       insufficient-samples
```

The open segment intentionally stopped after the integration proved stable segmentation and retained at least 30 samples. It did not collect enough samples for a classification.

### Aggregate diagnostic output

```text
stable segments:                     2
sampled callbacks before ring cap:   159
long frames:                         142
critical frames:                     32
suspension gaps:                     2
ignored transition callbacks:        3
dropped simulation time:             1,300 ms
suspension resets:                   2
Long Task entries:                   35
Long Task duration:                  4,912 ms
long-frame rate:                     0.89308
critical-frame rate:                 0.20126
```

These values reflect headless CI scheduling, mobile emulation, the deliberate busy interval, active viewport reconfiguration, and the configured test duration. They are detector evidence, not a performance benchmark.

## 6. Startup and privacy evidence

The same successful run reported:

```text
navigation response end:    16.8 ms
DOMContentLoaded:           195.3 ms
probe installation:         288 ms
asset mode:                 offline
asset duration:             92 ms
catalog records:            75
loaded external images:     0
procedural fallbacks:       75
timed out:                  0
asset network attempts:     0
fallback surfaces:          8
Long Task observer:         supported
performance storage keys:   0
catalog image requests:     0
browser exceptions:         0
```

The runtime and comparator contain no:

- `fetch()` call
- `XMLHttpRequest`
- `navigator.sendBeacon()`
- WebSocket construction
- LootLocker reference
- `localStorage` write
- `sessionStorage` write

A normal non-Gate game startup still attempted its pre-existing LootLocker guest-session request. The M11 test records that request rather than falsely attributing it to the performance probe. M11 neither created nor expanded that network path.

JSON leaves the page only through an explicit local file download initiated by the user.

## 7. Defects found while establishing the gate

### Test pinned the viewport profile

The first test URL forced `viewportProfile=fold-closed`, making a closed-to-open transition impossible. Chrome profile cleanup then replaced the useful timeout with an `ENOTEMPTY` error.

Correction:

- remove the forced profile from the active-transition case
- retry temporary-profile removal
- never allow cleanup failure to mask the primary assertion

### Transient resize context created a false segment

The browser briefly reported new dimensions before the viewport profile changed.

Correction:

- require three consecutive identical context observations
- exclude transition callbacks from measurements
- report the ignored count
- add deterministic promotion and reversion tests

### Zero-LootLocker assertion exceeded M11 scope

The third test assumed ordinary startup makes no LootLocker request. Existing game initialization attempts one guest session outside the Gate slice.

Correction:

- statically prove the M11 module and comparator contain no network API
- observe and bound the existing request separately
- preserve the existing leaderboard behavior instead of modifying it to satisfy an instrumentation test

## 8. Physical Fold measurement protocol

`tools/performance-budget-playtest.html` launches six controlled offline-asset profiles:

```text
Fold closed · native DPR
Fold closed · 2× DPR
Fold closed · CSS 1×
Fold open · native DPR
Fold open · 2× DPR
Fold open · CSS 1×
```

For useful owner evidence:

1. Run each configuration for at least 60 seconds after warm-up.
2. Play rather than leaving the menu idle.
3. Export the JSON report after each run.
4. Repeat every configuration at least three times.
5. Avoid switching apps or opening system overlays during a measured segment.
6. Compare medians and tails across repeated runs, not one isolated result.
7. Record perceived sharpness, heat, battery drain, touch latency, and visible stutter separately because the browser probe cannot establish those experiences alone.

The built-in comparator reads selected JSON files locally and creates no network request or persistent record.

## 9. Claim boundary

Milestone 11 establishes that the project can collect bounded, segmented, local performance evidence under the tested browser model and survive an active Fold profile transition without contaminating stable segments.

It does not establish:

- physical Fold 6 frame-time stability
- whether native DPR is sustainable
- GPU-memory pressure
- thermal throttling
- battery cost
- Samsung Internet behavior
- Safari behavior
- broad Android compatibility
- a release-grade performance budget
- Gate comprehension, balance, fun, or replayability

The provisional classifications must not be used as release gates until physical-device distributions and acceptable thresholds are defined.

## 10. Milestone disposition

Milestone 11 is accepted as a direction-independent diagnostic foundation.

PR #4 must remain draft. No branch is authorized for merge into `main`, and no itch.io deployment is authorized.
