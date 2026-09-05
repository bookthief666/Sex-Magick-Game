# M8 Gate Slice — Fold 6 Owner Pilot Results

Session: `gate_v2_mspvxn5n_rzqst5`
Date: 2026-08-12, 09:26:47 → 09:41:48 UTC
Tester: `OWNER-A` · Device: Samsung Galaxy Z Fold 6, **open** posture
Protocol: `gate-slice-playtest-v2`, schema 2
Configuration: `buffer=3`, `viewportProfile=fold-open` (forced), 15 minutes
Actual duration: 900.4 s · End reason: timer

Status: **complete**. This is the first human playtest evidence in the project's
history. Fifteen prior milestones were built without it.

## Raw report handling

The raw V2 report is stamped
`privacy: local-playtest-only-no-network-transmission` and this repository is
public. The report is therefore **deliberately not committed**. It remains on the
owner's device.

```text
file:   gate-slice-playtest-v2 export, session gate_v2_mspvxn5n_rzqst5
bytes:  355053
sha256: 8c07727b01b0a6da1bc64b77742708d16aed6732412607e4dc8ec4cfa9d07373
```

Everything below is derived from that file. Any future re-analysis should verify
the hash first.

## Session totals

| Metric | Value |
|---|---|
| Runs observed | 15 (14 completed) |
| Gates cleared | 507 |
| Gate offers | 28 |
| Gate entries | 13 |
| Gate banks | 15 |
| **Gate entry rate** | **46.4 %** |
| Void attempts / survivals / deaths | 13 / 9 / 3 |
| Void survival rate | 69.2 % |
| Unsafe crossings | 4 (see *Cleared as non-issues*) |
| Median run length | 48.4 s |
| Gates per run | 4, 6, 6, 7, 7, 11, 14, 34, 37, 41, 53, 64, 64, 78, 81 |

## Decision quality

| Metric | Value |
|---|---|
| Offers where the player moved toward the Gate | 27 / 28 |
| `deliberateEntryProxy` | 13 / 13 entries |
| Decision window visible | 91–133 frames (median 113 ≈ 1.9 s) |

The one offer with no movement toward the Gate (serial 22) started with the
player already aligned to within 1.22 px, so there was nothing to move toward.
Effective tracking is **28 / 28**.

## Owner's written answers

> **What is the game asking you to do?**
> To avoid crashing and to engage with challenges for more points

> **What did the meter mean?**
> It showed when I was going to encounter a chance for a challenge

> **What did the Gate mean?**
> Its a change for a challenge

> **Did input feel ignored?**
> no

> **Would you voluntarily play another run?**
> yes

> **Open feedback**
> It was fun cause its somewhat difficult, however this is obviously a
> prototype, it could definitely be really good if it takes some ideas from
> flappy bird or other games to add variety or more ways to play and be
> challenged maybe with moving walls, or different types of walls, or items that
> give you a shield, and another one thst lets you destroy the next wall coming
> up, etc also if it refines its aesthetic to be way more creative with its
> proper occult themes and symbology, intricate and maybe glitch and esoteric
> and electric and so on,

## Interpretation

**The Gate passes.** 46.4 % entry sits at the centre of the 25–75 % band that
D-018 set as the threshold for "this is a real decision rather than a formality".
Comprehension is confirmed in the owner's own words. Retention intent is
affirmative. The Gate/Void economy supplied roughly 45 % of total score in long
runs, so the mechanic is load-bearing rather than decorative.

**But the 46.4 % is a success rate, not a decision rate.** The player moved
toward the Gate on every offer where movement was possible. Banking is
overwhelmingly a *failure to reach*, not a choice to decline. The Gate as built
is a **skill challenge**, not a wager. That is a legitimate and arguably stronger
design — it matches the trick-system model rather than the gambling model — but
the design language in D-018 and the in-game telegraph
(`THE GATE OPENS · ENTER TO WAGER / PASS TO BANK`) should follow the evidence.

## Defects found

### 1. The entry aperture does not match the drawn ring — *blocking*

