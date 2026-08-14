# Sex Magick 2.0 — Antigravity Project Handoff

## 1. Canonical source of truth

Use this repository and branch as the Antigravity project:

- GitHub: `bookthief666/Sex-Magick-Game`
- Canonical Antigravity branch: `antigravity/sex-magick-2.0-continuation`
- Branch origin: exact M35 candidate `74262e2798d80493df0dd9cfb1f768c145e8f14d`
- M35 source PR: draft PR #14, stacked on M34; not merged or deployed.

Do **not** use `main` or `develop/sex-magick-2.0` as the implementation baseline. They are older than the stacked M30–M35 product line.

The owner physically launched M35 on a Samsung Galaxy Z Fold 6 after M34 had already been confirmed to match the last completed Claude-era state. M35 then added the first deeper art-direction layer. Physical subjective tuning remains open; repository correctness is well established.

## 2. What the game currently is

This is a static/browser arcade game with a substantial runtime/test layer around `index.html` and the `tools/` modules.

### HEX — Rite of Hexagram

HEX is the more elaborate progression rite. The mature normal product path includes:

- tap-flight player control;
- truthful collision geometry and short input buffering;
- deterministic fixed-step simulation;
- Tree-of-Life progression through eight live bands;
- obstacle grammar and moving/patterned obstacle families;
- Gnosis accumulation;
- Gate offers;
- bank-vs-Void decision;
- Void risk/reward state;
- persistent missions;
- earned/consumed power-ups;
- local Rite Board/history;
- procedural occult field and generated/fallback visuals;
- gallery/transition/glitch/event vocabulary;
- ritual-ascent HUD/ceremonial transitions;
- M35 sensory identities for MALKUTH, YESOD, TIPHARETH, GEBURAH, CHESED, BINAH, CHOKMAH and KETHER.

M34 clarified the Gate choice so the player-facing language explains the real decision instead of hiding it behind generic wager terminology. The presentation now exposes the actual enter-Void vs bank-Gnosis choice while leaving the mechanics unchanged.

M35 makes each Sephirah a sensory world-state using existing low-cost channels: background-particle motion/density/color/shape, scanline treatment, vignette pressure and a quiet procedural WebAudio undertone. KETHER intentionally sheds noise instead of becoming the most visually cluttered band.

### MONAS — Rite of Monas

MONAS is a separate control/game-feel identity:

- hold to rise/glide;
- release to sink/fall;
- no legacy Flappy tap-kick layered on top;
- Coherence earned through centered/smooth passage;
- Warp Surge;
- Gate-count-owned progression curve introduced after solver/reachability proof;
- distinct gold/Monas vocabulary;
- must stay free of HEX Gate/Missions/Tree presentation residue.

## 3. Recent milestone chain

The current product should be understood as a stacked continuation, not a flat branch history.

### Claude-era completion through `151f6be`

The last published Claude branch added/finished major product systems including the later obstacle curve, missions, power-ups, aesthetic restoration, Rite Board, MONAS, MONAS no-bounce hold/release behavior, Gate-telegraph cleanup and distinct HEX/MONAS effect vocabulary.

### M30 — integration truth

Recovered the real mature product path and standardized normal entry semantics, especially for MONAS and the Gate-era stack.

### M31 — MONAS reachability

Proved the legal MONAS control/progression envelope by solver/search rather than intuition. The higher frontier points were deliberately treated as proof/search ceiling rather than automatically shipping live.

### M32 — MONAS progression

Moved MONAS progression ownership away from inherited score/level logic and onto committed Coherence-gate count. Preserved restart/reset invariants and ordinary-vs-Gate entry parity.

### M33 — normal product integration + Fold rendering

Resolved the hidden-feature problem: normal `/index.html` now promotes the mature HEX product path instead of requiring the user to know a hidden Gate query flag. Also introduced Fold-aware DPR behavior so the large inner screen does not blindly render at native backing density, and the policy adapts when the phone folds/unfolds.

### M34 — ritual ascent/game feel

