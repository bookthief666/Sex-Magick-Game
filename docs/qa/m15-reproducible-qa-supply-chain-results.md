# Milestone 15 — Reproducible QA Supply-chain Results

**Branch:** `develop/m15-qa-supply-chain`  
**Base:** `c7bf4f9649407580bec35842498b1ae3482147e8` (`develop/m14-visual-state-regression`)  
**Implementation head:** `7231804f09696d77a84b70358fcbab94a5329c32`  
**Real-device validation head:** `012cebd40fb4d9935b0e98fe074a5a5156a5d381`  
**Status:** Machine-verified QA supply-chain checkpoint; keep draft, stacked, unmerged, and undeployed.

## Scope

Milestone 15 makes the existing automated QA dependency and GitHub Actions supply chain reproducible and reviewable. It does not change gameplay, visual baselines, Gate/Gnosis/Void balance, physics, input, collision, obstacle grammar, Monas, leaderboard behavior, `main`, or the itch.io build.

The branch now includes the final verified M14 head as ancestry. This corrects the initial M15 stack, which branched from `0f9f169b22c033611fdb83d0bfc4ad435eb2811c` and therefore omitted M14's final menu-first and zero-LootLocker contracts.

## Locked QA dependency graph

`package-lock.json` is committed with lockfile version 3. The direct QA dependencies remain exact rather than ranged:

| Dependency | Locked version | Purpose |
| --- | --- | --- |
| `@playwright/test` | `1.59.1` | local browser and visual-state matrix |
| `browserstack-node-sdk` | `1.65.3` | real Android and iOS BrowserStack transport |
| `http-server` | `14.1.1` | branch-local QA server |

The ordinary cross-screen and BrowserStack workflows install with `npm ci --ignore-scripts`. The audit workflow regenerates package-lock metadata, reapplies the approved action-pin map, requires a clean diff, and then runs the supply-chain contract.

## Immutable GitHub Action references

Every external `uses:` reference in the six reviewed workflow files is pinned to a full commit SHA:

| Action | Approved SHA | Verified upstream reference at adoption |
| --- | --- | --- |
| `actions/checkout` | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | `v5` |
| `actions/setup-node` | `a0853c24544627f65ddf259abe73b1d18a591444` | `v5.0.0` / `v5` |
| `actions/upload-artifact` | `330a01c490aca151604b8cf639adc76d48f6c5d4` | `v5.0.0` / `v5` |
| `browserstack/github-actions/setup-env` | `1ab56d9521ce20f4651bb5d9f3ef39c5ba54805a` | reviewed BrowserStack `master` head |
| `browserstack/github-actions/setup-local` | `1ab56d9521ce20f4651bb5d9f3ef39c5ba54805a` | reviewed BrowserStack `master` head |

`tools/test-qa-supply-chain.mjs` rejects abbreviated, tag-based, moving-branch, unknown, or unapproved action references. `tools/pin-workflow-actions.mjs` provides a deterministic repair path, but the enforcement workflow is read-only and never commits or pushes automatically.

## Least-privilege correction

The first M15 workflow granted `contents: write` and executed branch-controlled JavaScript before an automatic `git push`. That was unnecessary after the generated lockfile and pins had been committed.

The accepted implementation:

- uses `contents: read`
- checks out the normal event ref, including the pull-request merge ref
- performs no CI-side branch mutation
- rejects any future `contents: write`, `git push`, or forced head-ref checkout in the audit workflow contract
- checks every `npm install` occurrence independently, so an approved package-lock-only command cannot mask an unlocked command elsewhere in the same workflow

## Audit policy and current findings

The enforced policy is:

- production dependency findings: exactly zero at every severity
- full QA graph: zero high and zero critical findings
- lower-severity QA findings: visible in retained audit artifacts and explicitly reviewed

The accepted exact-head audit reported:

```text
production: 0 total
full QA graph: 5 moderate, 0 high, 0 critical
```

The five moderate entries are one QA-only dependency chain:

- direct `browserstack-node-sdk`
- transitive `googleapis`
- transitive `googleapis-common`
- transitive `gaxios`
- transitive `uuid@9.0.1`, advisory `GHSA-w5hq-g745-h8pq`

These findings are accepted provisionally because the affected graph is development-only, is installed with lifecycle scripts disabled, and is used only to drive QA sessions. npm's reported automatic fix is a downgrade of `browserstack-node-sdk` to `1.27.3`, which would replace the validated transport rather than provide a safe patch update. This acceptance is not a claim that moderate findings are harmless or permanently waived. Any production finding or any high/critical QA finding fails CI, and the moderate chain must be revisited when BrowserStack publishes a compatible dependency correction.

