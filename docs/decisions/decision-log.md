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

## D-021 — Keep performance evidence opt-in, bounded, local, and context-stable

**Date:** 2026-08-04  
**Status:** Accepted on stacked development branch; physical thresholds remain unresolved

**Decision:** Load performance instrumentation only for explicit `?perfProbe=1` sessions. Keep frame, draw, callback, fixed-step, Long Task, startup, DPR, backing-store, and viewport evidence in bounded memory; transmit and persist nothing automatically; export JSON only after a user action; and require a new Fold/render context to remain identical for three consecutive RAF callbacks before opening a measurement segment.

**Rationale:** Milestone 10 established bounded high-DPR rendering but not its physical Fold cost. Owner-operated comparison needs stable local evidence without converting every game session into analytics. Real resize testing also showed that new dimensions can appear before the viewport profile settles, so immediate segmentation creates false intermediate contexts.

**Consequences:** Ordinary sessions do not load the probe. Transitional callbacks are excluded and counted separately. The Fold playtest harness compares closed/open native, 2×, and CSS-pixel modes locally. Headless classifications remain detector diagnostics—not physical-device verdicts or release gates. The existing ordinary-startup LootLocker guest-session request is recorded separately and is neither created nor expanded by M11.

**Full record:** `docs/decisions/d021-local-performance-budget-probe.md`

## D-022 — Require complete physical evidence before selecting a Fold render DPR

**Date:** 2026-08-04
**Status:** Accepted on stacked development branch; physical recommendation pending owner evidence

**Decision:** Require versioned, same-origin, repeated Fold-closed and Fold-open evidence across CSS 1x, 2x, and native DPR before making a render recommendation. Exclude incomplete or mismatched runs explicitly and aggregate eligible repeats with medians and median absolute deviation.

**Consequences:** At least three eligible repeats per preset are required; automated fixtures prove the selection mechanism only; no physical Fold 6 DPR recommendation exists without owner evidence.

**Full record:** `docs/decisions/d022-physical-performance-evidence-gate.md`

## D-023 — Separate emulated breadth from real-device transport truth

**Date:** 2026-08-05
**Status:** Accepted on stacked development branch

**Decision:** Use pinned Playwright projects for broad repeatable screen coverage and a manually invoked BrowserStack workflow for bounded desktop, Android, and iOS transport truth. Preserve raw Playwright desktop transport and BrowserStack SDK mobile transport rather than forcing one connection path across platforms.

**Consequences:** Local automation remains the prerequisite for paid real-device smoke; BrowserStack runs do not establish performance, physical Fold ergonomics, gameplay quality, or release readiness. D-025 supersedes the exact SDK pin while retaining this topology.

**Full record:** `docs/decisions/d023-cross-screen-and-real-device-automation.md`

## D-024 — Use deterministic visual-state construction and separate transition truth from screenshot truth

**Date:** 2026-08-05
**Status:** Accepted on stacked development branch

**Decision:** Use a query-gated deterministic controller and 28 exact Chromium signatures for seven named states on four reference geometries. Test the real retry transition independently from the normalized retry screenshot and require every named state, including menu-first, to satisfy its own renderer preconditions.

**Consequences:** Firefox and WebKit retain structural coverage without inheriting Chromium hashes; zero LootLocker initiation is enforced in visual QA; baseline changes require explicit review; screenshot stability does not establish subjective quality or release readiness.

**Full record:** `docs/decisions/d024-deterministic-visual-state-regression.md`

## D-025 — Lock and review the QA supply chain without CI-side branch mutation

**Date:** 2026-08-05
**Status:** Accepted on stacked development branch

**Decision:** Commit the exact npm QA graph, pin reviewed external Actions to immutable SHAs, install with lifecycle scripts disabled, and enforce audit and drift policy from a read-only workflow that never pushes to its source branch.

**Consequences:** Production findings and high/critical QA findings fail CI; current moderate BrowserStack-chain findings remain explicit and provisional; dependency and Action updates require the full visual matrix and bounded BrowserStack revalidation when transport changes.

**Full record:** `docs/decisions/d025-reproducible-qa-supply-chain.md`

## D-026 — Correct Gate fairness and measurement truth before building on the slice

**Date:** 2026-08-12
**Status:** Accepted

**Decision:** Act on the first human playtest of the Gate slice. Make the entry aperture the circle the player aims at (44 px, drawn, inside a 60 px glow — it was a 31 px hitbox behind a 52 px ring). Replace fixed two-position Gate placement with seeded, corridor-constrained, reachability-bounded placement. Classify a gate clear from the frame of closest approach rather than after the pillar is marked passed. Change no balance constant.

**Consequences:** The D-018 acceptance signal is met — the 2026-08-12 Fold 6 pilot recorded a 46.4% Gate entry rate with affirmative comprehension, intentionality, feel, and replay. The four "unsafe crossings" it reported were a symptom of the sampling defect, not a collision failure. The input-buffer question is closed at three frames and D-018's R-1 prerequisite is retired, because the buffer never engaged in 1768 inputs. Risk-zone balance, near-miss threshold, and the wager ratio stay untouched pending re-measurement on corrected instrumentation. The Gate reads as a skill challenge rather than a wager, so the in-game telegraph is now inconsistent with observed behaviour and is owed a later change.

**Full record:** `docs/decisions/d026-gate-fairness-and-measurement-truth.md`

## D-027 — Extend the difficulty curve to KETHER and give walls motion and width, inside the verified envelope

**Date:** 2026-08-12
**Status:** Accepted

**Decision:** Add CHESED, BINAH, CHOKMAH and KETHER past GEBURAH, ending at speed 8.5 / gap 122. Replace the single global sine that moved every wall in lockstep with per-pillar motion, where amplitude and gap scale are declared by the named pattern and phase is hashed from (seed, spawnIndex) so the seeded stream is untouched. Cap Void speed at 8.5 and floor its gap at 110.

**Consequences:** The 2026-08-12 pilot spent 196 of its 507 gate clears past the old ceiling, on a flat curve; that is now the escalation the owner asked for as "more variety". Safety rests on one fact — a gap of width G swinging by ±A always contains a static corridor of G − 2A — so clamping every pattern's request against a verified floor of 110 makes motion clearable at any phase. 110 is measured: the audit degrades to marginal at 105 and invalid at 96. Motion and narrowing therefore self-limit, dramatic in wide early bands and near-still at KETHER. The Void cap also corrects a pre-existing overreach, since GEBURAH already exceeded the audited ceiling at 9.3. Evidence: 1008 new reachability cases all verified at margin 8, the original 252-case audit unchanged, and a 20 000-frame browser run confirming 102 distinct phases and a narrowest gap of exactly 110. Double-gap walls are deferred — they break the solver's single-corridor model and need solver support before shipping.

**Full record:** `docs/decisions/d027-difficulty-curve-and-obstacle-variety.md`

## D-028 — Give runs a purpose beyond score with persistent missions, read from existing telemetry

**Date:** 2026-08-12
**Status:** Accepted

**Decision:** Add three persistent, rotating objectives carrying progress across runs, driven entirely by state the Gate slice already tracks. The missions runtime is a pure observer — it diffs monotonic counters and reads `lastClear` rather than walking the 120-entry event array, which splices from the front and would silently undercount. `gate-slice-runtime.js` is unchanged.

**Consequences:** The 2026-08-12 pilot had 7 of 15 runs die under 15 gates and produce nothing; a short run is no longer a total loss. Missions also direct attention at mechanics a player would otherwise never engage, which matters most for the four bands M17 added. Two scopes (`cumulative` carries across runs, `run` resets) and a rotation that keeps the active three spanning light/steady/deep tiers, so nothing unreachable is ever handed out. Persistence stores only mission ids and integers under a defensive reader. The HUD is suppressed under `visualQa=1` — mission progress is per-player state and would make signature screenshots non-deterministic — verified differentially against a worktree at the pre-M18 commit, since this sandbox's Chromium cannot reproduce the committed baselines at all: 25 of 28 signatures are byte-identical and the 3 that differ also differ between two runs of the unmodified tree. The lost coverage is replaced by structural cross-screen assertions that run at every geometry instead of four. Targets are first estimates anchored to pilot rates and are explicitly untuned; that needs a Fold block at both postures.

**Full record:** `docs/decisions/d028-persistent-missions.md`

## D-029 — Power-ups unlocked by ascent and earned by challenge, not found on the floor

**Date:** 2026-08-12
**Status:** Accepted

**Decision:** Two power-ups on two separate ladders. Bands unlock the *type* — AEGIS at YESOD, DISSOLUTION at GEBURAH, caps rising with the climb — while challenges earn the *charge*: one per Void survived, one per 25 gates cleared in a run. Unlocks persist, charges reset every run. AEGIS spends itself automatically because a crash cannot be planned for, and refuses to absorb inside the Void because the Void is the wager. DISSOLUTION gets a button because destroying a wall is deliberate, and grants no gate or score credit for the wall it skips.

**Consequences:** Gating the breaker at GEBURAH keeps M17's curve intact on a first encounter — a new player meets the Gate, the Void and the risk bands before being handed a wall-skip. The button does not steal a jump, and not by luck: CONTROL_SELECTOR already exempted every `<button>` from the full-screen touch handler, so no input-path change was needed. Install order is a correctness requirement, not a preference — the runtime waits for the Gate slice so its gameOver wrapper is outermost and still sees `__gateSliceVoidActive`; installed inner, the shield would silently start covering Void deaths. Evidence: 21 fast suites, a real 20,000-frame run reaching KETHER and earning 5 charges from play, and cross-screen passing at both Fold postures. Two things are not clean and are recorded rather than hidden: `browser-m11-performance-budget-test` fails in the sandbox but fails identically at M17 and M18 and passed at M17 earlier the same session, so it is a pre-existing load-dependent race; and signatures were again verified differentially rather than against the committed baselines. The economy is explicitly untuned — the probe run filled both power-ups to cap, which suggests charges may arrive too freely.

**Full record:** `docs/decisions/d029-earned-powerups.md`

## D-030 — Make a playtest measure what is on disk, and delete the button nobody pressed

**Date:** 2026-08-12
**Status:** Accepted

**Decision:** Serve playtests with caching off (`tools/serve-playtest.py`) and stamp every report with a `runtime` fingerprint read live from the running constants. Delete the DISSOLUTION button outright; both power-ups now fire themselves, and AEGIS draws ward rings on the avatar rather than a count in a corner.

**Consequences:** The 2026-08-12 ten-minute session returned a complete-looking report describing a build that did not exist — new files loaded fresh while a cached pre-M16 Gate slice ran — and noticing took three separate inferences from the event data. M16 and M17 went unmeasured a second time. Reports now state their own provenance, and the browser suite runs against the same no-cache server the owner uses. On the button: `dissolves: 0` with `dissolveAttemptsWithoutCharge: 0` means it was never touched across a whole session, so D-029's reasoning that a deliberate act deserves a deliberate input was wrong in context — a corner button asks the player to switch input modes exactly when they can least afford to. A cross-screen assertion now requires the power-up layer to hold zero controls and `pointer-events: none`, enforcing that structurally. DISSOLUTION stays distinct from the shield by firing predictively: it projects the reachable band of player heights forward and dissolves a wall only when no sequence of taps could clear it, capped at 70 frames because the gap breathes. With both held it resolves first, keeping AEGIS for an unforeseeable hit; neither fires in the Void. The ward is violet `#c9b4ff`, chosen to avoid all three reserved colours. The economy is deliberately untouched — 11 earned against 1 spent says supply is too high, but retuning against a legibility bug would tune the wrong variable.

**Full record:** `docs/decisions/d030-honest-tests-and-visible-powerups.md`

## D-031 — The aesthetic pass, and the fill-rate budget it nearly spent

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** The generated occult field becomes the game's real look — per-Sephirah palettes, seeded seals and inscriptions at three parallax depths, inscribed walls, the Gate as a summoning, and a Void that drains the world's colour — with Drive artwork compositing over it as enrichment. The field composites at CSS-pixel resolution into an offscreen buffer and is blitted once, which is what keeps it inside the M11 budget rather than an optimisation bolted on afterwards.

