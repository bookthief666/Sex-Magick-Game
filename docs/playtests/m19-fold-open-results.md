# M19 Session — Fold 6 Open, 10 minutes

Session: `gate_v2_msqolaw8_mnbshv`
Date: 2026-08-12, 22:49:00 → 22:59:01 UTC
Tester: `OWNER-M19-OPEN` · Device: Samsung Galaxy Z Fold 6, **open** posture
Configuration: `buffer=3`, `viewportProfile=fold-open`, 10 minutes
Actual duration: 600.3 s · End reason: timer

Status: **partially invalid.** Missions and power-ups were measured. The Gate
slice was not — a cached pre-M16 copy of `gate-slice-runtime.js` executed instead.

## The build that actually ran

Three independent proofs that M16 and M17 were not in play:

1. **All 22 Gate offers landed on exactly two Y values**, 296.28 and 526.72, in
   perfect alternation. Those are `0.36 × 823` and `0.64 × 823` — the
   `gateSerial % 2` formula M16.2 replaced. Seeded placement produces 12 distinct
   values from 12 draws.
2. **A run cleared 83 gates and stayed at `bandIndex` 3.** Under M17's band table
   that is band 5 (BINAH); `getBandIndex(83) === 5`.
3. Running the tree directly at the same commit reproduces neither result, so the
   code on disk was correct and the browser was executing something else.

Meanwhile `missions` and `powerups` reported in full. Those files did not exist
before M18/M19, so they had no cache entry and were fetched fresh. Previously
fetched modules were served from the browser's heuristic cache, which
`python -m http.server` invites by sending no `Cache-Control` header.

**Consequence:** M16 and M17 remain unmeasured. The fix is
`tools/serve-playtest.py` plus the runtime fingerprint now embedded in every
report — see D-030.

## Valid results

### Power-ups work mechanically, and are oversupplied

| Metric | Value |
|---|---|
| Charges earned | **11** (4 from Void survivals, 7 from gate milestones) |
| Charges spent | **1** (a single AEGIS absorb) |
| **Wasted** | **10** |
| DISSOLUTION uses | **0** |
| DISSOLUTION taps with no charge | **0** |
| Unlocks witnessed | AEGIS, DISSOLUTION |
| Highest band | 3 (capped by the stale build) |

Two findings sit underneath those numbers.

**The breaker button was never touched.** Not once, not even while empty. A
control in the bottom-left corner of a game where the whole screen is a jump
surface simply does not get pressed.

**The waste is partly structural.** Charges reset each run, and the gate milestone
sits at 25 clears, so a charge often arrives after the difficult stretch it would
have helped with and is then discarded at the next death. Real M17 caps would
oversupply further, since band 3 held AEGIS to 2 and DISSOLUTION to 1.

### Missions work

Six completed inside ten minutes — `gates.total`, `climax.cleared`, `run.abstain`,
`run.gates`, `nearmiss.total`, `band.geburah` — with rotation and the recent-ring
behaving. Left active at session end: ACCEPT THE WAGER 7/10, WALK THE PATH 27/150,
ATTAIN KETHER 0/1.

### Session variance on an unchanged Gate slice

This session and the 2026-08-12 pilot ran **the same Gate code** and returned:

| Session | Duration | Offers | Entry rate |
|---|---|---|---|
| `gate_v2_mspvxn5n_rzqst5` | 15 min | 28 | 46.4 % |
| `gate_v2_msqolaw8_mnbshv` | 10 min | 22 | 54.5 % |

**An 8-point spread from identical code.** That is the metric's natural
session-level noise at n≈25, and it is the right lens for reading the eventual
real M16 measurement: a single session moving from 46% to 55% would prove nothing
on its own.

### Other observations

- 350 gates cleared across 9 runs; gates per run 2, 13, 19, 20, 24, 49, 59, 81, 83.
- Median run 48.9 s — unchanged in character from the first pilot.
- **Input: 1169 immediate, 1 buffered, 1 fired, 0 rejected, 0 expired.** The buffer
  engaged once in 1170 inputs. D-026's decision to close the buffer question at
  three frames stands.
- One unsafe crossing in 350 clears, on the stale sampling code, so it says nothing
  about M16.3.

## Owner's report

> **What is the game asking you to do?**
> To avoid crashing, and to take on challenges

> **On the power-ups**
> it wasn't clear when I had acquired the powerups or shields etc and when they
> were activated, the avatar should maybe start glowing or generate an actual
> visual thin neon shield when it one gets protection, also the other power up was
> also vague in terms of when one got it and what it did

> **Direction**
> refining the game by takin more inspiration from the best games in this category
> and by adding what might improve the game based on such research

> Input ignored: **no** · Would play again: **yes**
> "The game has definitely improved, just needs a bit more refinement"

That first comment explains `dissolves: 0` completely. It is a legibility failure,
not a design failure — the player cannot use what they cannot see.

## Consequences

Authorises M20: the no-cache server and runtime fingerprint, deletion of the
breaker button in favour of automatic firing, and ward rings drawn on the avatar
itself. See D-030.

**Explicitly deferred:** the power-up economy is not retuned. Retuning against a
legibility bug would tune the wrong variable, and the band cap means these numbers
understate real supply anyway. Gate tuning also stays frozen — M16 and M17 have
still never been observed by a human.
