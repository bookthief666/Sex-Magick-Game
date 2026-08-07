# Milestone 10 — Bounded DPR Rendering and Resilient Asset Startup

**Date:** 2026-08-04  
**Branch:** `develop/m10-render-resilience`  
**Stacked base:** `develop/m9-runtime-hardening` at `e774c2912ba7203df677f5c20f24d74273af23f0`  
**Tested implementation head:** `6300809b94bc0e3f8836b25bd064405ec7590b50`  
**Fast Gameplay QA:** `30969388698` — success

## Scope

Milestone 10 improves rendering sharpness and startup resilience without changing the unresolved player-facing design hypothesis.

It does not alter:

- Gate, Gnosis, banking, or Void rules
- scoring or progression thresholds
- player physics or input-buffer candidates
- collision geometry
- obstacle catalogs or scheduling
- Monas behavior
- leaderboard behavior
- deployment state

The work is isolated in:

- `tools/canvas-render-runtime.js`
- `tools/asset-resilience-runtime.js`
- parser-ordered bootstrap code in `tools/fixed-step-clock.js`
- duplicate-safe fallback bootstrap code in `tools/viewport-runtime.js`

## DPR-aware canvas contract

Existing gameplay code continues to operate in logical CSS pixels. The managed canvas exposes the logical viewport through its instance `width` and `height` properties, while the native canvas backing store is allocated separately.

Default policy:

```text
requested DPR: native device DPR
maximum DPR: 3
maximum backing-store pixels: 8,000,000
DPR quantization: downward to 0.125 increments
```

The context transform maps logical coordinates to the physical backing store and is restored before every `drawScene` invocation.

This preserves the existing game-space contract while allowing sharper rendering on high-density devices.

### Fold 6 closed profile

Tested browser viewport:

```text
logical viewport: 368 × 869
reported DPR: 2.625
effective DPR: 2.625
native backing store: 966 × 2281
backing pixels: 2,203,446
```

### Fold 6 open profile

Tested browser viewport:

```text
logical viewport: 884 × 1104
reported DPR: 2.625
effective DPR: 2.625
native backing store: 2321 × 2898
backing pixels: 6,726,258
```

Both remain below the eight-million-pixel budget.

### Large-viewport cap

A deterministic `1920 × 1080`, DPR-3 case is reduced to an effective DPR of `1.875` by the pixel budget. This prevents an unbounded `5760 × 3240` allocation while retaining more than CSS-pixel resolution.

### DPR-safe glitch path

The original RGB-split effect could require pixel readback using logical dimensions against a larger native backing store. The M10 shim replaces that managed-canvas path with a logical scratch-canvas blit.

Chrome validation forced `game.ctx.getImageData()` to throw and then executed the RGB-split effect. The effect rendered successfully, establishing that the managed DPR path did not use `getImageData` in that test.

## Asset resilience contract

The asset runtime replaces the legacy fire-and-forget loader with a finite policy:

```text
mode: auto or explicit offline
per-attempt timeout: 2500 ms by default
overall timeout: 6500 ms by default
maximum network attempts per asset: 2
network image mode: anonymous CORS
completion: idempotent
```

Every level receives an inspectable asset record. A failed or unavailable image receives a procedural replacement and remains drawable.

### Shared fallback atlas

Fallbacks are cached by normalized accent color. Each retained fallback surface is `480 × 270`; levels with the same accent reuse the same surface.

This avoids allocating a separate `960 × 540` bitmap for every level. The browser gate required no more than eight unique fallback surfaces for the current catalog.

### Explicit offline mode

The Chrome test loaded:

```text
?assetMode=offline&renderDpr=native
```

Verified results:

- zero catalog-image network requests
- zero asset network attempts
- every catalog entry settled
- every level had a complete drawable image source
- all unavailable catalog images used procedural fallbacks
- the menu became visible after the existing 500 ms reveal transition
- zero browser exceptions

Offline mode is a controlled diagnostic and resilience mode. It does not imply that external assets should be removed from the final visual direction.

## Defects found during validation

### M10-F1 — Omitted numeric query parameters collapsed to zero

**Observed in:** Fast Gameplay QA `30968920182`  
**Mechanism:** `URLSearchParams.get()` returned `null`; the numeric helper converted `null` to `0`; the DPR cap was then clamped to `1`. Native-DPR rendering was silently disabled when the cap parameter was omitted.

**Correction:** Treat `null`, `undefined`, and the empty string as absent values and preserve policy defaults. Deterministic tests now cover omitted render and asset parameters.

### M10-F2 — Dynamic-only bootstrap did not guarantee preload interception

**Observed while investigating:** Fast Gameplay QA `30968920182`  
**Mechanism:** The legacy game listener could construct `Game` and begin catalog image requests before dynamically appended resilience scripts had installed their prototype wrappers.

**Correction:** `tools/fixed-step-clock.js`, already loaded synchronously before the inline game script, now inserts the M10 shims in parser order. The viewport bootstrap remains only a duplicate-safe fallback.

**Result:** Explicit offline mode made zero catalog-image requests in the final Chrome test.

### M10-T1 — Initial browser assertion ignored the existing reveal transition

**Observed in:** Fast Gameplay QA `30969232035`  
**Mechanism:** The test asserted menu visibility immediately after asset settlement, while the original `finishLoading()` intentionally reveals the menu after 500 ms.

**Correction:** Preserve the product transition and wait for eventual menu visibility. No gameplay or UI timing was changed to satisfy the test.

## Final automated gate

Fast Gameplay QA `30969388698` passed all of the following at implementation head `6300809b94bc0e3f8836b25bd064405ec7590b50`:

- syntax checks
- deterministic timing, collision, input, Gate, M9 evidence, viewport, M10 render, M10 asset, telemetry, grammar, and diagnostics contracts
- fixed-step Chrome integration
- collision/input/touch Chrome integration
- fail-closed reachability-policy Chrome integration
- Gate-slice Chrome integration
- M9 evidence and Fold-profile Chrome integration
- M10 DPR and offline-asset Chrome integration
- telemetry and fast-retry Chrome integration
- obstacle-grammar Chrome integration

## Established

Under the tested Chrome model:

- logical gameplay geometry remains expressed in CSS pixels
- Fold-closed and Fold-open canvases receive bounded DPR backing stores
- the tested backing stores remain under the configured pixel budget
- explicit offline mode avoids catalog image requests
- missing catalog images resolve to bounded shared procedural surfaces
- the managed RGB-split path operates without `getImageData`
- prior fast gameplay suites remain green

## Not established

Milestone 10 does not establish:

- physical Galaxy Z Fold 6 frame rate or frame-time stability
- GPU-memory pressure under long sessions
- thermal behavior or battery cost
- Samsung Internet behavior
- Safari behavior
- visual preference for native DPR versus a lower cap
- external asset reliability from the itch.io origin
- Gate comprehension, fun, balance, or replayability
- production readiness

## Deployment

None. PR #3 remains draft. PR #2 and PR #1 remain draft. `main` and the live itch.io build remain unchanged.