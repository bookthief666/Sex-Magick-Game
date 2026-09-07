# M45 — capturing performance on the Fold, against D-060

**Who runs this:** the owner, on the Fold 6. Not CI, and not an agent.

## Why this document exists

D-060 measured the renderer on the physical device and found the frame budget was
never scarce: 6.9× the backing pixels cost 0.2ms at p50 and nothing at p95, with
frame intervals pinned to 16.7ms across p50/p95/p99. What the owner actually felt
lived entirely in the tails — thirteen long frames in 11,184, and
`droppedSimulationMs: 100`.

M44 then raised both ceilings (HEX to 10.0, MONAS to 6.5) and gave MONAS a portal
that darkens the field, draws gold silhouettes and runs a vignette. Those are the
two places the game is now most expensive, and neither has been measured on the
device.

`tools/browser-m45-perf-ceiling-test.mjs` runs in CI and answers a narrower
question — did the top of the ladder become a *different* performance regime from
the bottom — by comparing phases measured back-to-back on the same rasteriser. It
deliberately reports no absolute figure, because headless Chromium in a sandbox
rasterises in software: it rAFs at roughly 20fps where the Fold holds 60, and
`browser-m11-performance-budget-test.mjs` documents the fold-open surface
measuring ~25 seconds *per frame* under it. No number from that environment can be
set beside D-060's table.

This capture is the one that can.

## The two captures

Open each URL, play normally, then read the panel (tap `P` to toggle it).

**1. HEX to the crown.** Play until the HUD reads `KETHER`, then keep playing for
at least a minute inside that band.

```
index.html?perfProbe=1&perfPanel=1&assetMode=online&renderDpr=native
```

**2. MONAS inside the portal.** Play MONAS until the Gnosis meter fills, fly into
the ring, and stay inside the section. At the top band the portal runs 660 frames
(~11s), so this needs several entries to accumulate a minute.

```
index.html?perfProbe=1&perfPanel=1&assetMode=online&renderDpr=native&monas=1
```

For each, tap the panel's download control (or run
`__SEX_MAGICK_PERFORMANCE__.downloadReport()` from devtools) and keep the JSON.

## What the numbers have to clear

The thresholds are the project's own, from `DEFAULT_POLICY` in
`tools/performance-evidence-analysis.js` — not invented for this document:

| metric | bound |
|---|---|
| `frameIntervals.p95` | ≤ 20ms |
| `frameIntervals.p99` | ≤ 28ms |
| `criticalFrameRate` | ≤ 0.005 |
| `droppedSimulationMs` per minute | ≤ 50 |
| samples per run | ≥ 1800 |
| repeats | ≥ 3 |

`droppedSimulationMs` is the one to watch. It is the fixed-step clock discarding
simulation it could not fit — a logic outcome, not a rendering one — and D-060
identified it as the thing that produced the felt lag. The CI suite reports it but
refuses to assert on it, because a single 150ms host stall inside a six-second
window reads as ~2600ms/minute; the metric only means something at the sample
sizes above.

## Reading the result

- **All bounds clear, both captures.** M44's ceiling costs nothing the device
  cannot absorb. Record it and move on.
- **`droppedSimulationMs` over budget in one capture only.** The cost is specific
  to that state — the crown band or the portal — and that is where to look.
- **Both captures over budget, and D-060's own numbers no longer reproduce.**
  Something regressed between D-060 and now that is not about the ceiling at all.
  Re-capture at `renderDpr=1` before concluding anything; D-060 found the DPR
  policy was buying performance that was never scarce, and that comparison is the
  fastest way to tell a renderer problem from a logic one.

File the JSON under `docs/playtests/` and note the outcome in the decision log.
