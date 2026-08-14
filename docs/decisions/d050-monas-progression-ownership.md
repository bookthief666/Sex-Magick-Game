# D-050 — MONAS owns progression by gates, independent of Gate-slice entry

**Status:** Accepted for M32 implementation and Fold 6 validation. Not a release authorization.

## Context

M31 replaced the obsolete tap/jump proof model with the live MONAS HOLD/RELEASE state law and verified a substantial reachability envelope. Its targeted frontier verified the coordinates from `2.9 / 260` through `5.7 / 190`, and the D-048 upper-boundary job fully verified the `5.7 / 190` search ceiling across the complete scheduler-legal pattern-variant pair cross-product.

M31 intentionally changed no live progression values. It also exposed two ownership defects:

1. On the ordinary URL, the base game's score-driven `checkLevel()` still runs during MONAS. Score can therefore advance legacy levels and eventually invoke the base Void even though MONAS is meant to progress through its own rite.
2. With `?gateSlice=1`, the Gate runtime replaces `checkLevel()` and returns for non-HEX runs, so the same MONAS run has different progression semantics depending on a HEX-only query flag. The Gate restart wrapper also creates a Gate state unconditionally after retry, contaminating a restarted MONAS run.

The base loop calls `checkLevel()` when a pillar becomes marked, before `monas-runtime.js` commits the corresponding Coherence pass and increments `monasState.gatesPassed`. Progression therefore cannot safely be implemented by merely rewriting `checkLevel()` to inspect the current gate count.

## Decision

### 1. Gate count is the sole MONAS progression clock

MONAS `checkLevel()` is a no-op. Score, orb bonuses, Warp Surge score multiplication, `currentLevelIdx`, and the optional Gate slice do not advance MONAS difficulty.

The progression layer watches the semantic Coherence pass committed by `monas-runtime.js`. After `gatesPassed` changes, it resolves and applies the MONAS band.

### 2. Ship a conservative subset of the proven M31 frontier

The first live curve is:

| Gates passed | Base speed | Nominal gap |
|---:|---:|---:|
| 0 | 2.9 | 260 |
| 8 | 3.3 | 250 |
| 20 | 3.7 | 240 |
| 36 | 4.1 | 230 |
| 56 | 4.5 | 220 |
| 80 | 4.9 | 210 |

Every speed/gap pair is an exact M31 verified coordinate. `5.3 / 200` and `5.7 / 190` remain validated tuning headroom, not live bands. The hardest M32 base speed becomes `7.105` during the existing 1.45x Warp Surge, below the `8.265` surge at M31's search ceiling and below the game's pre-existing `8.5` maximum-speed scale.

No HEX difficulty value is copied into MONAS. HEX's gate-count curve is only a pacing reference.

### 3. MONAS owns its gap function

For MONAS, the live gap is the current band's nominal gap plus the existing `sin(frames * 0.05) * 10` breathing term. During Warp Surge the resulting gap is widened by the existing `1.18` multiplier. This matches the conditions M31 actually proved.

### 4. Entry-path semantics must be identical

`monas-progression-runtime.js` installs outside the already-installed MONAS runtime. For non-MONAS play it delegates to whatever implementation existed underneath: the base game on an ordinary URL or the Gate wrapper on `?gateSlice=1`.

For MONAS it owns `checkLevel`, `getCurrentGap`, and the post-Coherence progression update. Start and retry normalise Gate residue so a HEX-only bootstrap cannot alter MONAS state.

### 5. Retry is a fresh MONAS run

A MONAS retry resets Coherence, gate count, progression band, base speed, Void flags, held-input state, and any Gate offer/wager residue. The Gate HUD is hidden. The player returns to the `2.9 / 260` opening condition regardless of URL.

## Automated acceptance

M32 must prove in both an ordinary URL and `?gateSlice=1`:

- the progression runtime installs;
- the exact six-band ladder above is applied by gate count;
- setting an arbitrarily high score and calling `checkLevel()` cannot change MONAS progression or enter the Void;
- Warp Surge widens the M32 top live gap from `210` to `247.8` without mutating canonical base speed;
- retry returns to gate 0 / band 0 / `2.9 / 260`;
- Gate residue is absent after start and retry;
- the normalized player-visible progression snapshots from the two URLs are identical.

Unit coverage must also prove the live speed/gap pairs are exactly the first six coordinates of the M31 frontier and that `5.3 / 200` and `5.7 / 190` are not silently promoted into live bands.

## Claim boundary

A green M32 means progression ownership and the selected curve are internally consistent, entry-path invariant, and inside the mathematically verified M31 envelope. It does **not** establish that the pacing feels right, that 80+ gate runs are fun, that Warp Surge is readable at the top band, or that the curve is performant and comfortable on the physical Fold 6.

Those are human/device gates. M32 remains a draft stacked milestone until Fold 6 play confirms pacing, readability, fatigue, and voluntary replay. No merge to `develop`, no merge to `main`, and no deployment is authorized by this decision.
