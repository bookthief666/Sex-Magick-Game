# D-055 — Make the existing ascent read like a rite before adding another mode

**Status:** Accepted for M34 implementation and physical Fold 6 validation. Not a release authorization.

## Context

M33 recovered the actual mature product path: the ordinary URL now exposes the completed HEX Gate/Gnosis/Void stack, persistent missions, earned power-ups, Rite Board and MONAS while using a Fold-safe posture-aware render policy.

That closes the branch-recovery problem. The next question is no longer whether the Claude-era systems exist; it is whether the game communicates and dramatizes the systems it already has.

The last trustworthy ten-minute Fold-open Gate session is important here. It recorded 367 safe gate clears, 62.5% Gate entry, 70% Void survival, 16 power-up charges earned / 13 spent, nine distinct missions completed, a 147-gate KETHER run, and affirmative replay intent. That evidence specifically says the power-up economy no longer needs the retune earlier notes had proposed once the effects became legible. The owner feedback instead asked for the experience to become more enchanting and more thematically deliberate.

D-026 also left a semantic debt: observed Gate behavior reads primarily as a skill challenge, while product copy continued to say `ENTER TO WAGER`, `WAGER ACCEPTED`, `WAGER LOST`, `ACCEPT THE WAGER`, and `REFUSE THE GATE`. The mechanics are still a risk/reward stake — entering commits accumulated Gnosis to the Void — but the language overemphasized gambling terminology and underexplained the actual choice.

## Decision

### 1. Do not retune proven systems in this milestone

M34 changes no physics, collision geometry, Gate radius, scoring multiplier, band threshold, speed, gap, mission target, mission rotation, power-up capacity, power-up earning cadence, MONAS progression coordinate, or leaderboard rule.

The current evidence is strong enough to justify improving presentation while holding those variables stable.

### 2. Make the Tree ascent continuously legible

HEX receives a lightweight DOM-only ascent layer attached to the existing Gate HUD.

For each live band it shows the conventional English meaning already implied by the Sephirah name:

- MALKUTH · KINGDOM
- YESOD · FOUNDATION
- TIPHARETH · BEAUTY
- GEBURAH · SEVERITY
- CHESED · MERCY
- BINAH · UNDERSTANDING
- CHOKMAH · WISDOM
- KETHER · CROWN

The same row shows the next Sephirah and exact gates remaining. This is derived from `SexMagickGateSlice.BANDS`; no second progression table is introduced.

A short ceremonial banner appears when HEX begins and whenever the real Gate band index changes. It uses the already-active level accent and DOM/CSS only — no additional full-canvas passes, gradients or per-frame particles — so the aesthetic gain does not spend the Fold fill-rate budget M33 just recovered.

The layer is hidden for MONAS, menus, visual QA and low-level telemetry QA.

### 3. Explain the Gate as a choice the player can act on

Player-facing Gate copy changes presentation only:

- `THE GATE OPENS · ENTER TO WAGER / PASS TO BANK`
  → `GATE OPEN · ENTER → VOID ×10 / PASS → BANK ×3`
- `WAGER ACCEPTED × N`
  → `VOID TRIAL · STAKE × N`
- `WAGER LOST × N`
  → `VOID FAILED · STAKE LOST × N`

The multipliers were already real mechanics; M34 surfaces them at the decision point instead of asking the player to infer what the choice means.

Mission presentation is normalized without changing mission IDs or persistence:

- `ACCEPT THE WAGER` → `ENTER THE GATE`
- `REFUSE THE GATE` → `BANK THE GNOSIS`

This is a DOM presentation layer. Stored mission IDs, counters and completion semantics remain byte-for-byte compatible.

### 4. Preserve accessibility and diagnostic isolation

The ceremonial banner uses no canvas rendering. Reduced-motion sessions receive no arrival animation and a shorter static display. The layer is not loaded at all under `visualQa=1`, preserving the deterministic visual-state topology, and is not loaded under `telemetryQa`, preserving M33's low-level lifecycle boundary.

Explicit `gateSlice=0` / legacy product sessions also do not load the layer.

## Automated acceptance

M34 must prove:

- its eight ritual themes exactly match the actual live HEX band order;
- next-band gate counts derive from the real Gate thresholds;
- Gate decision copy exposes `VOID ×10` and `BANK ×3` and contains no legacy `WAGER` wording at the offer;
- mission display normalization changes wording only, not mission IDs or targets;
- a normal Fold-open product boot still receives M33 `gateSlice=1` and `renderDpr=2` defaults;
- starting HEX shows MALKUTH / KINGDOM and the next YESOD threshold;
- driving the real `game.checkLevel()` path to six gates produces YESOD / FOUNDATION and a ceremonial transition;
- switching to MONAS hides all ascent UI and leaves MONAS with no Gate residue;
- M34 creates no LootLocker request;
- visual QA does not request the M34 runtime at all;
- inherited M33 product integration and M30 MONAS standard-entry tests remain green;
- the complete Fast gameplay QA suite remains green before this milestone is considered ready for physical play.

## Claim boundary

M34 is a game-feel and communication milestone, not a claim that the game's aesthetic ambition is complete. It establishes that the existing Tree progression and Gate choice are more legible and ceremonially framed without changing gameplay truth.

Physical Fold 6 validation still decides whether the new banner is beautiful rather than distracting, whether the ascent row is readable at both postures, and whether the Gate choice now communicates itself immediately in actual play.

A third rite remains deferred. The current two rites should read as finished, coherent experiences before additional mode breadth is added.

No merge to `develop`, no merge to `main`, and no itch.io deployment is authorized by this decision.
