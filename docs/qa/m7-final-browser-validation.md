# Milestone 7 — Final Browser Validation

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Development branch: `develop/sex-magick-2.0`  
Final browser-tested code head: `6211652d1e033d8624446cec7a70a83de6c77aa9`  
Fast gameplay QA run: `30919867438`  
Job: `92027343121`

> **Scope correction:** This document closes the automated browser gate only. It does not close the R-1 human playtest gate, select a final buffer value, or establish production eight-pixel safety. The Hexagram Gate slice remains paused until the physical-phone protocol in `docs/playtests/r1-input-truth-protocol.md` is completed.

## Result

The exact code head passed the complete fast gameplay gate:

1. syntax checks across the runtime, diagnostics, tests, and browser runners
2. fixed-step deterministic contracts
3. collision and input-truth deterministic contracts
4. local run-telemetry deterministic contracts
5. obstacle-grammar deterministic contracts
6. Milestone 7 review-diagnostic contracts
7. fixed-step Chrome integration
8. real-Player collision/input/touch Chrome integration
9. fault-injected fail-closed policy Chrome integration
10. telemetry/fast-retry Chrome integration
11. obstacle-grammar Chrome integration

## Real-Player input evidence

The Chrome integration executed the actual mobile `Player` runtime and confirmed:

- configured input buffer: `3` authoritative simulation steps
- a tap with one cooldown step remaining queued one intent
- vertical velocity remained unchanged at queue time
- the queued Hexagram impulse fired exactly once on the first legal step
- accepted impulse: `-7.5`
- accepted mobile cooldown: `8` steps
- one cooldown-zero tap fired immediately
- one earlier cooldown tap was explicitly rejected
- no duplicate accepted-jump feedback path was introduced

Recorded input counters:

```text
immediate: 1
buffered: 1
bufferedFired: 1
rejected: 1
expired: 0
coalesced: 0
```

The browser result proves the mechanics of the candidate buffer. It does not show whether three steps or six steps feels better to a person using a physical phone.

The same browser gate reconfirmed:

- player core `#f8fbff`
- Hexagram aura `#00e5ff`
- Monas aura `#ffd700`
- lethal hazard silhouette `#ff2f6d`
- reduced-motion state can be enabled
- low-flash state can be enabled
- full-screen touch still jumps
- control touches remain excluded
- exact-edge collision remains safe
- a multi-step catch-up frame produces only one death transition

## Fault-injected reachability-policy evidence

The test deliberately blocked:

```text
/tools/reachability-policy.js
```

Observed bootstrap state:

```text
status: failed-closed
policyInstalled: false
failClosedInstalled: true
monasSealed: true
```

Observed game behavior:

- Hexagram start control remained enabled
- Monas start control became disabled
- Monas label became `RITE OF MONAS — SEALED`
- forcing an active Monas update paused the game
- pause heading became `RITE SEALED`
- action text became `RETURN TO VOID`
- no unverified Monas pattern was scheduled

This directly closes the production failure mode identified by the independent Opus review. The policy is no longer merely expected to load; absence is now an explicit, tested game state.

## Regression evidence

The same workflow reconfirmed:

- fixed simulation frames remain identical at 60, 90, 120, and 144 Hz
- one RAF chain remains active
- collision and touch contracts remain green
- run telemetry remains local, bounded, and identity-free
- retry begins at exact frame 0 and score 0
- obstacle grammar remains deterministic
- both Rite family cycles remain `safe → pressure → recovery → pressure → climax → recovery`
- forbidden persisted identity fields remain absent

## Claim boundary

Established for development:

- bounded input-intent implementation with URL-tunable candidate values
- real runtime queued, immediate, and rejected paths
- stable gameplay-authoritative contrast
- runtime reduced-motion and low-flash controls
- fail-closed reachability-policy behavior
- no regression across the fast gameplay surface

Still not established:

- whether 3 or 6 steps is the better human-facing buffer
- physical Android and Fold input latency
- physical 60/120 Hz game-feel equivalence
- production eight-pixel safety under per-gate breathing gaps
- active Fold remapping
- Safari and Firefox parity
- a fun Gnosis/Gate/Void wager loop

No merge or deployment is authorized by this result.
