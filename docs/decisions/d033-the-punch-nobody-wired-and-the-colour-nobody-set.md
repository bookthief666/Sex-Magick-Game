# D-033 — The level-up punch nobody wired, and the colour nobody set

Date: 2026-08-13
Status: Accepted

## Decision

Two fixes, found by reading the code the owner's complaint pointed at rather than
re-measuring the same rendering path a third time.

**`checkGateSliceBand()` now gives a real band change the original level-up's
punch** — 12px shake, a 3-frame freeze, the RGB-split glitch, a 30-particle burst
in the new band's own accent, and haptics — matching exactly what the original
score-based `checkLevel()` did on every level-up, before the Gate slice replaced
it.

**Every level the Gate slice can actually show now has a real accent colour.**
`originalLevels` — the 11 Sephirah-named images `prepareOrderedLevels` draws the
8 in-game bands from — never had an `accent` field. `MASTER_POOL` now builds them
through the same `palette` cycle `newImageIDs` already used, hoisted so both pools
share it.

## Why the owner still saw nothing after M22

M21 and M22 fixed how the field renders. Neither fixed what drives it, and the
owner's report — "I still don't see the backgrounds changing, glitch effects seem
missing" — pointed at both, once actually investigated rather than re-tested:

**The event was disconnected.** `gate-slice-runtime.js` (M16, months before the
aesthetic pass) overrides `Game.prototype.checkLevel` and
`Game.prototype.prepareLevels`. In `gameMode === 'HEX'` — the mode actually
played — this collapses the level pool to 8 band-matched images and ties changes
to Gate clears (6/16/32/48/68/92/120), not score. The replacement, `applyBand()`,
only updated the HUD and `--primary`; the shake, freeze, glitch, and particle
burst the original `checkLevel()` did on every level-up never carried over. That
architecture is not being revisited — the owner explicitly chose to keep
background variety at 8 images and to restore the punch on band changes only, not
on every gate cleared.

**The data was missing, and every M21/M22 test masked it.** `originalLevels`
entries are `{ name, id }` — nothing else. `img`/`loaded` get added later by
`preloadAllImages()` mutating in place, but `accent` never does. Since
`prepareOrderedLevels` draws every in-game band exclusively from this pool, **all
8 real backgrounds had `accent === undefined`.** Canvas silently ignores an
invalid `strokeStyle` assignment and keeps whatever was drawn last; CSS ignores an
invalid custom-property value the same way. So the tunnel never actually changed
colour, the HUD text colour never actually updated, and `applyAccentWash` — which
explicitly bails when there is no accent to wash with — never fired, in real
gameplay, on any band, ever. This is not new: it predates every milestone in this
session.

It went unnoticed through two milestones of my own testing because every test —
the M21/M22 browser suite's turnover check, and the screenshots sent to the
owner — used a stubbed image and hand-set accents (`forceBand`, or literal hex
values assigned directly to `game.gameLevels[i].accent`) to exercise the
rendering path in isolation. That is a legitimate way to test rendering, but it
never exercised the *real* data path, so it could not have caught data that was
never there.

## Verification

The fix was proven against the real, unforced data path rather than synthetic
values, specifically to close the gap that let this go unnoticed twice:

- `tools/browser-gate-slice-test.mjs`: drives `gatesCleared` across a real band
  boundary via `game.checkLevel()` (not `bandIndex` set directly, which bypasses
  the transition branch entirely) and asserts shake, hitStop, the RGB-split
  glitch, a 30-particle burst in the new band's actual accent, and haptics. A
  second case proves a gate clear that stays inside the same band does none of
  that — the owner's choice was punch-on-band-change only. A third check asserts
  **all 8 in-game levels** — not just the one exercised by the transition test —
  have a real `#rrggbb` accent, as a regression guard against this exact class of
  defect recurring on a different band.
- `browser-m21-aesthetic-test` and `browser-m17-obstacle-variety-test` pass
  unchanged with the real (no-longer-undefined) accent flowing through.
- 24 fast suites, 15 browser suites (12 unchanged, plus the extended
  gate-slice and aesthetic suites) all green, including
  `browser-m11-performance-budget-test` 3/3 — this fix adds work only on a rare
  event and reuses engine mechanics (shake/hitStop) that already fire every orb
  pickup, so no budget impact was expected or measured.
- Cross-screen at both Fold postures: the same eight blocked-host
  `ERR_TUNNEL_CONNECTION_FAILED`/`ERR_CONNECTION_RESET` failures as `65a0f9c`,
  `8559a7f`, and `9cd4217`. Unchanged, environmental.

## Consequences

The owner's next test session should see the punch when a band changes, and see
the tunnel, HUD, and field actually change colour with it — which none of the
three prior aesthetic commits could have shown, because the colour was never
there. It should not, and is not meant to, make band changes frequent: reaching
YESOD alone still takes 6 gate clears, and the owner chose to keep it that way.
`__SEX_MAGICK_GATE_SLICE__.forceBand(n)` remains available in the console for
anyone who wants to see every band without playing to KETHER.

## Still open

The 28 M14 visual signatures remain deleted and must be re-established from a
green CI run before release. The field has still never been seen on the Fold 6
itself — that session is now the first one where the visual claims being tested
actually match what the code does.
