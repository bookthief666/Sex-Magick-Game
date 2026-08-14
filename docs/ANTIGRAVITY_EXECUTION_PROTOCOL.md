# Antigravity Execution Protocol — After the Forensic Audit

Use this after Antigravity has completed `docs/ANTIGRAVITY_FIRST_SESSION_AUDIT.md` and the owner has reviewed the audit.

---

Continue as principal game engineer, gameplay designer, technical art director and QA lead for Sex Magick 2.0.

Your job is now to **build**, not merely advise.

Start from the verified audit and the current `antigravity/sex-magick-2.0-continuation` state. Create a new child branch for the next coherent milestone. Keep the Antigravity continuation branch itself as the preserved handoff anchor unless there is an explicit reason to advance it later.

## Choose the next milestone intelligently

The existing roadmap suggests:

- first-run ritual onboarding/comprehension;
- reward/run-arc/result/retry polish;
- deeper MONAS identity/mastery;
- tolerance-based visual regression modernization;
- further audio/haptic/performance/PWA refinement.

However, select the next milestone based on the forensic audit, not obedience to numbering.

Prefer a milestone that:

1. materially improves what a player feels within the first several runs;
2. can be validated as one coherent vertical slice;
3. preserves the proven simulation/collision/progression envelope unless changing it is the explicit measured goal;
4. improves both product quality and future development leverage when possible.

## Product-design freedom

You are authorized to invent and implement better solutions than those previously proposed. This may include:

- a better onboarding structure;
- redesigned run-result/retry flow;
- new micro-events or encounter pacing;
- more legible progression signals;
- better procedural visuals;
- stronger event-specific effects;
- more sophisticated but low-cost audio/haptic grammar;
- better mobile/foldable UI composition;
- smarter persistence/history presentation;
- refactors that remove ownership ambiguity;
- new diagnostics/tests that expose real player-facing regressions;
- measured gameplay tuning when evidence justifies it.

Do not add features merely because they are novel. Tie each meaningful change to a player-facing purpose.

## Implementation discipline

Before coding, write a short milestone contract containing:

- player problem;
- design hypothesis;
- systems/files touched;
- systems explicitly held fixed;
- performance budget implications;
- accessibility implications;
- focused automated acceptance;
- full-suite acceptance;
- Fold 6 physical acceptance.

Then implement the milestone.

### For gameplay changes

If changing physics, gaps, speed, Gate scoring, power-up supply, mission targets, progression thresholds or MONAS control/progression:

- state the hypothesis first;
- preserve deterministic replayability;
- add/update the narrowest proof/tool that measures the new contract;
- compare against the previous candidate;
- require physical validation before claiming the tuning is better.

### For visual/effect changes

- prefer semantic event signatures over constant noise;
- reuse/cache existing render channels when possible;
- do not add an expensive full-screen pass without an explicit performance test;
- preserve collision/readability truth;
- verify both Fold postures;
- verify STILLNESS and VEIL behavior.

### For audio/haptic changes

- keep mobile audio-policy constraints in mind;
- make event categories distinguishable;
- cap continuous layers so they do not fatigue or bury gameplay feedback;
- ensure Music and SFX toggles own the expected sounds;
- keep haptics meaningful rather than firing constantly.

### For UI/UX changes

- prioritize the actual touch/mobile layout;
- preserve fast retry and low friction;
- do not solve comprehension by covering gameplay with tutorial walls;
- ensure experienced players can move quickly through repeated runs.

## Verification sequence

1. Syntax/static checks for changed runtime/tests.
2. Focused deterministic tests for the milestone.
3. Focused browser integration on realistic mobile geometry.
4. Relevant inherited regressions.
5. Entire `.github/workflows/qa.yml` Fast gameplay QA on the exact candidate head.
6. Any reachability/boundary/progression workflows implicated by the change.
7. Physical Samsung Galaxy Z Fold 6 test in both postures.

Do not call a candidate complete if only the focused suite is green.

If CI exposes a legacy fixture boundary, first determine whether the product contract intentionally superseded the fixture or whether the new code is wrong. Preserve diagnostic tests whenever possible by keeping diagnostic paths isolated.

## Git/release discipline

- one coherent child branch per milestone;
- draft PR stacked on the previous verified candidate;
- document meaningful decisions;
- no merge/deploy without explicit owner authorization;
- no force-push/history rewrite;
- keep exact candidate SHA and CI run IDs in the PR body.

## Completion report

When the milestone is fully automated-green, report:

- exact branch and SHA;
- what changed for the player;
- what was deliberately held fixed;
- focused CI evidence;
- full-suite evidence;
- performance/accessibility implications;
- exact Fold 6 test instructions;
- what subjective questions the physical test must answer;
- recommended next milestone, including any better opportunity discovered while implementing this one.

The guiding principle is: **preserve proven truth, then be creatively aggressive about player experience.**

---