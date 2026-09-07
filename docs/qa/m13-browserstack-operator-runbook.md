# M13 BrowserStack Operator Runbook

## Purpose

Use this runbook to execute and interpret the M13 cross-screen and real-device smoke gates without changing `main` or deploying the game.

## Required repository secrets

The repository must contain these GitHub Actions secrets:

```text
BROWSERSTACK_USERNAME
BROWSERSTACK_ACCESS_KEY
```

Never commit, print, screenshot, or paste their values into issues or chat.

## Gate order

Always run the free local matrix before spending BrowserStack minutes.

### 1. Local cross-screen gate

Workflow:

```text
M13 Cross-screen QA
```

Expected branch:

```text
develop/m13-cross-screen-automation
```

The workflow installs pinned Playwright browsers and tests representative phone, Fold, tablet, laptop, desktop, Firefox, and WebKit configurations.

Do not proceed to BrowserStack if this workflow is red.

### 2. Real-device gate

Workflow:

```text
M13 Real-device QA
```

Once the workflow exists on the default branch, use GitHub’s `Run workflow` control and choose the intended branch or release candidate.

While M13 remains stacked and absent from the default branch, a commit changing only:

```text
.github/browserstack-run-request.txt
```

can trigger the branch-local workflow. Do not use this request-file path for routine changes.

## Reusable real-device topology

The workflow runs two jobs.

### Desktop job

```text
desktop-browserstack-smoke
```

Target:

```text
Windows 11
Chrome latest
1440 × 900
```

Transport:

```text
raw Playwright BrowserStack connection
explicit BrowserStack Local action
local server port 8099
```

### Real-mobile job

```text
real-mobile-browserstack-smoke
```

Targets:

```text
Samsung Galaxy S23 Ultra
Android 13
Chrome

_iPhone 13
_iOS 15
_Safari
```

Transport:

```text
BrowserStack Node SDK
browserstack.yml
local server port 3000
http://bs-local.com:3000
forced Local routing
```

## Objective smoke assertions

The selected browser must:

- load the game document
- expose `#game-container`
- render a visible canvas
- initialize viewport classification
- initialize the touch-target policy
- create a nonzero canvas backing store
- avoid horizontal overflow
- keep the canvas aligned with the viewport
- remain under the eight-million-pixel backing budget
- provide `44 × 44` CSS-pixel visible controls
- avoid page-level JavaScript exceptions

## Artifact review

For local Playwright failures inspect:

```text
m13-playwright-report
m13-test-results
```

For BrowserStack desktop failures inspect:

```text
m13-desktop-server-log
BrowserStack session video
BrowserStack network logs
BrowserStack console logs
```

For BrowserStack mobile failures inspect:

```text
m13-mobile-server-log
m13-browserstack-sdk-evidence
BrowserStack session video
BrowserStack network logs
BrowserStack SDK logs
Playwright error context and screenshots
```

## Failure classification

### Setup or integration failure

Examples:

- missing lockfile required by a cache setting
- unsupported Playwright capability string
- malformed BrowserStack endpoint
- invalid `browserstack.yml` field
- BrowserStack Local tunnel failure
- device unavailable
- authentication failure

These do not prove a game defect. Correct the infrastructure and rerun the narrowest canary first.

### Navigation failure

Examples:

- `#game-container` absent
- final URL is not the expected Local URL
- response status is null or unexpected
- page title/body indicate BrowserStack or proxy error

Inspect the retained navigation evidence before changing game code.

### Game or layout failure

Examples:

- horizontal overflow
- undersized controls
- canvas does not cover the viewport
- backing-store budget exceeded
- page-level JavaScript exception
- expected viewport profile missing

These should be corrected in the game/runtime branch and proven first through the local Playwright matrix.

## Usage policy

Run BrowserStack when:

- viewport or touch behavior changes
- browser-specific code changes
- a release candidate is prepared
- local WebKit or Firefox reveals a likely engine issue
- a real-device regression needs confirmation

Do not run BrowserStack for:

- documentation-only changes
- comments or formatting
- unrelated deterministic solver changes
- every incremental commit

## Claim boundary

A green BrowserStack smoke run proves only the assertions above for the selected target and build. It does not prove long-session performance, thermal behavior, battery use, haptic quality, subjective touch latency, Gate comprehension, fun, or broad market compatibility.
