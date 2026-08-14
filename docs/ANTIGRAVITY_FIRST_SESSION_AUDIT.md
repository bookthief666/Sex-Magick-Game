# Antigravity First-Session Prompt — Sex Magick 2.0

Copy this entire prompt into Antigravity after opening the repository root and checking out `antigravity/sex-magick-2.0-continuation`.

---

Act as the principal game engineer, gameplay designer, technical art director, QA lead, release manager, and technical historian for this repository.

You are taking over an existing project with a long evidence trail. Your first responsibility is to understand and verify it, not to immediately rewrite it.

## Repository / baseline

Repository: `bookthief666/Sex-Magick-Game`

Required starting branch: `antigravity/sex-magick-2.0-continuation`

This branch was created from exact M35 candidate:

`74262e2798d80493df0dd9cfb1f768c145e8f14d`

Do not use `main` or stale `develop/sex-magick-2.0` as the newest product baseline.

## First read these files

1. `ANTIGRAVITY.md`
2. `docs/ANTIGRAVITY_PROJECT_HANDOFF.md`
3. `docs/SEX_MAGICK_NORTH_STAR.md`
4. `.github/workflows/qa.yml`
5. `docs/decisions/d026-gate-fairness-and-measurement-truth.md`
6. `docs/decisions/d027-difficulty-curve-and-obstacle-variety.md`
7. the decision records for missions, power-ups, aesthetics, Rite Board and MONAS
8. `docs/decisions/d052-ritual-ascent-game-feel.md`
9. `docs/decisions/d053-living-sephiroth.md`
10. then inspect `index.html` and the actual `tools/` runtime modules.

Do not rely only on the handoff. Verify the implementation yourself.

## Establish the baseline before feature work

