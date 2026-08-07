# SEX MAGICK 2.0 — Forensic Audit, Design Direction, and Roadmap

Status: initial static audit  
Audit date: 2026-08-04  
Repository: `bookthief666/Sex-Magick-Game`  
Protected baseline branch: `main`  
Baseline commit: `d3760aaea9c7322d48e471389a67c4e579743e2a` (`Bro 9.0`)  
Development branch: `develop/sex-magick-2.0`

## 1. Baseline and repository access

- The connected GitHub account is `bookthief666`.
- Repository permissions are `admin`, `maintain`, `push`, `pull`, and `triage`.
- The repository is public and its default branch is `main`.
- Before 2.0 work, the only branch was `main`.
- No pull requests were present.
- No commit status checks were attached to the current `main` commit.
- No evidence of GitHub Actions, automated tests, a package manifest, or a build system was found.
- `develop/sex-magick-2.0` was created directly from the baseline commit. `main` was not modified.

## 2. Current game inventory

### Repository-owned files

The current repository is a single-file application centered on `index.html` (approximately 2,390 source lines). Repository history begins with one uploaded HTML file, later renamed to `index.html`; subsequent feature commits continue to modify that file.

No repository-owned JavaScript modules, stylesheets, test files, package manifests, lockfiles, deployment scripts, source maps, or documentation existed at the baseline.

### Systems embedded in `index.html`

- HTML screens and UI: loading, start/menu, Rite selection, settings, pause, game over, leaderboard display, debug panel.
- CSS: responsive layout, scanlines, vignette, animated buttons, glitch title, score display, mobile controls.
- Canvas renderer and animation loop.
- Game state machine: `START`, `LOADING`, `PLAYING`, `PAUSED`, `GAME_OVER`, `SETTINGS`.
- Player movement and two modes: `HEX` and `MONAS`.
- Procedural pillars, Orbs, Void Pentagrams, particles, stars, warp stars.
- Tree-of-Life labels plus a large shuffled pool of occult names and images.
- Score, local high score, level thresholds, Void mode.
- Synthesized Web Audio sound effects, vibration, background music playlists.
- LootLocker guest authentication, score fetching, score submission, and a production-visible connection test button.
- Local storage keys:
  - `93protocol_highscore`
  - `93protocol_settings`
  - `ritual_id`

### External dependencies and services

- Tailwind browser CDN: `https://cdn.tailwindcss.com`
- Google Fonts: Cinzel Decorative and Orbitron.
- Google Drive image delivery through `lh3.googleusercontent.com`.
- Audio from jsDelivr, backed by a separate repository named `93-protocol-game-assets-` and pinned commit-like URLs.
- LootLocker API at `https://7l3mo9bh.api.lootlocker.io`.
- No local fallback assets are present in this repository.

### External asset formats in the game playlist

The playlist mixes MP3, MP4, FLAC, M4A, and WAV. Browser support and decoding behavior will vary. There is no codec capability check or per-format fallback.

## 3. Initial architecture map

```text
DOM / UI screens
  ├── Rite buttons, settings, pause, restart, menu
  ├── score / level / status displays
  └── leaderboard list and test control
          │
          ▼
Game class (central mutable coordinator)
  ├── GameState
  ├── input listeners
  ├── frame loop
  ├── level preparation and progression
  ├── object update, collision, scoring
  ├── screen transitions
  └── rendering orchestration
          │
          ├── Player
          ├── Pillar
          ├── Orb
          ├── Pentagram
          ├── Particle
          ├── Star / WarpStar
          ├── GlitchFX
          ├── AudioSys / SFX / Haptics
          └── Leaderboard

Persistence
  ├── local settings
  ├── local high score
  └── LootLocker guest identifier

External runtime
  ├── Google Drive images
  ├── jsDelivr audio
  ├── Google Fonts / Tailwind CDN
  └── LootLocker leaderboard
```

