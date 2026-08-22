'use strict';

const assert = require('node:assert/strict');
const progression = require('./monas-progression-runtime.js');
const frontier = require('./monas-progression-frontier.js');
const monas = require('./monas-runtime.js');

function approximately(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

assert.equal(progression.validateBands(), true);

const expectedThresholds = [0, 8, 20, 36, 56, 80, 110, 150];
assert.deepEqual(progression.BANDS.map(band => band.gateThreshold), expectedThresholds);

// M43: the live curve is now every coordinate of M31's exact frontier, in order.
// The contract this replaces held the top two back as headroom; it is superseded,
// not weakened - the invariant that matters is unchanged and asserted here. Every
// live band must be an exact frontier coordinate, so a future tuning change still
// has to either stay on a proven pair or carry new reachability evidence.
assert.equal(progression.BANDS.length, frontier.CANDIDATES.length);
for (let index = 0; index < progression.BANDS.length; index += 1) {
  const live = progression.BANDS[index];
  const proven = frontier.CANDIDATES[index];
  approximately(live.speed, proven.baseSpeed);
  approximately(live.gap, proven.nominalGap);
}

// The top band is the search ceiling itself, which is the whole point of the
// extension and the reason it needs no new evidence: D-051's boundary job audited
// 5.7 / 190 across the complete scheduler-legal pattern-variant pair cross-product,
// in ordinary flight and in Warp Surge.
const ceiling = progression.BANDS.at(-1);
approximately(ceiling.speed, 5.7);
approximately(ceiling.gap, 190);

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

// M43: the hardest reward state is now the surge at the search ceiling itself -
// exactly the condition D-051's boundary job audited in `mode: 'surge'`, and named
// in its own text as 8.265. It stays below the game's pre-existing 8.5 maximum-speed
// scale, which is the constraint that was ever load-bearing here.
const liveSurgeMax = lastBand.speed * monas.SURGE_SPEED_MULTIPLIER;
const searchCeiling = frontier.CANDIDATES.at(-1);
const searchCeilingSurge = searchCeiling.baseSpeed * monas.SURGE_SPEED_MULTIPLIER;
approximately(liveSurgeMax, 8.265);
approximately(searchCeilingSurge, 8.265);
assert.ok(liveSurgeMax <= searchCeilingSurge, 'live surge must never exceed the audited ceiling');
assert.ok(liveSurgeMax < 8.5);

console.log('monas-progression-runtime: all deterministic contracts passed');
