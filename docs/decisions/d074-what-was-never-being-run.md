# D-074 — What was never being run

**Date:** 2026-08-22
**Status:** Accepted. M45. Not a release authorization — two owner gates remain.

## Context

M41–M44 finished the gameplay work the owner asked for across three rounds. The
review that opened M45 was meant to be a short pass over what was left before
publishing. It found that the verification story was worse than the gameplay
story, in four separate ways, and that none of them were visible from inside the
work that produced them.

## 1. CI was red, and had been for two pushes

Every M43–M44 change was verified against a curated local subset rather than the
CI set. Two suites in that gap were failing, and one of them was a real
regression I had introduced.

**The replay regression.** M44 routed the grammar's orb spawning through
`Game.orbPlacementFor`, which rolls `Math.random()` for the progression scarcity.
`obstacle-grammar.js` exists to produce a *seeded, reproducible* stream —
`spec.orbFloat` is there precisely so replays match — so an unseeded roll inside
it broke determinism and `run-browser-obstacle-grammar-test` failed with a replay
mismatch.

The fix is smaller than the shape it replaced. `PatternScheduler.next` already
takes an `orbChance` and decides with its own seeded stream, so `index.html`
splits into `orbSpawnChance()` (progression → number, no roll) and
`orbPlacementFor()` (geometry only, no roll), and the grammar passes the
progression-adjusted chance into the call that was already there. **One seeded
decision instead of two rolls.** Scarcity behaviour is unchanged; only the source
of the randomness moved.

**A suite measuring survival instead of its subject.**
`browser-m35-living-sephiroth-test` flies the avatar unattended, and both M43's
and M44's speed changes made that run die sooner — so it failed at a different
line locally than in CI, the signature of a test depending on how long a run
happens to last rather than on the thing it means to assert. It now holds the run
alive and asserts the sephirah identity, which is derived from `gateSliceState`
and untouched by the fix. Two more suites had the same defect exposed by the same
speed raise: `browser-m17-obstacle-variety-test` read `game.obstacles[0]` from an
emptied field, and `browser-m30-standard-entry-test` clicked before the
progression runtime's 50ms install poll and only failed under full-suite load.

## 2. Eight suites were not in CI at all

Including `browser-m43-monas-rite-test` and `browser-m44-endless-test` — the two
that guard the exact defects the owner reported twice — and
`browser-m32-monas-progression-test`, whose frame-level assertion is what caught
the M43 speed clobber in the first place. **A suite that is not in CI is a suite
that ran once.** All eight are wired in.

## 3. The menu had been shipping a blown-up error card

Found by eye-reviewing regenerated baselines rather than by any assertion.
`asset-resilience-runtime.js` substitutes a 480×270 placeholder reading "SIGIL
CHANNEL OFFLINE" at 18px when an image fails; M41's menu backdrop scaled whatever
it was given to cover the viewport, so the placeholder rendered as "GIL CHANNEL
OFFLI" hundreds of pixels tall. `pickTitleImage` now excludes `assetFallback`
entries. The confirmation is quantitative: the regenerated baseline set dropped
from 24 changed files to 20, with `menu-*` and `death-*` returning to matching
their 2026-08-18 selves.

## 4. The baselines had never been compared against

The 28 snapshots were regenerated for M40–M44's visual changes, but the
`visual-state` comparison job had been skipped on every run of this branch. The
assumed cause was the draft PR — the workflow triggers on `pull_request` with
`types: [ready_for_review]`. That was wrong. Its `if:` at
`cross-screen-qa.yml:61` admits any `workflow_dispatch` where
`update_snapshots != 'true'`; the comparison had been skipped because every
dispatch so far *was* a regeneration. Dispatched properly, it passes. The
baselines reproduce.

## The perf question, and what it is honest to say about it

M44 raised both ceilings and gave MONAS a portal that darkens the field, draws
gold silhouettes and runs a vignette. `browser-m45-perf-ceiling-test.mjs` samples
four phases back-to-back under the real rAF loop — HEX MALKUTH, HEX KETHER, MONAS
open field, MONAS portal — and asserts on the **ratios** between them.

Ratios, not milliseconds, and the distinction is load-bearing. The CI runner
rasterises in software: it rAFs at roughly 20fps where the Fold holds 60, and
`browser-m11-performance-budget-test.mjs` already documents the fold-open surface
measuring ~25 seconds *per frame* under it. Any absolute from that environment
quoted against D-060's table would be a fabrication with a decimal point in it.

`droppedSimulationMs` is reported and deliberately **not** asserted, which looks
like the weaker choice and is not. The project already has a bound —
`maxDroppedSimulationMsPerMinute: 50` in `performance-evidence-analysis.js` — and
that same policy demands `minSamplesPerRun: 1800` and `minRepeats: 3`. A single
120-frame phase is two orders of magnitude short: one 150ms host stall inside a
six-second window reads as ~2600ms/minute. At that sample size the metric measures
the CI scheduler. Asserting on it buys a suite that fails for reasons unrelated to
the game — the precise failure this milestone fixed in three other suites. It is
checked in `docs/qa/m45-fold-perf-capture.md` instead, on the device, at the
sample size the policy asks for.

Two findings from the ratios are worth keeping. **KETHER draws cheaper than
MALKUTH** (p50 ratio 0.56–0.90), which is correct rather than surprising: M35
gives the crown "lucid / sparse / transcendent" against MALKUTH's "material /
dense / grounded", spent on particle opacity, size, scanline and vignette —
0.24/0.64/0.07/0.26 against 1.15/1.15/0.52/0.86. The emptiest screen in the game
is the last one you reach. And **the portal costs about 1.1× ordinary MONAS
play** — the extra layers are real, but they are not a different regime.

**Consequences:** The through-line is that four of the five defects in this
milestone were invisible from inside the work that caused them, and each was found
by a different instrument: CI by running the full set, the M35 fragility by a
failure that moved between environments, the menu by looking at a picture, and the
`visual-state` gap by reading the `if:` instead of believing the explanation that
fit. Two of those instruments are cheap and were skipped for several milestones.

The verification of the verification is on the record too, because it failed
first. The perf suite's ratio bound was checked against a negative control — 40ms
of busy-wait per portal frame — and the **first attempt passed**, because the
wrapper sat outside the probe's timing bracket and the injected cost landed in
`droppedSimulationMs` rather than `drawDurations`. Corrected, it reads 5.00× and
trips. That failure is also what moved the assertion from p95 to p50: the p95
ratio swung 0.50 / 0.56 / 1.21 across runs of unchanged code, so it was carrying
the scheduler's worst moment rather than the cost of a frame.

Two gates remain and neither is mine: the board deploy needs Cloudflare
credentials, and the verdict on HEX 10.0 / MONAS 6.5 needs the owner's hands on
the game. Tuning either is a band-table edit requiring no new evidence — every
coordinate below both ceilings is already audited.

**Full record:** this entry.
