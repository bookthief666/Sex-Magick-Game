# D-075 — Release evidence must exercise the release

**Date:** 2026-08-22
**Status:** Accepted corrective work for M46. Not a release authorization; the
Cloudflare Worker deploy and the human verdict on HEX 10.0 / MONAS 6.5 remain
owner gates.

## Context

The pre-release adversarial review found seven confirmed defects and one test
shape that could pass for the wrong reason. The central failure was evidentiary:
M44 cited D-051's green MONAS boundary job for a ladder it never ran. That job
stopped at 5.7/190 while M44 ships 6.1/180 and 6.5/170 and clamps its portal at
7.0/160. It also materialized the raw grammar catalog, while the scheduler ships
five policy-adjusted MONAS sequences, including a return-flow expanded from five
walls to twelve.

The same dropped parameter appeared a layer deeper in HEX. Search built walls
with the requested `pillarSpawnBase`, then witness replay rebuilt them without
it. The solver could search one timeline, replay another, and still publish the
requested spawn rate. D-073's “no spacing headroom” conclusion came from that
rebuild, not from the shipped geometry.

## Decision

### 1. The MONAS evidence path receives the shipped catalog

`auditMonasPatternLibrary` now accepts the exact library to materialize, and the
boundary runner passes `PATTERN_LIBRARY.MONAS.map(applyPatternOverride)` into both
the individual and compositional audits. The retained job covers 5.3/200 and
5.7/190 as controls, every M44 coordinate (6.1/180, 6.5/170, 7.0/160) in ordinary
and Warp Surge flight, exact replay with margins `[8, 4, 0]`, and the complete
scheduler-legal composition cross-product at both the old and current ceilings.
14/120 is an explicit negative control and must produce a concern in the
individual ordinary, individual surge, and composition arms — one incidental
failure is not enough to prove the whole instrument is live.

The correction exposed one more parallel implementation before its first result
was accepted: the MONAS composition tool derived legality from the obsolete base
`FAMILY_CYCLE`, while the shipped scheduler selects among four `FAMILY_CYCLES` by
band. Auditing each cycle in isolation is still insufficient: `familyCursor` does
not reset when a long pattern crosses into a new tier, so the previous family can
come from the old cycle and the next from the new one at the same cursor position.
The audit now derives every within-tier and monotone cross-tier cursor transition.
That expands the legal surface from six to fourteen family transitions, including
`pressure→pressure` and `climax→climax`; the test retains the base-only derivation
as a negative control that must be incomplete.

The JSON is committed, rewritten by CI, and compared with `git diff --exit-code`.
A green calculation whose retained evidence is stale is a failed job.
Live band coordinates, surge widening, and the breathing amplitude are imported
from `monas-progression-runtime.js`; the audit no longer repeats those shipped
values in a parallel table.

### 2. Search and replay share one immutable wall sequence

`buildGateWindows` records `spawnFrame` and freezes the array and each gate.
`solveGateSequence` hands that exact array to `replayWitness`; it records both
spawn-frame arrays, asserts equality, and reports whether replay received the
same object. The public replay fallback still accepts a requested spawn base, but
the acceptance path no longer rebuilds at all. This evidence-semantic change is
published as player solver version 2 rather than silently reusing version 1.

The corrected 10.0/110 HEX frontier verifies bases 132, 124, and 116 at 450/450;
108 is the first rejected grid point. The release remains at base 140. This
recovers a possible future density lever without smuggling a late tuning change
into an evidence repair. The MONAS arm of that artifact is explicitly a legacy
tap-model spacing diagnostic and cannot support shipped HOLD/RELEASE claims.

### 3. Seeded spawning never touches the legacy global stream

`Pillar` has an explicit seeded construction path. The obstacle grammar passes
the scheduler spec into it, rather than constructing a random pillar and
overwriting the visible fields later, and it no longer consumes discarded legacy
orb rolls. Two independent guards remain: a browser spawn with a throwing global
RNG, and a source contract that forbids even naming that RNG in
`obstacle-grammar.js`. Neither replay tests nor the negative control were removed.

