# D-049 — Legacy browser QA should prefer the locked Playwright Chromium

**Status:** Accepted CI reliability fix. No gameplay/runtime semantics change.

## Context

Fast gameplay QA now installs the repository's locked `@playwright/test` dependency and its matching Chromium revision before browser integration. Three older CDP harnesses—fixed-step, collision, and telemetry—were still ignoring that installed browser and discovering system `google-chrome` first.

The fixed-step harness twice failed before gameplay while waiting for `http://127.0.0.1:9222/json/version`, while unchanged-head reruns could pass the complete browser ladder. The failure occurred after all deterministic contracts passed and before any page interaction, which localizes it to browser process startup rather than simulation/gameplay.

## Decision

1. Add `tools/qa-chrome-env.mjs` as a small compatibility bridge for legacy harnesses.
2. If `CHROME_BIN` already points to an existing executable, preserve it.
3. Otherwise, when the locked Playwright package and installed browser are present, set `CHROME_BIN` to `chromium.executablePath()` only after verifying the path exists.
4. If Playwright or its browser is absent, leave `CHROME_BIN` unset so the legacy harness keeps its existing system-Chrome fallback. This preserves lightweight/manual workflows that do not run `npm ci`.
5. Load this bridge before the fixed-step, collision, and telemetry CDP harnesses.

## Claim boundary

This change removes an unnecessary source of browser-version/environment drift. It does not weaken any browser assertion, retry a failed gameplay assertion, or change game code.

The Fast QA MONAS artifact uploader can still emit a secondary missing-artifact error when an earlier browser step aborts the job. That diagnostic-noise cleanup remains separate from this browser startup fix.
