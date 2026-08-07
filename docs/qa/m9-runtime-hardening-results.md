# Milestone 9 Results — Runtime Evidence Integrity and Fold Viewport Hardening

Date: 2026-08-04  
Frozen Milestone 8 base: `02299c9970cc6b68cf1c707edc671331878ad606`  
Tested implementation head: `d8d658a2f63d27bf3fe8a0ac4582f560d6e6500e`  
Fast gameplay QA run: `30954560540`  
Stacked draft PR: `#2`

## Status

**Implemented and automatically verified on a separate stacked branch. Not merged, deployed, or human-validated.**

Branch:

```text
develop/m9-runtime-hardening
```

Base branch:

```text
develop/sex-magick-2.0
```

Milestone 8 remains frozen at its prior checkpoint. `main` and the live itch.io build remain unchanged.

## Purpose

The first physical Gate-slice report exposed two evidence defects and one device-composition problem:

1. The playtest aggregate silently lost early runs after the local 20-run history limit was reached.
2. A crossing classified as `unsafe` could still increment the Gate clear count and slice score.
3. The physical Fold 6 closed viewport, recorded at `368 × 869` with DPR `2.625`, was materially more condensed than the headless approximation.

Milestone 9 repairs those issues without changing Gate design, Gnosis rules, Void behavior, input physics, obstacle patterns, progression, or balance constants.

## Architecture

### Device-aware viewport profiles

New module:

```text
tools/viewport-runtime.js
```

Profiles:

- `compact-phone`
- `tall-phone`
- `fold-closed`
- `fold-open`
- `tablet`
- `desktop`

Samsung Galaxy Z Fold 6 is detected through the `SM-F956*` model identifier. Controlled tests may override classification with:

```text
?viewportProfile=fold-closed
?viewportProfile=fold-open
```

The profile runtime owns responsive presentation variables rather than game rules. It adjusts:

- Gate HUD width and typography
- Gate telegraph size and vertical position
- score/band display scale
- atmospheric density
- compact spacing inside the Gate HUD

The Fold-closed profile used in the real-viewport Chrome test was:

```text
width: 368
height: 869
devicePixelRatio: 2.625
HUD width: calc(100vw - 82px)
HUD font: 8px
telegraph width: calc(100vw - 14px)
telegraph top: 34%
telegraph font: 9px
score scale: 0.8
atmosphere scale: 0.7
```

These values are presentation candidates. Physical Fold testing is still required.

### Complete-session Gate evidence

New module:

```text
tools/gate-evidence-runtime.js
```

The module retains every run observed during the active playtest session in memory, independently of the bounded 20-run local-storage history. Runs are deduplicated by `runId`, with the later completed snapshot replacing an earlier active snapshot.

Session totals include:

- runs observed and completed
- valid Gate clears
- Gate offers
- Gate entries
- Gate banks
- Void attempts
- Void survivals
- Void deaths
- separately recorded unsafe crossings

The module also records each Gate decision:

- frames visible before resolution
- entry, bank, unknown, or unresolved result
- starting player/Gate vertical separation
- minimum vertical separation
- total movement toward the Gate
- whether movement toward the Gate exceeded the provisional six-pixel threshold

`movedTowardGate` and `deliberateEntryProxy` are debugging proxies. They do not prove conscious intent.

### Unsafe-crossing correction

The M8 slice increments its internal clear record before the M9 compatibility layer can evaluate it. M9 therefore snapshots the pre-update Gate state and score. When a newly marked pillar produces `zone: unsafe`:

- Gate state is restored to the pre-crossing snapshot
- score is restored
- no Gate clear, Gnosis, streak, near-miss, or band progress is retained
- an `unsafe-crossing` event is recorded separately

This is an evidence-integrity correction, not a difficulty or collision change. The original collision runtime remains authoritative for death.

### Playtest harness V2

New harness:

```text
tools/gate-slice-playtest-v2.html
```

V2:

