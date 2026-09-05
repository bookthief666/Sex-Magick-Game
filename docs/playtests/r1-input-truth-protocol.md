# R-1 Human Playtest — Input Truth Before the Gate Slice

Date prepared: 2026-08-04  
Status: **retired 2026-08-12 — answered by the M8 owner pilot**  
Branch: `develop/sex-magick-2.0`

> This protocol is no longer a prerequisite for anything. The 2026-08-12 Fold 6
> block (see [`m8-fold6-owner-pilot-results.md`](./m8-fold6-owner-pilot-results.md))
> recorded **1768 immediate inputs and zero buffered, rejected, expired, or
> coalesced ones**, and the owner answered "no" to whether input felt ignored.
> The buffer never engages in ordinary play, so the 3-vs-6 question has no
> measurable difference to decide. **Three frames is the release value.**
> Retained below for the record and for the local-server setup instructions,
> which are still accurate.

## Purpose

This playtest decides human-perception parameters that automated reachability and browser tests cannot settle:

- whether the game appears to ignore input
- whether a 3-step or 6-step buffer is the better release candidate
- whether rejected/expired input is frequent in ordinary mobile play
- whether the current game communicates an understandable objective without explanation

It does not validate obstacle fairness, the future Gate loop, Monas, leaderboard integrity, or release readiness.

## Stop condition

Do not begin the Hexagram Gate/Gnosis/Void slice until this test has been run with:

- three people
- three physical phones
- ten uninterrupted minutes per person
- no explanation of controls, objective, buffer value, or prior findings
- one locally exported JSON report per session

Headless Chrome does not satisfy this gate.

## Conditions

Use only buffer values `3` and `6`.

Suggested assignment:

| Tester | Condition |
|---|---:|
| T1 | 3 simulation steps |
| T2 | 6 simulation steps |
| T3 | Randomly choose 3 or 6 before handing over the phone |

Do not tell the tester which condition is active.

The values remain candidates. A solver tie between 3, 4, and 6 is not evidence that 3 is human-optimal.

## Questions

Ask only these two questions after ten minutes:

1. **Did the game ever ignore you?**
2. **What is the game asking you to do?**

Do not explain terminology or ask leading follow-ups before the answer is recorded.

## Harness

Use:

```text
tools/r1-playtest.html
```

The harness:

- loads the actual branch game in a same-origin iframe
- applies `?inputBuffer=3` or `?inputBuffer=6`
- disables `QUEUED`, `WAIT`, and `MISSED` text during the session
- keeps quiet rejected/expired audio cues available through the game runtime
- resets local input counters when the session begins
- captures lifetime counters across deaths and retries
- runs a ten-minute timer
- asks only the two required questions
- exports one local JSON report
- performs no network transmission

## Running on a phone from a development computer

From the repository root on the development computer:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Open the computer's local-network address on each phone, for example:

```text
http://192.168.x.x:8000/tools/r1-playtest.html?buffer=3&tester=T1
```

Use `buffer=6` for the six-step condition. Optional facilitator parameters are:

```text
&device=Fold%206%20closed
&hz=120
```

The phone and development computer must be on the same local network. Do not expose this temporary server to the public internet.

## Required report fields

The harness exports:

- anonymous tester code
- manually entered device description
- manually selected display refresh setting
- configured buffer value
- actual duration
- viewport dimensions
- score and simulation frames at session end
- current and lifetime input counters
- rejected-input rate
- expired-per-buffered rate
- answers to the two questions

Input counters:

```text
immediate
buffered
bufferedFired
rejected
expired
coalesced
```

Use `lifetime` rather than `current` for the session comparison because `current` resets when the Player instance changes.

## Interpretation

This is a small formative playtest, not a statistical study.

Compare the 3-step and 6-step sessions on:

- whether the tester answered **yes** to ignored input
- rejected count and rejected rate
- expired count and expired-per-buffered rate
- whether the tester described the actual survival/navigation task coherently

Do not select a value solely because it has the smallest buffer or because a machine replay cannot distinguish it.

A buffer candidate may advance only when:

- no tester reports a clearly delayed or autonomous-feeling jump
- ignored-input reports are absent or materially lower than the alternative
- rejected/expired input is not dominating ordinary play

With only three sessions, ambiguous results require another short round rather than a confident generalization.

## UI policy during the test

Player-facing input text is debug-only by default:

```text
QUEUED
WAIT
MISSED
```

It can be enabled for diagnostics with:

```text
?inputFeedback=1
```

or the existing hitbox/debug mode. The human test must leave it disabled so it does not coach, nag, or add visual noise.

## After R-1

Record the three JSON reports and the selected buffer decision before beginning the Hexagram-only vertical slice.

The next slice remains:

```text
precise flight
→ voluntarily clear risk zones
→ accumulate Gnosis
→ summon a visible Gate
→ enter to wager or bypass to bank
→ survive a lethal transformed Void
→ convert the wager or lose it
→ retry immediately
```

The slice's later go/no-go metric is a Gate-entry rate between 25% and 75%. Monas expansion, additional solver infrastructure, Sephiroth expansion, leaderboard replacement, merge, and deployment remain deferred.
