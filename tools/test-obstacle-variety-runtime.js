'use strict';

const assert = require('node:assert/strict');
const variety = require('./obstacle-variety-runtime.js');
const grammar = require('./obstacle-grammar.js');

const {
  VERIFIED_STATIC_GAP,
  MOTION_DEFAULT_AMPLITUDE_PX,
  MOTION_MAX_AMPLITUDE_PX,
  GAP_SCALE_MIN,
  GAP_SCALE_MAX
} = variety;

// --- the invariant this module exists to hold ----------------------------
// A gap of width G whose top swings by +/-A always contains the static corridor
// of width G - 2A. So as long as that corridor is never narrower than the gap the
// solver verified, every moving wall is clearable at every phase. Nothing below
// is allowed to violate it.
{
  for (let gap = 0; gap <= 400; gap += 1) {
    for (const requested of [0, 1, 5, 14, 26, 60, 1000, NaN, -5, undefined]) {
      const amplitude = variety.resolveMotionAmplitude(requested, gap);
      assert.ok(Number.isFinite(amplitude), `amplitude for gap ${gap} must be finite`);
      assert.ok(amplitude >= 0, `amplitude for gap ${gap} must not be negative`);
      assert.ok(
        amplitude <= MOTION_MAX_AMPLITUDE_PX,
        `amplitude ${amplitude} exceeded the ceiling at gap ${gap}`
      );
      if (amplitude > 0) {
        assert.ok(
          variety.motionRespectsVerifiedCorridor(gap, amplitude),
          `gap ${gap} with amplitude ${amplitude} left less than ${VERIFIED_STATIC_GAP}px of verified corridor`
        );
      }
    }
  }
}

// A gap at or below the verified floor gets no motion at all.
assert.equal(variety.resolveMotionAmplitude(26, VERIFIED_STATIC_GAP), 0);
assert.equal(variety.resolveMotionAmplitude(26, VERIFIED_STATIC_GAP - 40), 0);
// Headroom is shared evenly between the two extremes of the swing.
assert.equal(variety.resolveMotionAmplitude(26, VERIFIED_STATIC_GAP + 20), 10);
// A pattern asking for less than the headroom allows still gets what it asked.
assert.equal(variety.resolveMotionAmplitude(6, VERIFIED_STATIC_GAP + 100), 6);
// And the ceiling holds even when headroom is enormous.
assert.equal(variety.resolveMotionAmplitude(1000, 900), MOTION_MAX_AMPLITUDE_PX);

// --- gap scaling ---------------------------------------------------------
assert.equal(variety.normalizeGapScale(0.1), GAP_SCALE_MIN);
assert.equal(variety.normalizeGapScale(9), GAP_SCALE_MAX);
assert.equal(variety.normalizeGapScale(undefined), 1);
assert.equal(variety.normalizeGapScale(NaN), 1);

// Rescaling must hold the corridor's centre still. Moving `gap` without moving
// `top` would silently shift the corridor the pattern was solved against.
{
  for (const gapScale of [GAP_SCALE_MIN, 0.94, 1, 1.08, GAP_SCALE_MAX]) {
    const geometry = variety.resolvePillarGeometry({
      gap: 200,
      top: 300,
      gapScale,
      motionAmplitude: 0
    });
    assert.equal(
      geometry.top + (geometry.gap / 2),
      300 + 100,
      `gapScale ${gapScale} moved the corridor centre`
    );
  }
}

// Narrowing is clamped rather than forbidden, so it is available where there is
// room and simply stops applying where there is not.
{
  const wide = variety.resolvePillarGeometry({ gap: 220, top: 100, gapScale: 0.88, motionAmplitude: 26 });
  assert.ok(wide.gap > VERIFIED_STATIC_GAP, 'a wide band keeps its narrowing');
  assert.equal(wide.motionAmplitude, MOTION_MAX_AMPLITUDE_PX, 'a wide band affords full motion');

  const tight = variety.resolvePillarGeometry({ gap: 112, top: 100, gapScale: 0.88, motionAmplitude: 26 });
  assert.equal(tight.gap, VERIFIED_STATIC_GAP, 'a tight band clamps narrowing to the verified floor');
  assert.equal(tight.motionAmplitude, 0, 'a tight band affords no motion');
}

// --- the vertical offset -------------------------------------------------
// An unannotated pillar - including every one the M14 visual-state controller
// builds by hand - must move exactly as the stock game moved it.
{
  const bare = {};
  for (const frame of [0, 1, 17, 133, 512]) {
    assert.equal(
      variety.pillarVerticalOffset(bare, frame),
      Math.sin(frame * 0.05) * MOTION_DEFAULT_AMPLITUDE_PX,
      `an unannotated pillar diverged from stock behaviour at frame ${frame}`
    );
  }
}

assert.equal(variety.pillarVerticalOffset({ motionAmplitude: 0 }, 40), 0, 'zero amplitude means a still wall');

