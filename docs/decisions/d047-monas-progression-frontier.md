# D-047 — Scan a MONAS progression frontier before choosing live bands

**Status:** Accepted as exploratory M31 evidence work. This decision does not change live progression.

## Context

The M31 baseline audit verified all 84 ordinary pattern cases, all 84 Warp Surge pattern cases, and all 144 bounded scheduler-legal composition cases at an 8px safety margin under the current 2.9 base speed / 260 nominal gap condition. That establishes a trustworthy floor, not a difficulty curve.

The baseline artifact also identified which patterns and legal transitions produced the tightest replayable witnesses. Rather than spend minutes repeatedly auditing the complete grammar at arbitrary guessed settings, the next step is to search a bounded frontier against those empirically tight cases, then run complete audits only near the measured boundary.

## Decision

1. Keep the live game unchanged while the frontier is measured.
2. Probe the following search candidates, which are **search coordinates, not proposed bands**:
   - 2.9 / 260 — known baseline
   - 3.3 / 250
   - 3.7 / 240
   - 4.1 / 230
   - 4.5 / 220
   - 4.9 / 210
   - 5.3 / 200
   - 5.7 / 190
3. A later coordinate is deliberately harder in both dimensions: higher base speed and smaller nominal gap.
4. Target the individual patterns that were tightest in the baseline artifact: `monas.caduceus-wave`, `monas.serpent-current`, `monas.lunar-sweep`, and `monas.mercurial-wave`.
5. Target the six tight scheduler-legal pair variants recorded in `tools/monas-progression-frontier.js`.
6. Test Fold-closed and Fold-open profiles, all three pattern anchors, and both ordinary and Warp Surge modes. Pair composition uses its scheduler-correct 0.5 starting anchor and the conservative pair corridor from D-046.
7. A candidate is `fullyVerified` only if every targeted case has an exact replayable witness at 8px. Once a candidate produces a concern, later candidates remain exploratory; a marginal/unverified harder candidate does **not** fail CI merely for being beyond the frontier.
8. The known 2.9 / 260 baseline is different: if it stops verifying, the frontier job fails because that would contradict the already-recorded M31 baseline evidence.
9. The usable frontier is the highest contiguous fully verified candidate starting from baseline. A surprising later verification after a concern is recorded rather than used to leapfrog the failed coordinate.

## Claim boundary

The frontier scan is a search accelerator. It is intentionally targeted and cannot authorize a live progression curve by itself. Once the boundary is found, the selected boundary coordinate and at least one adjacent coordinate must be subjected to the complete individual-pattern and scheduler-legal composition audit before a progression table is chosen.

Human Fold 6 play remains required after a measured curve is implemented. The independent MONAS progression-ownership bug—ordinary URL versus `?gateSlice=1`—also remains unresolved until the curve evidence is complete.

## Validation

- `tools/test-monas-progression-frontier.js` verifies the candidate ladder, target pattern/pair resolution, and the known baseline target.
- `tools/run-m31-monas-progression-frontier.js` emits `artifacts/m31-monas-progression-frontier.json` and only fails on scanner/configuration regressions.
- `.github/workflows/m31-monas-progression-frontier.yml` runs the targeted frontier automatically for the M31 draft PR.