The architecture is tightly coupled through globals (`game`, `CONFIG`, `AudioSys`, `Leaderboard`) and direct DOM access. It is still small enough to improve incrementally without a framework migration, but the competitive and gameplay-critical rules should be isolated before adding complexity.

## 4. Current gameplay loop

```text
page launch
→ preload every image in the full pool (or wait for 8-second failsafe)
→ initialize LootLocker
→ reveal menu
→ choose Hexagram or Monas
→ shuffle all stages/images
→ initialize player and effects
→ frame-based play loop
→ spawn pillars and occasional Orbs
→ pass pillar: +1 score
→ collect Orb: +5 score
→ every five score: advance shuffled stage
→ every fifth stage: enter temporary Void mode
→ collect Void Pentagram: +10 score
→ collide/fall: game over, except while Void mode suppresses death
→ update local best
→ submit raw client score to shared global leaderboard
→ restart or return to menu
```

## 5. System status matrix

| System | Status | Evidence / behavior | Player impact | Severity | Next action | Runtime test |
|---|---|---|---|---|---|---|
| Launch/loading | PARTIALLY WORKING | All images are eagerly requested; an 8-second failsafe calls `finishLoading()` without a one-shot guard. | Slow first load; duplicate initialization is possible when late images finish. | P1 | Add one-shot loading completion and lazy/background asset loading. | Required |
| Menu/Rite selection | WORKING statically | Both Rite buttons call `startGame()` after setting `gameMode`. | Clear choice, but no mechanical explanation. | P2 | Add concise Rite descriptions and first-run guidance. | Required |
| Game loop | PARTIALLY WORKING | Simulation, spawning, gravity, timers, and speed are advanced per animation frame rather than elapsed time. | Different difficulty and timing at 60/90/120/144 Hz; leaderboard fairness is compromised. | P0 competitive / P1 gameplay | Introduce fixed-step or delta-normalized simulation before competitive scoring. | Required on 60/120 Hz |
| Hexagram movement | WORKING statically | Gravity `0.45`, jump impulse `-7.5`. | Basic tap-flight control. | — | Tune only after instrumented playtests. | Required |
| Monas movement | PARTIALLY WORKING | Gravity `0.18`, velocity damping `0.98`, jump `-7.2`; obstacle grammar and score are otherwise shared. | Mostly an easier/flotier physics variant, not a full playstyle. | P1 design | Give it distinct risk/scoring/obstacle rules or separate ranking. | Required |
| Collision | PARTIALLY WORKING | Player uses reduced AABB; Pillar collision is rectangular. Pillar drawing constructs diagonal/jagged polygons that may not visually match collision rectangles. | Potential invisible or misleading collision zones. | P1 | Correct visual geometry or collision geometry, then record before/after capture. | Required |
| Obstacle generation | PARTIALLY WORKING | One pillar type; randomized vertical gap; sinusoidal vertical movement; spawn cadence tied to frames. | Repetition, refresh-rate variance, limited mastery grammar. | P1 design | Add deterministic pattern grammar after physics baseline. | Required |
| Difficulty | PARTIALLY WORKING | Speed increases by stage index; gap shrinks only every five stages; stages are shuffled. | Escalation exists but is not teachable or tied to Tree-of-Life identity. | P1 design | Define deterministic bands and recovery windows. | Required |
| Score | WORKING but shallow | Pillar +1, Orb +5, Pentagram +10. | Understandable, but limited score expression and easy client spoofing. | P1 | Isolate score rules and add streak/risk only after movement is stable. | Required |
| Gnosis | PLACEHOLDER / mislabeled | Orbs add five directly to the same score; debug panel is titled Gnosis but displays FPS/audio. | Gnosis is not a resource or decision system. | P1 design | Select one coherent resource model. | Required |
| Tree of Life | PARTIALLY WORKING | Tree names exist, but the full stage pool is shuffled and each entry is mainly an image/name/accent change. | Atmosphere without structured progression or learning. | P1 design | Use fewer substantive transformations or ordered bands. | Required |
| Void mode | PARTIALLY WORKING | Speed ×1.8, obstacles cleared, pentagrams spawn, death is suppressed while active. | Spectacle and bonus phase; falling can leave the player off-screen until Void ends. | P1 | Specify invulnerability/recovery behavior and clamp or reset player safely. | Required |
| Pause/resume | WORKING statically | State halts RAF scheduling and resume starts the loop again. | Expected functionality. | P2 | Test rapid pause/resume and audio promise failures. | Required |
| Restart | WORKING statically | Resets game objects and starts a new loop. | Reasonably fast, but no immediate retry shortcut. | P2 | Test repeated restart for duplicate loops/listeners. | Required |
| Mobile input | PARTIALLY WORKING | Touch only triggers in lower 40% of viewport; control overlay disappears after five seconds, but the invisible restriction remains. | Players may tap valid-looking areas and receive no input. | P1 | Make the active zone explicit or accept safe full-screen taps excluding UI. | Required on itch iframe |
| Resize/foldable | PARTIALLY WORKING | Canvas resizes, but live objects are not remapped; `adjustForScreenSize()` can reset game speed during a run. | Orientation/Fold transitions may alter difficulty and object layout. | P1 | Preserve simulation state and remap safely on resize. | Required on Fold |
| Audio | PARTIALLY WORKING | Mixed codecs, remote-only assets, retry behavior, and autoplay handling. | Track failures and browser inconsistency are likely. | P1/P2 | Add capability-aware playlist filtering and bounded retries. | Required across browsers |
| SFX/haptics | PARTIALLY WORKING | `playerJump()` and `Player.jump()` both trigger haptics; level-up feedback is also triggered in multiple paths. | Duplicate vibration/feedback. | P2 | Centralize action feedback. | Required |
| Local persistence | WORKING statically | Settings, best score, and guest ID use localStorage. | Personal best and preferences persist per browser. | P2 | Add schema/version and parse-error handling. | Required |
| Leaderboard fetch | UNKNOWN — REQUIRES RUNTIME TEST | LootLocker guest session and list endpoint are coded. | May work, fail from itch CORS, or return an unhandled schema. | P0 release | Test actual itch origin and record network responses. | Mandatory |
| Leaderboard submission | INSECURE BY DESIGN | Browser sends arbitrary integer score directly to submission endpoint. | Casual console cheating is trivial; shared Rite ranking is unfair. | P0 competitive | Disable competitive claims until server validation/proportional verification exists. | Mandatory |
| Leaderboard rendering | PARTIALLY WORKING / risky | Remote player name is inserted through `innerHTML` without local escaping. | Stored markup injection may be possible depending on backend name controls. | P1 security | Render with `textContent` and sanitize names server-side. | Required |
| Debug tooling | PARTIALLY WORKING | `#debug` exposes FPS; a large connection-test button is visible in production. | Useful diagnostics mixed into player UI; test sessions can create noise. | P2 | Move diagnostics to a branch-only harness/debug mode. | Required |
| Tests/CI | BROKEN / ABSENT | No tests, workflows, or status checks found. | Regressions are easy and releases are not reproducible. | P1 process | Add smoke harness first, then lint/static checks after modularization. | N/A |

