# Milestone 3 Results — Fast Retry and Local Run Telemetry

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `6ff1bf0eaf277ff1e8da3f59d5a876afdfd125bd`  
Final QA workflow run: `30899895422`

## Scope

Milestone 3 defines a canonical local run lifecycle, adds one-action retry from the game-over state, and records gameplay evidence needed for later leaderboard validation.

No telemetry is transmitted. No leaderboard provider, score-submission request, account identity, or live itch.io build was changed.

`main` and the published itch.io build remain unchanged.

## Runtime integration

`tools/fixed-step-prototype.js` now bootstraps:

- `tools/collision-runtime.js`
- `tools/run-telemetry.js`

The telemetry runtime installs once through `Game.prototype.__runTelemetryRuntimeInstalled` and exposes diagnostics through:

```text
window.__SEX_MAGICK_RUNS__
```

## Canonical run identity

Each run receives a local identifier with this shape:

```text
run_<base36 epoch>_<16-character random suffix>
```

The identifier is generated with `crypto.randomUUID()` when available and a random fallback otherwise.

The run identifier is deliberately unrelated to:

- LootLocker player identifiers
- session tokens
- names
- email addresses
- IP addresses
- browser user agents
- device identifiers
- advertising identifiers

## Run lifecycle

A run begins from either:

- `menu`
- `retry`

Every start event is normalized to:

| Field | Value |
|---|---:|
| Frame | 0 |
| Score | 0 |
| Simulation time | 0 ms |
| Wall offset | 0 ms |

This prevents a retry from inheriting the prior run's final frame or score in its lifecycle history.

A run can end with:

- `death`
- `menu`
- `replaced`
- an explicit debug/error reason

Death finalization is deferred to the microtask boundary so score changes from the current simulation step are captured before the run is persisted. Beginning a retry flushes any pending death finalization first.

## Recorded run data

Completed summaries contain:

- schema version
- local run identifier
- Rite (`HEX` or `MONAS`)
- start reason
- ISO start and end timestamps
- end reason
- final score and high score at end
- wall duration
- active duration excluding pause time
- fixed-step simulation frame count
- simulation duration derived from 60 Hz steps
- final level index
- number of Void entries
- score events
- lifecycle events
- sanitized fixed-step timing diagnostics

### Score event sources

| Delta | Source |
|---:|---|
| +1 | `gate` |
| +5 | `orb` |
| +10 | `void-pentagram` |
| Other or combined delta | `mixed-or-unknown` |

The source classification is descriptive evidence only. It does not validate a run or authorize leaderboard submission.

### Lifecycle events

The runtime records:

- start
- pause
- resume
- level transition
- Void entry
- Void exit
- death
- end

Each event includes frame, score, simulation time, and wall-time offset.

## Timing diagnostics

Completed runs retain a strict allowlist from the fixed-step runtime:

- runtime mode
- step duration
- maximum catch-up steps per frame
- suspension-reset threshold
- simulation frames
- score
- pending RAF state
- total fixed steps
- dropped time
- suspension-reset count
- remaining accumulator time

The final browser test verified that the policy remains:

- 60 Hz authoritative simulation
- maximum five catch-up steps
- 250 ms suspension-reset threshold

No arbitrary runtime object or account data is serialized.

## Local retention and privacy

Storage key:

```text
sex_magick_runs_v1
```

Retention policy:

- latest 20 completed runs
- maximum 200 lifecycle events per run
- maximum 200 score events per run
- oldest runs pruned first
- current in-progress run remains in memory
- completed summaries remain in local browser storage only

Malformed or unavailable local storage falls back safely to an empty history or in-memory storage.

The deterministic and browser tests explicitly verify that persisted JSON does not contain:

- `player_identifier`
- `session_token`
- `userAgent`
- `ipAddress`
- `deviceId`

## Fast retry

The game-over state now accepts:

- `R`
- `Space`
- `Enter`
- touch on a non-control part of the game-over surface
- primary mouse input on a non-control part of the game-over surface

