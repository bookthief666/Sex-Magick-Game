# M8 Owner Pilot — Gate Slice on Samsung Galaxy Z Fold 6

Date prepared: 2026-08-04  
Status: ready to run; not yet completed

## Purpose

This pilot answers whether the new Gate slice has obvious problems on the owner's available physical device before unfamiliar-player testing.

It can identify:

- unreadable risk zones or HUD
- misunderstood Gnosis and Gate behavior
- impossible or accidental Gate entry
- obviously poor banking-versus-wager balance
- Void presentation or difficulty problems
- ignored, delayed, or autonomous-feeling input
- closed-versus-open Fold layout failures

It cannot establish broad player appeal because the owner knows the design and development history.

## Required branch

```text
develop/sex-magick-2.0
```

Validated implementation head before documentation:

```text
71d1fedf17b009963c33340a0f102a8886c0ddf5
```

A later documentation-only head is acceptable when the Fast gameplay QA workflow remains green.

## Start the local server in Termux

From the repository root:

```bash
cd ~/Sex-Magick-Game
git fetch origin
git switch develop/sex-magick-2.0
git pull --ff-only origin develop/sex-magick-2.0
python -m http.server 8000 --bind 127.0.0.1
```

If `python` is unavailable:

```bash
pkg install python
```

Keep Termux running and open Chrome on the same Fold 6.

## Primary closed-posture sessions

Run two separate 15-minute sessions, with a break between them.

### Session A — three-step buffer

```text
http://127.0.0.1:8000/tools/gate-slice-playtest.html?buffer=3&tester=OWNER-A&device=Fold%206%20closed&minutes=15
```

### Session B — six-step buffer

```text
http://127.0.0.1:8000/tools/gate-slice-playtest.html?buffer=6&tester=OWNER-B&device=Fold%206%20closed&minutes=15
```

Alternate the order on a later day if the first comparison is close:

```text
6 → 3
```

Do not enable `inputFeedback=1`; the ordinary player should not see `QUEUED`, `WAIT`, or `MISSED` coaching text.

## Optional Fold-open diagnostic

After the closed-posture sessions, run one shorter diagnostic in Fold-open posture:

```text
http://127.0.0.1:8000/tools/gate-slice-playtest.html?buffer=3&tester=OWNER-FOLD-OPEN&device=Fold%206%20open&minutes=10
```

Do not fold or unfold during an active run. Test the existing `POSTURE SHIFT / TAP TO RESUME` contract separately by changing posture once during a disposable run.

Do not combine closed- and open-posture results into one buffer comparison because the geometry and grip differ.

## What to observe without changing the game

During each session, note:

- when the dashed risk boundaries first become understandable
- whether flying near the edge feels intentional or merely dangerous
- whether the meter visibly responds to the intended action
- whether the Gate arrives with enough warning
- whether entering the ring is a deliberate choice
- whether bypassing the ring is clearly understood as banking
- whether the Void feels like a climax rather than visual noise
- whether dying in the Void feels like a comprehensible loss
- whether any buffered jump occurs later than intended
- whether any tap appears ignored

Do not change constants during a session.

## Exported evidence

At the end of each block, complete the questionnaire and download the JSON report.

The report includes:

- Gate offers
- Gate entries
- Gate banks
- Gate entry rate
- Void attempts
- Void survivals
- Void deaths
- completed run count
- selected input buffer
- input counters
- viewport dimensions
- local-only preflight status
- comprehension answers
- replay intent
- open feedback

Upload the JSON reports to the project conversation without editing them.

## Preliminary interpretation

### Gate decision

The provisional target is:

```text
25% ≤ Gate entry rate ≤ 75%
```

For an owner-only pilot, do not treat this as statistical validation. Use it to detect extremes:

- near 0%: entry may be unreadable, too dangerous, or not worth the wager
- near 100%: bypass/banking may be unreadable or the wager may be automatic

### Comprehension

The pilot is promising only when the owner can honestly describe, based on what appeared in the game rather than prior knowledge:

- that risky routes charge the meter
- that the ring presents an enter-versus-bypass decision
- that entry wagers the meter on a lethal phase
- that bypass converts the meter safely

### Buffer comparison

Do not choose six frames merely because it lowers rejections. A longer buffer mechanically converts some rejections into queued actions.

Prefer three when:

- no ignored-input problem is perceived
- no meaningful responsiveness advantage appears at six

Prefer six when:

- three produces clear ignored-input complaints
- six feels more responsive
- six produces no delayed or autonomous-feeling jump
- expired queued actions remain rare

Ambiguous evidence keeps both candidates unresolved.

## Stop conditions

Stop and report immediately when any of these occur:

- the Gate cannot be entered intentionally
- the Gate overlaps hazards in a way that creates an unreadable forced death
- bypass does not bank
- the Void remains nonlethal
- the Void cannot spawn ordinary obstacles
- score or history is submitted remotely
- the HUD obscures the gap on the closed Fold
- a posture change resumes without explicit input
- the game enters a repeated crash/reload loop

## What remains deferred

Do not build or authorize from an owner-only pilot:

- Monas
- more Sephiroth
- new pattern families
- global leaderboard work
- solver expansion
- production deployment
- framework migration

The next code change should respond to observed player evidence, not add another speculative system.