Made Tree progression continuously legible and ceremonially framed. Added the lightweight ascent HUD, Sephirah names/meanings, next-threshold communication, band-transition presentation, clearer Gate choice language and normalized mission copy. It intentionally did not retune physics/economy.

### M35 — Living Sephiroth

Added an eight-profile sensory grammar. The final architecture is lifecycle/event-driven rather than polling. It respects STILLNESS/reduced-motion, pause/resume, menu/game-over retreat, and MONAS separation. No new full-screen canvas pass was introduced.

## 4. Verified current evidence

Final M35 candidate:

`74262e2798d80493df0dd9cfb1f768c145e8f14d`

Focused M35 workflow:

- Run `31835843192` — PASS.
- Covered profile alignment, Fold-open product defaults, real MALKUTH→YESOD→GEBURAH→KETHER transitions, KETHER noise shedding, event-driven lifecycle, STILLNESS, pause/resume, MONAS cleanup, visual-QA isolation and inherited product regressions.

Full Fast gameplay QA:

- Run `31835843362` — PASS through the complete suite on the same exact SHA.
- Included syntax, deterministic contracts, fixed-step simulation, collision/input/touch, fail-closed policy, raw Gate, M9 runtime hardening, M10 render/asset resilience, M11 performance budget, M12 physical-evidence checks, telemetry/retry, obstacle grammar, M17 obstacle variety, M18 missions, M19 power-ups, M21 aesthetics, MONAS + diagnostic artifact, Rite Board, M30 standard entry, M33 product integration, M34 ritual ascent and M35 Living Sephiroth.

Current `package.json` is QA-focused. Core useful commands include:

```bash
npm ci --ignore-scripts
npm run serve:test
npm run test:cross-screen
npm run test:supply-chain
```

The authoritative complete browser regression chain lives in `.github/workflows/qa.yml` and currently uses Node 22 + locked npm dependencies + Playwright Chromium.

Do not run `npm audit fix --force` as an orientation step. Dependency warnings are not authorization to mutate the locked supply chain.

## 5. Files/areas to understand before changes

Start by reading:

- `ANTIGRAVITY.md`
- `docs/SEX_MAGICK_NORTH_STAR.md`
- `docs/decisions/d026-gate-fairness-and-measurement-truth.md`
- `docs/decisions/d027-difficulty-curve-and-obstacle-variety.md`
- later mission/power-up/aesthetic/MONAS decision records
- `docs/decisions/d052-ritual-ascent-game-feel.md`
- `docs/decisions/d053-living-sephiroth.md`
- `.github/workflows/qa.yml`
- `index.html`

Then map the runtime ownership in `tools/`, especially:

- `fixed-step-clock.js`
- `fixed-step-prototype.js`
- `collision-runtime.js`
- `input-feedback-policy.js`
- `viewport-runtime.js`
- `canvas-render-runtime.js`
- `asset-resilience-runtime.js`
- `performance-budget-runtime.js`
- `gate-slice-runtime.js`
- `product-integration-runtime.js`
- `ritual-ascent-runtime.js`
- `sephirah-identity-runtime.js`
- `sephirah-identity-bootstrap.js`
- `obstacle-grammar.js`
- `obstacle-variety-runtime.js`
- `missions-runtime.js`
- `powerup-runtime.js`
- `occult-field-runtime.js`
- `occult-art-runtime.js`
- `leaderboard-runtime.js`
- `monas-runtime.js`
- `monas-progression-runtime.js`
- reachability/compositional proof tools.

Do not infer state ownership from filenames alone. Trace the actual prototype wrappers/install order and query/diagnostic isolation.

## 6. Known product direction after M35

The next planned work is deliberately about depth rather than adding another rite immediately.

### M36 — first-run ritual onboarding / comprehension

Goal: make a new player learn through play rather than a wall of instructions.

Likely focus:

- immediately distinguish HEX vs MONAS;
- teach tap vs hold/release through the first safe interaction;
- introduce Gate/Gnosis/Bank/Void at the moment each concept becomes relevant;
- communicate missions and power-ups without clutter;
- preserve experienced-player speed and replay flow;
- make first death/retry teach something instead of feeling arbitrary.

