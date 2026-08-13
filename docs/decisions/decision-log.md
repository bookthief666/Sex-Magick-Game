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
**Status:** Accepted

**Decision:** `tests/visual-baselines/m14-signatures.json` is re-established from CI run 31686044845 — a fully green `M14 Visual-state QA` run on `9d060d5` — restoring the 28 signatures deleted in M21 and closing the release obligation D-031 opened. Pixel comparison is on again for four geometries and seven states.

**Consequences:** The obligation is discharged, but the coverage claim needs correcting rather than celebrating. I recommended this work on the grounds that it would have caught the M21/M22/M23 regressions. **Reviewing the renders shows it would not have.** The signatures hash the whole `#game-container`, so any pixel change does flip them — but in the posed gameplay states the canvas is almost entirely unpainted: measured at `chromium-fold-inner`, non-black pixels run 0.6% for `gameplay` and `retry`, 2.3–3.3% for `death`/`void`/`gate-bank`/`gate-offer`, against 79.9% for `menu` (whose richness is the CSS title backdrop, not canvas). `__SEX_MAGICK_VISUAL_QA__` poses UI state and calls `drawScene()`, but the posed scene yields no painted occult field. This is pre-existing and not an M24 regression — the measurements are byte-identical at `6c75677` — but it means the three defects the owner actually hit (additive blending erasing the backgrounds, missing `accent`, frozen `currentLevelIdx`) all lived in states this suite renders black. The net is genuine for DOM, HUD, layout and safe-area, and it will flag future canvas changes; it is not today an art-regression net. The high-value follow-up is to make the gameplay poses render a real field — pillar, avatar, strata — so the signatures cover the artwork the owner looks at. Also recorded: the CI screenshot artifact could not be downloaded from this session because the egress policy denies the Azure blob host that serves Actions artifacts, so the mandated screenshot review was done on locally rendered equivalents instead, with the hashes taken only from CI.

**Full record:** `tests/visual-baselines/README.md`