## 6. Prioritized bug and risk list

### P0 — Critical

#### P0-01: Frame-rate-dependent simulation invalidates competitive consistency

**Reproduction**
1. Run the same build on a 60 Hz display and a 120 Hz display.
2. Compare real-time gravity, obstacle travel, spawn rate, Void duration, and score rate.

**Expected**: Equivalent real-time behavior within a small tolerance.  
**Current static evidence**: Movement, spawning, timers, speed, and thresholds advance per frame.  
**Acceptance criteria**: Fixed-step or normalized simulation; recorded 60/120 Hz tests show equivalent real-time behavior.

#### P0-02: Arbitrary leaderboard score submission

**Reproduction**
1. Obtain a guest session through the shipped client.
2. Call the score endpoint with a chosen integer or invoke/modify `Leaderboard.submit()` from DevTools.

**Expected**: Server rejects scores not supported by a plausible run.  
**Current**: Client score is authoritative.  
**Acceptance criteria**: Proportional server-side validation, versioning, duration/rate sanity checks, duplicate/rate controls, and suspicious-run quarantine.

### P1 — Important

#### P1-01: Loading completion can execute twice

The 8-second failsafe and eventual final asset callback can both call `finishLoading()`. Add an idempotent completion flag.

#### P1-02: Pillar drawing and rectangular collision appear mismatched