**Consequences:** No functional signal moved: hazard, Hexagram, Monas and ward colours, and the Gate's 44px aperture and ring, are unchanged and asserted in CI, so Gate entry rate stays comparable to the 46.4% and 54.5% baselines. `SIGIL CHANNEL OFFLINE` is now unreachable — a failed Drive fetch costs enrichment, not an error screen — which required removing the start screen's Drive background from `index.html`, the one deviation from the plan. The milestone's real lesson is a near-miss: `browser-m11-performance-budget-test` failed, the plan had already written it off as a known sandbox flake, and that was wrong — it passed 3/3 at `9cd4217` while failing 3/3 on the branch. `drawField` was doing four full-screen operations per frame into a DPR-scaled canvas, ~27M pixels, producing 300ms frames that the perf runtime discarded wholesale as suspension gaps. Caching the ground, making the strata layer horizontally periodic so one blit wraps instead of two, and compositing into a CSS-resolution buffer brought fold-open frames to ~87ms with zero gaps — faster than the tunnel it replaces. The doubled second blit was also a visual defect, alpha-compositing a moving band of doubled density across the right of the screen. Note `perFrameDrawMs` rose 0.76 → 4.15 because the buffer works synchronously where queued canvas calls deferred cost to rasterisation; throughput improved 3.4× regardless. **The 28 M14 signatures are deleted here and must be re-established from a green CI run before release** — an open obligation, with the procedure in `tests/visual-baselines/README.md`. Cross-screen's four failures per Fold posture are blocked-host network errors that fail identically at `9cd4217`.

**Full record:** `docs/decisions/d031-the-aesthetic-pass-and-the-fill-rate-budget.md`

## D-032 — Restoring the original effects, and the two metrics that disagreed

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** The generated field becomes a backdrop *beneath* the original game rather than a replacement for it. `Game.prototype.drawHyperspaceTunnel` is now called unmodified over the field, so the eight rotating pentagrams return in the per-level accent and the level artwork returns at its original alpha 0.6 source-over treatment. A per-level accent wash restores the frequent colour turnover the 27 shuffled levels used to give.

**Consequences:** The owner asked to retain the original effects, and reading the diff found three regressions rather than one. The decisive one: M21 rewrote the artwork composite as alpha 0.45 with `globalCompositeOperation = 'lighter'`, and **additive blending over a dark ground is nearly invisible** — the dark half of a photograph adds almost nothing, so the backgrounds vanished. M21's own plan had promised "the existing alpha". The fix is to stop reimplementing: the wrapper calls the original function, keeping only the deliberate difference that M10's placeholder error card never draws. The artwork is a small tested duplicate because it needs full device resolution while the tunnel does not; the suite now asserts the composite *by arithmetic*, where source-over and additive predictions differ by more than a hundred. Where the pentagrams draw was a real trade between two suites that disagreed: on the main canvas cost is deferred (0.14ms scripting, ~300ms frames), in the offscreen buffer it is synchronous (~16.5ms scripting, ~254ms frames). Measured, the tunnel in the buffer is free — 253.7ms against 254.5ms without it — so it goes there. Of the 16.5ms, 11.9ms is the 15px shadow blur that `optimizedShadow` **already disables on mobile**; the aesthetic suite had been running without a mobile user agent and measuring a desktop path the Fold 6 never takes. It now emulates the Fold UA and measures 5.29ms on the shipped path, with the desktop glow path bounded separately and labelled as software-rasterisation inflated. The accent wash is a plain source-over fill at 0.34 because a `'color'` composite, though better in principle, is non-separable and cost ~167ms a frame alone. Evidence: 24 fast suites, 13 browser suites, M11 **3/3 on both this branch and `8559a7f`** with 191 frames/20s against 195 and zero suspension gaps. Earlier in the same session both commits failed M11 3/3 — including the M21 commit that had passed hours before — and that was established as host degradation by A/B against a worktree rather than assumed, which is the mistake D-031 records.

**Full record:** `docs/decisions/d032-restoring-the-original-effects.md`

## D-033 — The level-up punch nobody wired, and the colour nobody set

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** `checkGateSliceBand()` now gives a real band change the original level-up's punch — shake, freeze, RGB-split glitch, a 30-particle burst in the band's own accent, haptics — matching what the pre-M16 score-based `checkLevel()` did. And every level the Gate slice can show now has a real accent colour: `originalLevels`, the 11-image pool `prepareOrderedLevels` draws the 8 in-game bands from, never had an `accent` field at all; it now cycles through the same `palette` array `newImageIDs` already used.

**Consequences:** After two rendering-focused milestones, the owner still reported no visible background changes or glitch effects. Investigation found two separate, real gaps rather than a rendering regression. First, `gate-slice-runtime.js` (M16) replaced score-based levelling with a Gate-slice band system months before the aesthetic pass, and its `applyBand()` never carried over the original's shake/freeze/glitch/particle spectacle — that event was simply disconnected, and the owner chose to reconnect it on band changes only, keeping backgrounds at 8 images. Second, and more consequentially: `originalLevels` — the *only* pool the Gate slice draws its 8 real backgrounds from — was missing `accent` on every entry, so canvas silently ignored the invalid `strokeStyle` and kept whatever was drawn last, CSS ignored the invalid custom property the same way, and `applyAccentWash` explicitly bailed with nothing to wash with. **Every backgrounds-changing claim from M21 and M22 was true only in synthetic tests that hand-set accents** (`forceBand`, literal hex assignments) — the real gameplay path had no colour to show, on any of the 8 bands, ever, and that predates this session's work entirely. The fix is verified against the *real* unforced data path specifically to close that gap: driving `gatesCleared` through `game.checkLevel()` across a boundary, asserting the punch fires with the band's actual accent, that a same-band gate clear stays quiet, and that all 8 in-game levels carry a real `#rrggbb` value as a standing regression guard. 24 fast suites and 15 browser suites green, including M11 3/3. Cross-screen shows the same eight pre-existing blocked-host failures as the prior three commits.

**Full record:** `docs/decisions/d033-the-punch-nobody-wired-and-the-colour-nobody-set.md`

## D-034 — The gallery, the corridors, and the flash that hid them

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** Three things M16 removed come back without disturbing the Gate slice: the background picture rotates through the whole ~71-image pool every 4 gates (independent of the band), pentagram bonus corridors return every 25 gates alongside the Void wager rather than instead of it, and the glitch gets its cadence back as orbs spawn again outside Gate and Void frames. Underpinning all of it, `applyBand` finally assigns `currentLevelIdx`.

**Consequences:** `currentLevelIdx` was never assigned anywhere in `gate-slice-runtime.js` — set to 0 at run start and never moved — and `drawLevelArtwork`, `drawScene`'s `tunnelColor` and M21's accent wash all read it, so every one was pinned to image 0 for whole sessions. The M23 telemetry exposed it: runs reached bands 7/5/4/2/2/2/1/1, about **24 band transitions in ten minutes**, after I had told the owner band changes were rare and to expect them seldom. Pentagrams were unreachable because they spawn only inside `if (this.voidMode …)` and the Gate slice's Void branch clears that flag so pillars spawn during the wager; the corridor is now its own state that borrows the flag for its spawn window only, at 25 gates — the faithful translation of the original's every-5-levels, since gates are this game's pillars at ~1.6s each. The glitch was starved of triggers, not weakened. **The milestone was nearly reverted:** the aesthetic suite's Void assertion began failing intermittently, my bisects contradicted each other because single runs are worthless against an intermittent failure, and I did revert the whole thing at one point rather than ship what I could not explain. Instrumenting inside `drawVoid` settled it — the field buffer's corner was `0/0/0` black in *both* outcomes, and the brightness came after the blit from `applyScreenFlash` painting a `#ffd700` gold pickup flash, i.e. `triggerOrbGlitch()` firing precisely because orbs are collectible again. Restoring the original's most frequent effect turned an accidentally-deterministic assertion into a coin flip; the assertion now settles transient overlays before sampling, and `voidDarkening` improved to 0.57 against M23's 0.553. Two further test failures traced the same way: the artwork check was setting images on `gameLevels` while the gallery draws from `MASTER_POOL`, and a 41–56ms draw-cost failure reproduced identically at the previous commit under host load average 178. Evidence: 24 fast and 14 browser suites green including M11, aesthetic 3/3 idle with `perFrameDrawMs` unchanged at 5.43, and the gate-slice suite driving the real `checkLevel()` path to assert a 75-entry gallery, an advancing pointer, a corridor with 9 pentagrams and 0 pillars, and **the Void wager with 0 pentagrams and pillars intact**.

**Full record:** `docs/decisions/d034-the-gallery-the-corridors-and-the-flash-that-hid-them.md`
**Session analysis:** `docs/playtests/m23-fold-open-results.md`

## D-035 — Visual signatures restored, and an honest note on what they cover

**Date:** 2026-08-13
**Status:** Superseded by D-036 — and its diagnosis was wrong. The blank canvas was real, but the cause given below ("the posed scene yields no painted occult field") is false: the pose paints 100%, and `waitForVisualSettlement()`'s `__SEX_MAGICK_RENDER__.refresh()` cleared it before the screenshot. See D-036.

**Decision:** `tests/visual-baselines/m14-signatures.json` is re-established from CI run 31686044845 — a fully green `M14 Visual-state QA` run on `9d060d5` — restoring the 28 signatures deleted in M21 and closing the release obligation D-031 opened. Pixel comparison is on again for four geometries and seven states.

**Consequences:** The obligation is discharged, but the coverage claim needs correcting rather than celebrating. I recommended this work on the grounds that it would have caught the M21/M22/M23 regressions. **Reviewing the renders shows it would not have.** The signatures hash the whole `#game-container`, so any pixel change does flip them — but in the posed gameplay states the canvas is almost entirely unpainted: measured at `chromium-fold-inner`, non-black pixels run 0.6% for `gameplay` and `retry`, 2.3–3.3% for `death`/`void`/`gate-bank`/`gate-offer`, against 79.9% for `menu` (whose richness is the CSS title backdrop, not canvas). `__SEX_MAGICK_VISUAL_QA__` poses UI state and calls `drawScene()`, but the posed scene yields no painted occult field. This is pre-existing and not an M24 regression — the measurements are byte-identical at `6c75677` — but it means the three defects the owner actually hit (additive blending erasing the backgrounds, missing `accent`, frozen `currentLevelIdx`) all lived in states this suite renders black. The net is genuine for DOM, HUD, layout and safe-area, and it will flag future canvas changes; it is not today an art-regression net. The high-value follow-up is to make the gameplay poses render a real field — pillar, avatar, strata — so the signatures cover the artwork the owner looks at. Also recorded: the CI screenshot artifact could not be downloaded from this session because the egress policy denies the Azure blob host that serves Actions artifacts, so the mandated screenshot review was done on locally rendered equivalents instead, with the hashes taken only from CI.

**Full record:** `tests/visual-baselines/README.md`

## D-036 — The settle step was wiping the canvas, and my diagnosis of it was wrong

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** `showState()` in `tests/visual-state.spec.ts` now calls a new `redraw()` on the frozen `__SEX_MAGICK_VISUAL_QA__` API *after* `waitForVisualSettlement()`, so the screenshot captures a painted frame. `tests/visual-baselines/m14-signatures.json` is re-established from CI run 31688307078 (77 passed, 23 skipped, 0 failed) on `a23e671`, replacing the blank-canvas baseline D-035 took from run 31686044845.

**Consequences:** The blank canvas D-035 reported was real, but **the cause I gave for it was false**, and that is the part worth recording. I wrote — in the log and in the baselines README — that "the posed scene yields no painted occult field", i.e. the harness posed UI state and the field never rendered. Instrumenting the pose showed the opposite: the canvas reaches **100% painted** immediately after `showState()`, and the next line empties it — `waitForVisualSettlement()` calls `__SEX_MAGICK_RENDER__.refresh()`, which re-runs the viewport path and clears the backing store, with the screenshot taken after that. Measured directly: 100% before `refresh()`, 0% after. The conclusion I drew (the net did not cover the artwork) was right; the mechanism was not, and a wrong mechanism sends the next person to fix the wrong file. With the repaint in place the non-black fraction at `chromium-fold-inner` goes from 0.6–3.3% to 83.8–99.7% (`retry` 99.7%, `gameplay` 97.0%, `gate-bank` 96.2%, `void` 96.2%, `gate-offer` 95.7%, `death` 83.8%), and the rendered `gameplay.png` shows the magenta field, the rotating pentagram tunnel, hazard-pink pillar edges and the cyan Hexagram avatar. The strongest evidence is the diff against the old baseline: **4 signatures unchanged — all four `menu` entries — and 24 of 28 changed.** `menu`'s richness is a CSS title backdrop on a DOM layer, so a canvas repaint cannot move it; every state that *is* canvas moved. That is the exact fingerprint a correct fix should leave, and it is what turns this from an assertion into a demonstration. Two limits stay on the record: these baselines cannot retroactively cover the M21/M22/M23 defects, and the gallery entry under `assetMode=offline` is a deterministic fallback rather than a live Drive image, so image-fetch regressions remain out of scope. The CI screenshot artifact still could not be downloaded (egress policy denies the Azure blob host serving Actions artifacts); the D-024 review step was done on locally rendered equivalents, with hashes taken only from CI.