Actual controls remain excluded and continue through their normal click handlers.

The game-over screen displays:

```text
[ TAP / SPACE / R TO RETRY ]
```

Fast retry calls the existing synchronous `restartGame()` path. It does not create a second game implementation.

## Debug summary

Pressing `T` toggles a local run-summary panel. It can also be enabled through:

```text
?telemetry=1
```

or a URL hash containing `telemetry`.

The panel displays:

- current run ID and Rite
- current score-event and lifecycle-event counts
- recent-run count
- last end reason and score
- last active and simulation durations

The panel is diagnostic, non-interactive, and hidden during ordinary play.

## Deterministic test results

Passed:

- malformed storage fallback
- run-ID construction
- score-source classification
- fast-retry key recognition
- timing allowlist and secret-field exclusion
- exact zeroed start event
- score and lifecycle recording
- pause-time subtraction
- simulation-duration calculation
- timing policy persistence
- 20-run retention behavior
- history clearing
- absence of account and device identifiers

## Headless Chrome integration results

The browser test loads the actual production path at a 390 × 844 emulated viewport while optional external services are blocked.

Verified sequence:

1. Start a Hexagram run.
2. Preserve exactly one pending RAF callback.
3. Produce one gate score.
4. Pause and resume.
5. Enter and exit the Void.
6. Trigger death.
7. Finalize and persist the run.
8. Retry with the `R` key.
9. Verify synchronous frame and score reset.
10. Verify a new run ID and zeroed start event.
11. Preserve exactly one RAF callback.
12. Display the telemetry debug panel.
13. Return to menu and finalize the retry run.

### Verified values

| Contract | Result |
|---|---|
| First run Rite | `HEX` |
| First run end reason | `death` |
| Final score | 1 |
| Score event | `+1 gate` |
| Void entries | 1 |
| Current run after death | None |
| Completed runs after death | 1 |
| Retry key prevented default | Yes |
| Retry state | `playing` |
| Retry score | 0 |
| Retry frame | 0 |
| Retry start reason | `retry` |
| Retry start event | frame 0, score 0, simulation 0 ms |
| Pending RAF after start | 1 |
| Pending RAF after retry | 1 |
| Debug panel | Visible when enabled |
| Completed runs after menu return | 2 |
| Persisted forbidden identifiers | None |
| Maximum catch-up steps retained | 5 |
| Suspension threshold retained | 250 ms |

The existing refresh-rate and collision suites also remained green.

## Automation

The permanent `QA checks` workflow now runs:

1. JavaScript syntax checks
2. fixed-step deterministic tests
3. collision/input deterministic tests
4. run-telemetry deterministic tests
5. fixed-step headless Chrome integration
6. collision/touch headless Chrome integration
7. telemetry/fast-retry headless Chrome integration

## Acceptance status

Accepted for the development branch:

- canonical local run IDs
- zeroed run origins
- local run lifecycle
- local score and timing evidence
- pause-aware active duration
- bounded retention
- explicit privacy allowlist
- death and menu finalization
- immediate keyboard and surface retry
- one pending RAF across retry
- local debug summary

Still required before itch.io release:

- physical keyboard and mouse retry testing
- physical Android touch retry testing
- Samsung Fold 6 closed/open retry testing
- mobile Safari retry and storage testing
- browser storage quota/private-mode testing
- subjective retry-flow review
- confirmation that the game-over hint remains readable with real fonts and artwork
- leaderboard validation design
- decision on whether run summaries should ever be transmitted
- explicit consent and privacy review before any future network telemetry

## Rollback

To remove Milestone 3 while retaining Milestones 1 and 2:

1. Remove the `bootstrapRunTelemetryRuntime` block from `tools/fixed-step-prototype.js` introduced by commit `9615f6ba97cdea4fd7d7a4b420a22307dec17c2a`.
2. Remove `tools/run-telemetry.js`.
3. The telemetry tests and documentation may remain without affecting gameplay.
