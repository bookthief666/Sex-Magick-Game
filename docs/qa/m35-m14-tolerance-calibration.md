# M35 — M14 tolerance calibration: the first real measurement

**Date:** 2026-08-19
**Status:** First sample recorded. `maxDiffPixelRatio` left at `0.006` pending a
second sample; a change is recommended but not made.

## Why this exists

D-046 shipped `maxDiffPixelRatio: 0.006` and said so plainly:

> `0.006` (0.6%) was chosen as a plausible starting point — conservative enough to
> plausibly clear the kind of jitter the fourth defect describes... **It has not been
> measured against real CI diff data**, and must not be read as settled until it has
> been.

That measurement was awkward to obtain, because **Playwright prints a comparison's
pixel difference only when the comparison fails.** A green run — and the M14 job is
now green twice on the merged trunk, runs `32250459932` and `32254043583` — says
nothing about how much headroom remains before a real regression slips under the
threshold.

`playwright.config.ts` now reads `M14_MAX_DIFF_PIXEL_RATIO` from the environment,
exposed as a `workflow_dispatch` input on `cross-screen-qa.yml`. Setting it to `0`
turns the suite into a measuring instrument for one deliberate run: every comparison
that is not byte-identical fails and reports its true difference.

## Sample 1 — run `32256329862`, commit `c0fc89c`, tolerance 0

```
1 flaky
  [chromium-fold-inner] › deterministic visual signatures match the M14 reference baseline
23 skipped
76 passed (3.2m)
```

**27 of the 28 baseline comparisons were byte-identical at tolerance zero.** One was
not:

| State | Geometry | Pixels different | Attempt 2 |
|---|---|---:|---|
| `gate-offer` | `chromium-fold-inner` | **202** | byte-identical (passed) |

The `chromium-fold-inner` container is 884×1104 CSS pixels = 975,936, and the
screenshots are taken at `scale: 'css'`. So:

> **202 / 975,936 ≈ 0.000207 — about 0.02%.**
>
> The committed tolerance of `0.006` is **0.6%**, roughly **5,856 pixels**.
> The worst observed real-world difference is therefore about **29× smaller than the
> tolerance allows.**

## A trap in reading these numbers

Playwright's log line reads:

```
202 pixels (ratio 0.01 of all image pixels) are different.
```

**That printed ratio is rounded to two decimals and is useless below ~1.5%.** The
identical string `ratio 0.01` was produced locally for a difference of **20,035**
pixels — a hundred times larger. Anyone calibrating from the printed ratio rather
than the pixel count will be wrong by two orders of magnitude, in the direction of
setting the tolerance far too loose.

**Use the pixel count and divide it yourself.** The geometries:

| Project | CSS size | Pixels |
|---|---|---:|
| `chromium-small-phone` | 320×568 | 181,760 |
| `chromium-fold-cover` | 368×869 | 319,792 |
| `chromium-fold-inner` | 884×1104 | 975,936 |
| `chromium-desktop` | 1920×1080 | 2,073,600 |

Note the ratio is per-geometry: a fixed pixel budget is ~11× stricter on desktop
than on the small phone. A single global ratio is the blunt instrument here, and
that is a known cost of configuring it in one place.

## What this suggests, and what is deliberately not being done

The evidence says `0.006` is far more generous than the capture pipeline actually
needs — the three D-046 fixes plus the M33 sensitivity-banner suppression appear to
have made these captures very nearly deterministic. Tightening would catch
meaningfully smaller art regressions.

**No change has been made, for two reasons.**

1. **n = 1.** One measurement is not a distribution. The single non-identical event
   might be typical, might be a rare outlier, and might not be the worst case. A
   second sample is running; a threshold set from one run would be exactly the kind
   of unexamined number D-046 objected to in the first place.
2. **Tightening trades one failure mode for another.** A stricter net catches
   smaller regressions and also flakes more often, and a net that flakes gets
   disarmed — which is the entire history that produced D-046. The direction is only
   safe with headroom that is measured rather than assumed.

**Recommendation once a second sample agrees:** `0.001` (0.1%, ~976 px on
fold-inner). That is roughly **5× headroom** over the largest observed event while
being **6× stricter** than today. If sample 2 shows a materially larger event, scale
the recommendation to keep ~5× headroom over the observed worst case rather than
keeping the number.

## How to take another sample

```
Actions → M14 Visual-state QA → Run workflow
  update_snapshots:     false
  max_diff_pixel_ratio: 0
```

Then read the **pixel counts** — not the printed ratios — from the job log. The run
is expected to report flaky/failed comparisons; that is the measurement working, not
a regression.