**Full record:** `tests/visual-baselines/README.md`

## D-037 — The signatures were phase-dependent, and the re-armed comparison caught it

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** `tools/visual-state-runtime.js` phase-locks the scene for capture: each pose clears the record, the first draw after a pose records the phase of every animated layer it can see, and every later draw restores it. `tools/occult-field-runtime.js` gains a read-only `getGlyphRain()` accessor so the Void's rain can be pinned; rendering never reads it. The baselines D-036 established are withdrawn and re-established from a fresh run, because phase-locking changes every rendered frame.

**Consequences:** Committing the D-036 baselines re-armed the comparison, and **the next CI run failed** — which is the net doing its job on its first live outing. The failure was narrow: `chromium-desktop` disagreed on `gate-bank` on both attempts and on `void` on the retry only, while the other three geometries reproduced all 28 hashes exactly. The cause is that the scene advances every time it is drawn, so a signature depended on the number of draws preceding the capture: `game.stars` drift and twinkle, `game.backgroundParticles` fall, `game.gateSliceOffer.pulse` advances 0.08, `game.screenFlash.duration` counts down, and the Void's `glyphRain` falls. `backgroundParticles` is what made it a flake rather than a constant offset — it is created once at page init, so its phase is a running total of every draw since load, and one stray or missing repaint anywhere in the suite shifts every later state. Desktop is where an extra resize repaint was most likely and the gate states are posed last, so they carried the most drift. It also explains the `menu` control from D-036: the start screen covers the canvas, so ambient drift behind it changes no container pixels. **I had assumed the flake was random spawning — restored orbs and particles from D-034 — and probed for it; eight independent contexts came back byte-identical with identical inputs, which disproved that and sent me to measure draw-count sensitivity instead, where all seven states failed immediately.** After the fix all seven are byte-identical across three consecutive draws and across eight contexts, canvas paint is 100% at fold-inner, and 39 fast suites plus 12 browser suites are green (m12 needs a physical device). The cost is recorded honestly: the signatures now assert what is drawn, not that it still animates, and `browser-m21-aesthetic-test.mjs` remains the check for motion.

**Full record:** `tests/visual-baselines/README.md`

## D-038 — The capture raced a 1100ms timer, and the failure pattern named it

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** The visual QA harness cancels the Gate telegraph's pending auto-hide before capture (`pinTelegraph()`, called from `drawNow()`; `resetUi()` also clears the timer when it hides the panel at the start of every pose), so telegraph visibility depends on the pose rather than on elapsed wall-clock time. The D-036/D-037 baselines are withdrawn again and re-established from a run that includes this.

**Consequences:** Arming the phase-locked baselines failed too — third time — but the failure pattern was the diagnosis. On `chromium-desktop` the four standard states matched **exactly** on both attempts, while all three gate states differed from the baseline *and* from each other between attempts; the other three geometries reproduced all 28. Something specific to the gate page, then, and it is `setTelegraph()` in `gate-slice-runtime.js` hiding its box on a **1100 ms `setTimeout`**. Only the gate states raise a telegraph, it is a large high-contrast panel, and `waitForVisualSettlement()` between pose and capture takes a variable number of 50 ms polls plus round-trips — so whether the panel is still on screen is a race. `chromium-desktop` is the largest geometry and the slowest to settle and screenshot, so it crossed 1100 ms while the smaller three stayed under. Measured directly: at 200 ms and 1400 ms after the pose the three gate states hash differently and the standard states do not; after the fix they are identical. **Two earlier candidate hypotheses were disproved by measurement rather than argued away** — random spawning (eight contexts byte-identical, with identical inputs) and a second look that flagged `menu` and `gate-offer` as time-dependent (both probe artifacts from skipping the dynamic-text lock and the settle step, neither reproducing under the faithful flow). The final check runs the spec's own flow three times, once with **2500 ms** of extra delay injected before the capture, and all seven states are identical in all three. 39 fast suites and the gate-slice, aesthetic, missions and power-up browser suites green. Worth stating plainly: this net has now caught three real defects in its own harness before catching a single product regression, and each one was a way the screenshot depended on something other than the posed state — a cleared canvas, an animation phase, and a wall-clock timer.

**Full record:** `tests/visual-baselines/README.md`

## D-039 — Three harness defects fixed, a fourth open, and the baseline withdrawn rather than shipped flaky

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** `tests/visual-baselines/m14-signatures.json` stays **absent** and the pixel comparison stays disarmed. The three harness fixes (repaint after settlement, animation phase lock, pinned telegraph) are kept — they are correct independently. The D-024/D-031 obligation remains open rather than being closed with a baseline that fails about half the time.

**Consequences:** The telegraph fix worked where it was aimed: `chromium-desktop`, which had failed every previous armed run, reproduced **all 7 signatures exactly**. The failure moved to the narrower geometries — `chromium-fold-cover` differed on the three gate states then matched on retry, and `chromium-fold-inner` differed on the three gate states on both attempts and on `death`, `gameplay` and `retry` as well on the retry. Still the gate page, still those states, now at roughly a coin-flip rate. `menu` has never moved in any run on any geometry. Ruled out by measurement rather than argument: random spawning, animation phase, and elapsed wall-clock time. **The recommendation is to stop patching and change the comparison.** Each round found something real, but the contract itself — a whole-container screenshot byte-identical across runs and machines — is brittle for a canvas game with a live HUD. Playwright's `toHaveScreenshot({ maxDiffPixels })` stores PNG baselines and compares within a tolerance; it is the standard tool for this and would absorb sub-pixel rasterisation noise while still catching the art regressions the net exists for. That is a design change with a real cost (28 PNGs committed to a public repo, CI-Chromium-specific), so it is recorded for the owner to decide rather than done unasked. Worth saying plainly: this net has now caught four ways a screenshot could depend on something other than the posed state, and zero product regressions. Three were worth fixing. The fourth says the design is wrong, not that the code is.

**Full record:** `tests/visual-baselines/README.md`

## D-040 — The Rite board: a leaderboard that works today, without pretending

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** The menu's board returns, filled from the player's own run history and ranked by gates cleared, with per-run consistency checking. `tools/leaderboard-runtime.js` performs no network I/O and a test asserts that against its own source. Shared submission stays off, deliberately.

**Consequences:** "Turn the leaderboard back on" was never one change. D-004 ruled the 1.0 board untrusted (an arbitrary integer, no server-side validation); M16 stubbed submission and hid the container entirely, so the menu showed nothing; and the scale changed, because 2.0 measures gates cleared across eight bands while `global_ritual` holds 1.0 score data — writing gate totals there would corrupt a live board with two incompatible scales. The part needing no owner decision is done: the top five verified runs from the history `finishRun` already writes, ranked by gates, then band, then score, then the earlier run. No new storage. On verification, stated plainly rather than oversold: every rule compares one recorded field against another, so raising `gatesCleared` alone now fails both on the band that no longer matches it and on the impossible pace — but this is consistency checking, not security, and anything in the player's own browser can produce a consistent forgery. Shared submission needs three things that are the owner's to decide: a leaderboard key of its own, a view on the `dev_` API key sitting in a public repository, and a position on validation, since client-side checks do not meet D-004's bar and shipping a "competitive" board without server-side validation would repeat exactly what D-004 objected to. Evidence: 20 unit assertions over validation and ranking, plus a browser suite driving the real page with seeded storage — the board renders `#1 KETHER 147 GATES`, a tampered 99999-gate run is rejected and never reaches the DOM, an empty history says so, the board stays inert under `visualQa=1`, and rendering adds zero external requests. 39 fast suites and 13 browser suites green. `browser-gate-slice-test.mjs` asserted the container was hidden; that assertion now asserts the new intent rather than being deleted.

**Full record:** `docs/decisions/d040-the-rite-board.md`

## D-041 — The Rite of Monas: the opposite rite

**Date:** 2026-08-13
**Status:** Accepted

**Decision:** MONAS is unsealed and becomes a genuinely different game: **hold to glide** (lift while held, sink on release) instead of HEX's tap; **Coherence** earned by passing near the centre of a gap and flying smoothly, the exact inverse of HEX's edge-courting risk; and the **Warp Surge**, where a full meter opens the corridor, streaks the warp starfield and doubles score for six seconds.

**Consequences:** The seal was one line — `startGame` returned without calling the original for any non-HEX mode, so the button did nothing. Unsealing is one delegation, because every other Gate slice override guards on `gateSliceState`, which a MONAS run never creates. The design was measured rather than guessed: the M17 solver models both rites, and under identical stress on a small phone HEX clears through BINAH while **MONAS fails a band earlier at CHESED**, because 0.18 gravity with 0.98 damping cannot dive onto a low gate in time. That is MONAS's character, not a defect, and Coherence is the scoring model that rewards flying the way the physics wants to be flown. **A correction:** my first measurement used gate ratios alternating 0.1 → 0.9 and showed *both* rites failing every band from GEBURAH up, which reads like a fairness emergency; under realistic placement every band solves 4/4 for both, so the alarming absolute result was an artifact of my own test input while the comparative result survives. **A real bug, found by reading my own test rather than by it failing:** the surge draws its streak from `voidMode`, but the loop calls `updateGameObjects()` and *then* `drawScene()`, and I was clearing the flag before returning — the surge would have shipped with a HUD and no visual. Leaving it set risks the loop's `endVoidMode()`, which assigns the never-set `preVoidSpeed` and turns `gameSpeed` into `NaN`; holding the timer above zero avoids both. The check I had written for this was vacuously true and asserted nothing; it now samples `voidMode` where the renderer reads it and asserts `gameSpeed` stays finite. Evidence: held flight climbs 500 → 261 and released sinks 500 → 636 through the real `Player.update()`; centred flight through spawned gates records perfect passes while **edge flight through the same gates earns 0 Coherence and never surges**; a surge widens the corridor 260 → 303 and ends on its own; HEX is untouched. 40 fast and 13 browser suites green. `browser-m11-performance-budget-test` fails on this container across **every** commit tested including `9d060d5`, which passed it earlier the same day on a different container, with an idle host and no leaked processes — recorded as environmental rather than explained away, with CI as the arbiter. Still open: MONAS has no band table of its own and its reachability envelope under *glide* physics is unsolved, since the solver models the original impulse profile; it is a second rite to play, not yet a validated competitive ladder.

**Full record:** `docs/decisions/d041-the-rite-of-monas.md`

## D-042 — MONAS gets its own look, and a borrowed flag stops causing damage

**Date:** 2026-08-14
**Status:** Accepted

**Decision:** MONAS's backdrop rotates now — its own gallery for the photo (every 4 gates) and its own `currentLevelIdx` rotation for the accent wash and tunnel/warp-star colour (every 6 gates), on the pattern the Gate slice already uses for HEX. The warp starfield is a cached fractal spark instead of a flat filled square. A perfect Coherence pass raises a short gold screen-flash and a coin-flip `GlitchFX` pulse. A rare ambient glyph flicker marks ordinary flight. The Warp Surge gained a gold bloom breathing from its own centre.

**Consequences:** `currentLevelIdx` had never been assigned for a MONAS run — the same D-034 defect, recurring in the one mode D-034 could not reach because it was still sealed — so the photo, wash and tunnel colour were pinned to whichever picture came first, for the whole game. Building the surge's visual surfaced a real bug in D-041's own fix: the surge held `this.voidMode = true` for its duration (deliberately, to solve a *different* problem D-041 had already found — the flag being cleared too early left the surge with a HUD and no visual). Reusing the flag also armed `occult-field-runtime.js`'s Void vignette every frame (~30ms on its own) and painted the Hexagram's reserved cyan over a MONAS event, a real correctness violation of M7's colour reservation, not just a performance one. The fix wraps `WarpStar.prototype.update` to read `monasState.surgeActive` directly and reproduce the same speed jump the flag used to buy, so `voidMode` is never touched by MONAS again. Chasing the remaining draw cost down to zero led to a genuine improvement — `drawSurgeBloom`'s full-canvas `createRadialGradient` fill, replaced with a cached 256×256 sprite blit, the same technique the spark itself uses — but also to a measurement mistake nearly shipped as fact: the `<12ms` ceiling was borrowed from `browser-m21-aesthetic-test.mjs` without checking it measured the same thing, and it didn't. HEX, measured under *this* suite's own methodology, costs the same ~16–17ms on this container at every warm-up length tried, traced to `drawLevelArtwork`'s `ctx.filter = 'blur(1px)'` before its `drawImage` - shared code, present for either mode once artwork is loaded and drawn. The corrected test compares MONAS against HEX in the same run instead of against a number from elsewhere, and even that needed multiple trials per mode compared by median rather than a single sample, after one run failed on nothing but this container's own several-millisecond noise. Evidence: eleven scenarios against the shipped path in `browser-monas-test.mjs` - `currentLevelIdx` and the gallery both change during a real run where they never did before, a close warp star's rendered footprint is measurably hollow line-art rather than a filled square and its sprite is cached rather than redrawn as live paths, a perfect pass raises a gold flash on the exact frame it happens (isolated from the pre-existing, identically-coloured orb-pickup flash, since orbs spawn at the same gap centre this suite steers through), the surge speeds the warp streak ~50× measured directly in `WarpStar.update` rather than inferred from `drawScene`, the surge never sets `voidMode`, the bloom measurably warms the canvas centre in RGB (the canvas is opaque under it either way, so alpha was the wrong channel to check), and MONAS's median draw cost sits within a defensible margin of HEX's own. 40 fast suites and 14 browser suites green.

