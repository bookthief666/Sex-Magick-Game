# D-042 — MONAS gets its own look, and a borrowed flag stops causing damage

Date: 2026-08-14
Status: Accepted

## Decision

MONAS stops looking like a recoloured copy of HEX standing still:

1. **The backdrop rotates.** Nothing had ever assigned `currentLevelIdx` for a
   MONAS run, so the photo, the accent wash and the tunnel/warp-star colour were
   pinned to whichever picture happened to be first, for the whole game — exactly
   the D-034 defect, recurring in the one mode D-034 could not reach because it was
   still sealed. MONAS now runs its own gallery (photo, every 4 gates) and its own
   colour rotation (`currentLevelIdx`, every 6 gates), on the same pattern the Gate
   slice already uses for HEX.
2. **A fractal spark**, not a flat filled square, is what the warp starfield is
   made of — a small self-similar sparkle (four cardinal spikes each forking into
   two shorter ones, four plain diagonal rays, a diamond core), cached once per
   colour and blitted like every other cached layer in this codebase.
3. **A perfect Coherence pass carries its own glitch signature** — a short gold
   screen-flash and a coin-flip `GlitchFX` pulse, reusing engines the base game
   already renders every frame rather than adding a new one.
4. **A rare ambient glyph flicker** during ordinary flight — invented sigil-script
   stamped near the avatar for a few frames, roughly every 4–8 seconds, built from
   the same `buildGlyphRun`/`drawGlyphRun` primitives the Void's falling script
   already uses.
5. **The Warp Surge gained a bloom** — a gold radial glow breathing from the same
   point the warp stars radiate from, widening as the surge runs down.

## The bug this milestone found, and what it cost

D-041 built the surge on HEX's `voidMode` flag deliberately, to reach the warp
starfield's existing fast-streak branch in `drawScene()` — and that session's own
record explains why: an earlier version cleared the flag too soon and the surge
shipped with a HUD and no visual, so D-041 held `voidMode` true for the surge's
whole duration as the fix. It solved that problem and created two worse ones:

- `occult-field-runtime.js`'s `voidActive` check is
  `gameInstance.voidMode || gameInstance.__gateSliceVoidActive` — setting
  `voidMode` for a MONAS surge also armed HEX's Void vignette and falling glyph
  rain, a second full field pass every frame that measured ~30ms on its own.
- `drawScene`'s `tunnelColor = this.voidMode ? '#00ffff' : lvl.accent` would have
  painted the Hexagram's reserved cyan over an event that has nothing to do with
  HEX — a real correctness bug, not just a performance one, and the kind M7's
  colour reservation exists specifically to prevent.

The fix decouples the surge from `voidMode` entirely. `WarpStar.prototype.update`
is wrapped to read `monasState.surgeActive` directly and apply the same speed
jump `voidMode`'s branch used to buy (`speed * 20`, the same ratio
`gameSpeed`-vs-`gameSpeed*0.05` gave); `voidMode` is never touched, so neither bug
can recur. `getCurrentGap`'s widening already read `surgeActive` directly and was
never affected.

## The measurement mistake almost shipped as a second "fix"

After removing the `voidMode` misuse, draw cost was still ~18ms against a 12ms
ceiling borrowed from `browser-m21-aesthetic-test.mjs`. The instinct was to keep
optimising — and one real win came from that: `drawSurgeBloom` was calling
`createRadialGradient` and filling the *entire canvas* with it every frame, which
evaluates the gradient function per pixel; caching it once into a 256×256 sprite
and blitting that instead (identical technique to the spark) dropped it further.

But the number never came close to 12ms, and the reason turned out not to be
MONAS at all. Measuring HEX under this suite's *own* methodology — real gameplay
driven through `updateGameObjects()`, then ten warm-up and sixty measured
`drawScene()` calls, the exact pattern `browser-m21-aesthetic-test.mjs` uses —
showed HEX costing the *same* ~16–17ms on this container, at every warm-up length
from 0 to 900 frames. Direct instrumentation of `drawHyperspaceTunnel` traced
essentially the whole figure to `drawLevelArtwork`'s `ctx.filter = 'blur(1px)'`
before its `drawImage` — a real cost, shared code, present for either mode once
artwork is loaded and drawn, and apparently not what the 12ms figure was measuring
in whatever scenario produced it.

The 12ms bound was borrowed without checking it was measuring the same thing.
It wasn't. The corrected test compares MONAS against HEX **in the same run, same
container, same methodology** — the comparison that is actually valid — and
asserts MONAS adds no more than a margin over HEX rather than clearing an
absolute figure with unclear provenance. A single sample either side turned out
not to be a fair comparison either: back-to-back runs on this container swung by
several milliseconds on their own, and one run failed the single-sample version
of this check at 23ms against HEX's 17ms — not a regression, just noise landing
on the wrong side of a tight margin. The test now takes five independent trials
per mode and compares medians. Across three full runs the observed gap between
medians was **0.48ms, 0.05ms and 1.10ms** (MONAS 17.27/17.00/17.93 against HEX
16.79/16.95/16.83), against an allowed margin of 6ms — stable, and nowhere near
what the real ~30ms `voidMode` bug would have shown.

## Evidence

- `browser-monas-test.mjs`, eleven scenarios against the shipped path:
  `currentLevelIdx` and the gallery entry both change during a real run (they
  never did before); a close warp star's rendered footprint is measurably hollow
  (line-art, not a filled square) and its sprite is cached, not redrawn as live
  paths; a perfect pass raises a gold flash on the exact frame it happens, isolated
  from the pre-existing orb-pickup flash by clearing `collectibles` for the
  duration of that check, since orbs spawn at the same gap centre this suite
  steers through and raise an identical `#ffd700` flash of their own; the surge
  speeds up the warp streak by ~50× over baseline, isolated in `WarpStar.update`
  directly rather than inferred from `drawScene`; the surge never sets `voidMode`;
  the bloom measurably warms the canvas centre (RGB, not alpha — the canvas is
  opaque under it either way); the ambient flicker schedules and reschedules
  itself; MONAS's draw cost sits within a small margin of HEX's measured the same
  way.
- 40 fast suites and 14 browser suites green, including the full pre-existing
  MONAS/HEX-untouched/surge-mechanics coverage from D-041, carried forward with
  updated assertions where the mechanism (not the behaviour) changed.

## What is still open

Same as D-041: MONAS runs the original score-based levelling with no band table
of its own, and its reachability envelope under *glide* physics is unsolved — the
M17 solver models the original impulse profile, not held lift. The look is
richer now; the ladder underneath it is still a follow-up.
