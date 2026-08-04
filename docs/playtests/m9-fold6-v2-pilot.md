# M9 Fold 6 Pilot — Complete-Session Evidence and Viewport Profiles

Date prepared: 2026-08-04  
Status: ready to run after the owner chooses to revisit Gate testing

## Purpose

This protocol replaces the Milestone 8 V1 harness for future Gate-slice sessions. It corrects the two evidence defects found in the first owner report:

- no truncation after 20 runs
- no successful-clear credit for `zone: unsafe`

It also records the selected Fold viewport profile and Gate decision-movement proxies.

Running this protocol is not required before direction-independent M9 asset/runtime work continues.

## Required branch

```text
develop/m9-runtime-hardening
```

## Update Termux checkout

```bash
cd ~/Sex-Magick-Game
git fetch origin
git switch develop/m9-runtime-hardening
git pull --ff-only origin develop/m9-runtime-hardening
```

Start the server:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

## Fold-closed V2 session

Three-step candidate:

```text
http://127.0.0.1:8000/tools/gate-slice-playtest-v2.html?buffer=3&tester=OWNER-M9-A&device=Fold%206%20closed&viewportProfile=fold-closed&minutes=15
```

Six-step candidate:

```text
http://127.0.0.1:8000/tools/gate-slice-playtest-v2.html?buffer=6&tester=OWNER-M9-B&device=Fold%206%20closed&viewportProfile=fold-closed&minutes=15
```

## Fold-open diagnostic

```text
http://127.0.0.1:8000/tools/gate-slice-playtest-v2.html?buffer=3&tester=OWNER-M9-OPEN&device=Fold%206%20open&viewportProfile=fold-open&minutes=10
```

Do not combine Fold-open and Fold-closed data when comparing input buffers.

## New evidence fields

V2 reports include:

- every run observed during the active session, even beyond 20
- unique and completed run counts
- valid Gate-clear totals
- separate unsafe-crossing count
- Gate offers, entries, and banks
- Gate entry and bank rates
- Void outcomes
- Gate frames visible before resolution
- player movement toward the Gate
- deliberate-entry proxy
- active viewport profile and DPR
- input-buffer counters

`deliberateEntryProxy` means that the player moved vertically toward the Gate by at least six pixels before entering. It is not proof that the player understood or consciously selected the wager.

## Interpretation

A V2 report can now support complete-session arithmetic. It still cannot by itself establish comprehension or fun.

The original qualitative questions remain controlling:

- What is the game asking you to do?
- What did the meter mean?
- What did the Gate mean?
- Did input feel ignored?
- Would you voluntarily play another run?

## Stop conditions

Stop and report when:

- the HUD still obscures the Fold-closed play corridor
- text becomes unreadable at the Fold-closed profile
- an unsafe crossing increases score or Gate count
- session totals stop increasing after 20 runs
- the Gate cannot be intentionally entered or bypassed
- a posture transition resumes play without explicit input
- any report is transmitted remotely

## Deferred

Do not infer permission for Gate tuning, Monas, additional Sephiroth, leaderboard work, deployment, or solver expansion from this protocol. Those remain separate decisions.
