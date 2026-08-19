'use strict';

const assert = require('node:assert/strict');
const progression = require('./monas-progression-runtime.js');
const frontier = require('./monas-progression-frontier.js');
const monas = require('./monas-runtime.js');

function approximately(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

assert.equal(progression.validateBands(), true);

const expectedThresholds = [0, 8, 20, 36, 56, 80];
assert.deepEqual(progression.BANDS.map(band => band.gateThreshold), expectedThresholds);

// The live M32 curve is deliberately the conservative first six coordinates from
// M31's exact frontier. A future tuning change must either remain on proven M31
// coordinates or carry new reachability evidence with it.
const provenLowerFrontier = frontier.CANDIDATES.slice(0, 6);
assert.equal(progression.BANDS.length, provenLowerFrontier.length);
for (let index = 0; index < progression.BANDS.length; index += 1) {
  const live = progression.BANDS[index];
  const proven = provenLowerFrontier[index];
  approximately(live.speed, proven.baseSpeed);
  approximately(live.gap, proven.nominalGap);
}

// The two harder proven coordinates remain headroom, not live bands.
const livePairs = new Set(progression.BANDS.map(band => `${band.speed}/${band.gap}`));
assert.equal(livePairs.has('5.3/200'), false, 'p6 must remain tuning headroom');
assert.equal(livePairs.has('5.7/190'), false, 'p7 is a search ceiling, not a live band');

// Threshold boundaries are gate-count driven and saturate at the last live band.
for (let index = 0; index < progression.BANDS.length; index += 1) {
  const band = progression.BANDS[index];
  assert.equal(progression.getBandIndex(band.gateThreshold), index);
  if (index > 0) assert.equal(progression.getBandIndex(band.gateThreshold - 1), index - 1);
}
assert.equal(progression.getBandIndex(10_000), progression.BANDS.length - 1);
assert.equal(progression.getBandIndex(-5), 0);

// getCurrentGap semantics mirror the M31 proof: nominal band gap, +/-10 breathing,
// then the existing 1.18 Warp Surge widening.
for (const band of progression.BANDS) {
  approximately(progression.gapFor(band.gateThreshold, 0, false), band.gap);
  approximately(progression.gapFor(band.gateThreshold, 0, true), band.gap * progression.SURGE_GAP_MULTIPLIER);
}
const troughFrame = (3 * Math.PI / 2) / 0.05;
const lastBand = progression.BANDS.at(-1);
approximately(progression.gapFor(lastBand.gateThreshold, troughFrame, false), lastBand.gap - 10, 1e-8);

// M32's hardest reward state remains materially below the M31 search ceiling and
// below the game's pre-existing 8.5 maximum-speed scale.
const liveSurgeMax = lastBand.speed * monas.SURGE_SPEED_MULTIPLIER;
const searchCeiling = frontier.CANDIDATES.at(-1);
const searchCeilingSurge = searchCeiling.baseSpeed * monas.SURGE_SPEED_MULTIPLIER;
approximately(liveSurgeMax, 7.105);
approximately(searchCeilingSurge, 8.265);
assert.ok(liveSurgeMax < searchCeilingSurge);
assert.ok(liveSurgeMax < 8.5);

console.log('monas-progression-runtime: all deterministic contracts passed');
