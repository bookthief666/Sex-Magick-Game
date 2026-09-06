# D-031 — The aesthetic pass, and the fill-rate budget it nearly spent

Date: 2026-08-13
Status: Accepted

## Decision

**The generated occult field is the game's real look.** Two new runtimes —
`tools/occult-art-runtime.js` (palettes, seeded glyph and seal generation,
offscreen caching) and `tools/occult-field-runtime.js` (background strata, wall
inscriptions, the Gate summoning, the Void) — replace the eight rotating
pentagrams of `drawHyperspaceTunnel`. Drive artwork still composites over the
field at its existing alpha, as enrichment.

**The field composites at CSS-pixel resolution into an offscreen buffer and is
blitted once.** That is not an optimisation added at the end; it is the only
reason the milestone fits inside the M11 performance budget.

## What the aesthetic actually changes

Per-Sephirah palettes keyed to the eight Gate bands, so ascending the Tree is a
colour journey — MALKUTH earthen and dim through to KETHER. Seeded seals and
Enochian-style inscriptions at three parallax depths. Walls carry carved glyph
strips. The Gate arrives as a summoning of counter-rotating seals. The Void
drains the band's colour out of the world, drops descending script through the
play area, and closes a vignette as the timer runs.

**No functional signal moved.** Hazard `#ff2f6d`/`#ff003c`, Hexagram `#00e5ff`,
Monas `#ffd700`, ward `#c9b4ff`, the Gate's 44px aperture and its boundary ring
keep their exact hues and geometry. `paletteCollisions()` returns `[]` and is
asserted in CI; the browser suite asserts `gateApertureUnchanged`. The point is
that Gate entry rate stays comparable to the 46.4% and 54.5% baselines instead of
being confounded by a redesign.

## The part worth recording: the budget nearly went

`browser-m11-performance-budget-test` failed on this branch. The convenient
reading was available and I had already written it into the plan — the suite is
known to be load-sensitive in this sandbox, and a previous milestone had recorded
it as pre-existing. **That reading was wrong, and checking cost one command.**
Run against a worktree at `9cd4217` it passed 3/3 while the branch failed 3/3, on
an idle machine, alternating.

The mechanism, once measured rather than assumed:

- The perf runtime discards any frame interval over 250ms as a suspension gap.
  At the Fold's open geometry the branch produced **~300ms frames, every one
  discarded** — `sampledFrames` stuck at 0 while `suspensionGaps` climbed. Pre-M21
  ran ~150ms with zero gaps.
- `drawField` performed **four full-screen operations per frame** — a radial
  gradient ground plus three parallax strata — drawn straight into the game
  canvas. That canvas is scaled by the device pixel ratio, so each operation
  rasterised 2321×2898 device pixels: **~27M pixels a frame**.

Three fixes, in increasing order of importance:

1. **The ground is cached.** It depends only on band, viewport and Void state, so
   painting a large radial gradient live every frame bought nothing.
2. **The strata scroll with one blit instead of two.** The double-width layer is
   now generated *horizontally periodic* — marks are drawn at −tile, 0 and +tile
   and the left tile is copied to the right half — so a single `drawImage` at
   `-drift` wraps seamlessly. The old second blit was not only a wasted
   full-screen fill: it alpha-composited a second copy over the rightmost `drift`
   pixels, a moving band of doubled density that grew across the screen each
   cycle. **A visual defect and a performance defect with one cause.**
3. **The field composites into an offscreen buffer at CSS-pixel resolution**, then
   blits once. The background gives up its DPR supersampling, which is the right
   thing to trade — it is soft line-work behind the gameplay, and pillars, avatar
   and HUD are untouched at full resolution.

Measured at fold-open after the fixes: **~87ms frames with zero suspension gaps**,
against pre-M21's ~150ms. The field is now roughly twice as cheap as the tunnel it
replaces, and M11 passes 3/3.

One number in `browser-m21-aesthetic-test` moved the "wrong" way and should not be
misread: `perFrameDrawMs` went from 0.76 to 4.15. The earlier figure measured
canvas calls being queued, with the real cost deferred to rasterisation; the buffer
does its work synchronously. Frame throughput improved 3.4× while that counter rose.

## Consequences

- `SIGIL CHANNEL OFFLINE` is unreachable. The generated field is the look, so a
  failed Drive fetch costs enrichment rather than producing an error screen. The
  start screen's Drive background was removed from `index.html` — the one
  deviation from the M21 plan, subtractive, and required for the offline test to
  pass with zero network requests.
- **The 28 M14 visual signatures are deleted in this commit and must be
  re-established from a green CI run before release.** Every rendered state
  changed, so the baselines could not survive; this sandbox cannot generate
  replacements CI would accept, because it runs Chromium 1194 against a Playwright
  pinned to 1217. `visual-state.spec.ts` guards with `if (baseline)`, so structural
  coverage — every named state reachable, correct layer, no LootLocker, no page
  errors — continues unchanged. `tests/visual-baselines/README.md` carries the
  procedure. **This is an open release obligation, not a completed step.**
- Cross-screen at both Fold postures shows four failures per project, all of them
  `ERR_TUNNEL_CONNECTION_FAILED` from blocked outbound hosts. The same four fail
  identically at `9cd4217`, so they are environmental and pre-existing.
- Evidence: 24 fast suites, 13 browser suites including M11 and M12, and gameplay
  captures at fold-open inspected directly rather than only measured.

## What this milestone does not settle

The field has never been seen on the Fold 6 itself. Frame cost here is software
rasterisation on a shared container — 87ms where a phone with a GPU should be far
under 16ms — so the sandbox can prove a *relative* improvement and nothing about
absolute smoothness. The owner's next session is the first look at whether the
Void frightens, whether the ward rings read mid-flight, and it remains the first
human measurement of M16 and M17.
