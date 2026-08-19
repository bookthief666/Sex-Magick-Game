# D-057 — What running the tests actually found

Date: 2026-08-19
Status: Accepted

## Decision

`qa.yml` gains `workflow_dispatch`, and the runtime fingerprint that guards
playtest reports is extended to cover every player-facing module. Both changes
exist for the same reason: this branch had a large body of work whose
correctness was asserted but never actually checked, and the checks that did
exist could not tell a stale build from a current one.

Three things were true at the start of this milestone and are no longer:

1. **`qa.yml` had no `workflow_dispatch` and only fired on
   `develop/sex-magick-2.0`.** Every other workflow in the repository had one.
   `claude/sex-magick-2-0-review-atdnu8` — which carries M16 through the M34
   reconciliation, roughly twenty milestones — had therefore **never had a
   single real Fast gameplay QA run of its own.** Every "N suites green" claim
   in this branch's decision log was a local result, not a GitHub Actions status
   at that SHA. This is precisely the defect D-047 diagnosed for a different
   branch; it was true here the whole time and nobody looked.

2. **The playtest protocol pointed at a branch that does not contain the game.**
   `docs/playtests/m9-fold6-v2-pilot.md` is documented as "the standing harness
   for every future block" and instructed the owner to check out
   `develop/sex-magick-2.0`. That branch is 118 commits behind and contains no
   Gate loop, no missions, no power-ups, no MONAS. A session run from it would
   have produced a clean, complete, and entirely worthless report.

3. **The anti-stale-build fingerprint had a hole exactly the shape of the
   unvalidated work.** D-030 added the report's `runtime` block after the
   2026-08-12 session had to be discarded for running a cached pre-M16 build.
   That block recorded grammar, variety, missions and power-up versions plus
   Gate internals — every one of which reads *identically* with or without M32
   MONAS progression, M33 product integration, M34 ritual ascent and M35 Living
   Sephiroth. Those four are the modules no human has played. A session that
   silently ran a pre-M32 checkout would have reported as valid.

## What running it found

Adding the dispatch trigger and running the suite immediately failed on
`run-browser-obstacle-grammar-test`. Running the harnesses that `qa.yml` only
`node --check`s found a second failure. Both are real regressions from the #18
merge, and both are the same defect class.

**The class:** M33 made the Gate stack the default for ordinary sessions and M30
made enhanced MONAS load on the ordinary URL. Both are correct product changes —
M30 is the fix for the owner's own report that `?monas=1` lacked what the
`gateSlice` URL had. But every low-level fixture that loads `index.html` without
an exemption flag now observes the assembled product instead of the primitive it
was written to test. D-054 anticipated this for `visualQa` and `telemetryQa` and
held them out. Four other fixtures were not held out.

| Fixture | Symptom | Pre-merge |
|---|---|---|
| `patternBrowserQa` | `Expected one deterministic obstacle` | passes |
| `reachabilityBrowserQa` | `400.1728 != 393.1204` | passes |

The second is the more interesting one. That fixture drives the real `Player`
against `player-reachability.js` and requires exact frame-by-frame agreement.
Isolated: **HEX parity still holds; only MONAS diverges.** That is correct
behaviour, not a defect — `player-reachability.js` models MONAS as the pre-M27
tap-to-jump avatar (`gravity: 0.18`, `jumpImpulse: -7.2`), and M27–M29 replaced
MONAS with hold/release glide. D-048 recorded exactly this and built
`tools/monas-reachability.js` as MONAS's real evidence model; M31's audits then
verified the shipped MONAS patterns under the actual glide law (84/84 ordinary,
84/84 surge, 144/144 composition, zero concerns — reproduced locally here).

So the live MONAS pattern set **is** covered, by the new solver. The old one is
legacy for MONAS and the fixture simply needs to keep seeing the base game.

## What changed

- **`.github/workflows/qa.yml`** — `workflow_dispatch` added; job timeout raised
  15 → 30 minutes. The first real run spent 14m02s of its 15-minute budget
  installing Playwright Chromium on a cold runner and was cancelled mid-suite.
  A cancelled job reads as an infrastructure hang, which is how a genuine
  regression gets waved away; the obstacle-grammar failure was one glance from
  being dismissed that way.
- **`tools/product-integration-runtime.js`** — `patternBrowserQa`,
  `reachabilityBrowserQa` and `compositionBrowserQa` join `telemetryQa` as
  low-level diagnostics held out of the Gate promotion. `patternBrowserQa` was
  previously set in a fixture URL and read by nothing; this gives it its first
  actual meaning.
- **`tools/fixed-step-prototype.js`** — the same three are held out of M30's
  MONAS bootstrap. Holding a fixture out of only one of the two paths leaves the
  other still loading the enhanced rite, which is why the first attempt at the
  reachability fix appeared to work and did not.
- **`tools/gate-slice-playtest-v2.html`** — the report fingerprint gains
  `monasProgressionVersion`, `productIntegrationVersion`, `ritualAscentVersion`
  and `sephirahIdentityVersion`. Verified against the real page: all eight
  resolve non-`null` after a real HEX start.