The visible polygon paths use diagonal/jagged geometry while collision treats full axis-aligned top and bottom rectangles. Verify with a debug hitbox overlay and make the visual silhouette and collision agree.

#### P1-03: Mobile controls become invisible while the lower-40% restriction remains

The instructional control overlay is hidden after five seconds, but the global touch handler still rejects taps above 60% viewport height.

#### P1-04: Live resize can reset game speed and desynchronize objects

`adjustForScreenSize()` writes `gameSpeed`; player and existing obstacles retain old coordinates.

#### P1-05: Shared leaderboard combines mechanically unequal Rites

Monas has different gravity/damping but uses the same score rules and leaderboard key.

#### P1-06: Unsanitized remote leaderboard markup

Remote names are interpolated into `innerHTML`. Use DOM creation and `textContent`.

#### P1-07: Remote-only mixed-codec audio pipeline

Unsupported formats and failed remote assets can create repeated retries and inconsistent music across browsers.

#### P1-08: Void death suppression can strand the player off-screen

`gameOver()` returns while `voidMode` is true, but player bounds do not provide a complete recovery rule.

### P2 — Moderate

- Duplicate jump haptic calls.
- Duplicate level-up SFX/haptic calls.
- Production-visible leaderboard connection test.
- `AudioSys.resume()` does not catch a rejected play promise.
- Array mutation with `splice()` inside `forEach()` can skip an adjacent element for one frame.
- `lastFrameTime` is not reset when beginning a new run.
- localStorage JSON parsing is not guarded.
- Debug panel label `GNOSIS` does not represent Gnosis.

### P3 — Polish

- No reduced-motion option.
- No safe-area inset treatment despite `viewport-fit=cover`.
- Canvas is not device-pixel-ratio aware, producing soft rendering on high-density displays.
- Rite buttons do not explain their control identity.
- Score feedback lacks streak, near-miss, or risk communication.

## 7. Design problems

### Controls and game feel

The movement model is simple enough to become strong, but it cannot be tuned reliably until time-step behavior is corrected. Input feedback is duplicated, mobile input has an invisible spatial restriction, and the two Rites are differentiated mostly by vertical physics.

### Comprehension

The game communicates atmosphere immediately, but does not explain the practical difference between Rites, the purpose of Gnosis, how progression works, or why the Void occurs.

### Pacing and difficulty

Obstacle grammar is one repeated moving gap. Difficulty rises numerically but not pedagogically. The player cannot learn distinct pattern families or anticipate how a Sephirah changes the rule set.

### Scoring and replayability

Score is readable but shallow. Orbs are large flat bonuses; no streak, near-miss, voluntary danger, route choice, or Rite mastery exists. The leaderboard is not trustworthy enough to sustain competition.

### Occult mechanics

The occult system currently functions mainly as names, images, colors, and effects. The strongest existing mechanical seed is Void mode: a transformed state with altered speed, hazards, and rewards. Gnosis should become the deliberate bridge into or through such altered states.

### Audiovisual clarity

The presentation is distinctive but computationally and visually noisy. Background images, tunnel geometry, RGB glitch, scanlines, trails, particles, flashes, and rotating obstacle patterns can compete with hazard readability. Effects need intensity hierarchy and accessibility controls.

## 8. Leaderboard diagnosis

### What exists

- LootLocker guest session creation.
- Persistent guest identifier in localStorage.
- Top-five fetch into the main menu.
- Score submission at game over.
- One shared leaderboard key: `global_ritual`.
- Development mode enabled in the client.
- A visible manual connection-test control.

