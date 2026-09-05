# M23 Fold-open session — the first trustworthy measurement of M16 and M17

**Session:** `gate_v2_msr5lko8_9kzdqo` · `OWNER-M23-OPEN` · Fold 6 open ·
`viewportProfile: fold-open` · buffer 3 frames
**Duration:** 601.3s of a planned 10 minutes, ended on the timer
**Raw report sha256:** `e6c17d4f94457079583d2e6eae5b5ea95fdb4e094aa35aec030662a159851c24`

The raw JSON is stamped `local-playtest-only-no-network-transmission` and is **not**
committed — this repository is public. Only derived analysis and the hash live here.

## Provenance

The report's `runtime` block reads `gateEntryRadius: 44`, `gateOuterRadius: 60`,
eight bands ending in `KETHER`, `maxValidatedSpeed 8.5`, `minValidatedGap 110`,
grammar v2, variety v1, missions v1, powerups v1.

That matters: the 2026-08-12 session reported cleanly while running a cached
pre-M16 build, and D-030 added the fingerprint precisely so that could never be
silent again. **This is the first session where M16 and M17 are provably the code
that ran.**

## Results

| Metric | Value | Reading |
|---|---|---|
| Gate entry rate | **62.5%** (10 entries / 16 offers) | M16 predicted 60–65%. Prior baselines: 46.4%, 54.5%. **The aperture fix is confirmed by a human.** |
| Unsafe crossings | **0** across **367 gates cleared** | M17's reachability guarantee held completely |
| Void survival | 70% (7 of 10 attempts) | The wager is a real risk, not a formality |
| Gate banks | 6 (37.5%) | Both branches of the choice are being used |
| Decisions | 16, of which 15 "moved toward" | The offer is being read and acted on, not ignored |
| Avg offer visibility | 96.4 frames | Comfortably above the reaction budget |
| Runs | 10 observed, 9 completed | |
| Best run | 147 gates, reached **KETHER** (band 7) | The M17 extension past GEBURAH is being used |

**Power-ups, previously the open question.** 16 earned (6 from Void survivals, 10
from gates), 13 spent (10 AEGIS absorbs, 3 DISSOLUTION dissolves), ending the
session at zero charges, `dissolveAttemptsWithoutCharge: 0`. D-029 and D-030 flagged
an 11-earned/1-spent imbalance as needing a retune. **It resolved itself once the
power-ups became legible — no economy change is warranted.**

**Missions:** 9 distinct missions completed, including `band.kether` and
`band.geburah`. Working as designed.

## Owner feedback, verbatim where it matters

> "the game has improved a lot and is a lot more fun to play now"

`wouldPlayAnotherRun: yes`, `didGameIgnoreInput: no`.

Three requests, all acted on in M24 or explicitly deferred:

1. *"I still don't see the large set of different background images from the
   original game … and have them change while you're playing like they used to."*
2. Spice the aesthetic further — "more enchanting … with the proper themes".
3. Activate the second mode, consider a third, and get the leaderboard working.

## What this session disproved about my own advice

Runs reached band indices 7, 5, 4, 2, 2, 2, 1, 1, 0, 0 — roughly **24 band
transitions in ten minutes**, about one every 25 seconds.

After M23 I told the owner band changes were rare and to expect the background to
change seldom. **That was wrong, and this data is what showed it.** They should
have seen the background change two dozen times and saw it change zero times,
which is what sent M24 looking for the frozen `currentLevelIdx` rather than
accepting "it's just infrequent". Telemetry corrected a wrong explanation I had
given with confidence.

## Standing risk this session does not address

All 71 background images are still hotlinked from Google Drive; the captured
traffic shows `smRetry=2` retry parameters, and a failed fetch is the reason the
`SIGIL CHANNEL OFFLINE` card ever existed. Hosting is an open decision for the
owner (repo is public / private bucket / pre-cache).
