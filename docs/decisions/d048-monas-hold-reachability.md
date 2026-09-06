# D-048 — MONAS progression must be proven from hold/release physics

Status: **Accepted for M31 evidence work; no live progression values changed by this decision.**

## Context

The original reachability solver predates the M27-M29 MONAS control rewrite. It still represents MONAS as a tap-to-jump avatar with a `-7.2` impulse and jump cooldown. The playable rite no longer behaves that way: `Player.jump()` is a no-op in MONAS, while `Player.update()` advances `monas-runtime.js::advanceGlide()` from continuous HOLD/RELEASE input with a five-frame release ramp.

Using the old solver to select MONAS speed/gap progression would therefore prove a different game.

M31 also found a second ownership problem. On the ordinary URL, MONAS can still reach the base game's score-driven `checkLevel()` path. When `?gateSlice=1` is present, the Gate runtime replaces `checkLevel()` and returns immediately for a MONAS run. The Gate flag must not determine MONAS progression semantics.

## Decision

1. Add a MONAS-specific evidence solver whose control state is `y`, `vy`, held/released input, and release-ramp age.
2. Advance vertical state through the exported `advanceGlide()` function used by the live rite, then apply the same top clamp and bottom-death boundary as the base `Player.update()`.
3. Reuse the existing solver only for neutral horizontal collision-window geometry; do not reuse its MONAS jump profile.
4. Resolve pattern gap scaling and wall motion through `obstacle-variety-runtime.js`. For proof, use the phase-independent contained corridor `[top + amplitude, top + gap - amplitude]`. A witness through that corridor is safe for every wall-motion phase.
5. Model the base game's +/-10 spawn-gap oscillation conservatively at its `-10px` phase unless an audit explicitly asks for another phase.
6. Audit ordinary flight and Warp Surge separately. Surge multiplies speed by `1.45` and widens the resulting gap by `1.18`; a reward state is not assumed safe merely because its gap is wider.
7. Every accepted search witness must replay through exact floating-point dynamics. Beam-search exhaustion is labeled **unverified**, not impossible.
8. Do not copy HEX's Tree-of-Life difficulty table into MONAS. Live MONAS progression remains unchanged until the measured envelope exists and both standard and Gate-flag entry paths can be made semantically identical.

## Claim boundary

M31 reachability evidence can prove that a concrete HOLD/RELEASE witness exists for a pattern, viewport, speed, gap, and safety margin. It does not prove that every human player can execute that witness, and failure to find a witness is not mathematical proof of impossibility.

Human Fold 6 validation remains a separate gate after measured progression is selected.
