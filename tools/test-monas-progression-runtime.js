'use strict';

const assert = require('node:assert/strict');
const progression = require('./monas-progression-runtime.js');
const frontier = require('./monas-progression-frontier.js');
const monas = require('./monas-runtime.js');

function approximately(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

assert.equal(progression.validateBands(), true);

const expectedThresholds = [0, 8, 20, 36, 56, 80, 110];
assert.deepEqual(progression.BANDS.map(band => band.gateThreshold), expectedThresholds);

// M43 promotes p6 (5.3 / 200) to a live band. The invariant that matters is
// unchanged: every live band is an exact M31 frontier coordinate, in order, so a
// future tuning change must either stay on a proven pair or carry new evidence.
assert.equal(progression.BANDS.length, frontier.CANDIDATES.length - 1);
for (let index = 0; index < progression.BANDS.length; index += 1) {
  const live = progression.BANDS[index];
  const proven = frontier.CANDIDATES[index];
  approximately(live.speed, proven.baseSpeed);
  approximately(live.gap, proven.nominalGap);
}

// p7 (5.7 / 190) stays off the ladder on purpose. It is not headroom held back for
// safety any more - M43 hands it to the portal, whose clamp saturates there - so
// the assertion is that it belongs to the wager rather than to ordinary play.
const livePairs = new Set(progression.BANDS.map(band => `${band.speed}/${band.gap}`));
assert.equal(livePairs.has('5.7/190'), false,
  'the search ceiling is the portal clamp, not a live band - promoting it makes the top-band portal a no-op');
approximately(monas.MONAS_MAX_VERIFIED_SPEED, 5.7);
approximately(monas.MONAS_MIN_VERIFIED_GAP, 190);

// Every band must actually escalate when a portal opens on it, which is the whole
// reason the ceiling is reserved. This is the contract the M43 browser suite then
// checks against real frames.
for (const band of progression.BANDS) {
  assert.ok(monas.portalSpeedFor(band.speed) > band.speed,
    `a portal on band ${band.id} must be faster than the band it interrupts`);
  assert.ok(monas.portalGapFor(band.gap) < band.gap,
    `a portal on band ${band.id} must be tighter than the band it interrupts`);
  assert.ok(monas.portalSpeedFor(band.speed) <= 5.7 + 1e-9,
    `a portal on band ${band.id} must never exceed the audited ceiling`);
  assert.ok(monas.portalGapFor(band.gap) >= 190 - 1e-9,
    `a portal on band ${band.id} must never go below the audited corridor`);
}

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

// The hardest reward state remains materially below the M31 search ceiling and
// below the game's pre-existing 8.5 maximum-speed scale.
const liveSurgeMax = lastBand.speed * monas.SURGE_SPEED_MULTIPLIER;
const searchCeiling = frontier.CANDIDATES.at(-1);
const searchCeilingSurge = searchCeiling.baseSpeed * monas.SURGE_SPEED_MULTIPLIER;
approximately(liveSurgeMax, 7.685);
approximately(searchCeilingSurge, 8.265);
assert.ok(liveSurgeMax < searchCeilingSurge);
assert.ok(liveSurgeMax < 8.5);

// The portal suppresses the surge, so the two escalations can never compound. That
// is asserted in the browser suite against real frames; here it is enough that the
// unmultiplied portal ceiling is itself the audited coordinate.
approximately(monas.portalSpeedFor(lastBand.speed), 5.7);

console.log('monas-progression-runtime: all deterministic contracts passed');
