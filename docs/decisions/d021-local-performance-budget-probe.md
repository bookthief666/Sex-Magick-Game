# D-021 — Keep performance evidence opt-in, bounded, local, and context-stable

**Date:** 2026-08-04  
**Status:** Accepted on stacked development branch; physical thresholds remain unresolved

## Decision

Add a performance-budget probe on `develop/m11-performance-budget` as an explicit diagnostic mode:

```text
?perfProbe=1
```

The probe must:

- remain unloaded during ordinary sessions
- keep measurements in bounded memory
- transmit nothing
- write nothing to browser storage
- export JSON only after an explicit user action
- segment evidence by stable viewport, logical size, DPR, backing store, render mode, and asset mode
- exclude transient Fold-resize callbacks from stable-context statistics
- expose its own measurement and interpretation limits

Do not use headless Chrome timing or provisional labels to choose a production DPR or declare physical-device performance acceptable.

## Context

Milestone 10 introduced a bounded high-DPR backing store and proved its rendering and failure behavior in Chrome. It did not establish whether the additional pixel workload is sustainable during real play on the owner’s Galaxy Z Fold 6.

The game needed an evidence surface capable of comparing:

- Fold closed and Fold open
- native DPR, 2× DPR, and CSS-pixel 1× rendering
- frame cadence
- draw and callback cost
- fixed-step dropped time
- Long Tasks
- startup and asset timing

That evidence is useful under any later gameplay direction and does not require modifying the unresolved Gate experiment.

## Rationale

### Keep the feature opt-in

Permanent performance instrumentation would add measurement work to every player session before a product need or consent model exists. An explicit query mode keeps the cost and diagnostic UI out of normal play.

### Keep evidence bounded

Long sessions can otherwise accumulate unbounded arrays and distort the runtime being measured. Each metric therefore uses a ring buffer, and only a bounded number of context segments is retained.

### Keep evidence local

The present need is owner-operated diagnosis, not remote analytics. A network pipeline would create privacy, consent, security, retention, and operational decisions that are unnecessary for this milestone.

### Stabilize context transitions

A Fold resize can expose updated dimensions before the viewport classifier updates. Opening a segment on the first changed key would create a false intermediate profile and attribute resize work to stable gameplay. A new context must therefore persist for three consecutive RAF callbacks before promotion. Transitional callbacks are excluded and counted separately.

### Separate detector validation from hardware conclusions

Headless Chrome scheduling, emulation, CI contention, deliberate busy intervals, and active resizing are not representative of the physical Fold. The automated run should prove that the detector records degradation—not that the measured degradation exists on the owner’s phone.

## Consequences

### Runtime

- `tools/performance-budget-runtime.js` is parser-loaded only for `perfProbe=1`.
- The compact panel is separately controlled through `perfPanel=1`.
- Frame intervals, callback durations, draw durations, fixed-step drops, resets, Long Tasks, startup timing, and render context are inspectable.
- Measurements are bounded per segment and by retained segment count.
- Stable-context promotion requires three matching RAF observations by default.
- Ignored transition callbacks remain visible in the report.

### Privacy and network behavior

- The probe contains no fetch, XHR, beacon, or WebSocket path.
- The probe contains no LootLocker reference.
- The probe writes neither localStorage nor sessionStorage.
- Export creates a local JSON download only after a user action.
- The local comparison harness reads selected JSON files without transmission or persistence.
- Ordinary non-Gate startup still attempts its existing LootLocker guest-session request; that behavior is outside M11 and is neither expanded nor concealed.

### Fold evaluation

The committed playtest surface provides six controlled offline-asset presets:

```text
closed/native
closed/2×
closed/1×
open/native
open/2×
open/1×
```

At least three repeated physical runs per configuration are required before using frame-time evidence to prefer a DPR policy. Perceived sharpness, heat, battery drain, touch latency, and visible stutter must be recorded alongside machine output.

### Classification

`within-observed-budget`, `watch`, `over-observed-budget`, and `insufficient-samples` are provisional diagnostic labels. They are not release gates and may not be treated as hardware certification.

## Alternatives rejected

### Always-on measurement

Rejected because it imposes overhead and creates an implicit analytics feature without a demonstrated product requirement.

### Persist every session automatically

Rejected because owner-operated exports are sufficient, while automatic persistence creates retention, stale-data, and privacy complexity.

### Send reports to a backend

Rejected because no remote analytics requirement, consent surface, data policy, or secure ingestion design exists.

### Open a segment immediately on every context change

Rejected because real Fold transitions demonstrated a transient mixed state that created false segments.

### Use CI headless numbers as the DPR decision

Rejected because emulation and CI scheduling do not represent physical Fold rendering or thermal behavior.

## Review boundary

This decision accepts the instrumentation architecture and its automated regression gate. It does not accept native DPR as the shipping default on physical devices, define final performance thresholds, or authorize merge or deployment.

**Evidence:** `docs/qa/m11-performance-budget-results.md`
