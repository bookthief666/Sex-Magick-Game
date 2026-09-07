# D-043 — No more bounce, the telegraph moves to the floor, and HEX gets a glitch vocabulary of its own

Date: 2026-08-14
Status: Accepted

## Decision

Three separate reports from the same playtest, each fixed independently:

1. **MONAS no longer bounces.** `Player.prototype.jump()` — the tap-to-flap kick
   every `click`/`touchstart`/`keydown Space` still routed into, on top of the
   hold-driven glide M27 added — is now a no-op for MONAS. The glyph rises only
   while held and falls only while released, with nothing else moving it
   vertically. Release also ramps gravity in over `HANG_FRAMES` (5 frames) instead
   of applying it in full on the very next frame, so letting go reads as a hang
   before a fall rather than an instant reversal. The original's continuous
   `rot += 0.03` spin is frozen at 0 for MONAS after each update; the pre-existing
   `vy * 0.05` bank term in `Player.draw()` already reads velocity independent of
   `rot`, so banking still tracks the movement without an independent spin under it.
2. **The Gate slice's telegraph moved off the artwork.** `#gate-slice-telegraph`
   was centred at `top: 42%`, opaque enough to sit on top of whatever the level
   photo was doing. It is bottom-anchored now, on the same convention
   `missions-runtime.js` and `powerup-runtime.js` already established for their
   own toasts, more transparent, and flashes a colour drawn from the event's own
   *kind* — `info`, `progress`, `bonus`, `success`, `danger` — rather than a fixed
   cyan, fading back to the resting colour over 400ms.
3. **HEX gets a glitch vocabulary of its own.** Every HEX event — orb pickup,
   band ascent, death — has rendered through the same single `rgbSplit` technique
   since 1.0; `GlitchFX.trigger`'s `type` argument was stored and never read.
   `GlitchFX` gains two more techniques (`shearTear`, a harder block-shift tear;
   `sweepBeam`, a travelling glow band) and an optional tint colour, and three HEX
   events that previously had no visual signature at all now use them: a graze
   pass under `NEAR_MISS_PX` clearance (`shear`, hazard pink), a void survived
   (`sweep`, the Hexagram's own reserved cyan), and a wager lost (`shear`, hazard
   pink, distinct from the game-over `death` rgbSplit already firing alongside it).

## The telegraph's colour palette, checked against M7

M7 reserves hazard pink (`#ff2f6d`/`#ff003c`), the Hexagram's cyan (`#00e5ff`),
Monas gold (`#ffd700`) and ward purple (`#c9b4ff`). Every new colour introduced
here avoids all four except one deliberate reuse: `danger` (a wager lost) reuses
hazard pink, because a wager lost *is* a danger event and that is exactly the
identity hazard pink already carries. `progress` (`#8f7bff`), `bonus`
(`#ffb347`) and `success` (`#5dffb0`) are all new and unreserved. HEX's own new
`sweep` glitch deliberately uses the Hexagram's own reserved cyan rather than a
new colour — it is HEX's own event, and cyan is HEX's own identity.

## The bounce, and why `Player.prototype.jump` was the one method to wrap

Tracing the actual call path rather than the physics math found two independent
callers of `Player.prototype.jump()`: `index.html`'s `playerJump()` (bound to
click/touchstart/keydown, gated only on `state === PLAYING`, not on mode) and
`collision-runtime.js`'s `dispatchPlayerJump`. Wrapping either alone would have
left the other still landing a discrete `vy = -7.2` kick, its own SFX, haptic
and particle burst on every tap. Wrapping the prototype method once, the way
every other MONAS override in this codebase already does, covers both without
either caller needing to know MONAS exists.

The hang on release needed a default that could not break the eleven existing
`advanceGlide` unit tests, all of which omit the new `framesSinceRelease`
option. It defaults to `HANG_FRAMES` itself — already fully ramped in — rather
than to `0`, so an omitted option reproduces the old immediate-gravity behaviour
exactly; four new tests exercise the ramp directly (fresh release falls slower
than a fully-ramped one, the ramp is monotonic across `HANG_FRAMES`, holding
overrides it instantly).

## The reduced-motion gap the new HEX triggers could have reintroduced

