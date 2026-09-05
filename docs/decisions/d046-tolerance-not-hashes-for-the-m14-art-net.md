# D-046 — Tolerance, not hashes, for the M14 art-regression net

Date: 2026-08-18
Status: Accepted

## Decision

`tests/visual-state.spec.ts`'s final test no longer requires its whole-container
screenshots to match a committed sha256 byte-for-byte. It now compares against
committed PNG baselines with Playwright's native
`expect(locator).toHaveScreenshot({ maxDiffPixelRatio })`, tolerance set once in
`playwright.config.ts`.

This is the owner's call, delegated explicitly, with one constraint: no cut
corners, no loss of the aesthetic coverage already refined. The reasoning below is
why this is not a corner cut — it is the correct tool for a problem three real
rounds of fixing already proved wasn't a defect in the page.

## Why: the byte-identical comparison was failing on noise, not on regressions

Three real harness defects were found and fixed while trying to arm the old
sha256 comparison (`tests/visual-baselines/README.md` has the full history):
phase-dependent ambient animation (stars, particles, the offer pulse, the Void's
glyph rain all keep moving between draws), a telegraph hide-timer racing the
capture, and a blank-canvas capture racing settlement's own `refresh()` call. Each
was a genuine bug, each was fixed, each stayed fixed.

**A fourth failure mode remained, and it was not a defect.** With every prior fix
in place, `chromium-desktop` reproduced all 7 signatures exactly, every time. But
`chromium-fold-cover` and `chromium-fold-inner` disagreed with themselves at
roughly a coin-flip rate — same commit, same code, different CI runs. Ruled out by
direct measurement rather than assumption:

- **Random spawning** — eight independent browser contexts hashed byte-identical
  under identical inputs.
- **Animation phase** — locked, and verified stable across three consecutive
  draws after the phase-lock fix.
- **Elapsed wall-clock time** — verified stable with 2500ms of extra delay
  injected before capture, under the spec's own real flow.

What's left is sub-pixel rasterisation jitter between otherwise-identical CI runs
of the same commit on the narrower geometries — the ordinary cost of a canvas game
with a live HUD rendered by a real browser, not a bug anywhere in this codebase.
**A byte-identical hash cannot distinguish that jitter from a genuine one-pixel
change to the art.** Both fail the same way: `expect(signatures).toEqual(baseline)`
returns false either way, and the failure output — a hash mismatch — carries no
information about which one happened.

## Why this isn't a coverage loss

`toHaveScreenshot` is not a looser version of the old check — it is a *more
precise* one. It still fails on a real change to the field, strata, pillars,
avatar, or level art, which is the entire reason M14 exists (D-024). What it adds
is the ability to *see the difference* on failure — Playwright writes actual,
expected, and diff images automatically — and the ability to set a tolerance
narrow enough to catch real regressions while wide enough to clear the rasterisation
noise the byte-identical comparison could never tell apart from one.

Nothing about the refined aesthetic gets less protected. If anything it is
protected more honestly: a net that fails at a coin-flip rate for reasons
unrelated to the art gets ignored or disabled (which is exactly what happened —
M14 has been disarmed since M21), and a disabled net protects nothing at all.

`package.json` already carried an unused `test:cross-screen:update` script
anticipating this exact workflow. This finishes wiring it up rather than
introducing new tooling.

## What changed

- **`tests/visual-state.spec.ts`** — removed `BASELINE_PATH`, `baselineData()`,
  `visualHash()`, and the `M14_VISUAL_SIGNATURE` console line. The final test now
  calls `expect(page.locator('#game-container')).toHaveScreenshot(...)` once per
  state, in place of hashing and manually comparing against a JSON file. Every
  part of the capture pipeline that the three real fixes touched — `showState`,
  `waitForVisualSettlement`, the `redraw()` call — is untouched. The structural
  test above it (layer/score/console-error assertions) never had anything to do
  with the flake and is untouched.