// Phase actually separates pillars instead of leaving them in lockstep.
{
  const a = variety.pillarVerticalOffset({ motionAmplitude: 20, motionPhase: 0 }, 10);
  const b = variety.pillarVerticalOffset({ motionAmplitude: 20, motionPhase: 31 }, 10);
  assert.ok(Math.abs(a - b) > 1, 'distinct phases must produce distinct offsets');
}

// The offset never exceeds the amplitude it was clamped to.
{
  for (let frame = 0; frame < 300; frame += 1) {
    const offset = variety.pillarVerticalOffset({ motionAmplitude: 14, motionPhase: 7 }, frame);
    assert.ok(Math.abs(offset) <= 14 + 1e-9, `offset ${offset} exceeded its amplitude`);
  }
}

// --- the shipped pattern library -----------------------------------------
assert.equal(grammar.validatePatternLibrary(grammar.PATTERN_LIBRARY).length, 0);

// Every declared motion and gapScale must be inside the bounds the runtime
// enforces, so no pattern silently relies on being clamped.
for (const rite of ['HEX', 'MONAS']) {
  for (const pattern of grammar.PATTERN_LIBRARY[rite]) {
    assert.ok(
      Number.isFinite(pattern.motion) && pattern.motion >= 0 && pattern.motion <= MOTION_MAX_AMPLITUDE_PX,
      `${pattern.id} declares motion outside [0, ${MOTION_MAX_AMPLITUDE_PX}]`
    );
    assert.ok(
      Number.isFinite(pattern.gapScale) && pattern.gapScale >= GAP_SCALE_MIN && pattern.gapScale <= GAP_SCALE_MAX,
      `${pattern.id} declares gapScale outside [${GAP_SCALE_MIN}, ${GAP_SCALE_MAX}]`
    );
  }
}

// Variety is the point: the library must not collapse to one behaviour.
{
  const motions = new Set();
  const scales = new Set();
  for (const rite of ['HEX', 'MONAS']) {
    for (const pattern of grammar.PATTERN_LIBRARY[rite]) {
      motions.add(pattern.motion);
      scales.add(pattern.gapScale);
    }
  }
  assert.ok(motions.size >= 6, `expected varied motion across the library, saw ${motions.size} values`);
  assert.ok(scales.size >= 6, `expected varied gap scaling across the library, saw ${scales.size} values`);
  assert.ok(motions.has(0), 'some patterns must hold perfectly still');
}

// --- end to end against real band geometry -------------------------------
// Replays every shipped pattern against every band, at the bottom of the +/-10px
// breathing getCurrentGap applies, and asserts the verified corridor survives.
{
  const gate = require('./gate-slice-runtime.js');
  let checked = 0;
  for (const band of gate.BANDS) {
    const breathingFloor = band.gap - 10;
    for (const rite of ['HEX', 'MONAS']) {
      for (const pattern of grammar.PATTERN_LIBRARY[rite]) {
        const geometry = variety.resolvePillarGeometry({
          gap: breathingFloor,
          top: 200,
          gapScale: pattern.gapScale,
          motionAmplitude: pattern.motion,
          minimumGap: VERIFIED_STATIC_GAP
        });
        assert.ok(
          geometry.gap - (2 * geometry.motionAmplitude) >= VERIFIED_STATIC_GAP - 1e-9,
          `${band.name} + ${pattern.id} left only ${geometry.gap - 2 * geometry.motionAmplitude}px of corridor`
        );
        assert.ok(geometry.gap >= VERIFIED_STATIC_GAP, `${band.name} + ${pattern.id} produced a sub-floor gap`);
        checked += 1;
      }
    }
  }
  // Derived: M40.3 grew the library, and a literal here asserted its size.
  assert.equal(
    checked,
    gate.BANDS.length * (grammar.PATTERN_LIBRARY.HEX.length + grammar.PATTERN_LIBRARY.MONAS.length)
  );
}

// --- seeded motion phase -------------------------------------------------
assert.equal(grammar.deriveMotionPhase(1234, 7), grammar.deriveMotionPhase(1234, 7));
assert.notEqual(grammar.deriveMotionPhase(1234, 7), grammar.deriveMotionPhase(1234, 8));
assert.notEqual(grammar.deriveMotionPhase(1234, 7), grammar.deriveMotionPhase(9999, 7));
{
  const phases = new Set();
  for (let index = 0; index < 200; index += 1) phases.add(grammar.deriveMotionPhase(42, index));
  assert.ok(phases.size > 60, `expected phases to spread over the period, saw ${phases.size}`);
  for (const phase of phases) {
    assert.ok(phase >= 0 && phase < grammar.MOTION_PHASE_PERIOD, `phase ${phase} left the period`);
  }
}

console.log(`obstacle-variety v${variety.VARIETY_VERSION}: all deterministic contracts passed`);
