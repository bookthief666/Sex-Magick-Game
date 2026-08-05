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
**Status:** Accepted for development; production safety interpretation superseded by D-017

**Decision:** Evaluate named obstacle patterns with a deterministic player-state solver that models the current Rite physics, cooldown, collision window, breathing motion, speed, gap, and viewport. Apply measured corrections to the five Monas patterns that failed the hard constant-gap matrix. If a future pattern is absent from the verified verdict set, deterministically substitute `hex.return-to-axis` for Hexagram or `monas.still-point` for Monas. Record the reachability policy version and fallback/adjustment verdict in local pattern evidence.

**Rationale:** The Milestone 4 `0.18` normalized transition envelope did not prevent impossible Monas routes on a tall Fold-open viewport at maximum speed and minimum tested gap. Geometric continuity is not equivalent to dynamic reachability under stateful velocity, damping, cooldown, and finite gate timing.

**Consequences:** All 16 named patterns retain exact replay witnesses under the Milestone 5 constant `110`-pixel matrix after the measured Monas corrections. That result does not establish a positive production safety margin because production uses a per-gate breathing timeline that can approach `100` pixels. Human timing tolerance, active Fold transitions, physical-device behavior, and production-gap witnesses remain unresolved.

## D-014 — Separate compositional reachability from human timing robustness

**Date:** 2026-08-04  
**Status:** Accepted as diagnostic foundation; interpretation superseded in part by D-017

**Decision:** Propagate position, velocity, and cooldown through complete seeded pattern cycles from a 27-state incoming cloud; require exact full-sequence witness replay under the tested model; and evaluate timing tolerance with distributed ±1–3-frame perturbations spanning the first through last witness jump. Classify technical reachability separately from provisional robustness. Do not retune obstacle patterns or claim human comfort solely from the resulting perturbation rates.

**Rationale:** All tested full cycles and two-cycle sequences are technically reachable. The original Milestone 6 instrumentation classified every one-cycle hard case as fragile under an eight-pixel retained-clearance policy. The current solver chooses a terminally convenient witness, not necessarily the most tolerant witness.

**Consequences:** Milestone 6 remains QA-only and is not loaded by the production entry point. Its exact replay witnesses and composition architecture remain accepted. Its original perturbation percentages and surviving-initial-identity interpretation must not be reused as ordinary survival or incoming-corridor evidence; D-017 records the corrected interpretation.

## D-015 — Use bounded input-buffer candidates and stable gameplay-authoritative contrast

**Date:** 2026-08-04  
**Status:** Accepted for development and physical playtest; final buffer unresolved

**Decision:** Support one queued jump intent within a bounded cooldown window, coalesce duplicate pending taps, reject earlier taps with quiet feedback, and expose local counters for immediate, queued, fired, rejected, expired, and coalesced input. Reserve stable high-contrast colors for the player core and lethal pillar silhouette while retaining psychedelic motion and color in subordinate atmospheric channels.

**Rationale:** The former `Player.jump()` silently returned during cooldown, making a rejected tap indistinguishable from player error. Full-spectrum player and pillar cycling could also erase collision readability.

**Consequences:** Three and six simulation steps remain human-test candidates through `?inputBuffer=3` and `?inputBuffer=6`. Machine evidence does not select the final value. Reduced-motion and low-flash settings, lower jump-particle density, and pause-on-major-resize are part of the same player-truth boundary.

## D-016 — Fail closed on missing reachability policy and separate fast QA from heavy audits

**Date:** 2026-08-04  
**Status:** Accepted

**Decision:** If the reachability correction policy fails to load or install, preserve Hexagram play but seal Monas and pause any active Monas run rather than scheduling an unverified catalog. Run rapid gameplay contracts and Chrome integrations on every development push. Move isolated and compositional reachability matrices to a manual, weekly, and relevant-path-triggered audit workflow.

**Rationale:** The previous policy bootstrap only logged failure, allowing the uncorrected Monas catalog to remain reachable despite Milestone 5 proving specific original routes impossible. Heavy solver matrices also taxed every creative edit even though their meaning changes primarily with physics, patterns, policy, or solver code.

**Consequences:** Policy status is exposed through `window.__SEX_MAGICK_POLICY_BOOTSTRAP__`. Full reachability evidence remains available through `.github/workflows/reachability-audit.yml`.

## D-017 — Report collision survival separately from retained safety margin and deprecate the initial-identity inference

**Date:** 2026-08-04  
**Status:** Accepted; supersedes the affected Milestone 6 interpretation

**Decision:** Use `margin = 0` to report collision survival and a separately named positive-margin metric to report retained safety clearance. Do not infer incoming-state diversity from the surviving `initialStateId` count after quantized state deduplication. Model production-style per-gate gap breathing before using a solver result to justify pattern retuning or safety claims.

