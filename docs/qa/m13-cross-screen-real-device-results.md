# Milestone 13 — Cross-screen and Real-device Automation Results

**Branch:** `develop/m13-cross-screen-automation`  
**Base:** `752ea422f04f1ba3987ebc6d3426781b6234031f` (`develop/m12-physical-performance-evidence`)  
**Reusable implementation head before this record:** `e5847afe48932079777565f248495a5f625f7363`  
**Reusable-head local QA:** GitHub Actions run `31062359820` — success  
**Status:** Accepted as cross-screen and real-device smoke-test infrastructure; keep stacked PR draft and unmerged.

## Scope

Milestone 13 adds objective browser, viewport, touch-target, canvas, and BrowserStack smoke-test infrastructure. It does not alter Gate, Gnosis, Void, scoring, player physics, input-buffer behavior, collision geometry, obstacle grammar, Monas, leaderboard semantics, `main`, or the published itch.io build.

## Local Playwright matrix

The repository pins:

- `@playwright/test` `1.59.1`
- `browserstack-node-sdk` `1.64.2`
- Node.js `22` in GitHub Actions

The automatic local matrix exercises:

- Chromium small phone — `320 × 568`
- Chromium Android phone — `360 × 800`
- Chromium modern phone — `390 × 844`
- Chromium Fold cover — `368 × 869`, DPR `2.625`
- Chromium Fold inner — `884 × 1104`, DPR `2.625`
- Chromium tablet — `768 × 1024`
- Chromium laptop — `1366 × 768`
- Chromium desktop — `1920 × 1080`
- Firefox desktop smoke
- WebKit mobile smoke

The matrix checks:

- viewport-profile classification
- horizontal document overflow
- canvas coverage of the logical viewport
- logical canvas dimensions
- bounded backing-store allocation
- visible-control minimum size of `44 × 44` CSS pixels
- page-level JavaScript exceptions
- major resize/orientation settlement
- BrowserStack SDK configuration contracts

The final reusable-head local run `31062359820` passed all required steps and uploaded its Playwright report and test-result artifacts.

## Accessibility correction discovered by M13

The first real local matrix found three visible controls below the project’s touch-target policy:

- `ACKNOWLEDGE` — approximately `24.5` CSS pixels high
- `SETTINGS` — approximately `43.2` CSS pixels high
- `TEST LEADERBOARD` — approximately `43.2` CSS pixels high

Milestone 13 added `tools/touch-target-runtime.js`, enforcing a `44 × 44` CSS-pixel minimum for interactive controls without changing game geometry or scoring. The policy is exposed through `window.__SEX_MAGICK_TOUCH_TARGETS__` and is asserted in local and BrowserStack smoke tests.

## Real-device and cloud-browser canaries

Each target was validated independently before being included in the reusable workflow.

### Desktop Chrome

- Workflow: `M13 Real-device QA #3`
- Commit: `b2e140ace455f0c0e992c7bee8561afb74b9d145`
- Result: success
- Duration shown by GitHub: 31 seconds
- Transport: raw Playwright connection to BrowserStack desktop endpoint
- Local server: port `8099`

This canary proved repository secrets, BrowserStack authentication, BrowserStack Local, the static GitHub Actions server, desktop session allocation, and the responsive smoke assertions.

### Samsung Galaxy S23 Ultra — Android 13, Chrome

- Workflow: `M13 Real-device QA #6`
- Commit: `3a161fa8f389689401eb1da49b346c021abba127`
- Result: success
- Duration shown by GitHub: 1 minute 43 seconds
- Transport: BrowserStack Node SDK
- Local URL: BrowserStack Local through the SDK

This canary proved a real Android session could load the locally served game and satisfy the responsive smoke contract.

### iPhone 13 — iOS 15, Safari

- Workflow: `M13 Real-device QA #8`
- Commit: `c6c7c5468eab3ba5950d10c1b9200efcc7c711a2`
- Result: success
- Duration shown by GitHub: 1 minute 36 seconds
- Transport: BrowserStack Node SDK
- Explicit Local URL: `http://bs-local.com:3000`
- Forced Local routing: enabled

This canary proved real Mobile Safari could load the locally served game through the explicit iOS-compatible BrowserStack Local hostname and satisfy the responsive smoke contract.

## Integration defects found and corrected

### Premature npm cache requirement

The first workflow enabled npm caching before a lockfile existed. GitHub stopped during Node setup with `Dependencies lock file is not found`. The cache requirement was removed; this was a workflow setup defect, not a game failure.

### Incorrect profile expectation

The first matrix expected `360 × 800` to classify as `compact-phone`. Its tall aspect ratio correctly maps to `tall-phone`. The test expectation was corrected; runtime classification was retained.

### Unsupported Playwright capability strings

BrowserStack rejected forced `1.60` and shortened `1.59` capability combinations before session allocation. The toolchain was aligned to installed client `1.59.1`, and automatic BrowserStack server selection was retained.

### Raw mobile endpoint mismatch

Desktop BrowserStack accepted the raw Playwright connection path. Real Android returned `Malformed endpoint`, proving mobile transport must not reuse the desktop connection path. Android and iOS now use the BrowserStack Node SDK.

### SDK `testMatch` serialization

A TypeScript regular-expression `testMatch` serialized into an invalid BrowserStack YAML value. Test discovery now lives in `browserstack.yml` as a quoted string glob:

```yaml
 testMatch: "**/browserstack-mobile.spec.ts"
```

The local configuration contract prevents reintroduction of the regex path.

### iOS localhost routing

The first iPhone session launched Safari but never reached the game document; `#game-container` was absent. The iOS path now uses:

```text
http://bs-local.com:3000/index.html?assetMode=offline&renderDpr=native
```

and forces traffic through BrowserStack Local. The test records the final URL, title, response status, document readiness, and initial body text when navigation fails.

## Final reusable workflow topology

`.github/workflows/real-device-qa.yml` now defines two jobs:

1. `desktop-browserstack-smoke`
   - validated raw desktop transport
   - desktop Chrome target only
   - port `8099`
   - explicit BrowserStack Local lifecycle

2. `real-mobile-browserstack-smoke`
   - BrowserStack Node SDK
   - Samsung Galaxy S23 Ultra, Android 13, Chrome
   - iPhone 13, iOS 15, Safari
   - explicit `bs-local.com:3000` Local URL
   - forced Local routing

The branch-local request-file trigger remains available while the workflow is absent from the default branch. Once the workflow exists on the default branch, `workflow_dispatch` is the intended operator path.

## Evidence boundary

The three targets passed independently. The final reusable three-target topology is protected by the local configuration contract and the complete local Playwright matrix. It has not been rerun as a combined three-session BrowserStack bundle after the individual canaries; this is deliberate to conserve trial minutes.

Passing smoke tests establishes that the selected browsers can load the game and satisfy the asserted objective layout contracts. It does not establish:

- long-session GPU or thermal sustainability
- battery impact
- subjective touch latency
- haptic quality
- Gate comprehension or fun
- broad device-market compatibility
- all game-state visual correctness
- release readiness

The physical Fold 6 performance matrix from M12 and human gameplay evidence remain separate gates.

## Deployment and branch protection

- PR #6 remains draft.
- No M13 commit was merged into `main`.
- No itch.io deployment occurred.
- Earlier stacked PRs remain separate.