`createGateOffer` builds the offer with `innerRadius: 31`, `outerRadius: 52`.
The hit test is `distance <= offer.innerRadius`. The player aims at a 52 px ring
and must hit a 31 px core.

Bank distances are cleanly bimodal:

```text
entries        26.61 … 34.48 px   (n=13)
near banks     31.08 … 41.95 px   (n=5)   ← inside the drawn ring
  ── gap: nothing between 42 and 82 px ──
far banks      82.17 … 237.73 px  (n=10)
```

The five near banks are a distinct population, not a tail. One missed the
aperture by **0.08 px**. Corrected for the drawn radius, intent rate is
**64.3 %**.

### 2. Difficulty ends at gate 32 — *blocking*

`BANDS` caps at GEBURAH (speed 6.2, gap 145). Eight of fifteen runs went past
that threshold. **196 of 507 gates cleared — 38.7 % of all play — happened on a
permanently flat curve.** This, not a shortage of mechanics, is the primary cause
of the owner's request for "more variety".

### 3. Gate placement is a two-position alternation

`gateSerial % 2 === 1` places every Gate at either 0.36 or 0.64 of canvas height.
All 28 offers landed on exactly two Y values: 296.28 and 526.72. There is no
positional variety and no seeding.

### 4. Clear classification is sampled after the fact

`handleClearedPillars` reads `gameInstance.player.y` once the pillar is already
marked passed, not at closest horizontal approach. At fall speeds up to 11
px/frame this misattributes the zone of every clear, biasing Gnosis accrual.

### Minor

- `risk-bottom` is near-dead content: 16 of 507 clears (3.2 %) against
  `risk-top` at 251 (49.5 %). Re-measure after defect 4 is fixed before
  rebalancing.
- The near-miss bonus fired 6 times in 507 clears (1.2 %) and contributed 1
  point to the best run.
- Risk was active on 419 of 507 clears (82.6 %), so "risk active" is closer to a
  default state than a special one.

## Cleared as non-issues

**The four unsafe crossings are a measurement artifact, not a collision failure.**
They are a direct consequence of defect 4: sampling player Y after the collision
window has closed trivially produces readings of −0.275 to −6.061 px. The
decisive evidence is that **zero of the 507 credited clears had negative
clearance** — the harness correctly withholds credit, and the base collision test
runs on the true rect every frame during overlap. Fixing defect 4 should drive
this count to zero.

**The input buffer never engaged.** Across 1768 inputs: 1768 immediate,
0 buffered, 0 bufferedFired, 0 rejected, 0 expired, 0 coalesced. The owner never
tapped inside the 8-frame mobile jump cooldown. The 3-vs-6 frame comparison the
protocol called for is therefore **unanswerable and moot** — at `buffer=6` every
counter would read identically.

**Decision: the input-buffer question is closed. Keep 3 frames. Do not run the
`buffer=6` block.** This retires `docs/playtests/r1-input-truth-protocol.md` as a
prerequisite for anything.

## Protocol deviations

- Only the **fold-open** posture was tested. `m9-fold6-v2-pilot.md` designates
  fold-open as a 10-minute diagnostic and fold-closed as the primary comparison
  posture. Owner has since designated **both postures first-class**, so
  fold-closed coverage is now owed as its own block rather than as a correction.
- Forced viewport measured 707 × 823 at DPR 2.625; `fold6Detected` was `false`,
  so the profile came from the URL parameter rather than device detection.
- Only one buffer arm was run. Superseded — see above.

## Stop conditions

None triggered. Specifically checked:

- HUD did not obscure the play corridor
- text remained readable
- no unsafe crossing increased score or gate count (verified: 0 of 507 credited
  clears had negative clearance)
- session totals continued past 20 runs correctly (15 runs, no truncation)
- the Gate was intentionally entered and intentionally bypassed
- no report was transmitted remotely by the harness

## Consequences

This report authorises M16 (Gate fairness and measurement truth) and, on its
completion, M17–M21. See the build plan for sequencing. Nothing here authorises
Gate *tuning* — the risk-zone balance, near-miss threshold, and 10× / 3× wager
ratio stay untouched until defect 4 is fixed and the numbers are re-measured.
