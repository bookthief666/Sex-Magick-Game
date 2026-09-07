# D-020 — Bound high-DPR rendering and fail open with procedural asset fallbacks

**Date:** 2026-08-04  
**Status:** Accepted for development; physical-device performance remains unvalidated

## Decision

Preserve the existing logical CSS-pixel game coordinate system while allocating a separate, bounded high-density canvas backing store. Use the native device pixel ratio by default, capped at DPR `3` and eight million backing-store pixels.

Replace indefinite or partially completed catalog-image loading with a finite asset policy:

- anonymous-CORS image attempts
- at most two network attempts per catalog asset
- finite per-attempt and overall deadlines
- idempotent completion
- inspectable per-asset state
- deterministic procedural fallbacks
- explicit offline test mode
- shared accent-keyed fallback surfaces

Load both shims in parser order before the game is constructed. Keep duplicate-safe dynamic bootstrapping only as a fallback.

## Context

The original canvas used CSS viewport dimensions as both logical and physical pixels. On the Galaxy Z Fold 6 report, a DPR of `2.625` meant the browser could display a sharper image than the one-pixel-per-CSS-pixel backing store provided.

Simply multiplying `canvas.width` and `canvas.height` by DPR would break existing gameplay code because collision, player placement, obstacle generation, HUD calculations, and drawing routines all read those properties as logical game dimensions.

The original asset loader also began all external catalog requests immediately and exposed an eight-second continuation path without a complete per-asset outcome contract. A network failure could leave levels without a reliable drawable source, and a dynamically loaded resilience wrapper could install too late to intercept the initial preload.

## Rationale

A compatibility shim is lower risk than rewriting every game-space consumer. Logical accessors allow existing code to continue reading CSS-pixel dimensions while the native backing store and transform provide higher-density rendering.

A hard pixel budget is required because a raw high-DPR allocation scales quadratically. The Fold-open test at `884 × 1104`, DPR `2.625`, produces `6,726,258` backing pixels and remains within the budget. A `1920 × 1080`, DPR-3 case is reduced to DPR `1.875` rather than allocating more than eighteen million pixels.

Asset failure must degrade visual richness rather than block gameplay or leave undefined image state. Shared fallback surfaces bound memory more effectively than one generated bitmap per level.

Parser-ordered installation is required because the original game begins preloading from its `DOMContentLoaded` construction path. Dynamic insertion alone does not prove interception before that listener runs.

## Consequences

### Positive

- Existing logical geometry remains stable.
- High-density devices can render above CSS-pixel resolution.
- Backing-store memory has an explicit upper bound.
- Managed RGB-split rendering no longer relies on `getImageData` readback.
- Explicit offline mode can start without catalog-image network requests.
- Every catalog level receives a complete drawable source.
- Asset outcomes are inspectable and bounded.
- Shared fallback surfaces limit fallback bitmap allocation.

### Costs and risks

- Instance-level canvas accessors add compatibility complexity.
- Third-party code reading native canvas dimensions must use the render snapshot or prototype descriptors rather than the managed instance properties.
- High-DPR rendering still has physical GPU, thermal, and battery costs that automated Chrome cannot validate.
- Parser-time `document.write` is accepted only as a contained compatibility bridge for the current single-file architecture; it should not become a general loading strategy.
- Procedural fallbacks preserve function, not the intended final art direction.
- Automatic retry cannot guarantee that remote assets are valid, CORS-clean, performant, or permanently available.

## Validation boundary

Automated validation establishes the contract only in the tested Chrome environment:

```text
Fold closed: 368 × 869 logical, DPR 2.625, 966 × 2281 backing
Fold open:   884 × 1104 logical, DPR 2.625, 2321 × 2898 backing
```

It also establishes explicit offline startup without catalog requests and with complete procedural fallbacks under that environment.

It does not establish physical Fold performance, Samsung Internet behavior, Safari behavior, thermal stability, battery cost, visual preference, or release readiness.

## Revisit when

- native ES modules or a bundler replace the current parser-order script architecture
- the game is decomposed beyond prototype shims
- long physical Fold sessions reveal frame-time, memory, or thermal problems
- assets move to a controlled same-origin or versioned delivery pipeline
- the final visual direction requires per-level fallback art rather than accent-keyed procedural fields

## Evidence

- `docs/qa/m10-render-resilience-results.md`
- `tools/test-canvas-render-runtime.js`
- `tools/test-asset-resilience-runtime.js`
- `tools/browser-m10-render-resilience-test.mjs`
- Fast Gameplay QA `30969388698`