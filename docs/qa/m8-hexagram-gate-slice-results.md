# Milestone 8 Results — Hexagram Gate Vertical Slice

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Final tested implementation head: `71d1fedf17b009963c33340a0f102a8886c0ddf5`  
Fast gameplay QA run: `30925941704`  
Final documented head: `eb58cc60313feaca08a949326e2dcef073f08145`

## Status

**Implemented as an opt-in development experiment. Not human-validated. Not authorized for merge or deployment.**

The ordinary branch game remains unchanged unless the page is opened with:

```text
?gateSlice=1
```

The input buffer remains independently tunable:

```text
?gateSlice=1&inputBuffer=3
?gateSlice=1&inputBuffer=6
```

`main` and the live itch.io build remain unchanged.

## Purpose

This milestone finally implements the player-facing hypothesis that the project had documented but repeatedly deferred:

```text
precise flight
→ voluntarily clear risky parts of a gap
→ accumulate Gnosis
→ summon a physical Gate
→ enter to wager or bypass to bank
→ survive a lethal transformed Void
→ convert the wager or lose it
→ retry immediately
```

The build is intended to answer whether this is a meaningful decision and a compelling dramatic arc. Automated QA can verify execution and evidence integrity; only human play can answer the design question.

## Architecture boundary

All Gate-slice behavior lives in:

```text
tools/gate-slice-runtime.js
```

No Gate, Gnosis, banking, wagering, Void, scoring, or playtest logic was added to `tools/collision-runtime.js`.

The new module is loaded only when `gateSlice=1` is present. The existing collision/input module remains unchanged during this milestone.

## Slice scope

### Rite

- Hexagram only.
- Monas is disabled and labelled `RITE OF MONAS — SEALED` inside the slice.
- Normal non-slice Monas behavior is unchanged.

### Ordered bands

The slice replaces shuffled level order with four fixed run bands:

| Band | Gate threshold | Base speed | Base gap | Risk scoring |
|---|---:|---:|---:|---|
| Malkuth | 0 | 2.9 | 220 | inactive |
| Yesod | 6 | 3.8 | 190 | active |
| Tiphareth | 16 | 5.0 | 165 | active |
| Geburah | 32 | 6.2 | 145 | active |

Malkuth provides six introductory gates before risk scoring begins. This differs from the earlier proposal to delay Gnosis until Tiphareth; the experimental slice exposes the mechanic earlier so a short session can actually evaluate it.

### Risk zones

The safe vertical interval inside each gap is divided into thirds after accounting for the effective 12-pixel player collision half-size:

- top third: upper risk zone
- middle third: center route
- bottom third: lower risk zone

Dashed internal marks show the boundaries. They are nonlethal guides; the original pillar boundaries remain collision-authoritative.

### Gnosis

Capacity: `10`.

Risk-zone gain by pattern family:

| Family | Gnosis |
|---|---:|
| safe / recovery | 0.5 |
| pressure | 1 |
| climax | 2 |

Three consecutive center clears while risk scoring is active decay one Gnosis. Gnosis values use half-step precision.

### Score behavior

The original gate clear still contributes `+1` through the existing runtime. The slice adds:

- risk-zone clear: `+2`
- risk streak at 3 clears: `+1` per qualifying clear
- risk streak at 7 clears: `+2` per qualifying clear
- surviving with less than 6 pixels of spare clearance: `+1`
- bypass and bank: `round(Gnosis × 3)`
- complete Void survival: `round(wager × 10 × duration fraction)`

Orbs are suppressed in the slice so random positional pickups cannot obscure whether the Gnosis loop itself is understandable or rewarding.

These numbers are tuning hypotheses, not accepted balance.

### Gate decision

At full Gnosis, the next eligible spawn opportunity creates a large physical ring at an alternating upper/lower route.

- Pass through the inner ring: wager all Gnosis and enter the Void.
- Allow the ring to pass behind the player: bank all Gnosis at the safer multiplier.

