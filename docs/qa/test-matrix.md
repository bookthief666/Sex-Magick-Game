# SEX MAGICK 2.0 — QA Test Matrix

Baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Development branch: `develop/sex-magick-2.0`

Record for every run:

- exact commit SHA
- browser and browser version
- OS/device
- display refresh rate
- viewport CSS pixels
- device-pixel ratio
- itch iframe or direct hosting
- network profile
- console errors/warnings
- failed network requests
- Rite
- score, duration, gates, Orbs, Void pickups

## 1. Platform matrix

| ID | Platform | Viewport / posture | Priority |
|---|---|---|---|
| D-CHR | Desktop Chrome | 1440×900, 60 and 120+ Hz where available | Required |
| D-SAF | Desktop Safari | 1440×900 | Required before release |
| D-FF | Desktop Firefox | 1440×900 | Required before release |
| A-PHONE | Android Chrome | narrow portrait, approximately 390×844 | Required |
| A-LAND | Android Chrome | phone landscape | Required |
| F-CLOSED | Samsung Fold 6 closed | narrow portrait | Required |
| F-OPEN-P | Samsung Fold 6 open | wide/square portrait posture | Required |
| F-OPEN-L | Samsung Fold 6 open | landscape posture | Required |
| IOS | Mobile Safari | representative recent iPhone | Required before release |
| ITCH | itch.io embed | desktop and mobile | Required before publication |

## 2. Baseline smoke test

For each required platform:

1. Clear site data for a true first-run test.
2. Load the game.
3. Record time until Rite buttons are interactive.
4. Confirm failed images/audio do not permanently block the menu.
5. Confirm menu is readable and buttons are reachable.
6. Start Rite of Hexagram.
7. Perform ten inputs.
8. Pass the first obstacle.
9. Collect one Orb where practical.
10. Pause and resume twice.
11. Resize or change posture once during play where supported.
12. Die by obstacle and by floor in separate runs.
13. Confirm final score and personal best behavior.
14. Restart five consecutive times.
15. Return to menu.
16. Start Rite of Monas and repeat core movement/collision checks.
17. Review console and network logs.

## 3. Control tests

| Test | Expected result |
|---|---|
| Space during play | Exactly one jump impulse and one feedback event |
| Space outside play | No gameplay mutation |
| Mouse/touch on UI button | Button action only; no accidental jump |
| Touch in clearly active play area | Immediate jump |
| Touch in visually inactive area | Either accepted consistently or explicitly communicated as inactive |
| Rapid taps | Cooldown is predictable; no stuck input |
| Escape during play | Pauses |
| Escape while paused | Resumes |
| Hidden-tab return | No giant simulation jump or duplicate loop |
| Fold posture/orientation change | Controls remain aligned and simulation difficulty is preserved |

## 4. Simulation consistency tests

Run equivalent timed samples at 60 Hz and 120+ Hz.

Measure:

- jump apex time and height
- fall time from a fixed starting state
- obstacle pixels traveled per real second
- obstacles spawned per real minute
- Void duration in real seconds
- score opportunity rate

Acceptance target after Milestone 1: values remain within ±2% across refresh rates, excluding human input variance.

## 5. Collision tests

Enable a debug hitbox overlay before accepting collision work.

- graze visible top pillar edge
- graze visible bottom pillar edge
- pass exact center
- collide at leading edge
- collide at trailing edge
- test during pillar breathing movement
- test after resize
- test at minimum intended gap
- test both Rites

Acceptance:

- visible and collision silhouettes agree
- near misses are visually legible
- no impossible transition is emitted by the generator
- no collision occurs while the player is visibly clear beyond the agreed tolerance

## 6. Loading and external failure tests

Test with normal, slow, offline-after-load, and blocked-origin conditions.

Block individually:

- Tailwind CDN
- Google Fonts
- Google Drive images
- jsDelivr audio
- LootLocker

Expected:

- critical play remains available without optional services
- loading completes exactly once
- menu does not remain stuck
- audio failure is bounded and does not create an infinite retry loop
- leaderboard failure is explained without blocking play

## 7. Audio tests

- autoplay permitted/blocked
- music toggle before run
- music toggle during run
- pause/resume
- game-over music transition
- return-to-menu transition
- unsupported FLAC/M4A/MP4/WAV handling by browser
- five track changes without silence caused by an uncaught error
- SFX disabled means no oscillator creation
- no unhandled `play()` promise rejection

## 8. Persistence tests

- first run with empty storage
- new personal best
- non-best run
- reload retains best and settings
- malformed `93protocol_settings` JSON does not crash startup
- storage unavailable/private mode fails gracefully
- schema/version migration test once introduced

## 9. Leaderboard tests

Do not call a leaderboard “verified” without network evidence.

### Fetch

- valid guest session
- missing/expired token
- empty board
- non-empty board
- unexpected response schema
- timeout
- CORS failure from itch origin
- backend 4xx/5xx
- malicious remote display name rendered as text, never HTML

### Submission

- valid run
- score zero
- negative score
- non-integer score
- impossible score rate
- impossible pickup counts
- empty/invalid name
- markup/script name
- duplicate run ID
- repeated submission/rate limit
- old game version
- wrong Rite/category
- timeout after request where client cannot know whether write succeeded
- backend unavailable

### Competitive acceptance

- separate Hexagram and Monas categories
- exact score formula documented
- server timestamp and version stored
- run duration sanity checked
- duplicate and rate controls active
- suspicious results quarantined rather than trusted
- no privileged secret in browser code

## 10. Performance tests

Measure, do not infer:

- interactive load time
- transferred bytes by origin/type
- steady FPS at early, middle, and high-intensity run
- long-frame count
- memory after 1, 5, 15, and 30 minutes
- object-array sizes over time
- CPU/thermal behavior on phone and Fold
- performance with effects enabled and reduced

## 11. Release gate

The itch.io build may be replaced only when:

- the release branch maps to an exact commit
- required platform smoke tests pass
- console errors are reviewed and dispositioned
- loading failure tests pass
- simulation consistency target passes
- collision captures pass review
- leaderboard is either production-safe or explicitly disabled/noncompetitive
- rollback ZIP/build is archived
- release notes and deployment steps are committed
- draft PR includes tests, known limitations, and rollback instructions