**Rationale:** The Milestone 6 `10.9%–43.6%` range replayed perturbations with an eight-pixel margin and therefore counted survivable near-misses as failures. The one-time Milestone 7 audit measured constant-gap margin-0 survival at `32.73%–74.55%`, improving to `38.18%–80.00%` with a three-step buffer. Cooldown-tight witness intervals were only `0%–18.18%`. With production-style gap breathing, margin-0 survival ranged `20.00%–69.09%` unbuffered and `29.09%–74.55%` buffered, while eight-pixel safety retention fell to `0%–5.45%` because the witness had been generated for different geometry.

State deduplication also discarded all but one representative `initialStateId` when histories converged. The resulting count proves neither a narrow nor a wide incoming corridor.

**Consequences:** The old Milestone 6 label `technically-reachable-fragile` remains historical diagnostic output, not a human-fairness verdict. Existing patterns will not be retuned from those percentages. Future provenance analysis must union state-origin masks or solve initial states independently. Future safety witnesses must be generated against the real per-gate gap timeline.

## D-018 — Implement the Gate hypothesis as a quarantined opt-in slice

**Date:** 2026-08-04  
**Status:** Accepted for development experiment only

**Decision:** Implement the Hexagram Gnosis/Gate/Void hypothesis behind `?gateSlice=1`, without replacing ordinary branch behavior, merging the draft PR, or deploying. Preserve both input-buffer candidates. Keep the experiment in `tools/gate-slice-runtime.js` rather than expanding `tools/collision-runtime.js`.

**Rationale:** The project had repeatedly deferred its central player-facing wager hypothesis while adding verification infrastructure. The owner explicitly directed development to continue while currently having access only to one Samsung Galaxy Z Fold 6. A query-quarantined implementation allows physical evaluation without treating the missing multi-person evidence as completed.

**Consequences:** The slice contains four ordered bands, visible risk zones, Gnosis gain and decay, a physical enter-or-bypass Gate, banking, a lethal transformed Void, bounded local evidence, and a Fold-friendly playtest harness. Monas is sealed in slice mode. The leaderboard is disabled before initialization, and browser QA proves that no LootLocker request is initiated. Automated success proves execution only—not fun, comprehension, balance, replayability, or release readiness.

**Full record:** `docs/decisions/d018-opt-in-gate-slice.md`

## D-019 — Separate session evidence and viewport composition from unresolved Gate design

**Date:** 2026-08-04  
**Status:** Accepted on stacked development branch

**Decision:** Freeze the Milestone 8 Gate experiment on `develop/sex-magick-2.0` and perform complete-session evidence correction and device-aware viewport composition on `develop/m9-runtime-hardening`. Do not change Gate, Gnosis, Void, score balance, input physics, obstacle patterns, Monas, progression, leaderboards, or deployment behavior.

**Rationale:** The first owner report lost early runs beyond the 20-record persistence cap, included an unsafe crossing in successful-clear arithmetic, and established the physical `368 × 869` Fold-closed viewport as a distinct composition target. These defects could be corrected independently of the unresolved Gate design.

**Consequences:** Session evidence is retained independently of bounded persistence; unsafe crossings cannot increase Gate clears or score; Gate visibility and movement-toward proxies are recorded without claiming conscious intent; Fold closed/open profiles are explicit; `collision-runtime.js` remains unchanged.

**Full record:** `docs/decisions/d019-runtime-evidence-and-viewport-hardening.md`

## D-020 — Bound high-DPR rendering and fail open with procedural asset fallbacks

**Date:** 2026-08-04  
**Status:** Accepted for development; physical-device performance remains unvalidated

**Decision:** Preserve logical CSS-pixel gameplay coordinates while allocating a separate canvas backing store bounded by DPR `3` and eight million pixels. Replace indefinite catalog-image loading with finite anonymous-CORS attempts, explicit offline mode, inspectable outcomes, idempotent completion, and shared accent-keyed procedural fallbacks. Install the compatibility shims in parser order before game construction.

**Rationale:** Directly multiplying canvas dimensions would break game-space consumers, while one CSS pixel per backing pixel underuses high-density Fold displays. External asset failure should reduce visual richness rather than block gameplay or leave undefined image state. Dynamic-only bootstrapping did not prove interception before the original preload began.

**Consequences:** Fold-closed and Fold-open Chrome cases retain logical dimensions while using bounded DPR backing stores; managed RGB-split rendering uses logical scratch blits instead of `getImageData`; explicit offline mode produces no catalog requests; parser-time `document.write` is accepted only as a contained bridge for the current single-file architecture.

**Full record:** `docs/decisions/d020-bounded-dpr-and-asset-fallbacks.md`