The next normal pillar spawn is suppressed while the Gate is crossing, but existing obstacles continue moving. Whether the Gate placement and telegraph are readable under real play remains a human-test question.

### Transformed Void

- Duration: 480 authoritative simulation steps, approximately 8 seconds.
- Speed: current band speed × 1.5.
- Gap: current band gap reduced by 20 pixels, with a 100-pixel floor.
- Existing and newly spawned obstacles remain lethal.
- The original death suppression is removed for the slice.
- Death forfeits the current wager and ends the run.
- Full survival converts the wager at the experimental Void multiplier.

The existing Void audiovisual treatment is retained and combined with a dedicated HUD countdown and wager display.

## Local-only product boundary

The Gate slice disables the global leaderboard before the original loading flow can call `Leaderboard.init()`.

Inside `gateSlice=1`:

- no LootLocker guest session is created
- no leaderboard fetch is initiated
- no score is submitted
- leaderboard UI is hidden
- Gate evidence is stored locally under `sex_magick_gate_slice_v1`
- at most 20 completed Gate-slice runs are retained

The Chrome integration listened to every network request and asserted that no requested URL contained `lootlocker.io`.

The local run evidence records Gate offers, entries, banks, Void outcomes, Gnosis and score-source breakdown, final score, selected input buffer, and local input counters. This is debugging/playtest evidence, not anti-cheat proof.

## Playtest harness

Use:

```text
tools/gate-slice-playtest.html
```

The harness loads the opt-in slice in a same-origin iframe, supports both input candidates, runs a 10-, 15-, or 20-minute session, captures completed and active runs, aggregates Gate entry and Void survival rates, asks comprehension and replay-intent questions, exports one local JSON report, and transmits nothing.

## Automated evidence

`tools/test-gate-slice.js` verifies pure state and scoring contracts. `tools/test-gate-slice-playtest-harness.js` verifies the playtest/export boundary.

The actual Chrome game integration verified:

```text
Monas: sealed
Hexagram: RITE OF HEXAGRAM — THE GATE
Bands: MALKUTH > YESOD > TIPHARETH > GEBURAH
Risk clear: pressure / risk-top / +1 Gnosis / +2 slice bonus
Bank: wager 10 / reward 30
Void entry: wager 10 / speed 5.7 at Yesod
Void survival: reward 100
Void death: recorded and run ended
Offers: 3
Entries: 2
Banks: 1
Synthetic entry rate: 0.6666666667
Input buffer: 3
Local history: 1 completed run
LootLocker network requests: 0
Browser exceptions: 0
```

The synthetic entry rate verifies arithmetic and persistence only. It is not player evidence.

All existing fast gates remained green: fixed-step timing, collision and input, fail-closed policy behavior, telemetry and fast retry, and deterministic grammar.

## Established

- explicit opt-in quarantine
- unchanged ordinary branch behavior without the query
- ordered Hexagram bands
- risk-route classification and Gnosis transitions
- physical Gate entry and bypass
- banking, lethal Void survival, and Void death
- bounded local evidence
- zero LootLocker requests in slice mode
- selectable input-buffer candidate
- no expansion of the collision god-module
- green deterministic and Chrome regressions

## Not established

- player comprehension of risk zones, Gnosis, Gate, or banking
- intentionality of entering versus bypassing
- fair Gate placement among existing obstacles
- correct balance, pacing, duration, or HUD
- preferred input buffer
- human Gate entry rate
- fun, replayability, product value, or release readiness
- physical-device and cross-browser parity beyond the forthcoming Fold pilot
- production safety margin under breathing gaps

## Decision gate

The next decision must use human evidence from the local harness. The primary provisional signal is:

```text
25% ≤ Gate entry rate ≤ 75%
```

This is useful only alongside comprehension, intentionality, reported feel, and voluntary replay. An owner-only Fold 6 pilot can identify obvious defects but cannot establish broad appeal.

## Deployment

None. PR #1 remains draft. Do not deploy the slice to itch.io yet.
