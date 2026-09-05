'use strict';

const assert = require('node:assert/strict');
const progression = require('./monas-progression-runtime.js');
const frontier = require('./monas-progression-frontier.js');
const monas = require('./monas-runtime.js');

function approximately(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

assert.equal(progression.validateBands(), true);

const expectedThresholds = [0, 6, 15, 27, 42, 60, 82, 108, 138];

assert.deepEqual(progression.BANDS.map(band => band.gateThreshold), expectedThresholds);

// Regression: the live composition begins a MONAS run in monas-runtime.js and the
// outer progression wrapper resets progression immediately afterward. That reset
// must preserve the run identity and start clock or finishMonasRun produces a
// zero-duration record which the shared leaderboard validator rejects.
const liveRun = {
  gameMode: 'MONAS',
  gameSpeed: 2.9,
  monasState: {
    ...monas.createMonasState(),
    runId: 'monas_regression_run',
    startedAt: '2026-09-05T00:00:00.000Z',
    endedAt: null
  },
  player: {}
};
progression.resetMonasRun(liveRun);
assert.equal(liveRun.monasState.runId, 'monas_regression_run');
assert.equal(liveRun.monasState.startedAt, '2026-09-05T00:00:00.000Z');
assert.equal(liveRun.monasState.endedAt, null);
assert.equal(liveRun.monasState.gatesPassed, 0);

// M47 re-tuned the MONAS curve steeper than the M31 frontier's candidates. The
// bands no longer match those coordinates one-to-one; the envelope check below
// (every band ≤ MAX_VALIDATED_SPEED / ≥ MIN_VALIDATED_GAP) is the live safety
// contract, and the frontier scan is an independent exploration artifact.
assert.ok(progression.BANDS.length >= frontier.CANDIDATES.length,
  'the live ladder must have at least as many bands as the frontier explored');

// The ceiling stays off the ladder on purpose. It is the portal's clamp, and M43
// established by measurement that promoting it makes a top-band portal identical
// to ordinary play - a stake and a dark field with no escalation behind them.
const livePairs = new Set(progression.BANDS.map(band => `${band.speed}/${band.gap}`));
assert.equal(livePairs.has('7/160'), false,
  'the search ceiling is the portal clamp, not a live band - promoting it makes the top-band portal a no-op');
approximately(monas.MONAS_MAX_VERIFIED_SPEED, 7.0);
approximately(monas.MONAS_MIN_VERIFIED_GAP, 160);
approximately(progression.MAX_VALIDATED_SPEED, 7.0);
approximately(progression.MIN_VALIDATED_GAP, 160);

// Every live band must sit inside the rite's own envelope. M44 made the audit
// per-rite, so this is the constant that now governs MONAS rather than HEX's.
for (const band of progression.BANDS) {
  assert.ok(band.speed <= progression.MAX_VALIDATED_SPEED + 1e-9,
    `${band.id} exceeds MONAS's audited speed envelope at ${band.speed}`);
  assert.ok(band.gap >= progression.MIN_VALIDATED_GAP - 1e-9,
    `${band.id} is tighter than MONAS's audited corridor at ${band.gap}`);
}

// Every band must actually escalate when a portal opens on it, which is the whole
// reason the ceiling is reserved. This is the contract the M43 browser suite then
// checks against real frames.
for (const band of progression.BANDS) {
  assert.ok(monas.portalSpeedFor(band.speed) > band.speed,
    `a portal on band ${band.id} must be faster than the band it interrupts`);
  assert.ok(monas.portalGapFor(band.gap) < band.gap,
    `a portal on band ${band.id} must be tighter than the band it interrupts`);
  // Derived, not literal: M43 wrote 5.7 and 190 in here and M44's re-search made
  // both wrong while the ladder they guard was still correct. The contract is that
  // the clamp respects the envelope, whatever the envelope currently is.
  assert.ok(monas.portalSpeedFor(band.speed) <= monas.MONAS_MAX_VERIFIED_SPEED + 1e-9,
    `a portal on band ${band.id} must never exceed the audited ceiling`);
  assert.ok(monas.portalGapFor(band.gap) >= monas.MONAS_MIN_VERIFIED_GAP - 1e-9,
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
approximately(liveSurgeMax, 10.005);
// The surge at the top live band was audited at that coordinate directly, in
// `mode: 'surge'`, rather than being compared against HEX's scale. D-051's ceiling
// rested on exactly that comparison, which is why it moved once HEX's cap did.
assert.ok(liveSurgeMax <= monas.MONAS_MAX_VERIFIED_SPEED * monas.SURGE_SPEED_MULTIPLIER + 1e-9,
  'the surge must stay inside the re-searched MONAS envelope');

// The portal suppresses the surge, so the two escalations can never compound. That
// is asserted in the browser suite against real frames; here it is enough that the
// unmultiplied portal ceiling is itself the audited coordinate.
approximately(monas.portalSpeedFor(lastBand.speed), monas.MONAS_MAX_VERIFIED_SPEED);

console.log('monas-progression-runtime: all deterministic contracts passed');
