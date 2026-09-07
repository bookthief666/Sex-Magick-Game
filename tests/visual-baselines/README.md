# M14 visual regression

## Status: the mechanism below is superseded — see D-046

**This file described a sha256-per-screenshot baseline
(`m14-signatures.json`) that required a byte-identical match.** M32
(`docs/decisions/d046-*.md`) replaced it with Playwright's native
`toHaveScreenshot({ maxDiffPixelRatio })`, which compares the same four
geometries and seven states against committed PNG baselines with a per-pixel
tolerance instead of a hash. The three defects documented below, and the
fourth that motivated the switch, are the reason — read on, they are still
true and still the reason the current mechanism works the way it does. Skip
to **"How to re-establish it"** at the bottom for the current process; the
sha256/JSON-baseline steps that used to be there no longer apply.

Everything from here through "The fourth defect" is kept as the historical
record of what three real rounds of fixing this actually found. None of it
was wasted: the phase-locking, the telegraph-timer fix, and the
blank-canvas-capture fix are all still exactly how the suite gets a real,
painted, settled frame to compare — `toHaveScreenshot` only replaced the
*comparison*, not the capture.

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

## The third defect: the capture raced a 1100ms timer

Arming the phase-locked baselines failed too, and again narrowly and again only on
`chromium-desktop` — but this time the four standard states matched **exactly** on
both attempts while all three gate states differed from the baseline *and* from
each other between attempts. That pattern is the diagnosis: whatever moved was
specific to the gate page.

It is `setTelegraph()` in `gate-slice-runtime.js`, which hides its box with a
**1100 ms `setTimeout`**. Only the three gate states raise a telegraph — "THE GATE
OPENS", "GNOSIS BANKED +30", "WAGER ACCEPTED × 10" — and it is a large, high
contrast panel. Between the pose and the capture the suite runs
`waitForVisualSettlement()`, whose length is a variable number of 50 ms polls plus
round-trips, so whether that panel is still on screen at capture time is a race
against wall-clock. `chromium-desktop` is the largest geometry and the slowest to
settle and screenshot, so it crossed 1100 ms while the three smaller geometries
stayed under it.

Measured directly: at 200 ms and at 1400 ms after the pose, the three gate states
hash differently and the standard states do not.

**The fix** cancels the pending hide (`pinTelegraph()`, called from `drawNow()`),
so telegraph visibility is a function of the pose rather than of elapsed time.
`resetUi()` hides it and clears the timer at the start of every pose, so nothing
leaks from one state into the next.

Verified against the spec's own flow — dynamic-text lock, geometry settlement,
repaint, container screenshot — run three times, once with **2500 ms** of extra
delay injected before the capture: all seven states identical in all three runs.
Two other states looked time-dependent in a first, cruder probe; both were probe
artifacts from skipping the text lock and the settle step, and neither reproduces
under the faithful flow.

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

## The fourth defect: still open

With the telegraph pinned, `chromium-desktop` reproduced **all 7 signatures
exactly**. The failure moved to the fold geometries:

| project | attempt 1 | retry |
|---|---|---|
| `chromium-desktop` | 7/7 match | — |
| `chromium-fold-cover` | 3 gate states differ | 7/7 match (flaky) |
| `chromium-fold-inner` | 3 gate states differ | also differs on `death`, `gameplay`, `retry` |

So it is still the gate page, still those three states, now on the narrower
geometries and at roughly a coin-flip rate. `menu` has never moved once, in any
run, on any geometry.

What is *not* the cause, each ruled out by measurement rather than argument:
random spawning (eight contexts byte-identical with identical inputs), animation
phase (locked, and verified stable across three consecutive draws), and elapsed
wall-clock time (verified stable with 2500 ms injected before capture, under the
spec's own flow).

**The recommendation was to stop fixing and change the comparison** — written
here at the time rather than done unasked, since it was a design change and
the owner's call. They made that call in M32: move to
`toHaveScreenshot({ maxDiffPixelRatio })`. See `docs/decisions/d046-*.md` for
the decision itself and the calibration status of the current tolerance
value.

## How to re-establish it (current process, per D-046)

Baselines are PNG files under `tests/visual-state.spec.ts-snapshots/`,
generated and reviewed only through CI — never generated locally, for the
same Chromium-version reason noted below.

1. Trigger `cross-screen-qa.yml` via `workflow_dispatch` with
   `update_snapshots: true`.
2. That run opens a PR containing the regenerated PNGs — it does not commit
   them directly. **Review every PNG in that PR's diff before merging.**
   D-024 requires baseline changes to be explicit, and this is that review
   step, now done by eye against the actual pictures rather than by eye
   against a hash diff.
3. Merge the PR once satisfied.
4. Re-run the workflow **twice** on the merged commit with
   `update_snapshots` left off (the normal comparison path). It should be
   green both times — that is the actual proof the comparison is stable, not
   merely believed to be. Read the real diff percentages Playwright reports
   for any state that comes close to `maxDiffPixelRatio`, and tighten or
   loosen the value in `playwright.config.ts` accordingly, with the
   justification recorded in D-046.

This process was designed specifically to avoid depending on Actions
artifact download: in at least one prior environment, the `m15-test-results`
artifact could not be downloaded at all (403 on
`productionresultssa0.blob.core.windows.net`, an egress policy denial, not
something to route around). A PR's own diff view renders PNGs inline and is
delivered over the repository's normal git/API path, not the artifacts
backend, so it is unaffected by that block.

Note for the development sandbox: it runs Chromium 1194 against a Playwright
pinned to 1217 and **cannot reproduce CI's screenshots locally**, regardless
of tolerance — a different browser build, not merely rendering noise. A
local run of `visual-state.spec.ts` is expected to fail the screenshot
comparison for that reason alone; the structural test above it
(`standard visual states remain reachable...`) does not touch screenshots
and is the one to trust locally.
