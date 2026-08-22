# D-073 — Audit each rite on the ladder it runs, and take the speed raise D-072 could not

**Date:** 2026-08-22
**Status:** Accepted for M44 implementation and physical Fold 6 validation. Not a
release authorization.

## Context

The owner reported four things after playing M43: speed stops building, walls stop
getting harder, shields keep coming back, and late runs never end.

All four are one defect. `getBandIndex` saturates at the final band in both rites,
so every quantity derived from it — speed, corridor, and the spawn rate that derives
from speed — froze there. Past gate 152 in HEX and gate 110 in MONAS, nothing about
the game changed again for the rest of the session.

D-072 had already proved the speed half was fixable and could not act on it. HEX
verified clean at 9.0, 9.5 and 10.0 across gaps 110/118/126/134, with its real
boundary at gap 122 between 12.0 and 14.0; 8.5 was never a discovered maximum, only
the fastest the solver had been asked about. The raise failed one assertion: the
shipped band audit requires every pattern in *both* rites to clear every
post-GEBURAH band, and `BANDS` is HEX's ladder. Seven MONAS patterns cannot hold
KETHER. D-072 named the option and reserved it: "whether MONAS should be held to
HEX's ladder is the owner's call rather than a mechanical one."

## Decision

### 1. Each rite is audited against its own ladder

`auditPatternLibrary` accepts `scenariosByRite`. HEX's patterns are audited against
HEX's bands, MONAS's against MONAS's.

This is not a loosening. The Gate slice is HEX-only — `updateGameObjects` returns
early unless `gameMode === 'HEX'` — and MONAS runs its own ladder in
`monas-progression-runtime.js`, so the old check constrained the ceiling with a
state the game cannot produce. It also never covered MONAS's own bands: they were
only ever incidentally cleared by being easier than HEX's. A rite the caller forgets
to describe still falls back to the shared list, so an omission over-constrains
rather than skips.

### 2. The ladders take the proven coordinates

HEX: CHESED 7.3/138, BINAH 8.2/132, CHOKMAH 9.1/127, KETHER 10.0/122.
`MAX_VALIDATED_SPEED` 8.5 → 10.0. Gaps unchanged — the raise is speed alone.

MONAS: 6.1/180 and 6.5/170 added. D-051 fixed MONAS's ceiling at 5.7/190 because
5.7 × 1.45 surge reached 8.265, "already close to the base game's existing 8.5
maximum-speed scale" — a comparison against HEX's cap, which this decision moves.
Re-searched with that comparison gone, MONAS verified clean at 6.1/180, 6.5/170 and
7.0/160 in both ordinary and Warp Surge flight, with 14/120 rejecting.

Neither rite's ceiling becomes a live band. 7.0/160 is MONAS's portal clamp and
10.0/122 is where HEX's ladder ends; M43 established by measurement that promoting a
ceiling to a band makes a top-band wager identical to ordinary play.

### 3. The descent

Past the final band, the corridor keeps closing toward `MIN_VALIDATED_GAP` — two
pixels every thirty gates, HEX 122 → 110 and MONAS 170 → 160. Bounded, not endless:
the game still plateaus, far later and tighter.

### 4. Sections lengthen; orbs stop being free

Void 480 → 900 frames and portal 300 → 660 across their ladders. Orbs cost five
rather than three, thin from one wall in two to one in six, and are held off the
corridor centre line by up to 96px so a narrowing corridor makes them harder.

## What the spacing frontier found, and why it changed the plan

The plan opened with a ladder of tightening wall spacing. It does not exist.

`auditPatternLibrary` never passed `pillarSpawnBase` to `classifyGateSequence`,
while recording a `spawnRate` on every case — so every spacing figure the audit had
ever produced was the default 140, and the reports looked as though spacing were
covered. M42's frontier caught it on its own negative control: base 12, walls almost
touching, returned CLEAN and the tool aborted rather than report a frontier.

Repaired, the control rejects 450 of 450 and the answer is a flat no: at HEX's
hardest coordinate a 6% tightening already returns 446 invalid. The top band has no
spacing headroom at all. Wall density is delivered instead by the speed raise, which
shortens the time between walls from 49 frames to 42 while leaving their pixel
spacing roughly constant.

## Claim boundary

The shipped band audit passes clean with both raised ladders and per-rite scenarios.
That means these conditions have replayable routes under the exact state law. It does
not establish that 10.0 is readable on a phone, that the descent is fair, or that the
new orb economy paces well. Physical Fold 6 validation remains the standing gate, and
the MONAS re-search used margin 8 across two scenarios and three anchors — the D-051
boundary job's `[8, 4, 0]` and full composition cross-product should still run against
these exact coordinates before they are treated as settled.

**Full record:** this document.