- **`playwright.config.ts`** — added `expect.toHaveScreenshot.maxDiffPixelRatio:
  0.006` as a global default, so the tolerance lives in one place. **This number
  is provisional**, chosen as a plausible starting point rather than measured —
  see Calibration below.
- **`.github/workflows/cross-screen-qa.yml`** — added a `workflow_dispatch`
  boolean input, `update_snapshots`. When true, a separate job
  (`update-visual-baselines`, scoped `contents: write` /
  `pull-requests: write` — the normal comparison job stays read-only) runs
  `npm run test:cross-screen:update` and, if it produced any PNG changes, opens a
  PR with them rather than committing directly. This is how D-024's explicit-review
  requirement is met under the new mechanism: the owner reviews actual pictures in
  the PR's diff view, not a hash. It was designed specifically to avoid Actions
  artifact download — a real, previously-hit egress block on
  `productionresultssa0.blob.core.windows.net` — since a `git push` to the repo's
  own remote is a different path entirely from the artifacts backend.
- **`tests/visual-baselines/README.md`** — marked the sha256 mechanism
  superseded, kept as historical record (the three defects it documents are still
  true and still exactly why the capture pipeline works the way it does), and
  updated the re-establishment steps to the current PR-based process.

## Calibration — the one number that is not yet evidence-based

`0.006` (0.6%) was chosen as a plausible starting point — conservative enough to
plausibly clear the kind of jitter the fourth defect describes on a
`#game-container` sized in the hundreds of thousands of pixels, without being
loose enough to plausibly hide a one-element art change. **It has not been
measured against real CI diff data**, and must not be read as settled until it
has been.

The plan: merge the first baseline-refresh PR once reviewed, then re-run the
plain comparison job twice on that same merged commit and read the actual `%`
Playwright reports for every state, especially any that approach the threshold.
Tighten or loosen from there, and record the final number's justification as an
addendum to this record rather than leaving `0.006` standing as an unexamined
guess.

## What this does not do

- **Does not touch HEX, MONAS, or any gameplay code.** This is test
  infrastructure only.
- **Does not relax what counts as a regression** for the states already covered —
  see "Why this isn't a coverage loss" above.
