# M9 Fold 6 Pilot — Complete-Session Evidence and Viewport Profiles

Date prepared: 2026-08-04  
Status: **first block completed 2026-08-12** (fold-open, `buffer=3`) — see
[`m8-fold6-owner-pilot-results.md`](./m8-fold6-owner-pilot-results.md).
This protocol remains the standing harness for every future block.

> **Superseded section:** the input-buffer comparison below is closed. The
> 2026-08-12 block recorded 1768 immediate inputs and zero buffered, rejected, or
> expired ones, so a `buffer=6` arm would produce identical counters. Keep three
> frames and do not run the comparison. Future blocks should vary **posture**
> (fold-open vs fold-closed), not buffer length.

## Purpose

This protocol replaces the Milestone 8 V1 harness for future Gate-slice sessions. It corrects the two evidence defects found in the first owner report:

- no truncation after 20 runs
- no successful-clear credit for `zone: unsafe`

It also records the selected Fold viewport profile and Gate decision-movement proxies.

Running this protocol is not required before direction-independent M9 asset/runtime work continues.

## Required branch

```text
claude/sex-magick-2-0-review-atdnu8
```

**This changed, and following the old instruction would test the wrong game.**
This document used to say `develop/sex-magick-2.0`, which was correct through
M15. Every milestone since — M16–M21 (Gate aperture, obstacle variety, missions,
power-ups, the occult art pass), M25–M29 (MONAS as a second rite), M30–M35 (the
Rite Board, MONAS progression, full-product integration, ritual ascent, Living
Sephiroth) — landed on the branch above instead. As of 2026-08-19
`develop/sex-magick-2.0` is **118 commits behind** it and contains none of that
work, so a session run from it would report cleanly on a game without the Gate
loop, missions, power-ups or MONAS at all.

Check the `runtime` block of any report against
["Confirming the build that ran"](#confirming-the-build-that-ran) below before
trusting a session.

## Update Termux checkout

```bash
cd ~/Sex-Magick-Game
git fetch origin
git switch claude/sex-magick-2-0-review-atdnu8
git pull --ff-only origin claude/sex-magick-2-0-review-atdnu8
```

Start the server:

```bash
python3 tools/serve-playtest.py 8000
```

**Use this server, not `python -m http.server`.** The stock module sends no
`Cache-Control`, so the browser heuristically caches the runtime modules. On
2026-08-12 that produced a report which looked complete but described a build that
did not exist: the new files loaded while a pre-M16 Gate slice ran from cache, and
the whole session had to be discarded. `serve-playtest.py` sends `no-store`.

Every report now carries a `runtime` fingerprint recording the entry radius, band
table and module versions that actually executed. Check it before trusting a
session.

## Confirming the build that ran

Open the exported report and read its `runtime` block **before** reading any
result. All eight module versions below must be non-`null`. A `null` means that
module did not load, which means the session did not test it — whatever the rest
of the report says.

| Field | Should read | Absent means |
|---|---|---|
| `grammarVersion` | `2` | pre-M4 obstacle grammar |
| `varietyVersion` | `1` | no M17 moving walls / gap variation |
| `missionsVersion` | `1` | no M18 missions |
| `powerupsVersion` | `1` | no M19 power-ups |
| `monasProgressionVersion` | `1` | no M32 MONAS gate-driven curve |
| `productIntegrationVersion` | `1` | no M33 — Gate stack **off** by default, Fold-open DPR unmanaged |
| `ritualAscentVersion` | `1` | no M34 Sephirah HUD or clarified Gate copy |
| `sephirahIdentityVersion` | `1` | no M35 per-Sephirah visuals or undertone |

`gateSlice` should also report eight `bandNames` ending in `KETHER`.

The bottom four were added on 2026-08-19 and are the reason this check matters
right now: the Gate fingerprint and the top four versions are **identical with or
without** M32–M35, so before they were added a session that silently ran a
checkout predating the ritual ascent HUD and Living Sephiroth would have produced
a report that looked completely valid. That is the same class of failure as the
discarded 2026-08-12 session, and those four modules are exactly the ones no
human has played yet.

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
