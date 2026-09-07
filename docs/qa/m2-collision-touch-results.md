# Milestone 2 Results — Collision Truth and Mobile-Control Clarity

Date: 2026-08-04  
Protected baseline: `d3760aaea9c7322d48e471389a67c4e579743e2a`  
Tested implementation head: `ebd43083f688cfafee0aacf7a5bcf4524b4ffcb9`  
Final QA workflow run: `30898292884`

## Scope

Milestone 2 makes visible obstacle geometry, collision geometry, touch input, and jump feedback agree with one another on the development branch.

`main` and the published itch.io build remain unchanged.

## Defects addressed

### Visual and collision mismatch

The original pillar collision test used two full axis-aligned rectangles, but the top pillar artwork included a long diagonal gap-facing edge. This could visually imply empty space inside an area that still killed the player.

### Invisible mobile input restriction

The original global `touchstart` handler accepted jumps only below 60 percent of viewport height. The instruction faded after five seconds, while the invisible restriction remained.

### Duplicate jump haptic

`Game.playerJump()` emitted a haptic after calling `Player.jump()`, while `Player.jump()` already emitted the accepted-jump haptic. Successful jumps therefore produced two pulses, and cooldown-rejected input could still produce an outer pulse.

## Integrated runtime

`tools/fixed-step-prototype.js` now bootstraps `tools/collision-runtime.js` from the same production path already loaded by `index.html`.

The collision runtime installs once and provides:

- canonical player collision rectangle using `CONFIG.HITBOX_OFFSET`
- canonical top, bottom, and safe-gap pillar rectangles
- strict penetration collision; merely touching a boundary is safe
- pillar rendering whose gap-facing jagged points stay at least two pixels inside the corresponding collision side
- a debug overlay showing the player hitbox, pillar collision rectangles, and safe gaps
- overlay toggle with the `H` key
- overlay activation through `?hitboxes=1` or a hash containing `hitboxes`
- full-screen gameplay touch input
- exclusion of real controls such as buttons, labels, inputs, links, and role-button elements
- `TAP ANYWHERE` mobile instruction text
- non-intercepting mobile instruction overlay
- player-owned jump feedback so one accepted jump produces one haptic path

Runtime diagnostics are available through:

```text
window.__SEX_MAGICK_COLLISION__
```

## Geometry contracts

The deterministic Node test verifies:

- rectangle normalization
- strict overlap semantics
- player hitbox inset
- canonical pillar top, bottom, and gap rectangles
- viewport clamping
- top artwork remains above the top collision boundary
- bottom artwork remains below the bottom collision boundary
- invalid jagged-edge direction is rejected
- jump dispatch reaches `Player.jump()` exactly once only while playing

## Headless Chrome integration results

The browser test loads the actual `index.html` production path at a 390 × 844 mobile viewport while blocking optional external services.

Test pillar:

| Property | Value |
|---|---:|
| Left | 200 |
| Right | 280 |
| Top pillar bottom | 220 |
| Safe gap top | 220 |
| Safe gap bottom | 400 |
| Bottom pillar top | 400 |
| Viewport bottom | 844 |

Verified results:

| Contract | Result |
|---|---|
| Player fully inside gap | Safe |
| Player penetrates top pillar | Collision |
| Player penetrates bottom pillar | Collision |
| Player exactly touches boundary | Safe |
| Debug API enables overlay | Passed |
| Touch policy | `full-screen-gameplay-excluding-controls` |
| Mobile instruction | `TAP ANYWHERE` |
| Instruction overlay intercepts touch | No |
| Upper-screen canvas touch | One jump |
| Pause-button touch | No jump |
| Gameplay touch suppresses synthetic mouse input | Yes |
| Control touch remains available for click synthesis | Yes |
| Five-step catch-up collision | One death transition |
| Obstacle updates after death in same catch-up | Zero additional updates |
| Final state | `gameover` |

The existing fixed-step integration suite also remained green at 60, 90, 120, and 144 Hz.

## Automation

The permanent `QA checks` workflow now runs:

1. JavaScript syntax checks
2. fixed-step deterministic tests
3. collision and input deterministic tests
4. fixed-step headless Chrome integration
5. collision and touch headless Chrome integration

The temporary collision-promotion script and duplicate workflow were removed after the runtime was integrated through the existing production bootstrap.

## Acceptance status

Accepted for the development branch:

- canonical collision geometry
- boundary-touch policy
- visible pillar edge containment
- collision overlay and diagnostics
- full-screen gameplay touch policy
- control exclusion
- single-owner jump feedback
- one death transition during fixed-step catch-up
- no additional simulation work after death changes state

Still required before itch.io release:

- physical Samsung Fold 6 closed-screen touch test
- physical Samsung Fold 6 open portrait and landscape touch tests
- rapid fold/unfold posture transition during play
- physical Android Chrome latency and gesture-conflict test
- iPhone/mobile Safari touch test
- desktop Safari and Firefox collision smoke tests
- subjective visual review of the revised pillar silhouettes
- real-player near-miss and edge-contact playtesting
- audiovisual and haptic testing on physical hardware

## Rollback

To remove Milestone 2 behavior while retaining Milestone 1:

1. Revert the collision bootstrap change in `tools/fixed-step-prototype.js` introduced by commit `aa1100c2c2c333152f7204b82411de243703e37f`.
2. Remove `tools/collision-runtime.js`.
3. The collision tests and documentation may remain without affecting runtime behavior.
