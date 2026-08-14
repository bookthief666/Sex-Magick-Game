# ANTIGRAVITY — Sex Magick 2.0 Continuation Contract

This repository is an actively developed browser game, not a greenfield prototype. Treat the current source, tests, decision records, and physical-device evidence as a system that must be understood before it is changed.

## Canonical starting point

- Repository: `bookthief666/Sex-Magick-Game`
- Antigravity continuation branch: `antigravity/sex-magick-2.0-continuation`
- This branch was created from M35 exact candidate `74262e2798d80493df0dd9cfb1f768c145e8f14d`.
- M35 source branch: `agent/m35-living-sephiroth`.
- Do not start from `main` or stale `develop/sex-magick-2.0`; those do not represent the newest game.

## Product identity

Sex Magick 2.0 is a deliberately strange occult arcade game built around two distinct rites:

- **Rite of Hexagram / HEX** — tap-flight, Tree-of-Life ascent, Gate/Gnosis/Void risk-reward play, persistent missions, earned power-ups, Rite Board, obstacle families, procedural occult field, gallery/effect vocabulary, and eight Sephirah world-states.
- **Rite of MONAS** — hold/release glide, Coherence, centered passage, Warp Surge, and its own visual/gameplay vocabulary. It is intentionally not just HEX with a different sprite.

The project is aiming for the immediacy and replayability of a compact arcade/mobile game while becoming far more authored, psychedelic, ceremonial, and mechanically legible than a Flappy-Bird clone.

## Non-negotiable engineering invariants

1. **Deterministic simulation and collision truth stay truthful.** Do not trade correctness for spectacle.
2. **Do not weaken valid tests to make a change pass.** If a test is obsolete because the product contract intentionally changed, document the superseding contract and isolate low-level diagnostics rather than deleting evidence.
3. **Samsung Galaxy Z Fold 6 is the primary physical target.** Both inner/open and cover/folded postures matter. Automated browser emulation is necessary but not sufficient.
4. **Preserve the posture-aware render policy.** The open Fold uses a lower backing DPR than native to protect performance; the narrow cover can retain native sharpness. Explicit diagnostic/user DPR overrides must remain authoritative.
5. **Respect accessibility.** Reduced-motion/STILLNESS and low-flash/VEIL are product features, not debug switches.
6. **No new expensive full-screen render pass without measured evidence.** The project has already demonstrated that fill-rate mistakes can destroy Fold performance.
7. **HEX and MONAS must remain cleanly separated.** New HEX systems must not leak into MONAS, and vice versa, unless a shared system is deliberately designed and tested.
8. **No speculative economy/physics retunes.** Gameplay constants may be changed when there is a clear hypothesis, instrumentation/QA, and physical evidence—not merely because a number looks arbitrary.
9. **No destructive Git operations.** No force-push, hard reset, branch flattening, or history rewrite as a convenience.
10. **No merge to `develop`, no merge to `main`, and no itch.io deployment without explicit owner authorization.** Work in stacked branches/draft PRs.

## Freedom to improve the game

You are explicitly authorized to search for better solutions and to improve more than the currently written roadmap when evidence supports it. This includes:

- gameplay feel and readability;
- game-loop pacing and run structure;
- obstacle grammar and encounter composition;
- progression communication;
- UI/UX and first-run comprehension;
- audiovisual feedback, procedural audio, haptics, particles, transitions, effects, typography, color and art direction;
- performance, memory, loading, offline/PWA reliability and foldable behavior;
- accessibility and input quality;
- test architecture, diagnostics and reproducibility;
- code organization/refactoring where it reduces risk or makes future game work safer.

Creativity is encouraged. Unmeasured churn is not. Prefer changes that make the game feel more intentional while preserving proven mechanical truth.

## Required working method

Before substantial feature work:

1. Verify the exact checked-out SHA/branch and clean working tree.
2. Read `docs/ANTIGRAVITY_PROJECT_HANDOFF.md`, `docs/SEX_MAGICK_NORTH_STAR.md`, and the recent decision records referenced there.
3. Run the current locked install and baseline checks.
4. Inspect the actual runtime/state ownership before proposing architectural rewrites.
5. Identify whether a perceived problem is mechanical, presentation, performance, state exposure, or test-harness debt.
6. State the hypothesis and acceptance criteria for the next milestone.
7. Implement the smallest coherent vertical slice that proves the direction.
8. Run focused tests first, then the complete Fast gameplay QA before physical handoff.
9. Require Fold 6 validation for claims about feel, readability, audio mix, performance, or touch behavior.
10. Record meaningful architectural/product decisions under `docs/decisions/`.

## Quality bar

The goal is not merely "all tests green." A milestone should also answer:

- Is the game easier to understand without becoming generic?
- Is the change perceptible in real play?
- Does it deepen the occult/ritual identity rather than decorate it superficially?
- Does it improve replay value, tension, mastery, surprise, or satisfaction?
- Does it remain responsive and readable on the Fold 6?
- Does it preserve or improve accessibility?
- Is the code easier to reason about after the change?

Read the project as a whole, preserve its evidence, and then push it further.