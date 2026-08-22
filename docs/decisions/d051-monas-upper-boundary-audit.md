# D-051 — Fully audit the natural MONAS search ceiling before live tuning

**Status:** Accepted as M31 evidence work. No live progression values are changed by this decision.

## Context

The D-050 targeted frontier scan found no reachability concern across any search coordinate from the known 2.9 / 260 baseline through 5.7 / 190. At every coordinate, all 96 targeted individual-pattern cases and all 24 targeted scheduler-legal composition cases produced exact replayable witnesses at the 8px safety margin.

That does **not** make 5.7 / 190 a live difficulty band. The frontier intentionally targeted the cases that were tightest in the baseline artifact. Before using its upper coordinate, the complete pattern grammar and scheduler-legal composition surface need a stronger audit.

The search also has a natural ceiling: a 5.7 base speed becomes 8.265 during MONAS's 1.45x Warp Surge, already close to the base game's existing 8.5 maximum-speed scale. Raising the automated search ceiling would therefore become a game-design/performance decision, not a reachability necessity.

## Decision

1. Treat 5.7 / 190 as the **search ceiling**, not as a proposed band.
2. At 5.7 / 190, audit every MONAS pattern variant and the **complete scheduler-legal pattern-variant pair cross-product** across Fold-closed/Fold-open, three representative anchors, ordinary flight, and Warp Surge.
3. Use exact witness replay and margins `[8, 4, 0]`; acceptance requires every case to classify `verified` at 8px. Marginal or unverified cases fail the boundary job.
4. Audit adjacent 5.3 / 200 as a control using every individual pattern variant and the bounded scheduler-legal composition coverage from D-049.
5. Do not widen the candidate ladder beyond 5.7 automatically. If the search ceiling fully verifies, progression design must still choose a humane curve inside the proven envelope rather than simply using the hardest proven coordinate.

## Claim boundary

A green boundary audit means these mathematical conditions have replayable routes under the exact MONAS HOLD/RELEASE state law. It does not prove subjective fairness, desired difficulty pacing, thumb fatigue, visual readability at speed, or device performance. Those remain human/Fold 6 and performance gates after a live curve is implemented.

## Validation

`tools/run-m31-monas-boundary-audit.js` emits retained evidence for the adjacent control and search ceiling. `.github/workflows/m31-monas-boundary-audit.yml` makes any marginal/unverified case a failed evidence gate.

## Correction — D-075

This decision proves only the coordinates it names: 5.3/200 and 5.7/190. It was
later cited as support for M44's 6.1/180, 6.5/170, and 7.0/160 ladder extension,
which it never ran. The old runner also audited the raw pattern catalog rather
than `reachability-policy.js`'s shipped overrides. D-075 replaces the runner and
artifact for the raised ladder. This record remains a historical result for the
raw catalog inside its original 5.7/190 boundary; it is not sufficient evidence
for the policy-adjusted schedule that ships.
