# Milestone 7 Follow-up Review Assessment

Date: 2026-08-04  
Branch: `develop/sex-magick-2.0`  
Status: accepted corrections; human gate pending

## Accepted corrections

### Withdraw the production eight-pixel claim

Milestone 5's 252/252 result was generated with a constant `110`-pixel gap. Production spawns use a per-gate breathing timeline that can vary approximately from `100` to `120` pixels.

Therefore:

- the 252 exact replay witnesses remain historical constant-gap evidence
- the production eight-pixel safety claim is withdrawn
- the PR and active documentation must not cite that number as a live-game guarantee
- no pattern retuning follows from this correction
- any future safety-margin claim must generate witnesses against the real per-gate gap timeline

### Do not finalize the buffer from machine evidence

The three-step buffer remains one candidate, not the chosen release value.

The current development comparison is:

```text
?inputBuffer=3
?inputBuffer=6
```

The solver's inability to distinguish 3, 4, and 6 does not decide a perception and motor-control question. Human play determines whether 3 or 6 better avoids ignored input without producing latent-action feel.

### Make input text diagnostic-only

The following text is now debug-only by default:

```text
QUEUED
WAIT
MISSED
```

Quiet rejected and expired audio cues remain available during ordinary play. Text can be enabled with `?inputFeedback=1` or the existing hitbox/debug mode.

### Require R-1 before the Gate slice

The Hexagram Gate/Gnosis/Void slice is paused until three physical-phone sessions are completed using `tools/r1-playtest.html` and the protocol in `docs/playtests/r1-input-truth-protocol.md`.

Headless browser validation does not satisfy this gate.

## Architectural debt accepted but bounded

`tools/collision-runtime.js` currently owns too many responsibilities:

- collision geometry and drawing
- touch policy
- jump buffering
- feedback UI
- authoritative colors
- reduced motion and low flash
- resize/posture pause

This coupling is accepted only through the first Hexagram vertical slice to avoid creating an eighth consecutive infrastructure milestone.

Constraints:

1. Gate, Gnosis, banking, wagering, and transformed Void behavior must not be added to `collision-runtime.js`.
2. New slice behavior must live in a dedicated player-facing module with explicit state and telemetry boundaries.
3. Before development proceeds beyond the slice into Monas expansion, additional Sephiroth, or broader progression, collision, input, accessibility, and presentation responsibilities must be extracted from the god-module.

## Color-vision follow-up

The Monas aura `#ffd700` and lethal hazard `#ff2f6d` require deuteranopia and protanopia review before Monas ships.

This is deferred because the next vertical slice is Hexagram-only. It is not waived.

## Remaining decision order

1. Complete R-1 physical playtest.
2. Select or revise the input buffer from human evidence.
3. Decide whether player-facing input text remains fully hidden outside diagnostics.
4. Build the Hexagram-only Gate slice in a separate module.
5. Use a Gate-entry rate between 25% and 75% as the slice's go/no-go signal.
6. Decompose the god-module before expanding beyond the slice.

PR #1 remains draft. `main` and the live itch.io build remain unchanged. No deployment is authorized.
