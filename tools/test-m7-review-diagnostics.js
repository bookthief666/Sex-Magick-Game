'use strict';

const assert = require('node:assert/strict');
const diagnostics = require('./m7-review-diagnostics.js');

function testJumpSpacing() {
  const result = diagnostics.analyzeJumpSpacing([10, 15, 20, 27], 5);
  assert.equal(result.jumpCount, 4);
  assert.deepEqual(result.intervals, [5, 5, 7]);
  assert.equal(result.tightCount, 2);
  assert.equal(result.tightRate, 2 / 3);
  assert.equal(result.belowCooldownCount, 0);
  assert.equal(result.minimum, 5);
  assert.equal(result.maximum, 7);
}

function testBreathingGap() {
  assert.equal(diagnostics.gapAtSpawnFrame(110, 0), 110);
  const nearMinimum = diagnostics.gapAtSpawnFrame(110, 94);
  const nearMaximum = diagnostics.gapAtSpawnFrame(110, 31);
  assert.ok(nearMinimum < 100.01 && nearMinimum >= 100, `expected near-100 gap, received ${nearMinimum}`);
  assert.ok(nearMaximum > 119.99 && nearMaximum <= 120, `expected near-120 gap, received ${nearMaximum}`);

  const gates = diagnostics.buildBreathingGateWindows([0.5, 0.5, 0.5], {
    viewportWidth: 390,
    viewportHeight: 844,
    speed: 8.5,
    baseGap: 110,
    gapAmplitude: 10
  });
  assert.equal(gates.length, 3);
  assert.ok(gates.every(gate => gate.gap >= 100 && gate.gap <= 120));
  assert.ok(gates.every(gate => Number.isFinite(gate.top)));
}

function testBufferedReplay() {
  const gates = [{ index: 0, start: 0, end: 12, top: 0, gap: 844 }];
  const base = {
    rite: 'HEX',
    mobile: false,
    viewportHeight: 844,
    gates,
    initialState: { y: 400, vy: 0, cooldown: 0 },
    jumpFrames: [0, 4],
    margin: 0
  };

  const unbuffered = diagnostics.replayBufferedWitness({ ...base, inputBufferFrames: 0 });
  assert.equal(unbuffered.valid, true);
  assert.equal(unbuffered.input.immediate, 1);
  assert.equal(unbuffered.input.rejected, 1);
  assert.equal(unbuffered.input.bufferedFired, 0);

  const buffered = diagnostics.replayBufferedWitness({ ...base, inputBufferFrames: 3 });
  assert.equal(buffered.valid, true);
  assert.equal(buffered.input.immediate, 1);
  assert.equal(buffered.input.buffered, 1);
  assert.equal(buffered.input.bufferedFired, 1);
  assert.equal(buffered.input.rejected, 0);
}

function testProvenanceMasks() {
  const mask = diagnostics.mergeProvenanceMasks(
    diagnostics.bitForInitialState(0),
    diagnostics.bitForInitialState(3),
    diagnostics.bitForInitialState(26)
  );
  assert.equal(diagnostics.countProvenance(mask), 3);
  assert.equal(diagnostics.countProvenance(diagnostics.mergeProvenanceMasks(mask, diagnostics.bitForInitialState(3))), 3);
  assert.throws(() => diagnostics.bitForInitialState(31), /31-bit provenance mask/);
}

testJumpSpacing();
testBreathingGap();
testBufferedReplay();
testProvenanceMasks();

console.log('m7-review-diagnostics: all deterministic contracts passed');
