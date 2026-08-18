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