### What is not established

- Whether guest session creation succeeds from the current itch.io iframe origin.
- Whether the endpoint paths and response schema match the configured LootLocker product version.
- Whether the published build contains exactly this code.
- Whether entries persist and appear after submission.
- Whether backend-side score validation, rate limiting, or moderation is configured outside the repository.

### Security and fairness limitations

- Raw client score is trusted.
- No Rite is stored or separated.
- No game version, run duration, deterministic seed, event summary, or duplicate identifier is submitted.
- No displayed player-name input exists, but remote names are rendered unsafely.
- Client code exposes the game key. A client-facing key may be expected by the service, but it cannot act as a privileged anti-cheat secret.

### Recommended first competitive version

Do not build the production backend before runtime diagnosis. The minimum credible score record should include:

- player display name (strictly normalized and moderated)
- score
- Rite
- game version
- run duration measured against a server timestamp/session
- run ID / nonce
- compact counters: gates, Orbs, Void pickups, deaths impossible by definition
- suspicious flag / quarantine state

Recommended initial categories: one all-time board per Rite. Add daily/weekly only after the base board is stable.

### Backend decision gate

Consequential options to compare after runtime testing:

1. **Repair LootLocker** — lowest migration cost if it supports server-authoritative validation hooks needed here.
2. **Cloudflare Worker + D1** — strong control over validation, rate limiting, CORS, and moderation; modest custom code.
3. **Supabase** — fast data/admin workflow; requires carefully designed Edge Function/RLS boundaries so the browser cannot write trusted scores directly.
4. **Firebase** — viable, but server validation and abuse controls must still sit behind a trusted function.

Current recommendation: test LootLocker first, but prefer Cloudflare Worker + D1 if LootLocker cannot enforce the proportional validation model without trusting the browser.

## 9. Gameplay improvement matrix

| Proposal | Impact | Difficulty | Risk | Thematic fit | Replayability | Confidence |
|---|---:|---:|---:|---:|---:|---:|
| Fixed-step / normalized simulation | Very high | Medium | Medium | Neutral | High through fairness | High |
| Hitbox visualization and pillar geometry correction | Very high | Low–Medium | Low | Neutral | Medium | High |
| Explicit full-screen-safe mobile input | High | Low | Low | Neutral | Medium | High |
| Instant restart and run-reset hardening | High | Low | Low | Neutral | High | High |
| Separate Rite leaderboards | High | Low–Medium | Low | High | High | High |
| Clean-clear streak multiplier | High | Medium | Medium | High for Hexagram | High | Medium-high |
| Gnosis as a wagerable Void-charge resource | High | Medium–High | Medium | Very high | High | Medium |
| Pattern grammar with authored procedural families | Very high | High | Medium | High | Very high | High |
| Ten fully unique Sephiroth stages immediately | Medium | Very high | Very high | High | Uncertain | Low |
| Framework migration | Low now | Very high | Very high | Neutral | None directly | Low |
| Music-reactive gameplay authority | Medium | High | High due codec/timing | High | Medium | Low initially |

## 10. Sex Magick 2.0 design direction

### Core fantasy

The player performs an increasingly dangerous arcade ritual by maintaining precise control, accumulating Gnosis, and choosing when to intensify the rite for greater score and transformation.

### Core loop

```text
read pattern
→ execute precise movement
→ earn clean clears and Gnosis
→ preserve a ritual streak
→ choose safety or intensified risk
→ enter an altered state / Void threshold
→ convert mastery into score
→ die, learn, and restart immediately
```

### Player actions

Keep the primary action minimal: tap/press to ascend. Depth should emerge from timing, trajectory management, route choice, and resource decisions rather than adding many buttons.

### Recommended Gnosis concept

**Gnosis is a charge earned through skilled clears and dangerous pickups. At a threshold, the player may continue safely or wager charge to intensify the Rite.**