Run and report:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20
npm ci --ignore-scripts
```

Do not run `npm audit fix --force`.

Inspect the current GitHub/draft-PR state and current CI evidence if available.

Then run the current deterministic/runtime checks that are practical locally. Read `.github/workflows/qa.yml` so you understand the full authoritative suite. Do not pretend a partial local run is equivalent to the full CI workflow.

If a test fails, diagnose the failure before changing product code. Never weaken a valid test simply to get green.

## Reconstruct the runtime as a system

Build an explicit ownership map for at least:

- fixed-step simulation;
- player input and buffering;
- collision geometry;
- resize/fold behavior and DPR policy;
- asset loading/fallbacks;
- performance-budget instrumentation;
- obstacle generation/grammar/variety;
- Gate/Gnosis/Void state;
- HEX progression/bands;
- missions;
- power-ups;
- local leaderboard/Rite Board;
- occult field/art/effect layers;
- M34 ritual-ascent presentation;
- M35 Living Sephiroth visual/audio identity;
- MONAS control state;
- MONAS progression ownership;
- MONAS reachability/proof tooling;
- accessibility settings;
- PWA/offline behavior that currently exists;
- diagnostic query paths and why they are isolated.

Pay particular attention to prototype wrapping/install order. This project evolved by layered runtimes; a visually small wrapper can own important semantics.

## Verify product parity

Produce a matrix for the normal product path on `/index.html` with at least these rows:

- HEX starts correctly from the normal URL;
- Gate/Gnosis/Void active;
- missions active/persistent;
- power-ups active/earned/consumed;
- Rite Board accessible;
- obstacle variety active;
- generated/fallback art path intact;
- Sephirah ascent HUD active;
- M35 sensory identity active;
- KETHER subtraction behavior present;
- Music/SFX/STILLNESS/VEIL ownership clear;
- MONAS starts correctly from the same normal product;
- MONAS hold/release behavior intact;
- Coherence/Warp intact;
- MONAS progression does not inherit HEX/score ownership;
- HEX presentation residue does not leak into MONAS;
- Fold-open/cover render policy remains posture-aware.

Classify each as:

- VERIFIED WORKING
- PRESENT BUT NEEDS PHYSICAL JUDGMENT
- PARTIALLY WORKING / POORLY EXPOSED
- BROKEN / REGRESSED
- NOT IMPLEMENTED

Do not infer “working” merely because a script exists.

## Audit the game as a player and game expert

After the engineering map, critique the actual experience. Look for high-value improvements in:

### Gameplay / arcade design

- first 30 seconds;
- control feel;
- fairness and death attribution;
- run pacing;
- obstacle encounter rhythm;
- difficulty escalation;
- risk/reward clarity;
- meaningful choices;
- mastery depth;
- replay incentives;
- mission/power-up usefulness;
- death/result/retry friction;
- whether KETHER feels like an earned destination;
- whether MONAS is deep enough to sustain repeated play.

### UX / onboarding

- whether a new player understands HEX vs MONAS;
- whether Gate/Gnosis/Bank/Void are learned at the right moment;
- whether missions and powers are visible without clutter;
- whether the menu exposes what matters;
- whether narrow/open Fold layouts remain readable;
- whether any text is too small or too transient.

### Art direction / effects

- hierarchy and readability;
- whether events have distinct visual signatures;
- whether the eight Sephiroth are perceptually distinct enough;
- whether effects are semantic rather than decorative;
- whether visual intensity is paced rather than constant;
- whether KETHER reads as transcendence instead of emptiness;
- whether MONAS has a sufficiently independent visual identity;
- where better procedural art, transitions, particles, shaders/canvas techniques, typography or animation could improve the game without violating performance.

### Audio / haptics

- whether the M35 undertone is architecturally sound;
- whether the mix can communicate gameplay by ear;
- missing event-specific sonic signatures;
- whether mobile audio policies are respected;
- whether haptic patterns can become more semantically meaningful without fatigue.

### Technical quality

- duplicated state ownership;
- wrapper-order fragility;
- dead/stale paths;
- per-frame work that should be event-driven;
- DOM/canvas costs;
- large-file maintainability risks;
- loading/offline/PWA gaps;
- testing blind spots;
- opportunities to make changes safer without pointless framework churn.

## Freedom to improve the roadmap

The current planned sequence is approximately:

- M36 first-run ritual onboarding/comprehension;
- M37 reward/run-arc/result/retry polish;
- M38 deeper MONAS identity/mastery;
- tolerance-based visual regression replacement;
- further audio/haptics/performance/PWA work;
- third rite only later.

Treat this as a hypothesis, not an order you must obey.

If your audit finds a better next move, propose it. You are encouraged to improve code, aesthetics, effects, gameplay, audio, UX, architecture or QA beyond the written roadmap when the expected player value is higher.

However, every proposed deviation must include:

- the player problem being solved;
- why it outranks the existing roadmap item;
- exact files/systems likely affected;
- major regressions it could cause;
- focused automated tests needed;
- full-suite implications;
- Samsung Galaxy Z Fold 6 physical-validation plan.

## Hard constraints

Do not:

- rewrite from scratch;
- migrate frameworks just because `index.html` is large;
- flatten layered runtimes before mapping ownership;
- reintroduce MONAS tap-to-flap;
- make MONAS progression score-owned again;
- change proven collision/reachability truth without a measured replacement;
- hide mature HEX features behind a secret experimental flag again;
- remove Fold-aware DPR behavior;
- disable accessibility;
- add an unbounded expensive full-screen effect;
- loosen valid QA/performance limits to fit a visual idea;
- merge to `develop` or `main`;
- deploy to itch.io;
- force-push or rewrite branch history.

## Required first-session deliverable

Do **not** start broad feature implementation during this first audit unless you discover a small, unambiguous blocker required to establish the baseline.

Return a report with:

1. **Verified starting state** — branch/SHA/status, install/test evidence and current CI.
2. **Architecture/state-ownership map**.
3. **Normal-product parity matrix** for HEX and MONAS.
4. **Performance/Fold/accessibility assessment**.
5. **Gameplay and art-direction critique**.
6. **Top 10 improvement opportunities**, ranked by player impact versus implementation risk.
7. **Recommended next milestone** with precise scope, acceptance criteria, test plan and physical Fold 6 plan.
8. **Things you explicitly recommend deferring** and why.
9. **Any assumption in this handoff that the current source disproves**.

Be ambitious about quality but conservative about unverified architectural churn. The goal is to preserve everything that is already proved while making Sex Magick 2.0 substantially more compelling, legible, atmospheric and replayable.

---