**Full record:** `docs/decisions/d042-monas-gets-its-own-look.md`

## D-043 — No more bounce, the telegraph moves to the floor, and HEX gets a glitch vocabulary of its own

**Date:** 2026-08-14
**Status:** Accepted

**Decision:** Three reports from the same playtest, fixed independently. MONAS no longer bounces: `Player.prototype.jump()` — the tap-to-flap kick every click/touchstart/keydown still routed into on top of the hold-driven glide M27 added — is a no-op for MONAS now, release ramps gravity in over 5 frames instead of applying it in full on the next frame, and the original's continuous spin is frozen so only the pre-existing velocity-based bank term shows. The Gate slice's telegraph moved from a centred, opaque `top: 42%` box that sat on top of the artwork to a bottom-anchored, more transparent one on the same convention `missions-runtime.js` and `powerup-runtime.js` already use, and it now flashes a colour drawn from the event's own kind rather than a fixed cyan. HEX gets a glitch vocabulary of its own: `GlitchFX` gains two techniques beyond the single `rgbSplit` every event has rendered through since 1.0, wired into three previously-silent events — a graze pass, a void survived, a wager lost.

**Consequences:** Tracing the real call path (not the physics) found two independent callers of `Player.prototype.jump()` — `index.html`'s `playerJump()` and `collision-runtime.js`'s `dispatchPlayerJump` — so wrapping the prototype method once, matching every other MONAS override in this codebase, was the only fix that covered both without either caller needing to know MONAS exists. The three new HEX glitch triggers are raw `GlitchFX.trigger()` calls outside `installEffectPolicy`'s wrap (which only reaches four specifically-named `Game.prototype` methods), so they would have silently bypassed the player's reduced-motion and low-flash settings if wired up directly — `gate-slice-runtime.js` now checks `__SEX_MAGICK_COLLISION__.getAccessibility()` itself before firing any of them. A second bug was caught before shipping: the first version of the wager-lost trigger fired *before* the base game's own `gameOver()`, which calls `triggerDeathGlitch()` internally and would have silently overwritten the wager's own tear with the generic death effect a moment later; the fix captures the guard condition once and moves the trigger to fire after the delegation returns, so it wins the frame. A wiring gap from M27/M28 was fixed alongside this: neither `test-monas-runtime.js` nor `browser-monas-test.mjs` had ever been added to `qa.yml`, so the "40 fast suites and 14 browser suites green" claims in D-041/D-042 were never actually run in CI — both are wired in now. Evidence: the hang ramp is monotonic and an omitted `framesSinceRelease` reproduces the old immediate-gravity behaviour exactly; `Player.jump()` leaves `vy` unchanged for MONAS through all three real call paths while leaving HEX's own kick untouched; twenty held frames lift the avatar and ten released frames show fall velocity ramping in rather than jumping; `rot` is pinned to 0 for MONAS; the telegraph resolves to a real bottom pixel offset with no `top: 42%`, and different event kinds carry different flash colours read off its own CSS custom property; a void survived triggers a `sweep` glitch in the Hexagram's reserved cyan, a wager lost triggers a `shear` glitch in hazard pink confirmed to win over the generic death effect, and a graze pass raises both a hazard-pink screen flash and a `shear` glitch — all three confirmed suppressed under reduced motion. 23 fast suites and the monas, gate-slice, m21-aesthetic and collision browser suites green.

**Full record:** `docs/decisions/d043-no-bounce-bottom-toasts-and-hex-gets-a-voice.md`

## D-044 — The global Rite board: a Worker that validates, and the limit of what that proves

**Date:** 2026-08-18
**Status:** Accepted

**Decision:** Shared submission is built, on a Cloudflare Worker with KV rather than LootLocker, and stays off by default behind `?globalBoard=1` until the owner deploys it. The Worker re-judges every submitted run with the same validation module the browser uses, against a single-use token it issued, bounded by its own clock and rate limited per identity. LootLocker is removed entirely — the client, the `dev_` key, the `global_ritual` board, and the runtime stub that existed to neuter it.

**Consequences:** D-040's three prerequisites are all resolved: a board of its own (built new, because `global_ritual` holds 1.0 *score* data and 2.0 measures gates across eight bands — writing gate totals there would have corrupted a live board with two incompatible scales), a view on the API key (the service is gone, so the key is gone with it), and a position on validation (server-validated *before* going live, rather than shipping unverified with an honest label). On the key, accurately: a LootLocker game key is a client key, publishable by design like a Firebase web config — the problem was never that it leaked, it is that a public client key with no server-side validation lets anyone write to the board, which is exactly what D-004 objected to. **What this does not establish, stated plainly: it is not anti-cheat.** The Worker validates a self-reported summary, so anything able to construct an internally consistent record and hold a valid token can still submit a lie; moving the rules to the edge raises the floor without changing what the rules can prove. Real proof needs the server to derive the result by replaying an input trace against a deterministic simulation, and that is impossible here today because gameplay RNG is unseeded (`Math.random()` throughout `index.html`'s spawn paths; `occult-art-runtime.js`'s `seededRandom` seeds visuals only). So the board reads `SERVER-VALIDATED · NOT ANTI-CHEAT` and the API response carries `verification: "server-validated-consistency"`, so the UI cannot drift into overclaiming. The load-bearing structural choice is one copy of the rules: `tools/rite-validation.js` is imported by both sides, because a second copy in the Worker would have drifted the first time a threshold moved — silently, in the direction that lets a rejected run onto a shared board — and the parity test asserts identical verdicts *and* identical reasons across both. The local board is untouched and stays network-free: `leaderboard-runtime.js` still performs no network I/O with its source-level test intact, submission lives in a separate module, and the global board renders beneath the local one so an unreachable Worker degrades to the board the player already has. Only HEX records runs (`finishRun` is Gate-slice-only and stamps `rite: 'HEX'`), so a MONAS submission is refused rather than ranked on an empty board — D-004's separate-Rite requirement is satisfied structurally, but a MONAS board needs a recorder first. Two defects were found by testing rather than review, neither visible to the layer above it: the CORS preflight threw, because a cross-origin JSON POST is preceded by `OPTIONS` and 204 is a null-body status, so every submission would have failed in production and only a real browser sending a real preflight could see it; and a strict clock bound rejected honest runs at the boundary, where a run submitted the instant it ends claims a duration equal to its token's age give or take latency — fixed with a 10s grace, which costs nothing because an inflated duration only makes the pace rule easier to satisfy and the pace rule is not what stops a forgery. Nothing is deployed: the Worker is fully tested against a fake KV, but the owner's Cloudflare billing is unresolved, so the flag stays off. Evidence: 18 Worker sections including client/Worker parity; a browser suite driving the real page against `worker/board.js` itself over an in-memory KV rather than a canned fixture, asserting flag-off sends no board traffic and does not install, flag-on submits a real run through `finishRun`'s own path and renders it, and a tampered 99999-gate run is refused server-side and never reaches the DOM. 29 fast suites green and 13 of 16 browser suites, including gate-slice, leaderboard and global-board. The three that did not pass were each checked against `4bff6cd`, the commit immediately before M30, rather than assumed: `test-player-reachability.js` exceeds a 120s cap and passes given 400s; `browser-m11-performance-budget-test` fails at the baseline too; and `browser-monas-test`'s `coherence pulse` assertion is nondeterministic at the baseline (three baseline runs gave one pass and two failures) — a real piece of test debt belonging to the MONAS visual work, since it measures a one-frame event D-042 already knew had to be isolated from an identically-coloured orb flash. `browser-fixed-step-test` failed once inside a 16-suite batch and passed twice run alone. Separately, this milestone closes the M26 verification debt: that commit shipped after unit tests passed and the browser suite timed out unverified, and the photo-transition spectacle is confirmed here firing exactly as claimed — shake 12, hitStop 3, 30 particles from 0, glitch active, all on the frame the gallery advances.

**Full record:** `docs/decisions/d044-the-global-board-and-what-validation-proves.md`

## D-045 — The screen it is played on, the flake that hid a bug, and the frame that cannot be measured here

**Date:** 2026-08-18
**Status:** Accepted

**Decision:** Three repairs sharing one root mistake — a test or a computation assuming a fixed number instead of asking what was actually there. MONAS difficulty now escalates from the geometry the game is being played on rather than `CONFIG`'s desktop constants; the MONAS coherence assertions lead M17's moving wall, making them deterministic; and the M11 fold-open frame budget is measured against the renderer in front of it rather than demanded as a constant.

**Consequences:** M26 computed MONAS's speed and gap from `CONFIG` and assigned `gameSpeed` every frame, overwriting `adjustForScreenSize()`'s portrait accommodation immediately after every resize — including a Fold posture change. On a portrait phone, which both Fold 6 postures are, MONAS ran a 200-wide corridor at 2.9 instead of the 260-wide corridor at 2.61 the base game intends: 23% tighter and ~11% faster than its own tuning, from frame one. The fix wraps `adjustForScreenSize` and *asks* it what it decides, probed from a pristine `INITIAL_GAME_SPEED`, rather than re-implementing its portrait test where a second copy would drift — and probing from a pristine value is load-bearing, because the original only assigns `gameSpeed` on its portrait branch, so probing from an already-escalated value would ratchet the base upward on every landscape resize. Worth naming as process failure: `monasSpeedForGatesPassed` and `monasGapForGatesPassed` carry comments saying they are pure "so the rotation can be asserted without a browser", and were never exported or asserted — a function documented as testable and then not tested is precisely how this shipped. The coherence flake had a single cause: M17's per-pillar vertical movement meant the avatar was placed on the gap centre at the top of a frame and the pass scored after the wall moved, so a centred pass routinely landed at 0.998 against a >= 0.999 threshold and whether any run saw a perfect pass was wall-phase luck. Aiming where the wall *will be* — leading a moving target, not loosening the measurement — made it deterministic at 12/12 across consecutive runs, and the assertions rose from "more than zero" to "nearly all". That stronger assertion immediately found a real interaction: the coherence pulse sets itself only when no flash is already active, and M26's photo spectacle raises its own flash every `GALLERY_ADVANCE_GATES` gates, so a perfect pass landing on a gallery boundary loses its gold pulse to the photo change. That is deliberate precedence rather than a dropped effect, so it is now asserted as *permitted* — a perfect pass must raise the pulse or yield to an active flash, and silence is the only failure — three cases a flaky test could never have distinguished. Left as an open observation rather than acted on: that photo-change flash comes from the base game's `triggerLevelUpGlitch()` and paints red and green at 0.4 intensity, where D-042 built MONAS's identity around gold; changing it is a feel decision. The M11 failure was not slowness but impossibility — the profile switched, the backing store resized and the loop stayed scheduled, but six frames arrived in 150 seconds, because fold-open is 2321×2898 and D-042 already traced the dominant cost to `drawLevelArtwork`'s `ctx.filter='blur(1px)'`, which this container software-rasterises at ~7.6s a frame. The budget is now measured: two frames prove the profile switched and the loop survived, two more are timed, and the full interval sample is taken only if it projects inside 60s — otherwise skipped with a notice naming the measured cost and where to run for the real sample, with every structural assertion still running. 63s and green, from 164s and red. `waitExpression` gained an optional diagnostic reported on timeout, which is what turned "timed out waiting for A && B" into "profile switched fine, six frames arrived" in one run. Evidence: 29 fast suites and all 16 browser suites pass — the first fully green run of this session, including all three suites that were failing when it began.

**Full record:** `docs/decisions/d045-the-screen-the-flake-and-the-unmeasurable-frame.md`

## D-046 — Tolerance, not hashes, for the M14 art-regression net

**Date:** 2026-08-18
**Status:** Accepted

