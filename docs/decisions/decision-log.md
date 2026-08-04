# SEX MAGICK 2.0 — Decision Log

This log records consequential project decisions. Trivial implementation details do not belong here.

## D-001 — Protect the shipped baseline

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Preserve `main` at commit `d3760aaea9c7322d48e471389a67c4e579743e2a` and perform 2.0 work on `develop/sex-magick-2.0`.

**Rationale:** The game is already published. A dedicated branch provides a clear rollback point and prevents unverified work from replacing the live build.

**Consequences:** No direct changes to `main`; substantial changes will use a draft pull request; itch.io remains untouched until release gates pass.

## D-002 — Do not migrate frameworks during the audit

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Retain the current single-file runtime during baseline diagnosis and the first gameplay milestones.

**Rationale:** The current project is compact. A framework migration would add regression risk before controls, physics, collision, scoring, and deployment behavior are understood.

**Revisit when:** Targeted changes become unreviewable, automated testing is materially blocked, or multiple systems require independent ownership. Native modules remain the preferred first structural step.

## D-003 — Correct simulation timing before tuning game feel

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Milestone 1 will address refresh-rate-dependent simulation before movement, difficulty, score, or leaderboard balance is tuned.

**Rationale:** Current gameplay-authoritative updates are frame-based. Tuning against an unstable clock would create device-dependent results and invalidate competitive comparison.

**Consequences:** No major physics rebalance until 60/120+ Hz behavior is normalized and tested.

## D-004 — Treat the current leaderboard as untrusted pending runtime and backend verification

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Do not present the existing shared board as competitively trustworthy. Do not choose a replacement provider until LootLocker behavior and configuration are tested from the itch.io origin.

**Rationale:** The browser currently submits an arbitrary integer score without visible server-side run validation. The repository cannot reveal backend dashboard rules.

**Consequences:** Backend selection remains a consequential owner decision. Separate Rite categories and proportional validation are required before a competitive 2.0 release.

## D-005 — Use instrumentation as the first branch-only development milestone

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Add a branch-only runtime viewport harness and committed QA matrix before altering gameplay.

**Rationale:** Runtime evidence is required for collision, mobile input, Fold behavior, audio, loading, and leaderboard connectivity. Instrumentation is reversible and does not impose premature architecture.

**Consequences:** `tools/runtime-harness.html` is not the production entry point and must not be included as a player-facing itch page.

## D-006 — Use Claude Opus for independent timing review

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Request a strongest-available Claude Opus review before merging the timing refactor.

**Rationale:** Fixed-step conversion touches hidden interactions across physics, spawning, timers, damping, effects, pause/resume, and score opportunity. Independent adversarial review is proportionate to the regression risk.

**Handoff:** `docs/handoffs/claude-opus-m1-simulation-review.md`

## D-007 — Make collision geometry canonical and visible

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Define canonical player, top-pillar, bottom-pillar, and safe-gap rectangles. Collision, diagnostics, and obstacle rendering must derive from the same pillar dimensions. Mere edge contact is safe; penetration is a collision.

**Rationale:** The former diagonal pillar artwork implied safe empty space inside a rectangular lethal area. Collision fairness requires visual and mechanical boundaries to agree.

**Consequences:** Gap-facing artwork remains inside the lethal rectangles, a debug hitbox overlay is available, and rendered-edge containment is covered by deterministic tests.

## D-008 — Use full-screen gameplay touch with explicit control exclusion

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** During active play, accept touch input anywhere in the gameplay surface except on actual controls. Remove the invisible lower-40-percent requirement and change the mobile instruction to `TAP ANYWHERE`.

**Rationale:** A fading instruction must not conceal a permanent input restriction. Full-screen touch matches the displayed instruction and reduces missed inputs on tall phones and foldables.

**Consequences:** Gameplay touches prevent default synthetic mouse duplication; control touches remain available for click synthesis; physical Android, Fold, and mobile Safari testing remains required.

## D-009 — Give Player.jump sole ownership of accepted-jump feedback

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** `Game.playerJump()` dispatches to `Player.jump()` once and emits no additional haptic. `Player.jump()` remains responsible for accepted-jump SFX and haptic behavior.

**Rationale:** The previous split ownership produced two pulses for successful jumps and could pulse on cooldown-rejected input.

**Consequences:** Input surfaces share one feedback path, cooldown behavior remains inside the player, and future accessibility or Rite-specific feedback changes have one owner.
