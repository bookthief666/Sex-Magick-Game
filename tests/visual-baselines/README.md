# M14 visual signatures

`m14-signatures.json` holds a sha256 per (project, state) screenshot of
`#game-container`, for four reference geometries and seven states — 28 in total.

## Provenance of the current file

Established from **CI run [31686044845](https://github.com/bookthief666/Sex-Magick-Game/actions/runs/31686044845)**,
a fully green `M14 Visual-state QA` run on commit `9d060d5`. The hashes are the
`M14_VISUAL_SIGNATURE` lines emitted by `visual-state.spec.ts` for
`chromium-small-phone`, `chromium-fold-cover`, `chromium-fold-inner` and
`chromium-desktop`.

They were removed in M21, when the aesthetic pass legitimately changed every
rendered state, and stayed unestablished through M22–M24. This file restores the
pixel-regression coverage that D-024 requires and D-031 tracked as a release
obligation.

## What these signatures actually cover — read this before trusting them

**They are hashes of the whole `#game-container`, so any pixel change flips
them.** That includes DOM layers, HUD text, layout, safe-area insets and the
canvas.

**But in the posed states the canvas is very nearly unpainted.** Measured on the
committed renders at `chromium-fold-inner`, the fraction of non-black pixels is:

| state | non-black |
|---|---|
| `menu` | 79.9% |
| `gate-offer` | 3.3% |
| `void` | 2.5% |
| `gate-bank` | 2.5% |
| `death` | 2.3% |
| `gameplay` | 0.6% |
| `retry` | 0.6% |

`menu` is rich because the generated title backdrop is a CSS background. The
gameplay-side states are essentially HUD and telegraph text over a black canvas —
`__SEX_MAGICK_VISUAL_QA__` poses UI state and calls `drawScene()`, but the posed
scene does not produce a painted occult field.

This is **pre-existing and not a regression**: the same measurements come out
byte-identical at `6c75677` (pre-M24) and at the current commit.

The consequence is worth being blunt about: **these signatures would not have
caught the M21, M22 or M23 field regressions** — additive blending erasing the
Drive backgrounds, missing `accent` values, or the frozen `currentLevelIdx`. All
three were canvas-art defects in states this suite renders black. The net is real
for DOM, HUD and layout, and it will flag any *future* change to the canvas, but
it is not today an art-regression net.

**The high-value follow-up** is to make the gameplay poses render a real field —
a live pillar, the avatar, the strata — so the signatures cover the artwork the
owner actually looks at. That is tracked as follow-up work, not done here.

## How to re-establish it

1. Run **M14 Visual-state QA** in CI on a green commit
   (`workflow_dispatch` is enabled on `cross-screen-qa.yml`).
2. Take the `M14_VISUAL_SIGNATURE` lines from the four reference projects.
3. Write them as `{ project: { state: sha256 } }`, projects and states sorted.
4. Review the screenshots in the `m15-test-results` artifact before committing.
   D-024 requires baseline changes to be explicit, and this is that review step.

Note for the development sandbox: it runs Chromium 1194 against a Playwright
pinned to 1217 and **cannot reproduce these hashes locally**. A local run of
`visual-state.spec.ts` will fail the comparison for that reason alone. Verify
locally by rendering and looking at `test-results/m14-visual/**`, and take the
hashes only from CI.