- **`tools/test-gate-slice-playtest-v2-harness.js`** — asserts each fingerprint
  field maps to its global, so a future module cannot be added without being
  stamped. Negative-checked by removing a field and confirming failure.
- **`tools/qa-chrome-env.mjs` consumers** — D-052 bridged three legacy CDP
  harnesses to the pinned Playwright Chromium and missed `obstacle-grammar`,
  `compositional` and `reachability`. All three failed with "Chrome/Chromium
  executable not found" rather than running, which is why neither regression was
  catchable locally. Bridged.
- **`docs/playtests/m9-fold6-v2-pilot.md`** — points at the trunk, and gains a
  "Confirming the build that ran" section: a table of all eight module versions,
  what each `null` would mean, and why the bottom four matter right now.

## Two corrections worth keeping

Both of these were caught by checking rather than by reasoning, and the record is
more useful with them in it than without.

**An earlier fix for the reachability failure was wrong.** The first attempt
rewrote the MONAS assertion to assert *divergence* from the legacy solver — a
defensible-sounding idea. The negative check for it did not fail when it should
have, which proved the diagnosis wrong: the fixture was still being promoted
into the Gate stack, so the guard under test was unreachable. Without that check
a test asserting the wrong thing would have shipped, and it would have passed.

**An assertion added here was initially stronger than the code.** It claimed the
reachability fixtures receive no injected product defaults at all; in fact the
adaptive `renderDpr` still applies to them. That is harmless — DPR resizes the
canvas backing store, not `innerHeight`, so it cannot move the boundaries the
solver models — and the assertion now states what is true rather than what
sounded tidier.

## What this does not establish

- **It does not make the merged work device-validated.** D-047 through D-056
  each ship with automated evidence only. Nothing here has been played on a
  physical Fold 6 or by a human. A green CI run and a played game remain
  different claims, and this milestone only strengthens the first.
- **It does not fix the MONAS progression conflict it uncovered.** Running the M32
  and M33 workflows found a third regression, and unlike the other two it is a real
  gameplay defect rather than a fixture problem: D-053's six-band MONAS speed ladder
  is overwritten at runtime by D-045's geometry-derived speed, so on a Fold in
  portrait MONAS runs 2.61 at gate 0 rising only to 3.17 at gate 80 where the curve
  specifies 2.9 → 4.9 — **35% slow at the top band, while the corridor still narrows
  on schedule from 260 to 210.** The gap half of every band applies correctly; only
  speed is lost. It is conservative rather than unsafe (slower at an equal-or-wider
  gap stays inside M31's verified envelope) but the escalation the design calls for
  is not happening. Two workflows are red for this single cause and were
  **deliberately left red** — the assertion is correct and relaxing it to get green
  would be the "do not weaken valid tests to make a change pass" failure the
  project's own contract names. Full measurements, both geometries, and three
  options with a recommendation: `docs/qa/m35-monas-progression-conflict.md`.
  Choosing among them changes live difficulty, so it is the owner's call.
- **It does not revisit the live reachability policy's MONAS overrides.**
  `reachability-policy.js` still adjusts and seals MONAS patterns using
  `player-reachability.js`'s tap-jump model (`RUNTIME ADJUSTMENT
  monas.lunar-sweep`, `MONAS FALLBACK monas.still-point`). M31's audit covers the
  shipped configuration under the real glide law, so this is not believed to be a
  live safety hole — but two models now describe MONAS and only one of them
  matches the game. Reconciling them is a real open question and is deliberately
  left for the owner rather than settled unilaterally here.
- **It does not claim the fixture hold-outs are exhaustive.** Four flags that
  load `index.html` without an exemption remain (`browserQa`, `collisionQa`,
  `policyFailClosedQa`, `viewportQa`). None currently fail, and their suites pass,
  so none were touched on speculation. If a fifth surfaces, it belongs in the
  same two lists.

## Evidence

- Fast gameplay QA run `32253654305` at `f68460c`: **success** — the first green
  Actions status in this branch's history. The prior run `32250415600` at
  `025bbb6` failed at step 17 and was cancelled at the 15-minute timeout.
- `run-browser-obstacle-grammar-test`: fails 3/3 on the merged tree, passes at
  `3375870` (pre-merge), passes 3/3 after the fix. Cause isolated by disabling
  each newly-added loader in turn — `monas-runtime` disabled → PASS,
  `monas-progression` disabled → still FAIL — rather than by reading code.
- `run-browser-reachability-test`: passes pre-merge, fails merged at
  `400.1728 != 393.1204`, passes after the fix with `MONAS PARITY JUMPS 10`
  intact. Removing the exemption reproduces the identical failure.
- `run-browser-compositional-test`: passes.
- 31 fast contract suites green. `browser-m30-standard-entry-test`,
  `browser-m33-product-integration-test` and `browser-m34-ritual-ascent-test`
  all pass, which is the check that matters for the fixture hold-outs: enhanced
  MONAS still loads on the ordinary URL for real players.
- Bounded MONAS reachability audit reproduced locally: 84/84 ordinary, 84/84
  surge, 144/144 composition, 0 concerns — matching D-048/D-049's recorded
  figures.
