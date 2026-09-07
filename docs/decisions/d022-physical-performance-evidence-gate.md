# D-022 — Require complete physical evidence before selecting a Fold render DPR

**Date:** 2026-08-04  
**Status:** Accepted on stacked development branch; physical recommendation pending owner evidence

## Decision

Use a versioned, same-origin, local capture protocol to compare Fold-closed and Fold-open CSS 1×, 2×, and native-DPR rendering. Preserve protocol, session, preset, repeat, requested-DPR, and expected-profile provenance in every accepted capture. Exclude incomplete, interrupted, mismatched, duplicate, hidden, or undersampled runs from recommendation evidence while keeping their exclusion reasons visible.

Require at least three eligible repeats for every DPR preset in a posture before allowing a recommendation. Prefer five repeats. Aggregate with medians and median absolute deviation rather than choosing from one run. When evidence is complete, select only the highest-DPR preset that passes every provisional threshold. Otherwise return an explicit refusal state.

## Context

Milestone 10 introduced bounded high-DPR backing stores. Milestone 11 added local performance instrumentation and a six-preset launcher, but it did not preserve the launcher session in exported reports or define a repeat-level recommendation contract. A renamed file could no longer be reliably assigned to a preset and repeat, and a single clean-looking result could be overinterpreted.

The project currently has one available physical target, a Samsung Galaxy Z Fold 6. That makes controlled repeated evidence more important, not less. The analyzer must distinguish missing evidence from poor performance and must be able to say that no candidate satisfies the current policy.

## Protocol

The protocol identifier is:

```text
m12-fold6-performance-v1
```

Every harness capture records:

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

The six presets are:

```text
closed-css
closed-2x
closed-native
open-css
open-2x
open-native
```

Minimum recommendation evidence is 18 eligible runs:

```text
6 presets × 3 repeats
```

Preferred evidence is 30 eligible runs:

```text
6 presets × 5 repeats
```

## Eligibility policy

A run is excluded from recommendation evidence when it has any of these defects:

- unsupported report mode or version
- protocol mismatch
- unknown preset
- missing session ID
- missing or invalid repeat index
- preset/profile mismatch
- preset/requested-DPR mismatch
- fewer than 1,800 frame samples
- asset mode other than offline
- one or more suspension gaps
- more than five ignored context-transition callbacks
- hidden page at export
- missing p95 or p99 frame percentile
- duplicate content fingerprint
- duplicate protocol/session/preset/repeat identity

Legacy reports remain inspectable but cannot authorize a DPR choice without M12 provenance.

## Provisional thresholds

A preset is a sustainable candidate only when all of these repeat-level checks pass:

```text
eligible unique repeats:             >= 3
frame p95 median:                    <= 20 ms
frame p99 median:                    <= 28 ms
critical-frame-rate median:          <= 0.5%
dropped simulation median:           <= 50 ms/minute
frame-p95 repeat MAD:                <= 2.5 ms
```

These values are development hypotheses, not release policy. Physical evidence may justify revising them, but a revision must be documented rather than silently made to obtain a desired recommendation.

## Recommendation states

The analyzer returns one of:

```text
insufficient-evidence
no-sustainable-candidate
provisional-recommendation
```

A posture receives no recommendation until CSS, 2×, and native all meet the repeat requirement. With complete evidence, the selected candidate is the highest DPR tier that passes every threshold.

The recommendation remains provisional because the browser report does not directly establish perceived sharpness, visible stutter, touch latency, heat, battery drain, or long-session thermal behavior.

## Privacy and integrity boundary

The capture harness and analyzer do not use:

- `fetch()`
- `XMLHttpRequest`
- `navigator.sendBeacon()`
- WebSocket creation
- LootLocker
- local-storage writes
- session-storage writes

Reports are downloaded only after an explicit user action and otherwise remain in memory.

The deterministic FNV-1a report fingerprint detects duplicate content. It is not a cryptographic signature, device attestation, user identity, anti-cheat mechanism, or proof that a report was not edited.

## Automated evidence

The controlled Chrome fixture created 18 eligible reports and one duplicate. It deliberately pushed Fold-open native DPR over the provisional limits. The analyzer selected:

```text
Fold closed: closed-native
Fold open:   open-2x
```

This proves selection and refusal mechanics only. It is not physical Galaxy Z Fold 6 evidence.

Tested implementation head:

```text
dcc0e4c914cc0da39d2164f0b850f65bbae35eeb
```

Successful workflow:

```text
30976375802
```

The first M12 run `30976313572` failed because an inherited M11 static test required the old launcher title. The compatibility test was corrected to validate the superseding M12 surface and its actual query construction. No gameplay or measurement threshold changed to satisfy CI.

## Consequences

- M12 cannot manufacture a render recommendation from one attractive run.
- Every excluded run has an explicit machine-readable reason.
- Closed and open postures may legitimately select different DPR tiers.
- Native DPR is not presumed sustainable.
- CSS 1× is not presumed visually acceptable.
- Physical owner evidence is now the next dependency for performance direction.
- Gameplay, Gate, balance, physics, collision, obstacle grammar, Monas, leaderboards, `main`, and itch.io deployment remain unchanged.
- PR #5 remains draft and stacked on the exact M11 branch.

## Revisit when

Revisit this decision after the owner has collected at least three eligible repeats for all six presets, or when a materially different device/browser target is introduced. Any threshold change should include the physical distributions and perceptual tradeoff that justified it.