- **Does not extend M14's honest limits**, which are unchanged from the prior
  record: animation phase is pinned for capture (ambient motion itself is
  `browser-m21-aesthetic-test.mjs`'s job), retroactive coverage for pre-M25
  defects was never claimed, and the `assetMode=offline` gallery fallback means
  live image-fetch regressions are out of scope here.

## Evidence

- `npx playwright test --list` typechecks and enumerates all 40 tests across 8
  projects cleanly after the `visual-state.spec.ts` rewrite — no compile errors
  from the removed imports/functions.
- The `update-visual-baselines` job's shell logic was extracted and executed
  end-to-end against a real sandbox git repository with stubbed `git push`/`gh pr
  create`, in two states: no snapshot changes (correctly exits without opening a
  PR) and real snapshot changes (correctly detects them via `git status
  --porcelain`, commits with a clean message, and calls `gh pr create` with a
  `--body-file` whose content renders the intended backtick-wrapped inline code
  literally rather than having it interpreted as shell command substitution — the
  bug the first draft of this script had, caught by actually running it rather
  than by re-reading it).
- A YAML parse check caught a second real bug in the first draft: a heredoc body
  left flush against column 0 to avoid baking literal indentation into the commit
  message instead terminated the surrounding `run: |` block scalar early, which
  is invalid YAML. The final version uses `printf` per line instead of a heredoc,
  which has no terminator-indentation constraint to conflict with YAML's
  block-scalar rule in the first place.

## Addendum 2 — the calibration run happened, and 0.006 is ~29x too generous

Calibration finally ran on 2026-08-19 (run `32256329862`). The obstacle was that
Playwright reports a comparison's difference only on failure, so the two green runs
on the merged trunk said nothing about headroom. `playwright.config.ts` now reads
`M14_MAX_DIFF_PIXEL_RATIO` from the environment, exposed as a `workflow_dispatch`
input; setting it to `0` makes the suite report every non-identical comparison.

Result: **27 of 28 comparisons were byte-identical at tolerance zero.** The single
exception was `gate-offer` on `chromium-fold-inner` at **202 pixels** - about
**0.02%** of that container's 975,936 CSS pixels - and it was byte-identical on
retry. The committed `0.006` is 0.6%, roughly 5,856 pixels, so the worst observed
real difference is about **29x smaller than the tolerance permits**.

A trap worth recording: Playwright printed `ratio 0.01` for that 202-pixel
difference, and printed the *same* `ratio 0.01` locally for a 20,035-pixel
difference. The displayed ratio is rounded to two decimals and is meaningless below
roughly 1.5%; **calibrate from the pixel count, not the printed ratio**, or be wrong
by two orders of magnitude in the loose direction.

The number has **not** been changed yet. One sample is not a distribution, and
tightening trades missed regressions for flakes - the failure mode that got M14
disarmed in the first place. A second sample is running; the recommendation, if it
agrees, is `0.001` (~5x headroom over the observed event, 6x stricter than today).
Full data and method: `docs/qa/m35-m14-tolerance-calibration.md`.

## Addendum — the first real review caught two defects a hash never could

The first `update_snapshots` run (workflow 32192780911) opened PR #16 with all 28
baseline PNGs. The owner looked at them and reported they didn't look right. Pulling
the PNGs directly from the PR branch and viewing them confirmed two real,
independent, pre-existing defects — not stale baselines, not a review mistake:

1. **Every one of the 28 screenshots had a permanent onboarding banner glued to the
   bottom of the frame.** `tools/collision-runtime.js`'s `installAccessibilityControls()`
   shows a one-time "VISUAL INTENSITY... ACKNOWLEDGE" sensitivity notice on any
   fresh browser profile, gated on a localStorage key. Every other QA-visible
   overlay in this codebase (leaderboard, missions HUD, powerup HUD) checks
   `visualQa=1` and suppresses itself; this one had no such check, and a fresh
   Playwright context is always a fresh profile — so the notice rendered over every
   state, every time, in all four geometries. Fixed by pre-seeding the same
   localStorage key in `visual-state.spec.ts`'s `seedPage()`, so a QA context looks
   like a returning player who already dismissed it. No production code changed;
   the notice still shows to every real first-time player exactly as before.

2. **`death.png` showed a real CSS bug: the wrong ghost text glitching over the
   game-over screen.** `.title-text::before`/`::after` — the chromatic-aberration
   glitch layer shared by all four `.title-text` headings across the game — had
   `content: "Sex Magick"` hardcoded rather than sourced from each heading's actual
   text. Only the start screen matched by coincidence; the game-over, pause, and
   settings screens all glitched "Sex Magick" over their real heading. M14 only
   captures the game-over screen among these, and it showed exactly that. Fixed in
   `index.html` with `content: attr(data-glitch-text)` and a matching attribute on
   each heading — same animation, same styling, now echoing the real text. This bug
   predates M14, M32, and this decision entirely; it was simply never visible to a
   human until a screenshot review was possible at all.

Both defects were invisible under the old sha256 mechanism by construction — a hash
mismatch carries no picture, so neither could have produced a legible signal even if
the byte-identical comparison had somehow stayed armed. This is the concrete case for
"Why this isn't a coverage loss" above: the switch to pixel comparison plus a
PR-based picture review didn't just tolerate rasterisation noise, it paid for itself
immediately by surfacing two things nobody could previously see. PR #16 was closed
unmerged rather than fixed up in place — its baselines were captured with both
defects present, and merging them would have cemented the banner and the mis-glitched
ghost text as the permanent "correct" appearance for the net to defend. A fresh
`update_snapshots` run off the fixed commit opened a replacement PR.