**Decision:** `tests/visual-state.spec.ts`'s art-regression test no longer requires its whole-container screenshots to match a committed sha256 byte-for-byte. It compares against committed PNG baselines with Playwright's native `toHaveScreenshot({ maxDiffPixelRatio })` instead, tolerance set once in `playwright.config.ts`. Delegated by the owner with one constraint — no cut corners, no loss of the refined aesthetic coverage — and this is not a corner cut: three real rounds of fixing the byte-identical comparison (phase-dependent ambient animation, a telegraph hide-timer racing the capture, a blank-canvas capture racing settlement) each found and fixed something genuine, and a fourth failure mode remained that was ruled out as a defect by direct measurement — not random spawning, not animation phase, not elapsed wall-clock time, all three checked directly rather than assumed. What's left is sub-pixel rasterisation jitter between otherwise-identical CI runs of the same commit on the narrower fold geometries, which a byte-identical hash cannot distinguish from a genuine one-pixel art regression - both fail the same way, with a failure message that carries no information about which one happened. `toHaveScreenshot` is not a looser check, it is a more precise one: it still fails on a real change to the field, pillars, avatar, or level art (the entire point of M14 per D-024), while writing actual/expected/diff images automatically on failure and absorbing exactly the noise the old comparison could never tell apart from a regression. A disabled net (M14 has been disarmed since M21) protects nothing at all, so the real coverage loss was the status quo, not this change.

**Consequences:** `playwright.config.ts` carries the tolerance as a single provisional value, `maxDiffPixelRatio: 0.006` — a plausible starting point, explicitly not yet measured against real CI diff data, with a calibration step planned: merge the first baseline-refresh PR, re-run the plain comparison job twice on that commit, read the actual diff percentages, and tighten or loosen from there rather than leaving the number as an unexamined guess. Baselines are regenerated only through CI, never locally — the development sandbox runs Chromium 1194 against a Playwright pinned to 1217, a different browser build that no tolerance value could paper over — via a new `workflow_dispatch` input (`update_snapshots`) that runs a separate, narrowly-scoped job (`contents: write` / `pull-requests: write`, the normal comparison job stays read-only) and opens a PR with the regenerated PNGs rather than committing them directly, which is how D-024's explicit-review requirement is met under the new mechanism - reviewed by eye against the actual pictures in the PR's diff view, not a hash - and was deliberately designed to avoid Actions artifact download entirely, since a prior environment hit a real, unroutable-around egress block on the artifact host and a `git push` to the repository's own remote is a wholly different path. Two real bugs were caught in that workflow script by actually running it rather than by re-reading it: a heredoc body left flush against column 0 (to avoid baking literal indentation into the commit message) instead terminated the surrounding YAML `run: |` block scalar early, invalid YAML; and backticks intended as literal Markdown inline-code in the PR body were, in an early draft, inside a double-quoted shell string where the shell would have executed them as command substitution. Both were fixed - the heredoc replaced with per-line `printf` calls, which have no terminator-indentation rule to conflict with YAML in the first place, and the backticks backslash-escaped - and the fix was verified by extracting the actual shell logic and running it end-to-end against a real sandbox git repository with stubbed `git push`/`gh pr create`, in both the no-changes and has-changes cases. `tests/visual-baselines/README.md` keeps its three-defect history as the (still-true, still load-bearing) record of what the capture pipeline itself had to get right, with the sha256-specific steps marked superseded and replaced by the current PR-based process. Nothing about HEX, MONAS, or any gameplay code changed - this is test infrastructure only - and M14's existing honest limits (animation phase pinned rather than exercised, no retroactive coverage before M25, the offline gallery fallback out of scope for image-fetch regressions) are unchanged.

**Full record:** `docs/decisions/d046-tolerance-not-hashes-for-the-m14-art-net.md`

## D-047 — Integration truth before another feature layer

**Date:** 2026-08-14
**Status:** Accepted

**Decision:** M30 on the parallel "Antigravity" agent line (`agent/m30-integration-truth` through `agent/m35-living-sephiroth`, reconciled into this trunk at D-047 through D-056) is an integration milestone, not a content one: before MONAS gets a progression ladder, it must be proven that player-visible systems added after the consolidated M1-M15 branch are actually present on the paths a normal player uses and actually exercised by CI. Two real gaps were found: M29's MONAS tests lived only on `claude/sex-magick-2-0-review-atdnu8`, a branch `qa.yml` never triggered on, so "wired into CI" and "CI-green at this SHA" were not the same claim; and `browser-monas-test.mjs` always opened `?gateSlice=1`, and `monas-runtime.js` was itself only loaded from inside that same flag's bootstrap, so the suite proved enhanced MONAS worked *after* the flag loaded it, never that the ordinary URL loaded it at all. M30 makes `monas-runtime.js` load independently of `?gateSlice=1`, adds a standard-entry browser test that loads the bare URL and asserts the enhanced runtime, hold/release physics and no-bounce behavior with no Gate module present, and wires the previously-orphaned Rite Board tests into CI.

**Consequences:** This is the first of ten decisions (D-047-D-056) carried into the trunk from a five-day-dormant, previously unmerged parallel development line — see the note at the top of this block and the merge commit for the full reconciliation record. Every one of these ten decisions was built and CI-proven on its own stacked draft-PR chain but explicitly marked "not authorized for merge... pending physical Fold 6 device validation" by its own author; merging the code into this trunk does not retroactively supply that validation. None of it has been played on a physical device or by a human tester. Treat D-047 through D-056 as CI-verified, not device-verified or player-verified, until that separate pass happens. M30 itself changes no gameplay values — it establishes wiring and CI truthfulness only, and does not claim MONAS has a validated difficulty ladder (the existing solver at the time still modeled the pre-M27 tap/jump control profile, not the held-lift glide physics — see D-048).

**Full record:** `docs/decisions/d047-integration-truth.md`

## D-048 — MONAS progression must be proven from hold/release physics

**Date:** 2026-08-14
**Status:** Accepted; no live progression values changed

**Decision:** The reachability solver in use before M31 still modeled MONAS as a tap-to-jump avatar with a fixed impulse and cooldown — a different game from what `Player.jump()` (a no-op for MONAS) and `monas-runtime.js`'s `advanceGlide()` (continuous hold/release with a five-frame release ramp) actually ship. Using the old solver to select progression would prove reachability for a control scheme nobody plays. M31 adds a MONAS-specific evidence solver driven by the real exported `advanceGlide()` function, the same top clamp and bottom-death boundary as base `Player.update()`, and a phase-independent contained corridor model for M17's per-pillar wall motion so a witness is valid across every wall-motion phase rather than one lucky sample. Ordinary flight and Warp Surge (1.45x speed, 1.18x gap) are audited as separate cases. Every accepted witness must replay through exact floating-point dynamics; a beam-search that finds nothing is labeled `unverified`, never promoted to `impossible`.

**Consequences:** No HEX difficulty table is copied into MONAS, and no live speed/gap value changes in this decision — it is evidence work that later milestones (D-053) draw a conservative live curve from. It also surfaces, without yet fixing, the ownership bug that D-053 resolves: on the ordinary URL MONAS can still reach the base game's score-driven `checkLevel()`, while `?gateSlice=1` silently suppresses that same path, so the same run has different progression semantics depending on a HEX-only query flag. A found witness proves a concrete HOLD/RELEASE path exists for a given pattern/viewport/speed/gap/margin; it does not prove every human can execute it. Physical Fold 6 validation remains a separate, later gate.

**Full record:** `docs/decisions/d048-monas-hold-reachability.md`

## D-049 — MONAS composition is proved only across scheduler-legal transitions

**Date:** 2026-08-14
**Status:** Accepted; no live progression values changed

