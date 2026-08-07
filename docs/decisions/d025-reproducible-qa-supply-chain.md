# D-025 — Lock and review the QA supply chain without CI-side branch mutation

**Date:** 2026-08-05  
**Status:** Accepted on stacked development branch

## Decision

Commit the exact npm QA dependency graph, install it with `npm ci --ignore-scripts`, and pin every reviewed external GitHub Action reference to a full commit SHA. Enforce the policy from a read-only workflow that verifies committed state and uploads audit evidence but never commits or pushes to its source branch.

Require zero production dependency findings and zero high or critical findings in the full QA graph. Permit lower-severity QA-only findings only when they are visible in retained evidence, explicitly assessed, bounded to development tooling, and assigned a revisit condition.

## Rationale

The M14 matrix depended on exact browser behavior while its workflow still used unlocked installation and moving Action tags. The first M15 implementation generated the missing lockfile and pins, but retained a repository write token and an automatic branch-push step after running branch-controlled scripts. Once the generated state was committed, that authority was unnecessary and contrary to the supply-chain hardening objective.

The M15 branch also initially diverged two commits before final M14. A green 70-test run therefore did not protect the final menu-first and zero-LootLocker contracts. The branch now contains final M14 as merge ancestry and enforces the complete 80-test matrix.

## Consequences

- `package-lock.json` lockfile version 3 is committed and checked for deterministic regeneration.
- Playwright `1.59.1`, BrowserStack Node SDK `1.65.3`, and `http-server` `14.1.1` remain exact direct pins.
- Six workflow files are scanned for unknown, moving, abbreviated, or unapproved Action references.
- The audit job uses `contents: read`, tests the normal event ref, and performs no `git push`.
- Ordinary cross-screen and real-device installs use `npm ci --ignore-scripts`.
- Any production audit finding fails; any high or critical QA finding fails.
- The current five moderate QA-only entries in the BrowserStack/Google API/UUID chain are provisionally accepted and remain visible in artifacts and the M15 report.
- Tool or Action updates require human review, exact-head Playwright enforcement, and a bounded BrowserStack rerun when transport dependencies change.
- Visual baselines are never silently rewritten for a dependency update.
- Gameplay, balance, physics, input, collision, Monas, leaderboards, `main`, and deployment behavior are unchanged.

## Accepted evidence

Implementation head:

```text
7231804f09696d77a84b70358fcbab94a5329c32
```

Implementation runs:

```text
Supply chain 31075711927 / job 92533170974 / success
Visual state 31075711881 / job 92533170841 / 57 passed, 23 skipped
```

Real-device validation head and runs:

```text
012cebd40fb4d9935b0e98fe074a5a5156a5d381
Supply chain 31076061485 / job 92534255086 / success
Visual state 31076061581 / job 92534258226 / 57 passed, 23 skipped
BrowserStack 31076059515
  desktop 92534243795 / success
  Android and iOS 92534246896 / 2 passed
```

All 28 accepted Chromium signatures remained unchanged on both M15 visual-state runs.

## Revisit when

- BrowserStack publishes a compatible graph that removes the current moderate UUID advisory chain
- Playwright or the BrowserStack SDK changes
- an approved Action release or commit changes
- GitHub runner, Node, npm, or browser drift changes a deterministic signature
- a production dependency is introduced
- read-only enforcement can no longer verify the required committed state

## Full record

`docs/qa/m15-reproducible-qa-supply-chain-results.md`