### 4. Runtime ownership is reasserted after the clobbering write

The Gate installer wraps `adjustForScreenSize`: the base geometry call runs first,
then HEX reapplies its current band or wagered Void speed. The browser regression
forces KETHER through portrait → landscape → portrait and samples player-observed
speed after live frames in ordinary and Void states.

`initGame` now resets `screenFlash`, `glitchEffect`, and `glitchTimer`. A death is
first required to arm the effects, then death → retry and death → menu → MONAS
must both start clean. The negative arm prevents a permanently-disabled effect
from satisfying the reset assertion.

### 5. Test assertions identify their subject

The browser reachability policy check compares exact set equality with the two
catalogs instead of asserting a count. The M32 browser suite no longer catches
and ignores inner-frame exceptions; it delegates four frames to a real obstacle
and records the speed each frame received. A mutation control makes an exception
inside that captured update escape the progression wrapper, so restoring the
blanket catch leaves the sentinel absent and fails.

The replay identity has a fast dedicated `qa.yml` contract as well as the retained
450-case audit. Keeping both is deliberate: the fast test identifies the dropped
timeline immediately; the full audit says whether the shipping surface remains
reachable.

### 6. Styling is self-contained without deleting preflight by accident

The Tailwind runtime CDN and Google Fonts requests are gone. The page carries the
specific preflight declarations it depended on, replaces the three utility
classes used by the final score with local CSS, and embeds the same Orbitron and
Cinzel Decorative faces under their retained OFL notices.

At the four release geometries, `qa.yml` compares computed style and layout with
all external HTTP requests blocked, freezes CSS animation and transition phase in
both documents, asserts the captured preflight invariants, and requires every font
face to resolve locally. Freezing is subject isolation: without it, two separately
loaded pages report different sub-pixel geometry and animated colours merely
because their animation clocks started at different times. M14's existing
visual-state workflow remains unchanged as the independent art-regression net.
Its screenshots are not used as a before/after oracle here: the font-source
change moved three narrow-geometry baselines beyond their existing tolerance, so
that change needs the existing explicit image-review/regeneration process on its
own merits. No M14 baseline is deleted, regenerated, or loosened here.

## Validation and claim boundary

The corrected artifacts are:

- `docs/qa/m44-monas-shipped-boundary-audit.json`
- `docs/qa/m46-corrected-spawn-frontier.json`

The retained MONAS run completed with zero expectation failures. At 5.3/200,
5.7/190, 6.1/180, 6.5/170, and 7.0/160, both individual arms verified 150/150
cases and the composition arm had no marginal or unverified cases. The old and
current ceilings each covered all 584 legal variant pairs and verified
7,008/7,008 composition cases; the other three coordinates verified
2,016/2,016 bounded cases over 168 pairs. The 14/120 negative control rejected
independently in every required arm: ordinary had 1 marginal and 4 unverified,
surge had 2 marginal and 11 unverified, and composition had 35 marginal and 109
unverified cases. That is the evidence that the instrument can disagree with
the claim it is testing.

The first corrected run was interrupted after five coordinates, before its
single final write, and lost all completed work. The runner now optionally
checkpoints each coordinate under a SHA-256 fingerprint of the Node version,
coordinate, scenarios, margins, beam, adjusted library, and relevant solver and
runtime sources. A resumed local run may reuse only an exact fingerprint match;
CI deliberately starts without a checkpoint directory and recomputes the whole
artifact. This changes audit durability, not the release gate or its coverage.

Automated reachability remains a mathematical claim about replayable routes under
the modeled state law. It does not answer whether HEX 10.0 or MONAS 6.5 feels
right. Styling parity does not make the remaining jsDelivr audio origin offline;
it establishes that first layout and typography no longer depend on a style or
font CDN. Nothing here deploys the leaderboard Worker or chooses the two owner
verdicts.

**Full record:** this document.
