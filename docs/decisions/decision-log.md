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

## D-010 — Keep run telemetry local and identity-free

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** Record bounded gameplay run summaries in local browser storage only. Do not transmit telemetry and do not include LootLocker identity, session tokens, names, browser user agents, device identifiers, IP addresses, or advertising identifiers.

**Rationale:** The project needs structured run evidence for debugging and future leaderboard validation, but no network collection or player tracking is required for the current milestone. A strict local allowlist minimizes privacy and security exposure while preserving useful gameplay diagnostics.

**Consequences:** The latest 20 completed runs are retained under `sex_magick_runs_v1`; current runs remain in memory; malformed or unavailable storage fails safely; any future network telemetry requires a separate explicit product, consent, security, and privacy decision.

## D-011 — Define fast retry as a single transition through the existing restart path

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** In the game-over state, `R`, `Space`, `Enter`, and non-control surface input invoke the existing synchronous `restartGame()` method. They must not create a second gameplay implementation or a second RAF chain.

**Rationale:** Fast retry improves arcade flow only if it is immediate, deterministic, and mechanically identical to the existing restart button. Reusing one restart path prevents divergent reset rules and duplicate loops.

**Consequences:** Every retry receives a new local run ID and an exact frame-0, score-0 lifecycle origin; controls remain excluded; one pending RAF callback is required before and after retry; physical touch, iframe-focus, and cross-browser verification remain release gates.

## D-012 — Use seeded named obstacle grammar without claiming solved fairness

**Date:** 2026-08-04  
**Status:** Accepted for development

**Decision:** Replace independent random normal-pillar placement with per-run seeded Hexagram and Monas pattern catalogs organized through `safe`, `pressure`, `recovery`, and `climax` families. Preserve the existing spawn cadence, gap progression, physics, scoring, and progression systems. Constrain consecutive normalized gap-top movement to at most `0.18`.

**Rationale:** Independent random pillars cannot be reliably reproduced, paced, audited, or compared between Rites. Named deterministic patterns create a stable design vocabulary and exact replay surface while keeping the existing core loop intact.

**Consequences:** The same grammar version, seed, Rite, viewport, gap sequence, and Orb probability reproduce the same pattern sequence. Pattern evidence is retained locally under `sex_magick_patterns_v1` and linked only by the local run ID. The `0.18` envelope is explicitly a geometric constraint—not proof that every sequence is beatable. Automated trajectory reachability, high-speed/minimum-gap testing, independent Opus review, and physical playtesting remain release blockers. Local seeds and pattern records are debugging evidence and must not be treated as authoritative leaderboard validation or anti-cheat proof.

## D-013 — Require exact player-state reachability and policy-versioned fallback

**Date:** 2026-08-04  
**Status:** Accepted for development

**Decision:** Evaluate named obstacle patterns with a deterministic player-state solver that models the current Rite physics, cooldown, collision window, breathing motion, speed, gap, and viewport. Accept a tested route only when its complete jump witness replays successfully with at least eight additional pixels of clearance. Apply measured corrections to the five Monas patterns that failed the hard matrix. If a future pattern is absent from the verified verdict set, deterministically substitute `hex.return-to-axis` for Hexagram or `monas.still-point` for Monas. Record the reachability policy version and fallback/adjustment verdict in local pattern evidence.

**Rationale:** The Milestone 4 `0.18` normalized transition envelope did not prevent impossible Monas routes on a tall Fold-open viewport at maximum speed and minimum gap. Geometric continuity is not equivalent to dynamic reachability under stateful velocity, damping, cooldown, and finite gate timing.

**Consequences:** All 16 currently named patterns pass the 252-case hard matrix after the measured Monas corrections, with exact replay witnesses and eight-pixel margin. The solver is a deterministic quantized beam search, not a mathematical proof over continuous state space. It begins each isolated pattern centered in its first gate with zero velocity and cooldown; long cross-pattern compositions, incoming-state sets, human timing tolerance, active Fold transitions, physical-device behavior, and independent Opus review remain release blockers. The client-side solver and evidence remain debugging/fairness instrumentation and must not be treated as anti-cheat proof.

## D-014 — Separate compositional reachability from human timing robustness

**Date:** 2026-08-04  
**Status:** Accepted as diagnostic foundation

**Decision:** Propagate position, velocity, and cooldown through complete seeded pattern cycles from a 27-state incoming cloud; require exact full-sequence witness replay with eight additional pixels of clearance; and evaluate timing tolerance with distributed ±1–3-frame perturbations spanning the first through last witness jump. Classify technical reachability separately from provisional robustness. Do not retune obstacle patterns or claim human comfort solely from the resulting perturbation rates.

**Rationale:** All tested full cycles and two-cycle sequences are technically reachable, but every one-cycle hard case is fragile under the selected witness and provisional timing tests. The current solver chooses a terminally convenient witness, not necessarily the most tolerant witness. Pattern changes made before reviewing witness-selection bias, state merging, beam pruning, perturbation construction, and threshold calibration could flatten the game without addressing the actual source of fragility.

**Consequences:** Milestone 6 remains QA-only and is not loaded by the production entry point. The hard matrix records 16 technically reachable but fragile cases, zero robust candidates, and zero invalid cases. Independent Fable 5 review is required before deciding whether the next step is robustness-aware witness search, broader reachable-set modeling, pattern retuning, or Fold-resize work. Human comfort, physical input latency, active posture changes, and leaderboard authenticity remain unproven.