`installEffectPolicy` in `collision-runtime.js` gates `triggerOrbGlitch`,
`triggerLevelUpGlitch`, `triggerDeathGlitch` and `triggerGlitchEffect` behind the
player's reduced-motion and low-flash settings, but it does that by wrapping
those four named `Game.prototype` methods specifically — it has never reached a
raw `GlitchFX.trigger()` call, because none existed outside those four before
this milestone. The three new HEX triggers are raw calls, so they would have
silently bypassed accessibility settings entirely if wired up directly, exactly
the class of gap `installEffectPolicy` exists to close. `gate-slice-runtime.js`
now checks `__SEX_MAGICK_COLLISION__.getAccessibility()` itself before firing:
reduced motion suppresses the effect outright, low flash shortens its duration,
matching the existing policy's own two-tier behaviour. A browser assertion
confirms both the glitch and the accompanying screen flash stay off with reduced
motion enabled.

## A second ordering bug, found before it shipped

The first version of the wager-lost trigger fired *before* calling the base
game's own `gameOver()`, which calls `triggerDeathGlitch()` internally
(`GlitchFX.trigger(200, 'death')`) — a call that runs *after* the delegation and
overwrites `type`/`tint` back to the generic death effect, silently discarding
the wager's own tear before a single frame rendered it. The fix captures the
guard condition once (`wagerLost`, since `this.__gateSliceVoidActive` is reset
to `false` earlier in the same branch) and moves the new trigger to fire after
`originalGameOver.apply(...)` returns, so it wins the frame instead of losing to
the generic effect that already ran. A browser assertion locks in the ordering
by reading `GlitchFX.type`/`tint` immediately after `gameOver()` returns and
requiring `shear`/hazard-pink, not `death`/`null`.

## A wiring gap from M27/M28, fixed alongside this

Neither `test-monas-runtime.js` nor `browser-monas-test.mjs` was ever added to
`qa.yml` — both existed and passed locally since M27, but neither has run in CI
even once. Both are wired in now, alongside the new assertions this milestone
adds to them, so the next regression in either file is caught automatically
rather than depending on someone remembering to run it by hand.

## Evidence

- `test-monas-runtime.js`: the hang ramp is monotonic across `HANG_FRAMES`,
  omitting the new option reproduces the pre-existing immediate-gravity
  behaviour exactly, and holding overrides an in-progress ramp instantly.
- `browser-monas-test.mjs`: `Player.jump()` called directly, through
  `game.playerJump()` (the real click/touch/keydown path) and through
  `collision-runtime.js`'s `dispatchPlayerJump` all leave `vy` unchanged for
  MONAS; HEX's own `jump()` is unaffected by the wrap; twenty real frames of
  holding lift the avatar and carry upward `vy`; the ten frames after release
  show fall velocity ramping in rather than jumping to its released value;
  `rot` is pinned to `0` after `Player.update()` runs for MONAS. The full
  pre-existing M27/M28 suite (unsealing, glide, Coherence, edge flying, the
  Warp Surge, the backdrop rotation, the fractal spark, the coherence pulse, the
  ambient glyph, the surge bloom, the MONAS/HEX draw-cost comparison) stayed
  green throughout.
- `browser-gate-slice-test.mjs`: the telegraph resolves to `position: fixed`
  with no `top: 42%` and a real pixel `bottom` offset; a wager-accepted
  telegraph carries the `progress` flash colour (`#8f7bff`) and a void-survived
  telegraph carries `success` (`#5dffb0`) — different kinds, different colours,
  read directly off the element's own `--gate-slice-telegraph-flash` custom
  property. A void survived triggers a `sweep` glitch tinted the Hexagram's
  reserved cyan; a wager lost triggers a `shear` glitch tinted hazard pink,
  confirmed to win over the generic `death` effect that fires alongside it; a
  graze pass under `NEAR_MISS_PX` raises both a hazard-pink screen flash and a
  `shear` glitch; all three are confirmed suppressed under reduced motion.
- Fast suites: 23 green, including the new `test-monas-runtime.js` assertions.
- Browser suites: `browser-monas-test.mjs`, `browser-gate-slice-test.mjs`,
  `browser-m21-aesthetic-test.mjs` and the collision integration suite all
  green with the new code paths exercised.

## What is still open

Same open items as D-041/D-042: MONAS still runs the original score-based
levelling with no band table of its own, and its reachability envelope under
glide physics is unsolved. HEX's new glitch vocabulary covers three events —
graze, void survived, wager lost — not every event the Gate slice has; band
ascent still uses the original `rgbSplit` via `triggerLevelUpGlitch`, which was
a deliberate scope decision (three new, previously-silent events) rather than a
rewrite of every existing trigger.