A wagered state increases score potential and changes obstacle rules, but losing the run forfeits an unbanked bonus. This connects altered state, risk, and transformation without becoming a bag of unrelated powers.

The mechanic must remain fun when described without occult terms: build a resource through precision, choose when to risk it, survive a harder phase, receive a larger score.

### Rite direction

**Hexagram**
- Stable, precise impulse.
- Authored geometric pattern families.
- Clean consecutive clears build order/streak.
- Optional narrow center lines or exact-clear zones.

**Monas**
- Momentum and fluid correction.
- Transforming gaps, drifting routes, and controlled volatility.
- Bonuses for sustained flow and route improvisation.

Both Rites must receive separate tuning and leaderboard categories.

### Progression structure

Prefer **fewer substantial mechanical bands** over ten cosmetic stages in the first 2.0 release. Tree names can mark threshold transformations, but each released band must introduce a readable rule, teach it, combine it, and then test mastery.

A practical first scope is four bands plus a Void state:

1. Malkuth — establish control and basic gates.
2. Yesod/Hod — moving geometry and timing patterns.
3. Netzach/Tiphereth — risk lanes and streak pressure.
4. Geburah/Chesed — combined high-speed mastery.
5. Void — wagered altered-state challenge.

Further Sephiroth become expansion milestones only after these are mechanically distinct.

### Scope boundaries for first 2.0 release

Include:
- consistent simulation
- fair collision and readable patterns
- reliable desktop/mobile controls
- two mechanically distinct Rites
- one coherent Gnosis loop
- separate competitive categories
- proportional anti-cheat
- fast restart
- reproducible itch build

Defer:
- accounts beyond a lightweight display identity
- ten bosses
- large unlock economy
- framework migration
- audio-authoritative rhythm mechanics
- elaborate replay verification unless simpler validation proves insufficient

## 11. Development roadmap

### Milestone 0 — Safe baseline and runtime harness

**Purpose**: preserve rollback point, document current behavior, make viewport/runtime testing repeatable.  
**Files**: `docs/**`, `tools/runtime-harness.html`.  
**Dependencies**: none.  
**Risks**: minimal; harness must never be used as the production entry point.  
**Acceptance**: branch exists at baseline; audit committed; harness loads the branch game in desktop, phone, and Fold presets; errors/unhandled rejections are visible.  
**Rollback**: delete documentation/harness commits or branch.  
**Claude review**: not required.

### Milestone 1 — Deterministic simulation baseline

**Purpose**: remove refresh-rate dependence before tuning.  
**Files**: initially `index.html`; optional extraction of a small configuration/simulation module only if needed.  
**Approach**: fixed simulation step with capped catch-up; render independently; convert frame timers/spawn cadence to simulation time.  
**Risks**: broad feel changes and hidden timing dependencies.  
**Acceptance**: equivalent obstacle travel, jump arc, spawn cadence, Void duration, and score rate at 60 and 120 Hz.  
**Test**: recorded scripted/manual timing matrix.  
**Rollback**: one focused commit.  
**Claude review**: Opus recommended before merge because timing touches most gameplay systems.

### Milestone 2 — Collision truth and control clarity

**Purpose**: ensure visible hazards match collision and all supported inputs are predictable.  
**Files**: `index.html`, test documentation.  
**Approach**: debug hitbox overlay; correct pillar geometry; define tap zone; remove duplicate feedback.  
**Acceptance**: no visible/hitbox mismatch in captures; keyboard and touch smoke tests pass; no duplicate haptic call per jump.  
**Rollback**: separate collision and input commits.  
**Claude review**: optional; Fable useful for game-feel critique after implementation.

### Milestone 3 — Fast retry and run telemetry

**Purpose**: improve replay loop and collect deterministic run facts needed for tuning/leaderboards.  
**Files**: game loop/state/score areas; documentation.  
**Approach**: isolate run state; add run ID, duration, gates, pickups, Rite, version; instant keyboard/touch retry.  
**Acceptance**: 50 repeated restarts without duplicate loops/listeners; telemetry matches visible events.  
**Claude review**: Opus recommended for state/regression review.

