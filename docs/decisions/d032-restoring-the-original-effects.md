# D-032 — Restoring the original effects, and the two metrics that disagreed

Date: 2026-08-13
Status: Accepted

## Decision

**The generated field is a backdrop beneath the original game, not a replacement
for it.** `Game.prototype.drawHyperspaceTunnel` is now *called*, unmodified, over
the field rather than being replaced by it. The eight rotating pentagrams return
in the per-level accent, the level artwork returns at its original treatment, and
a per-level accent wash gives the background its frequent colour turnover back.

## What M21 actually broke

The owner tested M21, saw the improvement, and asked to retain the original
effects — the glitch work, the Drive backgrounds, and the way those backgrounds
changed often. Three regressions, found by reading the diff rather than guessing:

| | Original | M21 |
|---|---|---|
| Level artwork | alpha 0.6, source-over, `blur(1px)` | alpha 0.45 **and `globalCompositeOperation = 'lighter'`** |
| Hyperspace tunnel | 8 rotating pentagrams in `lvl.accent` | removed; the `color` argument ignored |
| Colour turnover | repainted per level across 27 shuffled levels | band palette only — 8 bands, changing rarely |

The first is the one that made the backgrounds "disappear". **Additive blending
over a dark ground is nearly invisible**: the dark half of a photograph adds
almost nothing, so moody occult artwork vanished. M21's own plan had said the
Drive art would composite "at the existing alpha", and it did not.

**The glitch effects were never touched.** `GlitchFX` RGB-split, the scanline
pass, screen flash, shake and the CSS overlays all still fire, and the browser
suite now proves it rather than assuming it.

## Restoring rather than reimplementing

The artwork broke because M21 rewrote it. So the tunnel is not rewritten: the
wrapper calls the original function, with the level temporarily marked unloaded so
the artwork can be handled separately. The **one** intended difference survives —
M10's procedural placeholder is an error card, not artwork, and still never draws,
which is what keeps `SIGIL CHANNEL OFFLINE` unreachable.

The artwork *is* a small deliberate duplicate of the original's tail, because it
needs full device resolution while the tunnel does not. Its constants are the
contract, and the suite asserts them by arithmetic: a flat test image over a lit
field must land within 10 of the source-over prediction, where additive blending
would land more than a hundred away.

## The two metrics that disagreed

Where the pentagrams draw is a real trade, and the two suites wanted opposite
answers:

- **Drawn to the main canvas**, cost is *deferred* — canvas calls only record
  into a display list. Synchronous cost is ~0.14ms, but the rasterisation shows
  up later and the fold-open frame measured ~300ms.
- **Drawn into the field's offscreen buffer**, rasterisation is forced
  synchronously: ~16.5ms of scripting, but the fold-open frame measured ~254ms.

Measured, the tunnel in the buffer is free — 253.7ms/frame with it against
254.5ms without. So it goes in the buffer, and the artwork stays at full device
resolution on the main canvas so the owner's photographs keep every pixel.

**Why the 16.5ms turned out not to matter, and how that was checked.** Of it,
11.9ms is the tunnel's 15px shadow blur. `optimizedShadow` in `index.html`
disables shadow blur entirely when `isMobile`, and `isMobile` is user-agent based
— so **the owner's Fold 6 never pays it**. The aesthetic suite had been running
without a mobile user agent, measuring a desktop glow path the target device never
takes. It now emulates the Fold's user agent like the M11 suite already did, and
measures 5.29ms on the shipped path. The desktop glow path is measured separately
against a deliberately looser bound, documented as software-rasterisation
inflated rather than quietly folded into the phone budget.

## The accent wash

The band palettes keep the Tree's identity; the accent gives the turnover. Applied
over the ground and before the strata, so the seal-work and tunnel stay crisp on a
recoloured floor. Deliberately a plain source-over fill at 0.34: a `'color'`
composite maps hue while preserving luminance and looks better in principle, but
it is a non-separable blend mode and **measured ~167ms a frame on its own** —
three times the rest of the field. Measured per-level colour spread is 236, so the
turnover is unmistakable.

Level accents already include `#ff003c`, and the original painted its whole tunnel
in them, so this restores pre-existing behaviour rather than breaching the M7
reserved-colour policy — which governs the new band palettes, and which
`paletteCollisions()` still asserts as empty.

## Evidence

- 24 fast suites, 13 browser suites — all green.
- `browser-m11-performance-budget-test` **3/3 on both** this branch and `8559a7f`,
  alternating on an idle host; frame accounting 191 frames/20s against M21's 195,
  zero suspension gaps on both. Cost-neutral.
- Worth recording: earlier in the same session both commits failed M11 3/3,
  including the M21 commit that had passed 3/3 hours before. The host itself had
  slowed. That was established by A/B against a worktree rather than assumed —
  the opposite of the mistake D-031 documents, where the same assumption was made
  and proved wrong.
- Cross-screen at both Fold postures: the same four blocked-host
  `ERR_TUNNEL_CONNECTION_FAILED` failures per project as at `8559a7f` and
  `9cd4217`. Environmental and unchanged.
- Looked at, not only measured: fold-open captures with a stubbed loaded image at
  three levels — yellow-green, amber and crimson — confirming sharp artwork, the
  tunnel in the accent, and the layers reading coherently.

## Still open

The 28 M14 visual signatures remain deleted and must be re-established from a
green CI run before release (`tests/visual-baselines/README.md`). And the field
has still never been seen on the Fold 6 itself — the owner's next session remains
the first human measurement of M16 and M17.