Antigravity should audit the current first-run experience before accepting this scope verbatim. It may propose a better solution if it preserves the goal.

### M37 — reward/run-arc polish

Likely focus:

- stronger run opening and run-end rhythm;
- new-best and Rite Board feedback;
- mission-completion satisfaction;
- KETHER arrival/achievement treatment;
- cleaner death→result→retry flow;
- more legible sense that a run had an arc rather than simply stopping.

### M38 — MONAS identity/depth pass

Likely focus:

- strengthen MONAS audiovisual identity independent of HEX;
- improve Coherence and centered-passage feedback;
- tension/release around Warp;
- make Warp feel climactic without adding frame-cost noise;
- preserve the solver/progression envelope.

### Deferred but important

- replace brittle exact-hash screenshot baselines with tolerance-based Playwright image comparison;
- continue performance and real-device proof as visuals deepen;
- PWA/offline/install reliability hardening where gaps remain;
- richer audio/haptic language if real-device evidence supports it;
- only consider a third rite after HEX and MONAS read as complete experiences.

## 7. Where Antigravity is encouraged to go beyond the roadmap

Do not treat M36–M38 as sacred task tickets. They are the current best direction, not a ceiling.

During the forensic audit, actively look for higher-value opportunities in:

- arcade feel and mastery curve;
- encounter rhythm;
- obstacle telegraph/readability;
- visual hierarchy on narrow vs open Fold postures;
- satisfying microfeedback;
- thematic coherence between occult symbolism and mechanics;
- sound design and mix;
- haptics;
- animation timing;
- dead code / conflicting wrappers / state duplication;
- unnecessary per-frame work;
- loading/asset failure paths;
- local persistence UX;
- accessibility;
- PWA/offline behavior;
- discoverability of missions, power-ups and Rite Board;
- replay incentives;
- score/progression legibility;
- testing gaps that let visually broken but logically green behavior slip through.

A proposal that changes the roadmap is welcome if it is evidence-based and clearly explains the expected player benefit, implementation risk, test strategy and physical validation plan.

## 8. Things Antigravity must not do casually

- rewrite the game from scratch;
- convert the stack to a framework merely because the current file is large;
- flatten/remove the runtime modules without mapping ownership first;
- reintroduce tap-kick into MONAS;
- make MONAS progression score-owned again;
- hide the mature HEX stack behind an experimental query flag again;
- remove Fold-aware render behavior;
- disable reduced-motion/low-flash behavior;
- add unbounded full-screen effects;
- loosen performance thresholds because a new visual is expensive;
- delete or weaken reachability/collision/progression tests to ship a desired feel;
- merge/deploy without explicit owner authorization.

## 9. Physical validation contract

Primary device: Samsung Galaxy Z Fold 6.

For player-facing milestones, explicitly test:

- Fold open;
- cover/folded posture;
- live posture transition while the page remains open;
- touch responsiveness;
- readability around camera cutouts/safe areas;
- frame feel and thermal/performance impression;
- audio at real phone volume/headphones when relevant;
- Music/SFX/STILLNESS/VEIL settings when affected;
- HEX and MONAS separation;
- at least one serious run rather than only synthetic state forcing.

Automated browser emulation supports this evidence but does not replace it.

## 10. Recommended Antigravity workflow

1. Open **this repository root**, not a bootstrap/docs folder.
2. Check out `antigravity/sex-magick-2.0-continuation`.
3. Verify the branch ancestry starts from M35 exact candidate.
4. Read `ANTIGRAVITY.md` and this handoff.
5. Run the first-session audit prompt in `docs/ANTIGRAVITY_FIRST_SESSION_AUDIT.md`.
6. Do not immediately rewrite/code based on the summary alone; inspect the implementation and run baseline checks.
7. Produce a concise audit report with a verified state matrix and a ranked improvement plan.
8. Then execute one coherent next milestone on a new child branch, with focused tests + full QA + physical handoff.

The desired relationship is: preserve what has been proved, understand why it exists, and then be ambitious about making the game substantially better.