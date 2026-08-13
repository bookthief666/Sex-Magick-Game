# M14 visual signatures

`m14-signatures.json` holds a sha256 per (project, state) screenshot of
`#game-container`, for four reference geometries and seven states — 28 in total.

## Provenance of the current file

Established from **CI run [31691080584](https://github.com/bookthief666/Sex-Magick-Game/actions/runs/31691080584)**,
a green `M14 Visual-state QA` run (77 passed, 23 skipped, 0 failed) on commit
`ca4dc54` — the first run with the phase lock below in place. The hashes are the
`M14_VISUAL_SIGNATURE` lines emitted by `visual-state.spec.ts` for
`chromium-small-phone`, `chromium-fold-cover`, `chromium-fold-inner` and
`chromium-desktop`.

The signatures were removed in M21, when the aesthetic pass legitimately changed
every rendered state, and stayed unestablished through M22–M24. Restoring them is
the pixel-regression coverage that D-024 requires and D-031 tracked as a release
obligation.

## The second defect: the signatures were phase-dependent

Committing the painted-canvas baselines re-armed the comparison, and the very next
CI run **failed** — narrowly and informatively. `chromium-desktop` disagreed on
`gate-bank` on both attempts and on `void` on the retry only, while the other three
geometries reproduced all 28 hashes exactly.

The cause is that **the scene advances every time it is drawn**, so a signature
depended on how many draws happened to precede the capture:

| what moves | per draw | where it lives |
|---|---|---|
| `game.stars` | drift + twinkle | rebuilt by `startGame()` each pose |
| `game.backgroundParticles` | fall | created once at page init — phase is a running total of every draw since load |
| `game.gateSliceOffer.pulse` | `+0.08` | spawned during the gate poses |
| `game.screenFlash.duration` | `-1` | left live by the Void entry |
| the Void's `glyphRain` | `y += speed` | module-local in `occult-field-runtime.js` |

`backgroundParticles` is the one that made this a *flake* rather than a constant
offset: because its phase accumulates across the whole session, a single stray or
missing draw anywhere — a resize-triggered repaint during settlement, say — shifted
every later state. Desktop is where that extra repaint was most likely, and the
gate states are posed last, so they carried the most accumulated drift.

It also explains why `menu` was the one state that never moved across the
blank-canvas fix: the start screen covers the canvas, so ambient drift behind it
changes no pixels in the container screenshot.

**The fix** phase-locks the scene for capture. Each pose clears the record; the
first draw after a pose records the phase of every animated layer it can see, and
every later draw restores it. Layers are recorded on first sight rather than all at
pose time because the Void's glyph rain is seeded lazily by the first Void draw.
`occult-field-runtime.js` gains a read-only `getGlyphRain()` accessor for this;
rendering never reads it.

Measured after the fix: all seven states are byte-identical across three
consecutive draws, and identical across eight independent browser contexts. Before
it, every one of the seven changed on every redraw.

## The blank-canvas defect, and the correction to what I said about it

The previous baseline (run 31686044845 on `9d060d5`) hashed **an unpainted
canvas**. In the posed gameplay states the fraction of non-black pixels in
`#game-container` was 0.6% for `gameplay` and `retry` and 2.3–3.3% for
`death`/`void`/`gate-bank`/`gate-offer`, against 79.9% for `menu`.

**I diagnosed the cause wrongly, and this paragraph is the correction.** I wrote
here and in D-035 that *"the posed scene does not produce a painted occult
field"* — that the harness posed UI state and the field simply never rendered.
That is false. Instrumenting the pose showed the canvas reaching **100%** painted
immediately after `showState()`. What emptied it was the very next step:
`waitForVisualSettlement()` calls `__SEX_MAGICK_RENDER__.refresh()`, which
re-runs the viewport/resize path and clears the backing store, and the screenshot
was taken after that. Measured directly: 100% painted before `refresh()`, 0%
after. The pose was always right; the settle step wiped it.

The conclusion I drew was still correct — the net did not cover the artwork — but
the mechanism I gave was not, and a wrong mechanism sends the next person to fix
the wrong file.

**The fix** (`a23e671`) adds `redraw()` to the frozen `__SEX_MAGICK_VISUAL_QA__`
API and calls it in `showState()` *after* settlement, so the screenshot captures a
freshly painted frame. Locally at `chromium-fold-inner` the non-black fraction now
reads:

| state | before | after |
|---|---|---|
| `retry` | 0.6% | **99.7%** |
| `gameplay` | 0.6% | **97.0%** |
| `gate-bank` | 2.5% | **96.2%** |
| `void` | 2.5% | **96.2%** |
| `gate-offer` | 3.3% | **95.7%** |
| `death` | 2.3% | **83.8%** |
| `menu` | 79.9% | 79.9% (unchanged) |

The rendered `gameplay.png` now visibly shows the magenta field, the rotating
pentagram tunnel, inscribed pillars with hazard-pink edges, and the cyan Hexagram
avatar.

`menu` is the control: its visuals come from the generated title backdrop, which
is a CSS background on a DOM layer rather than canvas, so the fix cannot move it.
Comparing the new baseline against the old one bears that out exactly —
**4 signatures unchanged (all four `menu` entries), 24 of 28 changed.** That is
the precise fingerprint a correct fix should leave.

## What these signatures now cover

Hashes of the whole `#game-container`: DOM layers, HUD text, layout, safe-area
insets **and the painted canvas**. With the repaint in place this is an
art-regression net — a change to the field, strata, pillars, avatar or the level
artwork flips the hash for the affected states.

Three honest limits remain:

- Animation phase is pinned for capture, so the signatures assert *what* is drawn,
  not that the ambient layers, offer pulse, flash decay and glyph rain still
  animate. Those are covered by `browser-m21-aesthetic-test.mjs` instead.
- It would still not have caught the M21/M22/M23 defects *by itself*, because
  those baselines predate the fix. The claim going forward is about future
  changes, not retroactive coverage.
- The gallery entry drawn under `assetMode=offline` is a deterministic fallback,
  not a live Drive image, so image-fetch regressions are out of scope here.

## How to re-establish it

1. Run **M14 Visual-state QA** in CI on a green commit
   (`workflow_dispatch` is enabled on `cross-screen-qa.yml`).
2. Take the `M14_VISUAL_SIGNATURE` lines from the four reference projects.
3. Write them as `{ project: { state: sha256 } }`, projects and states sorted.
4. Review the screenshots before committing. D-024 requires baseline changes to be
   explicit, and this is that review step.

Note on step 4 from this session: the `m15-test-results` artifact **could not be
downloaded** — the egress policy denies the Azure blob host that serves Actions
artifacts (403 on CONNECT to `productionresultssa0.blob.core.windows.net`), and
routing around a policy denial is not an option. The review was done on locally
rendered equivalents instead, with the hashes taken only from CI. Anyone with
artifact access should prefer the artifact.

Note for the development sandbox: it runs Chromium 1194 against a Playwright
pinned to 1217 and **cannot reproduce these hashes locally**. A local run of
`visual-state.spec.ts` will fail the comparison for that reason alone. Verify
locally by rendering and looking at `test-results/m14-visual/**`, and take the
hashes only from CI.
