# D-023 — Separate emulated breadth from real-device transport truth

**Date:** 2026-08-05  
**Status:** Accepted on stacked development branch

## Decision

Use a two-layer test architecture for screen and browser compatibility:

1. A pinned Playwright matrix in GitHub Actions for broad, repeatable coverage across representative phone, Fold, tablet, laptop, desktop, Chromium, Firefox, and WebKit configurations.
2. A manually invoked BrowserStack workflow for selected real desktop, Android, and iOS targets.

Keep desktop BrowserStack automation on the validated raw Playwright connection path. Use the BrowserStack Node SDK for real Android and iOS sessions. Route real-mobile Local traffic through the explicit `bs-local.com` hostname, force Local routing, and retain navigation diagnostics.

Do not run BrowserStack on every push. Ordinary changes use the free local matrix; real-device minutes are reserved for viewport/runtime changes, release candidates, and browser-specific uncertainty.

## Context

The project must support more than the owner’s Galaxy Z Fold 6. Desktop emulation can catch layout, overflow, sizing, state, and browser-engine regressions, but it cannot establish actual mobile-browser transport, OEM behavior, Mobile Safari behavior, thermal cost, touch feel, or physical Fold ergonomics.

The first M13 integration attempts also demonstrated that BrowserStack transport is not uniform:

- desktop Chrome accepted the raw Playwright endpoint
- real Android rejected that endpoint as malformed
- BrowserStack’s mobile SDK required YAML-owned string test selection
- iOS Safari required explicit `bs-local.com` routing rather than relying on localhost rewriting

Treating all platforms as one connection mechanism would preserve a fragile and misleading workflow.

## Rationale

The local Playwright layer is fast, deterministic, inexpensive, and suitable for every relevant pull request. It can exercise a much larger screen matrix than a paid device cloud should run continuously.

The BrowserStack layer proves a smaller set of claims that emulation cannot:

- credentials and tunnel setup are valid
- a cloud browser or real device can reach the branch-local game
- the target browser can execute the smoke test
- the observed layout satisfies the same objective contracts
- BrowserStack captures video, network, and failure evidence

Separating the transport implementations preserves the exact path that each platform proved. It also avoids spending real-device minutes while debugging local configuration errors.

## Consequences

- `@playwright/test` remains pinned to `1.59.1` for the validated shared BrowserStack support window.
- `browserstack-node-sdk` remains pinned to `1.64.2`.
- Visible interactive controls must satisfy a `44 × 44` CSS-pixel minimum.
- The local matrix remains the required precondition for a BrowserStack run.
- Desktop Chrome uses `tools/browserstack-real-device-smoke.mjs` with explicit BrowserStack Local lifecycle.
- Samsung Android and iPhone Safari use the BrowserStack SDK, `browserstack.yml`, port `3000`, `bs-local.com`, and forced Local routing.
- BrowserStack configuration is statically checked in the ordinary local matrix.
- Real-device smoke results are not performance benchmarks or human-gameplay validation.
- Physical Fold 6 DPR, heat, battery, touch, and game-feel evidence remain governed by the M12 protocol.
- PR #6 remains draft; no merge or deployment is authorized by this decision.

## Validated canaries

- Desktop Chrome: `M13 Real-device QA #3`, commit `b2e140ace455f0c0e992c7bee8561afb74b9d145` — passed.
- Samsung Galaxy S23 Ultra, Android 13, Chrome: `M13 Real-device QA #6`, commit `3a161fa8f389689401eb1da49b346c021abba127` — passed.
- iPhone 13, iOS 15, Safari: `M13 Real-device QA #8`, commit `c6c7c5468eab3ba5950d10c1b9200efcc7c711a2` — passed.

## Revisit when

- BrowserStack drops support for the pinned Playwright version.
- Device availability changes materially.
- The project adds installable PWA or native-shell behavior.
- Visual-regression baselines stabilize enough to justify broader real-device screenshot comparison.
- A release candidate requires a larger Android/iOS version matrix.