- emits schema version `2`
- explicitly starts and stops a session evidence scope
- preserves totals beyond 20 runs
- records the active viewport profile
- supports Fold-closed and Fold-open test conditions
- supports three- and six-step input-buffer candidates
- records decision visibility and movement proxies
- exports one local JSON report
- transmits nothing

The original V1 harness remains available only for historical compatibility. New Gate tests should use V2.

## Automated evidence

### Deterministic contracts

`tools/test-viewport-runtime.js` verified:

- Fold 6 `368 × 869` → `fold-closed`
- Fold 6 `884 × 1104` → `fold-open`
- tall-phone, compact-phone, tablet, and desktop classification
- explicit profile overrides
- Fold model detection
- DPR preservation

`tools/test-gate-evidence-runtime.js` verified:

- 25 runs remain present rather than truncating to 20
- duplicate run IDs resolve to one latest snapshot
- session totals and rates remain bounded and valid
- Gate visibility and movement-toward calculations

`tools/test-gate-slice-playtest-v2-harness.js` verified:

- controller syntax
- V2 protocol and schema
- viewport and buffer propagation
- session evidence API usage
- unchanged comprehension questions
- absence of `fetch`, `XMLHttpRequest`, `sendBeacon`, and `WebSocket` report transmission

### Actual Chrome integration

`tools/browser-m9-runtime-hardening-test.mjs` ran the actual game realm with:

```text
user agent: Samsung Galaxy Z Fold 6 / SM-F956U
viewport: 368 × 869
DPR: 2.625
forced profile: fold-closed
```

Verified output:

```text
profile: fold-closed
Fold 6 detected: true
gates before unsafe crossing: 6
gates after unsafe crossing: 6
score before unsafe crossing: 0
score after unsafe crossing: 0
unsafe crossings recorded: 1
Gate visible before entry: 29 frames
movement toward Gate: 90px
movedTowardGate: true
deliberate entry proxy: 1
25 synthetic runs retained: 25
synthetic entry rate: 0.5
synthetic bank rate: 0.5
synthetic Void survival rate: 0.5
browser exceptions: 0
```

The synthetic rates verify aggregation only. They are not player evidence.

### Regression surface

All previous fast gates remained green:

- fixed-step simulation and lifecycle
- collision, touch, input buffering, and accessibility
- fail-closed reachability policy
- original Gate-slice state transitions
- local telemetry and retry
- deterministic obstacle grammar

## Established

- M8 remains frozen on its own branch and PR
- M9 is isolated on a stacked branch and draft PR
- complete session totals can exceed 20 runs
- duplicate run snapshots do not double-count
- unsafe classifications no longer inflate Gate totals or slice score
- unsafe crossings remain observable as separate evidence
- Gate visibility duration is recorded
- movement toward the Gate is recorded as a bounded proxy
- Fold 6 closed/open profiles are deterministic and externally selectable
- the real recorded Fold-closed viewport has an explicit presentation profile
- existing gameplay and QA contracts remain green

## Not established

- that the Fold-closed profile is comfortable or attractive on the physical device
- that an eight-pixel Gate HUD font is sufficiently readable
- that reduced atmosphere improves gameplay rather than weakening identity
- that movement toward the Gate proves deliberate choice
- that the Gate system is understood, balanced, fun, or replayable
- that the three- or six-step input buffer is preferable
- Safari, Firefox, iOS, or other foldable parity
- DPR-aware canvas rendering; this milestone profiles CSS composition but does not yet change the canvas backing-store contract
- local asset and audio resilience
- release readiness

## Next direction-independent work

The next M9 phase may proceed without Gate tuning:

1. extract a DPR-aware canvas/viewport adapter
2. add asset manifest and loading one-shot guard
3. add audio codec selection and fallback reporting
4. localize critical fallback assets

Gate/Gnosis onboarding, balance, Monas, additional Sephiroth, leaderboard work, and deployment remain deferred until human evidence is revisited.

## Deployment

None. PR #2 remains draft. PR #1 remains draft. `main` and itch.io remain unchanged.