### Milestone 4 — Obstacle grammar vertical slice

**Purpose**: replace single random gap repetition with learnable pattern families.  
**Approach**: deterministic seeded generator, safe sequencing rules, recovery patterns, difficulty bands.  
**Acceptance**: no impossible transitions across a large seeded test set; player can name/learn pattern families.  
**Claude review**: Fable for feel/readability; Opus for generator invariants.

### Milestone 5 — Scoring and Gnosis vertical slice

**Purpose**: create skill expression and risk/reward.  
**Approach**: clean-clear streak plus one coherent Gnosis wager/altered-state loop. Document exact formula.  
**Acceptance**: score can be recomputed from run telemetry; UI explains multipliers; no accidental farming exploit found in adversarial test.  
**Claude review**: Fable for design; Opus for formula/exploit review.

### Milestone 6 — Rite differentiation

**Purpose**: make Hexagram and Monas mechanically distinct without relying on visuals.  
**Acceptance**: blind playtest can identify Rite by mechanics; separate balance targets and leaderboards.  
**Claude review**: Fable strongly recommended.

### Milestone 7 — Leaderboard runtime repair and backend decision

**Purpose**: verify current LootLocker behavior, then select the smallest trustworthy backend.  
**Decision required from owner**: provider, ongoing cost, moderation, personal data, category structure.  
**Acceptance**: valid/invalid/duplicate/version/CORS/rate tests pass; suspicious submissions are quarantined; secrets remain server-side.  
**Claude review**: Opus required for threat model and implementation review.

### Milestone 8 — Asset, audio, and loading hardening

**Purpose**: shorten load, eliminate unsupported tracks, add bounded failure handling and local critical fallbacks.  
**Acceptance**: menu becomes interactive quickly on slow connection; failed images/audio do not block play; supported-browser matrix passes.  
**Claude review**: optional architecture review; Fable for audiovisual hierarchy.

### Milestone 9 — Release candidate and itch deployment

**Purpose**: produce an exact-commit release with rollback.  
**Acceptance**: desktop/mobile smoke matrix, console review, leaderboard release posture, release notes, archived rollback ZIP, draft PR evidence, exact SHA.  
**Publication**: live itch build remains untouched until this milestone passes.

## 12. Static versus runtime confidence

### Verified statically

- Repository permissions, branch, baseline commit, branch/PR/status-check state.
- Single-file architecture and embedded systems.
- Exact movement constants and score increments.
- Shared Rite leaderboard key.
- Raw client score submission.
- Frame-based update/spawn/timer implementation.
- Eager remote image loading with an 8-second failsafe.
- Mixed remote audio formats.
- Touch-zone restriction.
- Duplicate feedback call paths.

### Requires runtime verification

- Actual game feel and fairness.
- Pillar silhouette/collision mismatch severity.
- LootLocker connectivity, persistence, CORS, and configured backend protections.
- Whether the itch build is byte-identical to `main`.
- Browser codec failures.
- Fold/orientation behavior.
- Console and network errors.
- Real load time and thermal/frame performance.

## 13. Published itch.io comparison status

The public page describes the same central identity: two Rites, procedural infinite-runner play, Gnosis collection, reactive glitch/audio presentation, and an HTML5 release. Its indexed update time is 2025-12-16, the same date as the current repository commit. This supports “probably related/current-era,” not an exact-match conclusion.

The page copy says “Global Leaderboards Coming Soon,” while the repository contains active LootLocker code and a leaderboard UI. This could mean the page description is stale, the deployed build differs, or the feature is present but not considered released.

Current classification: **probably the same development era; exact correspondence unknown**.

To establish an exact match, capture from the itch embed:
- document title and visible menu
- DevTools Sources or downloaded HTML hash
- console log
- Network requests for LootLocker, image, audio, and script origins
- desktop and Fold screen recordings through the first run and game over
