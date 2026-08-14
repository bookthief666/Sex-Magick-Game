# D-046 — MONAS composition is proved only across scheduler-legal transitions

**Status:** Accepted for M31 evidence work. No live difficulty or progression values are changed by this decision.

## Context

M31 introduced a hold/release reachability solver because the older shared solver still treated MONAS as a discrete jump avatar. Proving one named pattern from a valid first-gate state is necessary but not sufficient: the shipped `PatternScheduler` concatenates patterns, and a legal pattern can still become unfair when entered from the state produced by the pattern before it.

A naive all-pattern-to-all-pattern matrix would test transitions the game never emits and multiply search cost without adding production evidence. The scheduler already defines the real family order in `FAMILY_CYCLE`, including its wrap from recovery back to safe.

## Decision

1. Composition audits derive their legal family-transition set directly from `FAMILY_CYCLE`.
2. A pair is materialized exactly as the scheduler composes it: the second pattern is anchored to the final ratio of the first, and its first pillar is retained.
3. Pair geometry is deliberately conservative. Every gate in the pair is audited with the tighter of the two `gapScale` values and the larger of the two motion amplitudes. Because the variety runtime preserves corridor centre while clamping motion, that synthetic corridor is contained within both real pattern corridors. A replayable witness through the conservative pair is therefore valid evidence for the shipped pair.
4. The pull-request audit uses bounded coverage: for every legal family transition it includes every first-side pattern variant and every second-side pattern variant at least once. The tool also retains a `full` mode for the complete legal variant-pair cross product.
5. Accepted witnesses must replay through the exact floating-point HOLD/RELEASE state law. Beam-search exhaustion remains `unverified`; it is never promoted to `impossible`.
6. Ordinary flight and Warp Surge remain separate cases. Surge is not assumed easier merely because its gap opens; its horizontal speed also increases.

## Claim boundary

This evidence answers whether the current MONAS pattern grammar has replayable routes under the current hold/release control law at a supplied speed/gap condition. It does **not** yet choose a progression curve, prove arbitrary human recovery from every possible entry state, or authorize a live speed/gap change.

The progression-ownership discrepancy found during M31 remains a separate implementation task: ordinary-URL MONAS can still touch the base score-driven `checkLevel()` path while the Gate-slice wrapper suppresses that path. A Gate-only query flag must not remain capable of changing MONAS progression semantics.

## Validation

- `tools/test-monas-compositional-reachability.js` checks scheduler transition derivation, bounded variant coverage, boundary anchoring, conservative pair geometry, and an exact replayable baseline pair witness.
- `tools/run-m31-monas-audit.js` records individual-pattern and compositional evidence for Fold-closed and Fold-open profiles in ordinary and surge modes.
- `.github/workflows/m31-monas-reachability.yml` runs the bounded audit on the M31 PR and exposes the full legal cross product by manual dispatch.
