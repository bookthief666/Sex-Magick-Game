# D-058 — Compose D-045's geometry accommodation with D-053's progression ladder

**Date:** 2026-08-20
**Status:** Accepted for implementation and physical Fold 6 validation; not a release
authorization

## Context

D-057 measured and deliberately left red a defect from the M34 merge: D-053's
six-band MONAS speed ladder (`tools/monas-progression-runtime.js`) was overwriting
D-045's portrait-phone speed accommodation (`tools/monas-runtime.js`'s
`adjustForScreenSize` wrapper) every time it applied a band. On the owner's primary
target — a Fold in portrait — MONAS ran at 2.61 rising only to 3.17 across the full
ladder, where the curve specifies 2.9 rising to 4.9: a 35% shortfall at the crown
band while the corridor still narrowed on schedule. Full measurements, the root
cause, and three options are in `docs/qa/m35-monas-progression-conflict.md`.

Choosing among those options changes live difficulty numbers, which the project's
contract reserves for the owner rather than a unilateral call. The owner chose
**option 1: compose them** — apply the portrait accommodation as a factor on top of
the ladder rather than letting either side win outright.

## Decision

`monas-progression-runtime.js`'s `applyProgression()` no longer assigns
`gameInstance.gameSpeed = band.speed` directly. A new `geometrySpeedFactor()` reads
`__monasGeometryBaseSpeed` — the value `monas-runtime.js`'s `adjustForScreenSize`
wrapper already captures, unmutated, from whatever the base game's own screen-size
rule decides — and divides it by the shipped desktop base
(`CONFIG.INITIAL_GAME_SPEED`, 2.9). Every band speed is multiplied by that ratio
before being assigned. On desktop the ratio is 1 and every value ships exactly as
D-053 authored it. On the portrait Fold viewport the ratio is 0.9, so the six live
pairs become:

| Gates | Old (D-053 alone) | Composed |
|---:|---:|---:|
| 0  | 2.9 | 2.61 |
| 8  | 3.3 | 2.97 |
| 20 | 3.7 | 3.33 |
| 36 | 4.1 | 3.69 |
| 56 | 4.5 | 4.05 |
| 80 | 4.9 | **4.41** |

Gap is untouched — it was never the part in conflict.

`tools/browser-m32-monas-progression-test.mjs` (the test D-057 left red on purpose)
is updated to assert the composed values instead of the raw ladder literals, since
it runs at the same portrait viewport (884×1104, mobile UA) the conflict was
measured at.

## Consequences

Every composed pair remains **below** M31's verified frontier at an equal-or-wider
gap for every band — the M31 evidence model (`monas-reachability.js`) already proves
2.9/260 through 4.9/210 reachable at an 8px margin, and running slower at the same
or wider corridor stays inside that envelope by the same reasoning D-057 used to
call the pre-fix numbers conservative rather than unsafe. Re-ran the bounded M31
audit after this change (84/84 ordinary, 84/84 surge, 144/144 composition, 0
concerns) as a smoke check; the full frontier/boundary CI workflows should still run
at least once against this exact change before it's treated as settled, since they
cover the search ceiling this composition doesn't touch.

This is a real tuning change, not a bugfix that restores an agreed value — nobody
designed for 4.41 at the crown band specifically, it is what falls out of composing
two independently-authored numbers. It does **not** establish that 4.41 feels
correct, only that it is reachable and closer to both authors' intent than either
side winning outright. The escalation shape D-053 designed (six increasing bands)
is preserved; its absolute magnitude on portrait is not. Physical Fold 6 validation
— the standing gate every M30-onward decision has deferred — is what actually
settles whether this composed curve plays right, not this fix.

**Full record:** this document.