## Exact-head automated evidence

### Implementation enforcement

- Supply-chain run `31075711927`, job `92533170974`: success
- Visual-state run `31075711881`, job `92533170841`: success
- Result: `57 passed`, `23 intentionally skipped`, `80 total`
- All 28 accepted M14 Chromium signatures matched unchanged

Artifacts:

- audit: `8957402296`, digest `sha256:083015d92998f9e2ca27b4621d48dea301dfae4ccff050e2fcc028ee0c79a2f4`
- Playwright report: `8957453165`, digest `sha256:613c7dbb3a75ffa1e63e2da6e409d7e67d8be633b20c1218aa47fce0d704a007`
- test results: `8957453563`, digest `sha256:9fb1fac33568ccff38681aa5f36dff06f8344572fe871097ba08b61c693c41ca`

### Real-device validation head

The only change after the implementation head was the bounded operator request record.

- Supply-chain run `31076061485`, job `92534255086`: success
- Visual-state run `31076061581`, job `92534258226`: success
- Result: `57 passed`, `23 intentionally skipped`, `80 total`
- All 28 accepted M14 Chromium signatures matched unchanged
- BrowserStack run `31076059515`: success
- desktop job `92534243795`: success
- Android/iOS job `92534246896`: `2 passed`

The real-device smoke targets were:

- Windows 11, Chrome latest, `1440 x 900`
- Samsung Galaxy S23 Ultra, Android 13, Chrome
- iPhone 13, iOS 15, Safari

Both mobile sessions returned HTTP 200 through BrowserStack Local, selected the compact-phone profile, reported zero horizontal overflow, retained the 44 CSS-pixel control minimum, created valid canvas/backing-store geometry, and raised no page-error assertion failure.

Artifacts:

- real-device-head audit: `8957538135`, digest `sha256:bf969d6df2bff534b4ef79521d9e11fa400d22a14341728ddbceb0a57068322c`
- real-device-head Playwright report: `8957595707`, digest `sha256:02405badf13ce6832058055748bd13144befde3959b7379f601d93cc978e8a42`
- real-device-head test results: `8957597167`, digest `sha256:a8a4e408d22a7489fdbf70335a47c7938c559b770d0efb50006fcfe18ea015fd`
- desktop server log: `8957545402`, digest `sha256:92315f0fd84f184f63e7efdebdd99557e3f5b4acfc05d97e72e08e00a1d0ec3f`
- BrowserStack Local log: `8957547154`, digest `sha256:c71c73218b10f076d0f08e33686955dc4397593eb9e7e93840b142a6ffce1a8d`
- mobile server log: `8957564554`, digest `sha256:52289aae41f4242dc310eed09456592c1c5f6625531109e1355959bf97bce299`

## Update policy

Dependency or Action updates must be explicit reviewed commits. For each update:

1. Verify the intended upstream release/tag and immutable commit SHA.
2. Update `package.json`, regenerate `package-lock.json`, and review the complete dependency diff.
3. Update both the pinning tool and enforcement allowlist together.
4. Run `npm ci --ignore-scripts`, both npm audits, `test:supply-chain`, and `test:browserstack-config`.
5. Run the full ten-project visual-state matrix and confirm all intended M14 signatures.
6. Run the bounded BrowserStack smoke gate when Playwright, the BrowserStack SDK, BrowserStack Actions, or transport configuration changes.
7. Do not update visual baselines merely to make a tooling upgrade green; inspect and justify every visual difference first.

## Claim boundary

Passing M15 establishes that the committed QA dependency graph installs reproducibly in the tested GitHub environment, all reviewed Actions use approved immutable references, the audit policy is enforced, the final M14 matrix remains green, and the selected BrowserStack targets work through the locked transport.

It does **not** establish a hermetic build. `ubuntu-latest`, the Node 22 patch release, npm, downloaded browser packages, fonts, and external BrowserStack device availability remain managed upstream. It also does not prove production security, long-session performance, thermal behavior, battery use, physical Fold 6 posture transitions, touch latency, haptics, Gate comprehension, fun, broad device compatibility, or release readiness.

## Deployment and branch protection

- PR #8 remains draft and stacked on PR #7.
- No M15 commit was merged into `main`.
- No itch.io deployment occurred.
- The published game remains unchanged.
