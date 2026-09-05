# D-056 — Make each Sephirah a sensory world-state without changing gameplay truth

**Status:** Accepted for M35 implementation and physical Fold 6 validation. Not a release authorization.

## Context

M33 recovered the full Claude-era product path. M34 made the Tree ascent legible and clarified the Gate as a skill/risk choice. The next high-value problem is experiential rather than mechanical: the eight live HEX bands are named, coloured and progressively harder, but they still share too much of the same moment-to-moment sensory grammar.

The player should be able to recognise YESOD, GEBURAH or KETHER before reading the HUD. That means the ascent needs authored differences in motion, density, screen texture and sound, not another set of score rules.

The project also has a hard-earned Fold performance boundary. D-031 showed that one careless full-screen layer can destroy frame time. M35 therefore must not add another full-device-resolution canvas pass, postprocess stack, analyser or per-frame DOM rewrite.

## Decision

### 1. Keep the proven mechanics fixed

M35 changes no:

- physics constants;
- collision geometry;
- Gate radius, placement or scoring;
- band thresholds, speed or gap;
- mission ids, targets or persistence;
- power-up unlocks, earning or spending;
- MONAS progression;
- leaderboard validation/ranking.

The identity system is an observer/presentation layer.

### 2. Give all eight HEX bands an explicit sensory profile

`tools/sephirah-identity-runtime.js` defines exactly one profile for each live Gate band in the same order as `SexMagickGateSlice.BANDS`:

- **MALKUTH · KINGDOM** — material, dense, grounded;
- **YESOD · FOUNDATION** — lunar, reflective, tidal;
- **TIPHARETH · BEAUTY** — solar, balanced, radiant;
- **GEBURAH · SEVERITY** — martial, cut, pressure;
- **CHESED · MERCY** — expansive, spacious, benefic;
- **BINAH · UNDERSTANDING** — saturnine, formative, grave;
- **CHOKMAH · WISDOM** — electric, kinetic, overflowing;
- **KETHER · CROWN** — lucid, sparse, transcendent.

These are game-art direction labels, not claims of exhaustive historical correspondence.

### 3. Reuse existing visual channels rather than adding fill-rate

M35 does not draw a new canvas backdrop. On a real band change it retunes only channels the game already pays for:

- the existing 25 background particles: speed, opacity, size, colour and shape vocabulary;
- the existing scanline overlay: opacity and spacing;
- the existing vignette: opacity;
- a `data-sephirah` marker on the document root for inspectable state.

The expensive occult field, gallery compositing, tunnel, artwork, pillars, player and Gate remain in their proven rendering paths.

A key direction is **subtraction at KETHER**. The Crown reduces particle opacity, scanline density and vignette pressure rather than becoming the noisiest psychedelic band. The upper Tree should feel increasingly lucid, not merely busier.

### 4. Add a low-cost procedural undertone beneath existing music

M35 adds a tiny WebAudio graph only after active HEX play requires it:

- three persistent oscillators;
- one low-pass filter;
- one slow LFO;
- one ambient gain;
- one SFX gain for short transition motifs.

Oscillators are created once, then retuned by AudioParam ramps when the band changes. No audio samples, network fetches, FFTs, analysers or per-frame node creation are used.

Each Sephirah has a distinct root, interval set, timbre, cutoff and pulse rate. Ambient gain is capped at `0.02`, deliberately subordinate to the existing playlist. Band transitions may play a short motif when SFX is enabled. The continuous undertone obeys the existing Music setting; motifs obey the existing SFX setting.

The Void does not get a ninth harmonic identity. It temporarily drains the current band's undertone by ducking gain, lowering the filter and slowing the pulse, mirroring the established visual rule that the Void drains colour from the current world.

### 5. MONAS remains a separate rite

M35 is a HEX/Tree system. Entering MONAS removes the `data-sephirah` marker, restores the base scanline/vignette treatment, restores HEX particle baselines and silences the undertone. MONAS keeps its own gold/Coherence/Warp vocabulary from M28-M32.

### 6. Keep diagnostics isolated

The Living Sephiroth bootstrap is not loaded under:

- `visualQa=1`;
- `telemetryQa`;
- `gateSliceQa`;
- explicit `gateSlice=0` legacy sessions.

The withdrawn exact-hash screenshot topology therefore does not silently change. A tolerance-based visual regression replacement remains a separate deliberate milestone.

## Automated acceptance

M35 must prove:

- identity order exactly matches the eight live Gate bands;
- every visual profile is distinct;
- every audio profile is distinct and frequency/gain bounded;
- GEBURAH is kinetically stronger than MALKUTH;
- CHOKMAH exceeds GEBURAH in atmospheric motion;
- KETHER materially sheds particle and CRT noise;
- Fold-open normal product boot retains M33 `gateSlice=1` and `renderDpr=2` defaults;
- starting HEX applies MALKUTH's real particle/scanline/vignette profile;
- real Gate progression to YESOD, GEBURAH and KETHER changes the identity state without changing band truth;
- switching to MONAS restores the base overlays and removes the HEX identity marker;
- no LootLocker request is introduced;
- visual QA requests neither M35 script;
- M34, M33 and M30 product/rite regressions stay green;
- full Fast gameplay QA stays green before physical validation.

## Claim boundary

M35 establishes a coherent sensory grammar and a performance-conscious implementation. Automated checks cannot establish that the sound layer is beautiful at real phone volume, that the profile contrasts are strong enough without becoming distracting, or that KETHER's subtraction feels transcendent rather than empty.

Those are physical Fold 6 judgments. No merge to `develop`, no merge to `main`, and no itch.io deployment is authorized by this decision.