# Claude Opus Comprehensive Review — SEX MAGICK 2.0

## Operating model

Use the strongest Claude Opus model available to the account through Claude Code. At the time this handoff was prepared, Anthropic's supported-model documentation listed Claude Opus 4.8 as the newest Opus model. Prefer the `opus` alias or select the newest Opus shown by `/model` rather than assuming a future version number.

Recommended session mode:

- fresh Claude Code session
- model: latest available Opus
- effort: `max` for the strategic review, reduced only if usage limits require it
- permission mode: Plan / read-only
- repository writes: prohibited except for the single uncommitted response document explicitly requested below

## Repository target

Repository: `bookthief666/Sex-Magick-Game`  
Branch: `develop/sex-magick-2.0`  
Draft pull request: `#1`  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Published itch.io build and `main`: protected and unchanged

Before beginning, verify:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse main
git rev-parse develop/sex-magick-2.0
```

Do not change branches, modify `main`, merge the PR, deploy, push, or commit.

## Controlling assignment

Read and follow this complete whole-project assignment:

```text
docs/handoffs/fable-5-comprehensive-game-evolution-review.md
```

The filename records the model originally considered. Its strategic assignment, required reading, alternative-path analysis, vertical-slice specification, and required A–O response structure remain controlling. Execute that assignment as Claude Opus.

The central question is not whether Milestone 6 is technically correct. It is:

> Is the evolution from the original SEX MAGICK prototype into the proposed 2.0 becoming a distinctive, immediately understandable, mechanically expressive, exciting, replayable, aesthetically coherent, realistically scoped game—or has the project over-invested in rigorous infrastructure before validating the strongest creative direction?

Review the original baseline, current branch, full audit and roadmap, all decisions, all six milestone reports, current PR, current gameplay implementation, tests, architecture, audiovisual direction, product positioning, and prospective release scope.

Do not assume the current plan is correct. Explicitly assess whether to:

1. continue the current evolution
2. reorder its roadmap
3. materially redesign its game systems
4. pivot to a stronger core concept

Develop and rank the required focused-refinement, thematic-redesign, and hybrid alternatives against the current plan.

## Technical appendix

After completing the whole-project creative and strategic review, read and execute:

```text
docs/handoffs/fable-5-m6-compositional-robustness-review.md
```

Treat it as a technical appendix. Preserve its distinction among confirmed defects, risks requiring experiments, accepted design choices, robust-witness search, perturbation policy, Fold resize safety, and client-side security boundaries.

## Required execution

When possible, run without modifying files:

```bash
node tools/test-player-reachability.js
node tools/test-compositional-reachability.js
node tools/run-browser-reachability-test.mjs
node tools/run-browser-compositional-test.mjs
```

Also inspect the current GitHub Actions configuration and existing recorded workflow results. A locally unavailable browser must be reported honestly rather than simulated.

## Review discipline

- Separate creative judgment from technical correctness.
- Separate fairness from fun.
- Separate occult atmosphere from meaningful thematic mechanics.
- Separate machine reachability from human comfort.
- Separate replay/debug evidence from anti-cheat proof.
- Anchor major conclusions to this repository rather than generic game-design advice.
- Identify what the original game already gets right and must not lose.
- Determine whether Milestones 5–6 were proportionate groundwork or premature optimization.
- Do not recommend large content production before a playable vertical slice proves the core loop.
- Do not recommend a framework rewrite without a concrete production benefit.
- Challenge the preferred recommendation with at least one serious counterargument.

## Required output

Write the complete response to:

```text
docs/reviews/claude-opus-comprehensive-game-evolution-review-response.md
```

Creating that one uncommitted review file is permitted. Do not modify any other repository file and do not commit the response.

The response must contain:

1. the complete A–O whole-project review required by the controlling assignment
2. the complete A–J Milestone 6 technical appendix
3. an executive decision on the present game direction
4. a ranked comparison of the current plan and three alternatives
5. a counterfactual roadmap from the baseline
6. a recovery roadmap from the present branch
7. an exact playable vertical-slice specification
8. what should explicitly not be built next
9. the three most important owner decisions
10. whether PR #1 should remain draft

At completion, print:

- verified branch and commit reviewed
- tests actually executed and their outcomes
- files read
- generated response path
- confirmation that no code was edited, committed, pushed, merged, or deployed