**Decision:** Proving one named MONAS pattern reachable in isolation is not sufficient, because the shipped `PatternScheduler` concatenates patterns and a pattern that's fine on its own can become unfair when entered from the exit state of the pattern before it. Rather than test every pattern-to-pattern combination (most of which the scheduler never actually emits), composition audits derive their legal transition set directly from the scheduler's own `FAMILY_CYCLE`, materialize each pair exactly as the scheduler composes it (second pattern anchored to the first's final ratio), and audit pair geometry conservatively — the tighter of the two `gapScale` values and the larger of the two motion amplitudes, which is provably contained within both real corridors since the variety runtime preserves corridor centre while clamping motion. The PR-facing audit covers every legal transition with every pattern variant on both sides at least once (bounded mode); a `full` mode covering the complete legal cross-product exists for manual dispatch.

**Consequences:** This evidence answers whether the current MONAS grammar has replayable routes under the current hold/release law at a given speed/gap — it does not choose a progression curve or authorize a live change by itself, and the entry-path ownership discrepancy (D-048) remains unresolved until D-053. `tools/test-monas-compositional-reachability.js` checks the derivation, coverage, anchoring and a baseline witness; `tools/run-m31-monas-audit.js` records evidence for both Fold postures in both ordinary and surge modes; `.github/workflows/m31-monas-reachability.yml` runs the bounded audit automatically and the full cross-product on manual dispatch.

**Full record:** `docs/decisions/d049-monas-compositional-evidence.md`

## D-050 — Scan a MONAS progression frontier before choosing live bands

**Date:** 2026-08-14
**Status:** Accepted as exploratory evidence work; no live progression changed

**Decision:** With the M31 baseline (2.9 base speed / 260 nominal gap) fully verified — all 84 ordinary and 84 Warp Surge pattern cases, all 144 bounded composition cases, all at an 8px safety margin — the next step is a bounded frontier scan rather than repeatedly auditing the complete grammar at arbitrary guessed settings. Eight search coordinates from `2.9/260` (baseline) through `5.7/190` are probed, each strictly harder in both dimensions, targeting only the patterns and pair variants the baseline artifact showed were tightest. A coordinate is `fullyVerified` only if every targeted case replays exactly at 8px; once a candidate produces a concern, later (harder) candidates stay exploratory and do not fail CI for being past the frontier — except the known baseline itself, which fails the job if it stops verifying, since that would contradict already-recorded evidence.

**Consequences:** This is explicitly a search accelerator, not authorization for a live curve — the eventual boundary coordinate and an adjacent one still need the complete audit (see D-051) before any progression table is chosen. `tools/test-monas-progression-frontier.js` verifies the candidate ladder and target resolution; `tools/run-m31-monas-progression-frontier.js` emits a retained evidence artifact and only fails on scanner regressions, not on a harder candidate failing to verify; `.github/workflows/m31-monas-progression-frontier.yml` runs it automatically on the M31 PR.

**Full record:** `docs/decisions/d050-monas-progression-frontier.md`

## D-051 — Fully audit the natural MONAS search ceiling before live tuning

**Date:** 2026-08-14
**Status:** Accepted as evidence work; no live progression changed

**Decision:** The D-050 frontier scan found no reachability concern anywhere from `2.9/260` through `5.7/190`, but a targeted scan is not the complete grammar, and `5.7/190` has a natural ceiling anyway — its 1.45x Warp Surge reaches 8.265 horizontal speed, already close to the game's existing 8.5 maximum-speed scale. Rather than push the search further, `5.7/190` is fixed as the **search ceiling**, and every MONAS pattern variant plus the complete scheduler-legal pattern-variant pair cross-product is audited at that coordinate across both Fold postures, three anchors, and both ordinary and Warp Surge flight, with margins `[8, 4, 0]` and any marginal-or-unverified case treated as a hard failure. The adjacent `5.3/200` coordinate is audited as a control using the full individual-pattern set and the D-049 bounded composition coverage.

**Consequences:** A green boundary audit proves these are the mathematical conditions with replayable routes under the exact HOLD/RELEASE law — it says nothing about subjective fairness, pacing, thumb fatigue, visual readability at speed, or device performance, all of which remain human/Fold-6 gates after a curve is chosen. The candidate ladder is not automatically widened past 5.7 even if it fully verifies; progression design still has to choose a humane curve inside the envelope rather than default to the hardest proven point (this is exactly what D-053 then does, taking only the first six of the eight verified coordinates live). `tools/run-m31-monas-boundary-audit.js` and `.github/workflows/m31-monas-boundary-audit.yml` retain the evidence and fail on any marginal/unverified case.

**Full record:** `docs/decisions/d051-monas-upper-boundary-audit.md`

## D-052 — Legacy browser QA should prefer the locked Playwright Chromium

**Date:** 2026-08-14
**Status:** Accepted CI reliability fix; no gameplay/runtime semantics changed

**Decision:** Once Fast gameplay QA started installing the repo's locked Playwright/Chromium pair, three older CDP-based harnesses (fixed-step, collision, telemetry) kept discovering system `google-chrome` instead, and the fixed-step harness intermittently failed waiting on `http://127.0.0.1:9222/json/version` — after every deterministic contract had already passed and before any page interaction, which localizes the flake to browser process startup rather than gameplay. `tools/qa-chrome-env.mjs` is added as a small compatibility bridge: if `CHROME_BIN` is already set to a real executable it's left alone; otherwise, if the locked Playwright package and its browser are actually installed, `CHROME_BIN` is set to that Chromium's `executablePath()` after verifying the path exists; if Playwright isn't installed at all, `CHROME_BIN` is left unset so the legacy system-Chrome fallback still works for lightweight/manual runs that skip `npm ci`.

**Consequences:** Removes an environment/browser-version drift source without weakening any assertion, retrying a failed gameplay check, or touching game code. A secondary, unrelated diagnostic-noise issue (the Fast QA MONAS artifact uploader emitting a second error when an earlier step aborts the job) is explicitly left for separate cleanup.

**Full record:** `docs/decisions/d052-pin-legacy-browser-qa.md`

## D-053 — MONAS owns progression by gates, independent of Gate-slice entry

**Date:** 2026-08-14
**Status:** Accepted for implementation and physical Fold 6 validation; not a release authorization

**Decision:** With the M31 envelope proven from `2.9/260` through the `5.7/190` search ceiling, M32 gives MONAS its own progression clock: `checkLevel()` is a no-op for MONAS (score, orb bonuses, Warp Surge score multiplication, and the optional Gate slice can no longer advance MONAS difficulty or trigger the base Void), and a new layer watches the semantic Coherence pass `monas-runtime.js` itself commits, advancing the band only after `gatesPassed` actually changes. The first live curve takes only the first six of the eight M31-verified coordinates — `2.9/260` at gate 0 up to `4.9/210` at gate 80 — leaving `5.3/200` and `5.7/190` as validated headroom rather than live bands; the hardest M32 Warp Surge speed (`7.105`) stays below both the M31 ceiling's surge speed (`8.265`) and the game's pre-existing 8.5 max-speed scale. MONAS keeps its own gap function (nominal gap plus the existing breathing term, widened by the existing surge multiplier) rather than borrowing HEX's. `monas-progression-runtime.js` installs outside the existing MONAS runtime and delegates to whatever underlying implementation exists for non-MONAS play (base game on the ordinary URL, Gate wrapper under `?gateSlice=1`), while owning `checkLevel`, `getCurrentGap`, and post-Coherence progression for MONAS itself — making the ordinary URL and `?gateSlice=1` produce identical normalized MONAS progression regardless of entry path. Retry resets Coherence, gate count, band, speed, Void flags, held-input state and any Gate residue to a fresh `2.9/260` start.

**Consequences:** A green M32 proves the curve is internally consistent, entry-path invariant, and inside the mathematically verified M31 envelope — it does not establish that the pacing feels right, that long runs are fun, that Warp Surge stays readable at the top band, or that it performs and reads comfortably on a physical Fold 6. Those remain human/device gates before any release decision, and this milestone (like D-047 through D-056 generally) ships without that validation as of this reconciliation.

**Full record:** `docs/decisions/d053-monas-progression-ownership.md`

## D-054 — Promote the completed HEX stack to the normal product path and use a Fold-safe render default

**Date:** 2026-08-14
**Status:** Accepted for implementation and physical Fold 6 validation; not a release authorization

**Decision:** A physical Fold 6 session after M32 exposed a product-level contradiction automated correctness couldn't see: the mature HEX Gate/Gnosis/Void/missions/power-up/Rite-Board stack the M16-M29 Claude pass had already built, and M30-M32 had integrated and proven for MONAS, still sat behind the historical `?gateSlice=1` experiment flag on the ordinary URL — so the owner saw a much sparser game than the repository history implied. The same session reported visible lag, traced to M10's native-DPR-up-to-8M-pixel default allocating roughly 6.7M backing pixels at measured Fold-open geometry (`884×1104 @ 2.625`). M33 makes ordinary product sessions behave as though `gateSlice=1` was always supplied, applied before any Gate/canvas bootstrap runs (preserving the tested Gate → MONAS → Rite Board wrapper order), while keeping `?gateSlice=0`, `?legacyHex=1`/`?productMode=legacy` as explicit opt-outs and leaving `?visualQa=1` and `?telemetryQa=...` completely untouched by the promotion — the former so M14's deterministic visual-QA topology doesn't shift under it, the latter because that fixture deliberately drives lower-level primitives rather than product HEX semantics. Rendering gets a posture-adaptive default: `renderDpr=2` only when logical viewport area is at least 700,000 CSS px and device DPR exceeds 2.25 (captures Fold-open without depending on brittle UA model strings), Fold-cover stays native, and a live open↔cover resize swaps the backing store DPR accordingly — but only while no caller has explicitly set `renderDpr`, at which point the adaptive layer steps back entirely. `product-integration-runtime.js` is parser-loaded first, before canvas/asset/MONAS-progression bootstraps, so its URL normalization runs before the Gate bootstrap reads `location.search`.

**Consequences:** Reconciliation with this session's own M14 work (D-046) specifically depended on the `!visualQa` exemption holding at every layer, not just in this decision's prose — verified directly against the merged code (query defaults, adaptive DPR, and M34/M35's own DOM script injection all route through a shared guard that excludes `visualQa=1`) before this merge landed, so no additional M14 baseline regeneration was needed. A green M33 establishes product-path integration and a safer rendering default; it does not establish that the Fold 6 is actually smooth now, that 2x is the final shipping DPR, or that the game is release-ready — the next gate is physical comparison against the pre-M33 report in both postures, live fold/unfold included.

**Full record:** `docs/decisions/d054-product-integration-and-fold-rendering.md`

## D-055 — Make the existing ascent read like a rite before adding another mode

**Date:** 2026-08-14
**Status:** Accepted for implementation and physical Fold 6 validation; not a release authorization

**Decision:** With M33 recovering the actual mature product path, the next question isn't whether the Claude-era systems exist but whether the game dramatizes them. A trustworthy ten-minute Fold-open Gate session (367 safe clears, 62.5% Gate entry, 70% Void survival, nine missions completed, a 147-gate KETHER run, affirmative replay intent) showed the power-up economy no longer needs the retune earlier notes proposed — the owner's actual feedback asked for more enchantment and thematic deliberateness instead. M34 explicitly changes no physics, collision, Gate radius, scoring, band thresholds, speed, gap, mission targets, power-up economy, MONAS coordinates, or leaderboard rules; it adds a lightweight DOM-only ascent layer deriving the Tree's eight conventional Sephirah meanings (MALKUTH·KINGDOM through KETHER·CROWN) directly from `SexMagickGateSlice.BANDS` (no second progression table), a brief ceremonial banner on HEX start and real band changes using only the already-active level accent (no new canvas passes, so it doesn't spend the Fold fill-rate budget M33 just recovered), and clearer Gate copy — `GATE OPEN · ENTER → VOID ×10 / PASS → BANK ×3` replacing the old wager-only framing D-026 had already flagged as underexplaining the actual choice — plus normalized mission wording (`ENTER THE GATE`/`BANK THE GNOSIS`) without touching mission IDs or persistence.

**Consequences:** The layer is hidden for MONAS, menus, and both `visualQa=1` and `telemetryQa`, and reduced-motion sessions get no arrival animation and a shorter static display. A green M34 proves the ascent is legible and ceremonially framed without changing gameplay truth — it does not establish that the banner is beautiful rather than distracting, or that it reads correctly at both Fold postures; that's a physical-device judgment still pending as of this reconciliation. A third rite remains explicitly deferred until the existing two read as finished experiences.

**Full record:** `docs/decisions/d055-ritual-ascent-game-feel.md`

## D-056 — Make each Sephirah a sensory world-state without changing gameplay truth

**Date:** 2026-08-14
**Status:** Accepted for implementation and physical Fold 6 validation; not a release authorization

**Decision:** M34 made the Tree ascent legible; M35 makes it perceptible — the eight HEX bands are named and progressively harder but still share too much moment-to-moment sensory grammar, and the goal is for a player to recognise YESOD, GEBURAH or KETHER before reading the HUD. `tools/sephirah-identity-runtime.js` defines one distinct profile per band (MALKUTH material/dense/grounded through KETHER lucid/sparse/transcendent, deliberately subtractive rather than the busiest band) that retunes only channels the game already pays for on a real band change — the existing 25 background particles' speed/opacity/size/colour/shape, the existing scanline overlay's opacity/spacing, the existing vignette's opacity, plus a tiny WebAudio undertone (three persistent oscillators, one filter, one LFO, retuned by AudioParam ramps rather than recreated) capped at 0.02 ambient gain, subordinate to the existing playlist and obeying the existing Music/SFX settings. No new full-device canvas pass, postprocess stack, analyser, or per-frame DOM rewrite is added — this respects the Fold fill-rate lesson D-031 already established the hard way. The Void ducks the current band's undertone rather than getting a ninth identity, mirroring the existing rule that the Void drains colour from the current world. MONAS remains untouched: entering it removes the `data-sephirah` marker, restores base overlay/particle baselines, and silences the undertone.

**Consequences:** Explicitly isolated from M14: the bootstrap doesn't load under `visualQa=1`, `telemetryQa`, `gateSliceQa`, or explicit `gateSlice=0` sessions, so it does not silently change what M14's visual regression net captures — this decision's own text notes the withdrawn exact-hash topology stays untouched and that a tolerance-based replacement (built independently on this trunk as D-046/M32) "remains a separate deliberate milestone," which is exactly what happened. A green M35 proves a coherent, performance-conscious sensory grammar; it cannot establish that the audio is pleasant at real phone volume, that the profile contrasts read clearly without becoming distracting, or that KETHER's subtraction feels transcendent rather than merely empty — physical Fold 6 judgments still pending. This is the last of the ten reconciled decisions (D-047-D-056); see D-047's consequences note and the merge commit for the overall Fold-6-unvalidated caveat covering the whole block.

**Full record:** `docs/decisions/d056-living-sephiroth.md`

## D-057 — What running the tests actually found

**Date:** 2026-08-19
**Status:** Accepted

**Decision:** `qa.yml` gains `workflow_dispatch` and the playtest report's runtime fingerprint is extended to every player-facing module, because this branch had ~20 milestones of work whose correctness was asserted but never actually checked, and the guard against stale builds could no longer tell a stale build from a current one. Three things were true and are no longer: `qa.yml` had no dispatch trigger and fired only on `develop/sex-magick-2.0`, so `claude/sex-magick-2-0-review-atdnu8` had **never had a single real Fast gameplay QA run** — every "N suites green" claim in this log was local, not an Actions status at that SHA, which is exactly the defect D-047 diagnosed for a different branch; the standing playtest protocol instructed the owner to check out `develop/sex-magick-2.0`, 118 commits behind and containing no Gate loop, missions, power-ups or MONAS, so a session from it would have produced a clean and worthless report; and D-030's runtime fingerprint recorded grammar/variety/missions/powerups plus Gate internals, every one of which reads identically with or without M32–M35, so a session that silently ran a pre-M32 checkout would have reported as valid — and those four modules are precisely the ones no human has played.

**Consequences:** Running the suite immediately found two real regressions from the #18 merge, both the same class. M33 made the Gate stack default and M30 made enhanced MONAS load on the ordinary URL — both correct product changes, M30 being the fix for the owner's own report that `?monas=1` lacked what the `gateSlice` URL had — but every low-level fixture loading `index.html` without an exemption now observes the assembled product instead of the primitive it tests. D-054 had anticipated this for `visualQa`/`telemetryQa`; four other fixtures were not held out. `patternBrowserQa` failed with `Expected one deterministic obstacle`; `reachabilityBrowserQa` failed with `400.1728 != 393.1204`, and isolating that one showed **HEX parity still holds and only MONAS diverges** — correct behaviour, since `player-reachability.js` models MONAS as the pre-M27 tap-jump avatar while M27–M29 replaced it with hold/release glide, exactly as D-048 recorded when it built `monas-reachability.js` as MONAS's real evidence model and M31 verified the shipped patterns under the real glide law. Both fixtures are now held out of the Gate promotion *and* the MONAS bootstrap; holding out only one leaves the other path loading the enhanced rite, which is why a first attempt looked fixed and was not. Also fixed: D-052 bridged three legacy CDP harnesses to the pinned Chromium and missed obstacle-grammar, compositional and reachability, so all three failed with "Chrome/Chromium executable not found" instead of running — which is why neither regression was catchable locally. The `qa.yml` timeout went 15 → 30 minutes after the first real run spent 14m02s installing Chromium and was cancelled mid-suite; a cancelled job reads as infrastructure flake, which is how a genuine regression gets waved away. Two corrections are kept in the record because both were caught by checking rather than reasoning: an earlier fix rewrote the MONAS assertion to assert divergence, and its negative check failed to fail — proving the diagnosis wrong before a test asserting the wrong thing could ship; and an assertion added here was initially stronger than the code, claiming these fixtures receive no injected defaults when the adaptive `renderDpr` still applies (harmless, since DPR resizes the backing store rather than `innerHeight`), and now states what is true. **A third regression was found and deliberately left red.** Running the M32/M33 workflows exposed a real gameplay defect rather than a fixture problem: D-053's six-band MONAS speed ladder is overwritten at runtime by D-045's geometry-derived speed. On a Fold in portrait MONAS runs 2.61 at gate 0 rising only to 3.17 at gate 80, where the curve specifies 2.9 -> 4.9 - 35% slow at the top band, while the corridor still narrows on schedule from 260 to 210. Every band's gap is correct; only speed is lost, and the outcome is order-dependent (live play reads 2.61, a sample taken immediately after start reads 2.9), which is why a casual check concludes the ladder works. It is conservative rather than unsafe - slower at an equal-or-wider gap stays inside M31's verified envelope - but the escalation the design calls for is not happening. Two workflows are red for this one cause and were left red on purpose: the assertion is correct, and relaxing it to reach green would be exactly the "do not weaken valid tests to make a change pass" failure this project's contract names. Measurements at both geometries and three options with a recommendation are in `docs/qa/m35-monas-progression-conflict.md`; choosing among them changes live difficulty, so it is the owner's call rather than one to make unilaterally. **Left open deliberately rather than settled unilaterally:** `reachability-policy.js` still adjusts and seals MONAS patterns using the tap-jump model, so two models now describe MONAS and only one matches the game — M31's audit covers the shipped configuration, so this is not believed to be a live safety hole, but reconciling them is the owner's call. Nothing here makes D-047–D-056 device-validated; a green CI run and a played game remain different claims.

**Full record:** `docs/decisions/d057-what-running-the-tests-actually-found.md`

## D-058 — Compose D-045's geometry accommodation with D-053's progression ladder

**Date:** 2026-08-20
**Status:** Accepted for implementation and physical Fold 6 validation; not a release authorization

**Decision:** D-057 measured and deliberately left red a defect where D-053's six-band MONAS speed ladder overwrote D-045's portrait-phone speed accommodation every time it applied a band — 2.61 rising only to 3.17 across the ladder on the owner's primary target, where the curve specifies 2.9 rising to 4.9. The owner chose to compose them rather than let either side win outright: `monas-progression-runtime.js`'s `applyProgression()` now multiplies each band's speed by the ratio between `monas-runtime.js`'s captured `__monasGeometryBaseSpeed` and the shipped desktop base (`CONFIG.INITIAL_GAME_SPEED`), rather than assigning the band's absolute value directly. On desktop the ratio is 1 and nothing changes; on the portrait Fold viewport the ratio is 0.9, so the six live pairs become 2.61/2.97/3.33/3.69/4.05/4.41 rather than 2.9/3.3/3.7/4.1/4.5/4.9. Gap is untouched. `browser-m32-monas-progression-test.mjs`, the test D-057 left red, is updated to assert the composed values and now passes.

**Consequences:** Every composed pair remains below M31's verified frontier at an equal-or-wider gap, so this stays inside the proven envelope by the same reasoning D-057 used to call the pre-fix numbers conservative rather than unsafe — reconfirmed with the bounded M31 audit (84/84 ordinary, 84/84 surge, 144/144 composition, 0 concerns) as a smoke check; the full frontier/boundary CI workflows should still run at least once against this exact change. This is a real tuning change, not a restoration of an agreed value — nobody designed for 4.41 at the crown band specifically, it is what falls out of composing two independently-authored numbers, and it does not establish that it feels correct, only that it is reachable and closer to both authors' intent than either side winning outright. Physical Fold 6 validation remains the standing gate that actually settles whether this composed curve plays right.

**Full record:** `docs/decisions/d058-compose-the-monas-speed-conflict.md`

## D-059 — The gallery comes home

**Date:** 2026-08-20
**Status:** Accepted; tooling landed, assets not yet fetched. Not a release authorization.

**Decision:** All 75 gallery images are fetched at runtime from Google Drive viewer URLs (`lh3.googleusercontent.com/d/{id}=s0`), a fragility M30 identified and wrote `migrate-images-to-r2.mjs` to fix — a migration that was never run. On 2026-08-20 the owner served the branch from Termux on the Fold 6, the first time this build has run on the physical target, and every background image failed to load; the whole gallery fell back to the procedural placeholder surface. The failure is unambiguous, because Termux served only the HTML and runtime scripts over localhost while Chrome requested the images directly from Drive over the phone's ordinary network — what failed is the Drive dependency itself, on the target device, in the configuration a player would use. The owner chose in-repo hosting over R2: no third-party account in the critical path, and a self-contained itch build, which is the audit's own §10 release requirement rather than a new goal. Filenames are the existing Drive ids, so the whole wiring change is two `CONFIG` lines (`BASE_URL` to `assets/gallery/`, `IMG_SUFFIX` to `.webp`) and the three source arrays are untouched. This milestone lands the tooling and the guard only: `tools/gallery-source.mjs` (the single derivation of which images exist, imported by both the new fetch tool and the retained R2 script rather than copied, for the same reason `rite-validation.js` is shared by client and Worker), `tools/fetch-gallery.mjs` (resumable, requests `=s1600` rather than the full-size original to cut Drive rate-limiting risk, with a `--from-dir` fallback for manual export), `tools/gallery-transcode.py` (Pillow, deliberately Python so no npm image codec with native binaries enters the M15 supply-chain surface), and `tools/test-gallery-source.mjs` wired into `qa.yml`. The fetch itself must run outside this environment: the egress gateway refuses `CONNECT` to `lh3.googleusercontent.com` with a 403 policy denial, the same class of unroutable block D-046 hit on the Actions artifact host.

**Consequences:** M14's 28 baselines are unaffected — `visual-state.spec.ts` pins `assetMode: 'offline'` on every capture, so they were taken against the procedural fallback and have never contained the real art; no regeneration round is needed, which was the main risk. The same fact is a coverage opportunity deliberately not taken here: D-046 lists the offline gallery fallback as a known limit of the visual net *because* the art was a network dependency, and once it is same-origin that reason evaporates and M14 could cover the real visual identity for the first time — a real expansion, costing a 28-PNG regeneration and review, so it belongs to its own milestone. Repository weight is permanent and one-shot: git history keeps every encoding, so the procedure is fetch, inspect on the real device, then commit, expected at 15–20 MB under the q82/1600px defaults. The guard fails half-migrated states, which is the actual risk — assets present while `CONFIG` still points at Drive, or `CONFIG` switched with no files behind it, both ship a broken gallery and neither is visible by reading either file alone — and also fails on a per-image sha256 mismatch or any id in index.html without an asset, so adding an image without fetching it breaks CI instead of a player's screen. Not established: the fetch has not run, no image is in the repo, `CONFIG` still points at Drive, and whether Drive will serve the 75 originals at all is unverified (if it refuses, `--from-dir` is the fallback). Nothing here has been seen on the Fold 6 — the milestone makes the physical playtest *possible*, it does not substitute for it. `asset-resilience-runtime.js` is untouched and stays as insurance: a bounded loader with a procedural fallback is correct regardless of where the bytes come from, and removing it because the new host is more reliable would be the wrong lesson to draw from this defect.

**Full record:** `docs/decisions/d059-the-gallery-comes-home.md`

## D-060 — What the first real Fold 6 playtest found

**Date:** 2026-08-21
**Status:** Accepted. Three fixes from one physical session; the AEGIS change is a deliberate difficulty change made by the owner. Not a release authorization.

**Decision:** M36 put the gallery in the repository and the owner played the result on a Fold 6 in the open posture — the first time this build has been played on the physical target by a human, and the gate every decision since D-047 has deferred to. Three findings, all real. **(1) The lag is not the renderer.** Two probe captures, same posture, one at `renderDpr=1` and one at native: 6.9× the backing pixels (477,225 → 3,288,832) cost 0.2ms at draw p50 and nothing at p95, with frame intervals pinned to 16.7ms across p50/p95/p99 in both runs — a locked 60fps at full native resolution with every M34/M35 layer drawing. D-054's adaptive render-DPR policy is spending fidelity to buy performance that was never scarce here; **no change is made to it**, since one posture on one device is not grounds for retiring a policy and the cover and closed postures remain unmeasured, but its premise is now contradicted where it matters most. What the owner felt lives in the tails: max frame 83.3ms, three long tasks totalling 198ms, and `droppedSimulationMs: 100` — 13 long frames in 11,184, 0.12% of frames and the entire complaint. The cause is M36's own doing: `startup.assets` now reads `loaded: 75, fallback: 0` where before every image failed into a cheap procedural canvas, and `decoding = 'async'` is only a hint for the `<img>` path — an undecoded bitmap is decoded *synchronously on the main thread* the first time `drawImage()` touches it, once per level transition. `loadImageAttempt` now awaits `image.decode()` before resolving, moving the cost to the loading screen, still bounded by the existing attempt timer, and resolving anyway on decode failure so a usable image can never become a fallback. **(2) AEGIS did not cover floor deaths.** `tryAbsorb()` required an overlapping pillar, so a fall past `y > innerHeight - r * 1.5` killed the player outright while `drawWardRings()` kept drawing a ring per held charge — the interface promising cover for the most common death in a gravity game and not providing it. An oversight rather than a decision: the Void exclusion two lines above carries a comment defending itself and the floor has none, and absorb works *by dissolving the blocking pillars*, which a fall does not have. The owner chose to make the rings mean what they look like they mean: AEGIS now absorbs the fall and `liftFromFloor()` applies the base game's own jump impulse scaled by 1.35 while placing the avatar three radii clear of the death line, so the save does not depend on check-versus-integration ordering. The announcement distinguishes the two saves (`THE FALL IS REFUSED`). **(3) The ascent banner was flying across the play field** at `top: max(112px, …)`, a 430px-wide slab 17% down a 707×675 viewport; moved to the bottom toast band at `bottom: max(206px, …)`, clearing the missions toast, the powerup toast and both HUDs, with the arrival keyframes flipped to rise rather than settle.

**Consequences:** D-043 already moved this game's transient messages out of the middle in M29; the ritual-ascent banner was authored on the Antigravity branch, never saw that decision, and reintroduced the problem — the same species of collision D-058 untangled for MONAS speed, and now the third instance, which is worth reading as a pattern rather than three unrelated bugs. The AEGIS change is a real difficulty change: floor deaths become survivable while a charge is held, nothing modelled it, and no evidence says it is correctly tuned. Writing its tests found two further defects in the fix itself — `(root.innerHeight || 0)` made the floor line negative with no viewport, so every non-pillar death would have been claimed as a fall and spent a charge; and `CONFIG?.PLAYER_JUMP_FORCE` threw `ReferenceError` on an undeclared `CONFIG` (optional chaining does not protect an undeclared identifier) inside the `gameOver` path, where it would have taken the death handler with it. Both fixed. The bounded M31 audit re-ran unchanged (84/84 ordinary, 84/84 surge, 144/144 composition, 0 concerns), which confirms nothing regressed but says nothing about whether the floor save is balanced — the audit models the MONAS corridor and knows nothing of HEX power-ups. Not established: that the decode fix removes the hitches (it addresses the cause the evidence points at; the same probe re-run on the same device is what settles it), that the floor save is tuned correctly, or anything about the two unmeasured Fold postures. The memory shape also changes — 75 bitmaps decoded at load rather than gradually raises peak image memory earlier, though the steady state is the same. None of these three has been played yet.

**Full record:** `docs/decisions/d060-what-the-first-real-playtest-found.md`

## D-061 — AEGIS is a wall shield, and the ring was never the shield

**Date:** 2026-08-21
**Status:** Accepted. Reverses D-060's floor save after playing it. Not a release authorization.

**Decision:** The owner played D-060 and reported the shield still failing: crashed while "having a shield" and got game over. Investigation says AEGIS was working correctly and the report has a different cause. `drawWardRings()` returns early at `charges <= 0`, so the violet rings only ever appear when a charge is actually held; the first AEGIS charge requires 25 cleared gates (`GATES_PER_CHARGE`) or a Void survival, and the owner's own screenshot from the session reads `GATES 8`. At eight gates, with AEGIS unsealed at YESOD but no charge yet earned, there were no ward rings on screen at all — what read as a shield being ignored was the avatar's own outline. The owner reached the same conclusion unprompted ("maybe Im confusing the circle to mean that if I crash I dont die"), and chose to drop the floor protection entirely rather than keep it: most deaths are wall crashes, a fall is the player's own altitude management, and a power-up that covers the rarer case is not worth its complexity. D-060's `isFloorDeath()` / `liftFromFloor()` machinery and its three constants are removed; `tryAbsorb()` is wall-only again, as originally designed, and the announcement reads `THE WALL IS REFUSED` so the save names what it covered. The `configOf()` guard D-060 introduced is kept and now also covers `overlappingPillars()`, which carried the identical undeclared-`CONFIG` hazard in the same `gameOver` path.

**Consequences:** The real defect is legibility, and it is not fixed by this commit. A player is told `AEGIS UNSEALED` at YESOD and can then hold zero charges for twenty-five gates, with nothing on screen distinguishing "unsealed but empty" from "armed" except rings they have no reason to know the meaning of — and an avatar that already looks ringed. A regression test now pins that gap explicitly (unsealed at band 1 grants no charge; nothing at 24 gates; the first charge at 25). Whether the fix is a clearer armed-state visual, a cheaper first charge, or both is a design decision the owner has not yet made and this record does not pre-empt. D-060's difficulty change is fully withdrawn, so the reachability position returns to exactly what it was before it — no re-audit required, since AEGIS never entered the MONAS corridor model in the first place.

**Full record:** this entry.

## D-062 — One power-up, reachable, legible, and the shield bug behind all of it

**Date:** 2026-08-21
**Status:** Accepted. Owner-directed redesign plus a real regression fix. Not a release authorization.

**Decision:** The owner played D-061 and reported the shield still failing with a ring visibly present, plus both transient overlays still crossing the play field. Three separate causes, and the first is the one that mattered. **(1) A regression I introduced in D-061.** The revert that removed the floor save used a non-greedy regex that also deleted the `configOf()` helper introduced alongside it, leaving `overlappingPillars()` calling a function that no longer existed. Every `tryAbsorb()` threw a `ReferenceError` from inside `gameOver`, so *the shield stopped working entirely* — which is exactly what the owner reported, on exactly the commit they were running. The unit suite could not catch it because it never enters that code path; `browser-m19-powerups-test.mjs` caught it on the first run against a real page. `configOf()` is restored with the reasoning written into it so it does not get deleted a third time. **(2) The overlays were both in the same bad neighbourhood.** D-060 moved the ascent banner to `bottom: 206px` and the gate telegraph already sat at `bottom: 230px`; on the owner's measured 707×643 viewport those are 68% and 64% down — the middle of the corridor. Both now sit on the bottom edge (telegraph at 6px, banner at 74px above it) with raised z-indexes, briefly covering the HUD strips rather than ever covering gameplay. **(3) The power-up model, per the owner's direction.** DISSOLUTION is retired; AEGIS is the entire ladder. It unlocks at band 0 rather than YESOD, caps at a flat three at every band, and `GATES_PER_CHARGE` drops 25 → 10. The Void exception is removed — it was defensible as the wager, but a player crashing inside a Gate run saw the shield decline for a reason nothing on screen ever stated, which is a large part of why it read as broken. The ward rings are redrawn as heavy counter-rotating dashed rings rather than thin concentric circles, because the owner twice read the avatar's own round outline as a shield, and the HUD now prints `◈◈ AEGIS 2/3` or an explicit `◇ AEGIS EMPTY` instead of leaving armed-versus-empty to be inferred from an absent glyph.

**Consequences:** The loop the owner asked for is now pinned by tests: three shields maximum, a wall crash costs exactly one, and the next milestone earns it back. `browser-m19-powerups-test.mjs` verifies absorb, consumption, and pillar dissolution against the real page, and its Void section is inverted to assert the new behaviour rather than deleted. This is a substantial difficulty change stacked on an unmeasured base: shields arrive 2.5× sooner, cap higher for a new player than the old band-gated ladder allowed, and now cover the Void, which was previously the one place the game guaranteed stakes. Nothing models whether that is correctly tuned, and the Void in particular loses a property earlier decisions deliberately gave it — if the wager stops feeling like a wager, this is the change to look at first. The wider lesson is procedural: D-060 and D-061 were both authored, tested and shipped against a symptom the owner reported, and both times the unit suite passed while the actual product path was broken or unchanged. The browser suites are the ones that touch what a player touches, and they should run before a fix to a reported gameplay defect is called done, not after the owner reports it again.

**Full record:** this entry.

## D-063 — A fourth, older system was still overriding the telegraph's position

**Date:** 2026-08-21
**Status:** Accepted. Regression fix. Not a release authorization.

**Decision:** The owner confirmed AEGIS working (`AEGIS 2/3` visible, correctly consumed) but reported the telegraph still centered - this time on `GATHER THE SIGILS`, not the gate-offer text. The repo's `#gate-slice-telegraph` rule was correctly `bottom: max(6px, ...)` since M39; this was not the caching problem from the prior report. `tools/viewport-runtime.js` - a per-device responsive layer predating D-060/D-062 entirely - independently declares `#gate-slice-telegraph { top: var(--sm-telegraph-top) !important; }`, with `--sm-telegraph-top` set to 34-42% depending on device profile (`compact-phone` through `desktop`) and pushed onto `documentElement.style` on every viewport snapshot. `!important` on an explicit `top` wins outright over the base rule's `bottom`, on every profile, silently, the entire time D-060 and D-062 believed the telegraph had been moved. Removed `telegraphTop` from all six profile configs, the CSS custom property, the `!important top` rule, and the JS line that set it; the width, font-size and letter-spacing responsiveness in the same rule are legitimate and untouched, since those were never in conflict. Vertical position now belongs to `gate-slice-runtime.js` alone.

**Consequences:** This is the fourth instance this session of two independently-authored systems disagreeing about a value neither knew the other touched - MONAS speed (D-058), the ascent banner (D-060), and now a responsive-viewport layer that predates all of it. The pattern is now worth naming as a search strategy rather than a coincidence: before trusting that a single rule change moved an element, grep every file for the element's id, not just the one file that appears to own it. Confirmed no test suite asserted `telegraphTop` or `--sm-telegraph-top`, so nothing was pinned to the value being removed. `#gate-slice-hud`'s own `top` overrides in the same file are correct and untouched - the HUD is meant to stay anchored to the top; only the telegraph had a genuine conflict.

**Full record:** this entry.

## D-064 — The bottom stack, done once, properly, with a test that can't be lied to

**Date:** 2026-08-21
**Status:** Accepted. Positioning + a permanent regression guard. Not a release authorization.

**Decision:** The owner reported the overlap "got worse" after D-063: a screenshot showed the ascent banner (3 lines: kicker/name/subtitle) directly overlapping the persistent `#sex-magick-missions` list, both centered, both large. Measured directly via a forced band-transition on the owner's own viewport (707×643): banner occupied y=498-569, missions occupied y=548-597 - a real, reproducible 21px overlap, not a screenshot artifact. This was D-062's mistake: its comment claimed the banner "clears the missions toast (170px)" but 170px is `#sex-magick-missions-announce`, a *different*, rarer element - the actual, always-present `#sex-magick-missions` list at `bottom:46px` was never checked against. Auditing every centered `bottom:max(...)` rule across the codebase (not just the ones already touched) found five elements that can realistically all be visible in the same second of ordinary play: the persistent missions list, the gate telegraph, both toast rows (mission-complete, AEGIS-absorb), and the ascent banner - plus two more (a debug-only input-feedback indicator, and a one-time-ever sensitivity notice) left out of scope as genuinely rare. Rebuilt the stack bottom-up from the persistent anchor: missions stays at 46px; telegraph moves to 128px (clears missions' worst-case ~70px height with a 12px margin); missions-announce moves 170px → 200px (clears telegraph's new top); powerups-announce moves 120px → 252px (clears missions-announce's new top); the ascent banner moves 74px → 304px (clears powerups-announce's new top, and is highest by design since it is the tallest and rarest of the five). Verified by forcing all five visible simultaneously with worst-case content - the longest telegraph string, a live band-transition banner driven through the real `updateGameObjects()` path, both toasts - at the owner's exact viewport: zero overlaps. Re-ran at `chromium-fold-cover` and `chromium-small-phone`, the tightest CI geometries: zero overlaps there too.

**Consequences:** This is the fourth positioning fix in three exchanges (D-060, D-062, D-063, now D-064) and the first one backed by a permanent test rather than a claim in a comment - `tests/cross-screen.spec.ts`'s new `'every centered transient overlay clears every other one, worst case'` forces the real band-transition path (not a synthetic DOM write) and asserts zero pairwise overlap among whichever of the five are visible, so a sixth instance of this fails CI instead of requiring the owner to find it by hand a third time. The existing `'power-up readout adds no control and clears the missions HUD'` test still passed `api.grant('dissolution', 2)` after D-062 retired DISSOLUTION - harmless (`grant()` no-ops on an unknown id) but stale, and is now removed. On the owner's 643px-tall viewport the ascent banner's worst-case top edge still lands around 40% down from the top even after this fix - the five-element stack's own height, correctly cleared end to end, still consumes a real fraction of a short viewport. That is a known, disclosed residual, not a hidden one: it is not an overlap (verified), but a player could still reasonably find five stacked elements' worth of vertical space too much presence. If so, the next move is reducing how many of the five can be simultaneously visible - e.g., queuing the two toasts through the banner rather than giving every transient message its own independent screen position - not another offset patch.

**Full record:** this entry.

## D-065 — One notice slot, because four positions could never be kept safe

**Date:** 2026-08-21
**Status:** Accepted. Structural fix replacing four failed positional ones. Not a release authorization.

**Decision:** The owner reported text over the play field for a fifth time, said it had got worse, and was right on both counts. Measuring the real page at both of their postures found two independent faults. **(1)** `ritual-ascent-runtime.js`'s `@media (max-width: 430px)` block still set `top: max(100px, ...)`, left over from D-060's original top-anchored design. Once D-060 switched the base rule to `bottom`, a narrow screen received *both*, and an element with a top, a bottom and no height stretches between them: on the Fold cover screen (368px) the banner became a **284px empty box spanning 14%-55% of the display** - the giant rectangle in the screenshot. Four previous audits missed it because every one grepped for `bottom:` and this rule says `top:`. **(2)** More seriously, **D-064's entire approach was wrong**: it resolved overlap by stacking notices upward from a bottom anchor, and 304px above the bottom of a 643px viewport *is* the middle. On the inner screen the banner was correctly sized and still sat at 41%-52% - dead centre - for exactly the reason D-064's own maths intended. Clearing overlap by stacking and staying out of the corridor are contradictory goals while each message owns a position. The root cause across all five reports is architectural, not arithmetic: four elements each owning a screen coordinate means every fix must reason about all four simultaneously, and no amount of care makes that safe. D-065 removes the possibility. All four transient notices - gate telegraph, ritual-ascent banner, missions toast, power-up toast - now render at one shared offset (`bottom: max(128px, ...)`, clear of the persistent missions list), and a new `tools/notice-slot.js` arbiter guarantees only one is ever visible: each runtime calls `claim(id)` immediately before revealing its notice, which hides every other registered notice. A single line of text at a small fixed offset cannot migrate into the corridor on any viewport, because its position no longer depends on what else might be showing. The ascent banner is additionally compacted from three stacked lines and a gradient slab to one inline row, keeping the ceremony in the type rather than the footprint. Measured after the change at 368x690, 707x643 and 360x800: every notice 30-32px tall, sitting at 73%-83%, exactly one visible at a time.

**Consequences:** The D-064 regression test was itself part of the problem and is now fixed: it revealed notices by writing `.hidden = false` directly, bypassing the announce path entirely, which is precisely why it could pass while four notices piled up on the owner's screen. It now goes through the real slot handoff, and gained assertions that every visible notice is under 90px tall (catching a `top`+`bottom` stretch) and sits below 60% of the viewport (catching corridor intrusion) - the two properties four previous fixes each believed they had. Running the wider browser sweep this time also surfaced a genuine pre-existing break: `browser-m33-product-integration-test.mjs` asserted `powerups >= 2`, stale since D-062 retired DISSOLUTION, and had simply not been run on any commit since. That is the same failure mode as the positional bugs - a claim nobody re-checked - and is fixed. `notice-slot.js` is loaded ahead of every notice-raising runtime by `fixed-step-prototype.js`, and every call site treats it as optional, so a failed load degrades to pre-D-065 behaviour rather than breaking an announce. Not established: the owner has not yet seen this on the device, and after four failures that is the only evidence that counts. The measurements above are necessary and were absent from previous attempts; they are still not the same thing as playing it.

**Full record:** this entry.
