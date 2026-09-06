# D-054 — Promote the completed HEX stack to the normal product path and use a Fold-safe render default

**Status:** Accepted for M33 implementation and physical Fold 6 validation. Not a release authorization.

## Context

The physical Fold 6 validation after M32 exposed a product-level contradiction that automated correctness could not see.

The M16–M29 Claude pass had already built the Gate/Gnosis/Void loop, persistent missions, earned power-ups, Rite Board, gallery rotation, bonus pentagram corridors, restored effects, occult field, and the second MONAS rite. M30–M32 then integrated and proved MONAS entry/reachability/progression. The individual deterministic modules and full CI stack were green.

But the ordinary URL still behaved like an earlier partial product because the mature HEX stack remained behind the historical `?gateSlice=1` experiment flag. Several modules were downloaded on ordinary pages but could not become player-facing without Gate state. The owner therefore saw a much sparser game than the repository history implied.

The same physical Fold session also reported visible lag. M10 defaults the canvas backing to native DPR up to an 8M-pixel budget. At the measured Fold-open geometry (`884×1104`, DPR `2.625`) that allocates roughly `2321×2898`, about 6.7M backing pixels. M12's evidence analyzer had already provisionally selected open-2x rather than open-native, while the closed posture could retain native. The physical report now gives that distinction product relevance.

## Decision

### 1. The full HEX stack is the default product

Ordinary product sessions now behave as though `gateSlice=1` was supplied before any Gate/canvas bootstrap executes. This preserves the already-tested Gate → MONAS → Rite Board wrapper order instead of dynamically installing Gate after MONAS.

The query flag is retained as a diagnostic interface:

- ordinary URL: full HEX stack on by default;
- `?gateSlice=0`: explicit legacy/diagnostic opt-out;
- `?legacyHex=1` or `?productMode=legacy`: explicit legacy opt-out;
- `?visualQa=1`: untouched so M14 named-state visual QA retains its deterministic topology;
- `?telemetryQa=...`: untouched because that fixture deliberately drives the base telemetry/Void/retry primitives rather than product HEX semantics.

M33 does not merge HEX and MONAS semantics. Starting MONAS must still clear Gate state and use the M32 gate-count progression ladder.

### 2. Fold rendering follows posture unless the caller explicitly overrides it

When the caller has not explicitly supplied `renderDpr`, the parser-ordered product integration layer selects `renderDpr=2` only when both are true:

- logical viewport area is at least 700,000 CSS pixels;
- device DPR is greater than 2.25.

This captures the measured Fold-open geometry without depending on UA model strings, which modern Chromium may reduce or omit. Fold-cover geometry remains native by default. Any explicit `renderDpr=css|2|native|...` remains authoritative for the page lifecycle.

A Fold is one device with changing geometry, not two cold-load profiles. M33 therefore owns only the DPR value it injected itself. While that automatic policy is active, a resize from open → cover removes the automatic `renderDpr=2` and refreshes the backing store at native DPR; cover → open restores 2x. If any caller supplies a non-M33 DPR value, the adaptive layer relinquishes ownership rather than fighting it.

This is a conservative posture policy, not a frame-time auto-scaler. Physical Fold evidence still decides whether 2x is smooth enough and whether a different quality/performance policy is warranted.

### 3. Product-facing discoverability should describe the rites that actually exist

The normal menu receives a compact, non-interactive rite manifest:

- HEX · Gate / Gnosis / Missions / Power
- MONAS · Hold / Coherence / Warp

The obsolete network leaderboard test control is hidden from ordinary product UI. The local Rite Board remains the visible board. No shared leaderboard submission is enabled and no network trust claim changes.

The manifest is suppressed under `visualQa=1` so M14 visual construction remains isolated.

### 4. Parser order is part of the correctness contract

`product-integration-runtime.js` is parser-loaded first from `fixed-step-clock.js`, before canvas, assets, MONAS progression and the later fixed-step product bootstraps. Its synchronous URL normalization therefore happens before the Gate bootstrap inspects `location.search`.

This avoids the unsafe alternative of loading Gate after MONAS, which would reverse wrapper order and reopen the Void/shield/MONAS ownership problems the earlier milestones explicitly solved.

The adaptive resize listener is registered at that same early boundary. It updates the M33-managed query synchronously before later viewport/render resize listeners observe the new posture; the render refresh is retained as a fail-safe rather than as the only update path.

## Automated acceptance

M33 must prove:

- ordinary product URL gains `gateSlice=1` before Gate bootstrap;
- Fold-open `884×1104 @ 2.625` gains `renderDpr=2` and the canvas actually uses effective DPR 2;
- Fold-cover `368×869 @ 2.625` keeps native unless explicitly overridden;
- an in-page open → cover transition returns to native DPR and cover → open returns to 2x;
- explicit Gate/render choices are never overwritten;
- visual QA and the low-level telemetry fixture are not product-default-mutated;
- Gate preflight, Gate runtime, missions, power-ups, Rite Board, MONAS and M32 progression all install on the normal product path;
- starting HEX creates Gate state and surfaces three missions;
- starting MONAS creates MONAS state, clears Gate state and retains zero Gate residue;
- no LootLocker request is initiated by the default M33 local product bootstrap before play;
- inherited obstacle, missions, power-up, occult-art, MONAS and Rite Board deterministic contracts remain green;
- M32 MONAS progression parity remains green.

## Claim boundary

A green M33 establishes product-path integration and a safer posture-aware rendering policy. It does **not** establish that the Fold 6 is now smooth, that 2x is the final shipping DPR, that every Claude-era feature is visually strong enough, or that the game is release-ready.

The next physical Fold block must compare the new ordinary URL directly against the M32 physical report, specifically checking frame smoothness in both postures and during a live fold/unfold, Gate/missions/power-up discoverability, background/gallery turnover, bonus corridors, band-change punch, MONAS feel, and whether the two rites now read as a coherent finished product rather than hidden subsystems.

No merge to `develop`, no merge to `main`, and no itch.io deployment is authorized by this decision.
