# D-047 — Integration truth before another feature layer

Date: 2026-08-14
Status: Accepted on `agent/m30-integration-truth`; CI evidence pending

## Decision

M30 is an integration milestone, not a content milestone. Before MONAS gets a
progression ladder or a third Rite is considered, the repository must prove that
the player-visible systems added after the consolidated M1–M15 branch are actually
present on the paths a normal player uses and are actually exercised by GitHub CI.

Four corrections define the milestone:

1. **Enhanced MONAS loads on the ordinary game URL.** `monas-runtime.js` is a
   player-facing Rite runtime and is no longer owned by the `?gateSlice=1`
   bootstrap. The HEX Gate slice remains independently opt-in.
2. **A standard-entry browser test exists.** It deliberately loads
   `index.html?assetMode=offline` with no Gate flag and requires the MONAS module,
   runtime state, hold-to-rise/release-to-fall physics and no-bounce tap behavior.
   It also requires the Gate module and Gate preflight to remain absent.
3. **The Rite Board tests become real CI.** `test-leaderboard-runtime.js` and
   `browser-leaderboard-test.mjs` existed at M28 but were not invoked by
   `.github/workflows/qa.yml`; both are now syntax-checked and executed.
4. **Visual QA watches the current rendering surface.** The cross-screen workflow
   now treats bootstrap, Gate slice, MONAS and Rite Board runtime changes as
   rendering-relevant paths and can run for a PR into `develop/sex-magick-2.0`
   when that PR is marked ready for review.

## Why this milestone exists

M29 correctly added `test-monas-runtime.js` and `browser-monas-test.mjs` to the fast
workflow, but the commit lived only on `claude/sex-magick-2-0-review-atdnu8`.
`qa.yml` runs on pushes to `develop/sex-magick-2.0` and on pull requests targeting
`main` or `develop/sex-magick-2.0`; therefore M29 had no GitHub Actions status of
its own. "Wired into CI" and "CI-green at this SHA" were not the same statement.

A second integration gap was hidden by the MONAS browser suite itself. Its helper
always opened `?gateSlice=1`, and the only loader for `monas-runtime.js` was inside
that same feature-flag bootstrap. The tests could prove the enhanced Rite worked
once the flag had already loaded it, but could not prove that the normal URL loaded
it at all.

M30 makes both claims falsifiable.

## Claim boundary

M30 does **not** claim that MONAS has a validated competitive difficulty ladder.
The existing reachability solver models the older impulse/tap control profile, not
M27-M29's held-lift glide physics. The standard-entry test establishes wiring and
behavioral reachability of the runtime, not fairness across a progression table.

M30 also does not enable shared leaderboard submission, merge to `main`, or deploy
the game. The Rite Board remains local-only and the published baseline remains
untouched.

## Required evidence before M30 is called green

- Draft PR from `agent/m30-integration-truth` into `develop/sex-magick-2.0`.
- `Fast gameplay QA` completes successfully on the PR head, including:
  - existing M29 MONAS unit/browser coverage,
  - Rite Board unit/browser coverage,
  - `browser-m30-standard-entry-test.mjs`.
- Any failure is investigated from the failing job rather than reclassified as a
  host flake without A/B evidence.
- Cross-screen QA remains a ready-for-review/release-facing gate; adding its path
  coverage here does not turn every draft iteration into a full browser matrix.

## Next milestone if M30 passes

**M31 — MONAS reachability and progression.** Build a solver around the actual
held-input state (`y`, `vy`, held/released state and release-ramp age), measure the
reachable envelope at Fold-relevant geometries and speeds, and only then design a
MONAS-specific ascent. Do not copy the HEX band table by assumption.
