# M35 — MONAS progression speed is overwritten at runtime

**Date:** 2026-08-19
**Status:** Resolved 2026-08-20 — the owner chose option 1 (compose them). See
`docs/decisions/d058-compose-the-monas-speed-conflict.md`. The measurements below
remain accurate as a record of the pre-fix behavior; `browser-m32-monas-progression-test.mjs`
now asserts the composed values and both previously-red workflows should be green.

## Summary

The MONAS progression ladder D-053 shipped — six bands indexed by gate count, every
speed/gap pair an M31-verified frontier coordinate — **is not reaching the running
game's speed.** The nominal gap half of each band applies correctly; the speed half
is clobbered.

On the owner's primary target, a Fold in portrait with a mobile user agent, MONAS
runs at **2.61 at gate 0 rising only to 3.17 at gate 80**, where the curve specifies
2.9 rising to 4.9. At the top band the game is **35% slower than designed** while the
corridor has still narrowed on schedule from 260 to 210.

That combination is the part worth caring about: **the walls close in on time while
the speed barely moves.** Whatever MONAS's difficulty curve is meant to feel like,
it is not currently that.

## Measured

Driven through `__SEX_MAGICK_MONAS_PROGRESSION__.forceGatesForTest()` on the real
page, reading `game.gameSpeed` and the progression snapshot's `nominalGap`.

**Fold phone — viewport 884×1104, `SM-F956U` mobile UA**

| gates | `game.gameSpeed` | nominalGap | curve says | speed error |
|---:|---:|---:|---:|---:|
| 0 | 2.61 | 260 | 2.9 | −10% |
| 8 | 2.645 | 250 | 3.3 | −20% |
| 20 | 2.75 | 240 | 3.7 | −26% |
| 36 | 2.855 | 230 | 4.1 | −30% |
| 56 | 2.995 | 220 | 4.5 | −33% |
| 80 | 3.17 | 210 | 4.9 | **−35%** |

**Desktop — viewport 1280×800, landscape, default UA**

| gates | `game.gameSpeed` | nominalGap | curve says | |
|---:|---:|---:|---:|---|
| 0 | 2.9 | 260 | 2.9 | matches |
| 8 | 2.935 | 250 | 3.3 | −11% |
| 20 | 3.04 | 240 | 3.7 | −18% |
| 36 | 3.145 | 230 | 4.1 | −23% |
| 56 | 4.5 | 220 | 4.5 | matches |
| 80 | 4.9 | 210 | 4.9 | matches |

Every `nominalGap` is correct in both tables. The desktop rows that match at 56/80
but not 8/20/36 indicate the outcome is **order-dependent**, not a clean override —
which is also why this reads differently depending on when you sample it (see below).

## Why two decisions disagree

Two independently-developed systems both own MONAS's speed, and they were written on
branches that could not see each other:

- **D-045 (this line's M31)** found that M26 computed MONAS speed from `CONFIG`'s
  desktop constants and assigned `gameSpeed` every frame, overwriting
  `adjustForScreenSize()`'s portrait accommodation. On a portrait phone that ran
  MONAS "23% tighter and ~11% faster than its own tuning, from frame one." The fix
  wraps `adjustForScreenSize` and *asks* it what it decides — which on portrait
  yields **2.61**.
- **D-053 (the Antigravity line's M32)** gave MONAS an explicit gate-driven ladder
  and required every live pair to be an exact M31-verified coordinate, starting at
  **2.9 / 260**.

Both are well-reasoned and neither is obviously wrong. They simply disagree about
what MONAS's base speed is, and after the #18 merge both run.

## Is this dangerous?

**No — the current behaviour is conservative, not unsafe.** Every measured speed is
*below* the curve at the same or wider gap, and M31 verified 2.9/260 as reachable
with 84/84 ordinary, 84/84 surge and 144/144 composition witnesses. Running slower
at an equal-or-wider corridor stays inside that envelope. Nothing here is
unreachable or unfair.

What is lost is the *design*: MONAS's difficulty is supposed to escalate and
currently barely does, while the corridor tightens as specified.

## Why the number moves depending on when you look

Sampled live, immediately after `startMonasBtn`, `gameSpeed` reads 2.9. Sampled
during actual play with the loop running, it reads 2.61 from frame 2 onward. The
M32 regression pauses the loop and reads 2.61. This is the same order-dependence the
desktop table shows, and it is why a casual check can easily conclude the ladder
works. **The live-play value is the one that matters, and it is 2.61.**

## Current CI state

Two workflows are red, both from this single root cause — `M33 product integration`
runs `browser-m32-monas-progression-test.mjs` as part of its suite:

| Workflow | Run | Result |
|---|---|---|
| M32 MONAS progression | `32254059532` | failure — `product default URL: fresh speed 2.61 !== 2.9` |
| M33 product integration | `32254061865` | failure — same assertion, same test |

**These were deliberately left red.** The assertion is correct and is detecting a
real defect; making CI green by relaxing it would be exactly the "do not weaken
valid tests to make a change pass" failure the project's own contract warns about.
Everything else is green — see D-057.

## Options, for the owner to decide

Not chosen here, because picking one changes live difficulty numbers and the project
explicitly forbids speculative retunes.

1. **Compose them.** Apply the portrait accommodation as a factor *to* the band
   speed rather than instead of it, preserving D-053's ladder shape and D-045's
   device accommodation. Top band becomes ~4.41 on portrait rather than 4.9. This is
   most likely what both authors would have wanted, but it is a real tuning change
   and every resulting pair would need re-checking against M31's frontier.
2. **Progression wins outright.** MONAS owns speed absolutely; the portrait
   accommodation applies to HEX only. Restores D-053 exactly, and reintroduces
   precisely the phone-too-fast problem D-045 was created to fix.
3. **Geometry wins outright.** Retire D-053's speed column and let the ladder govern
   gap only. Honest and simple, but discards the progression evidence M31 built
   across three audits.

Option 1 is the recommendation, with the caveat that its coordinates need
re-verification before shipping.

## Reproduce

```bash
export CHROME_BIN=/opt/pw-browsers/chromium-1194/chrome-linux/chrome   # or any Chromium
node tools/browser-m32-monas-progression-test.mjs      # fails: 2.61 !== 2.9
```

The full ladder tables above were produced by driving `forceGatesForTest()` on the
real page at both geometries; the failing assertion alone reproduces in one command.
