# D-028 — Give runs a purpose beyond score with persistent missions, read from existing telemetry

Date: 2026-08-12  
Status: Accepted

## Decision

Add three persistent, rotating objectives that carry progress across runs, driven
entirely by state the Gate slice already tracks. Keep the missions runtime a pure
observer of that state, and keep its HUD out of the M14 visual signature baselines.

## Context

The 2026-08-12 pilot showed the loop works — Gate entry 46.4%, comprehension
confirmed, voluntary replay yes. It also showed what happens when it does not:
**7 of 15 runs died under 15 gates and produced nothing at all.** A short run is a
total loss, which is exactly the failure mode persistent objectives exist to fix.

The unusual thing here is the cost. Every counter a mission could want already
exists: `gateSliceState` tracks gates cleared, risk zones, Gnosis, banks, entries,
Void outcomes, streaks, band index, and score broken down by source, and
`run-telemetry.js` tracks duration and lifecycle. **Nothing new needed measuring.**

Objectives also teach. Naming a behaviour — "clear risk-zone gates", "attain
KETHER" — directs attention at mechanics a player would otherwise never
deliberately engage. That matters most for the four bands M17 added, which almost
nobody would otherwise see.

## Design

### The runtime observes; it does not participate

`tools/missions-runtime.js` reads `gameInstance.gateSliceState` once per
simulation step and advances progress from what changed. **`gate-slice-runtime.js`
is unchanged.**

Progress comes from **diffing the monotonic counters and reading `lastClear`**, not
from walking `state.events`. The event array is capped at 120 and splices from the
front, so indices shift and entries are silently dropped in a long run — anything
built on it would quietly undercount. `gatesCleared`, `gateEntries`, `gateBanks`,
`voidSurvivals` and `scoreBreakdown.*` only ever increase, and `lastClear` carries
`zone`, `family`, `riskActive` and `nearMiss` for the most recent clear. That pair
covers the whole catalogue.

A unit test asserts the Gate slice still exposes each field the catalogue depends
on, so removing one fails loudly instead of silently zeroing a mission.

### Two scopes, and a tier spread

`cumulative` missions carry across runs — this is what makes a bad run productive.
`run` missions reset at run start — this is what creates single-session goals.

Missions declare exactly one of `delta` (accumulate what changed) or `level`
(report an absolute high-water mark). The distinction matters: REFUSE THE GATE is a
`level` mission reading `gateEntries === 0 ? gateBanks : 0`, so entering a Gate
stops further credit for the rest of the run without clawing back what was earned.

Rotation prefers a tier that is currently unrepresented, so the active three always
span light/steady/deep. A player is never handed three objectives they cannot reach
from where they are.

### Persistence

`localStorage` under `sex_magick_missions_v1`, following the bounded read/write
pattern in `run-telemetry.js`. **Only mission ids and integers are stored** — no run
content, no timestamps, no identifiers, no network. Read is defensive: unknown ids,
duplicates, out-of-range progress, corrupt JSON and a throwing storage all degrade
to a usable state rather than propagating. A privacy test asserts the persisted
payload has exactly five keys and contains none of the forbidden substrings the
telemetry privacy tests already screen for.

## The visual-QA trade

The 28 Chromium signatures cover **both** standard and `?gateSlice=1` states and
hash a screenshot of `#game-container`, so a new HUD layer would break the
gate-slice ones.

**The missions HUD is suppressed when `visualQa=1`.** This is not a convenience.
Mission progress is per-player persisted state, so a screenshot containing "COURT
THE EDGE 7/40" is inherently non-deterministic — the same class of problem the
harness already works around with `installDynamicTextLock`. Whether the
suppression works is therefore checked by whether the signatures move at all.

The lost coverage is replaced **structurally rather than by hashing**, in
`tests/cross-screen.spec.ts`: the HUD must exist, render one row per active
mission, sit inside the viewport, stay below the play corridor, carry
`pointer-events: none`, and introduce no horizontal overflow. That runs at *every*
geometry rather than the four reference ones, and it protects the property that
actually matters — an obscured Fold-closed corridor is an explicit stop condition
in the pilot protocol.

Layout reuses the `--sm-hud-width`, `--sm-hud-font-size` and
`--sm-hud-letter-spacing` custom properties the viewport runtime already publishes
per profile, so both Fold postures are handled by existing code rather than by new
breakpoints.

## Evidence

- 20 fast deterministic suites pass, including a new missions suite covering
  catalogue validity, monotonic and bounded progress across a replayed 400-gate
  run, scope reset, rotation under 60 consecutive completions, hostile storage,
  and the privacy boundary.
- 10 browser integration suites pass, including a new missions suite that drives a
  real 20 000-frame run, completes and rotates missions, verifies progress
  survives an actual page reload, and confirms the HUD is absent under `visualQa=1`.
- The new cross-screen assertion passes at `chromium-small-phone`,
  `chromium-fold-cover`, `chromium-fold-inner` and `chromium-desktop`.

### On the visual signatures, precisely

The committed M14 baselines could **not** be reproduced in the development
sandbox, which runs Chromium 1194 against a Playwright pinned to 1217. All 28
signatures differ there, and they differ identically at `a25592a` — the commit
before M18 — so the mismatch is environmental and predates this work. CI, which
runs the pinned build, is the authority.

M18 was therefore verified differentially instead, by capturing signatures from a
worktree at `a25592a` and from this branch in the same environment:

- **25 of 28 signatures are byte-identical between pre-M18 and M18**, including
  every state on `chromium-small-phone`, `chromium-fold-cover` and
  `chromium-fold-inner`.
- The 3 that differ — `gate-offer`, `gate-bank` and `void` on `chromium-desktop` —
  **also differ between two consecutive runs of the unmodified `a25592a` tree**,
  so they are unstable in this sandbox and carry no signal about M18. The
  differing pixels fall entirely inside a 593×44 band at 42% height, which is
  `#gate-slice-telegraph`, and the telegraph's text is identical in both trees.
- A live probe confirms the mechanism directly: under `visualQa=1` the missions
  HUD element exists but reports `hidden === true` in every gate state.

The claim this supports is that **M18 does not change what the page renders under
visual QA**. It is not a claim that the committed baselines pass here — they do
not, for reasons that have nothing to do with missions.

## Claim boundary

Proven: missions accrue correctly from real gameplay, persist across reloads,
rotate without duplicating or emptying a slot, store nothing sensitive, and do not
disturb the rendered page under visual QA.

**Not established: that the targets are well-tuned.** They are first estimates
anchored to pilot rates — risk-zone clears ran about 50% of gates, near misses
about 1.2%, Void survival about 69% — but no human has played against them. The
targets most likely to be wrong are the cumulative ones, where a number that is too
high makes the feature feel inert. That needs a Fold block at both postures.

Also not established: whether three simultaneous objectives is the right number, or
whether the HUD's bottom placement reads well in the Fold-closed posture.

## Architecture consequence

`tools/missions-runtime.js` owns missions entirely. `gate-slice-runtime.js`,
`collision-runtime.js` and `index.html` are unchanged. The runtime is loaded by a
bootstrap in `fixed-step-prototype.js` alongside the other modules.

`cross-screen-qa.yml` now triggers on `missions-runtime.js` and — a gap from M17 —
on `obstacle-variety-runtime.js`, since both change what the page renders.

## Deployment

None. `main` remains protected, PR #1 remains draft, and itch.io remains unchanged.
