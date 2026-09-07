'use strict';

const assert = require('node:assert/strict');
const grammar = require('./obstacle-grammar.js');
const reach = require('./monas-reachability.js');
const composition = require('./monas-compositional-reachability.js');
const policy = require('./reachability-policy.js');

assert.equal(composition.COMPOSITION_VERSION, 2,
  'the all-band-cycle composition surface must not identify itself as the old base-cycle-only v1');

assert.deepEqual(
  composition.LEGAL_FAMILY_TRANSITIONS.map(entry => entry.key).sort(),
  [
    'climax->climax', 'climax->pressure', 'climax->recovery', 'climax->safe',
    'pressure->climax', 'pressure->pressure', 'pressure->recovery', 'pressure->safe',
    'recovery->climax', 'recovery->pressure', 'recovery->safe',
    'safe->climax', 'safe->pressure', 'safe->recovery'
  ].sort(),
  'composition must cover within-tier and cross-tier transitions at the scheduler cursor'
);

const baseOnlyTransitions = composition.deriveLegalFamilyTransitions(grammar.FAMILY_CYCLE).map(entry => entry.key);
assert.ok(baseOnlyTransitions.length < composition.LEGAL_FAMILY_TRANSITIONS.length,
  'negative control: the historical base cycle must omit shipped crown transitions');
for (const required of [
  'climax->safe', 'climax->pressure', 'recovery->climax',
  'safe->climax', 'pressure->safe', 'pressure->pressure',
  'safe->recovery', 'climax->climax'
]) {
  assert.equal(baseOnlyTransitions.includes(required), false,
    `negative control: ${required} must prove why a base-cycle-only audit is incomplete`);
  assert.ok(composition.LEGAL_FAMILY_TRANSITIONS.some(entry => entry.key === required),
    `the full shipped transition surface must contain ${required}`);
}

for (const cycle of grammar.FAMILY_CYCLES) {
  for (const transition of composition.deriveLegalFamilyTransitions(cycle)) {
    assert.ok(composition.LEGAL_FAMILY_TRANSITIONS.some(entry => entry.key === transition.key),
      `missing shipped cycle transition ${transition.key}`);
  }
}

// Independently enumerate every monotone tier crossing at the global cursor.
// This is the path a long pattern takes when it clears a band threshold before
// choosePattern runs again; auditing each cycle in isolation does not see it.
for (let fromTier = 0; fromTier < grammar.FAMILY_CYCLES.length; fromTier += 1) {
  for (let toTier = fromTier; toTier < grammar.FAMILY_CYCLES.length; toTier += 1) {
    const fromCycle = grammar.FAMILY_CYCLES[fromTier];
    const toCycle = grammar.FAMILY_CYCLES[toTier];
    for (let cursor = 1; cursor <= fromCycle.length; cursor += 1) {
      const key = `${fromCycle[(cursor - 1) % fromCycle.length]}->${toCycle[cursor % toCycle.length]}`;
      assert.ok(composition.LEGAL_FAMILY_TRANSITIONS.some(entry => entry.key === key),
        `missing tier ${fromTier}->${toTier} cursor transition ${key}`);
    }
  }
}

const allPairs = composition.buildLegalVariantPairs();
const bounded = composition.selectCoveragePairs(allPairs);
assert.ok(allPairs.length > bounded.length, 'bounded PR coverage must be smaller than the full cross product');
assert.ok(bounded.length > 0, 'bounded coverage must retain legal pairs');

const shippedLibrary = grammar.PATTERN_LIBRARY.MONAS.map(pattern => policy.applyPatternOverride(pattern));
const shippedPairs = composition.buildLegalVariantPairs(shippedLibrary);
const shippedReturnFlow = shippedLibrary.find(pattern => pattern.id === 'monas.return-flow');
assert.equal(shippedReturnFlow.values.length, 12, 'the shipped composition catalog must carry the policy override');
assert.ok(
  shippedPairs.some(pair => pair.first.id === shippedReturnFlow.id && pair.first.values.length === 12) ||
  shippedPairs.some(pair => pair.second.id === shippedReturnFlow.id && pair.second.values.length === 12),
  'the legal composition surface must include the shipped twelve-wall return-flow'
);

// Exercise auditLegalCompositions itself without passing prebuilt pairs. If the
// function silently drops `library`, this falls back to the raw five-wall
// return-flow and the length assertion fails even though a superficial id/count
// assertion could stay green.
const shippedPressure = shippedLibrary.find(pattern => pattern.id === 'monas.lunar-sweep');
const sentinelPressure = Object.freeze({ ...shippedPressure, id: 'qa.adjusted-pressure' });
const sentinelReturnFlow = Object.freeze({ ...shippedReturnFlow, id: 'qa.adjusted-return-flow' });
const adjustedCompositionAudit = composition.auditLegalCompositions({
  library: [sentinelPressure, sentinelReturnFlow],
  coverage: 'bounded',
  scenarios: [{ id: 'fold-closed', width: 374, height: 882 }],
  anchors: [0.5],
  modes: ['ordinary'],
  margins: [8, 4, 0],
  baseSpeed: 2.9,
  nominalGap: 260,
  beamWidth: 500
});
assert.ok(adjustedCompositionAudit.cases.some(entry =>
  entry.firstPatternId === 'qa.adjusted-pressure' && entry.secondPatternId === 'qa.adjusted-return-flow'),
  'the compositional audit must build its pairs from the supplied policy-adjusted library');
assert.ok(adjustedCompositionAudit.cases.every(entry =>
  [entry.firstPatternId, entry.secondPatternId].every(id => id.startsWith('qa.adjusted-'))),
  'dropping the supplied library must not silently fall back to raw catalog pairs');

for (const transition of composition.LEGAL_FAMILY_TRANSITIONS) {
  const allForTransition = allPairs.filter(pair => pair.transition === transition.key);
  const boundedForTransition = bounded.filter(pair => pair.transition === transition.key);
  assert.ok(boundedForTransition.length > 0, `missing bounded coverage for ${transition.key}`);

  const expectedFirst = new Set(allForTransition.map(pair => pair.firstVariant));
  const actualFirst = new Set(boundedForTransition.map(pair => pair.firstVariant));
  const expectedSecond = new Set(allForTransition.map(pair => pair.secondVariant));
  const actualSecond = new Set(boundedForTransition.map(pair => pair.secondVariant));
  assert.deepEqual(actualFirst, expectedFirst, `${transition.key} must cover every first-side pattern variant`);
  assert.deepEqual(actualSecond, expectedSecond, `${transition.key} must cover every second-side pattern variant`);
}

const still = grammar.PATTERN_LIBRARY.MONAS.find(pattern => pattern.id === 'monas.still-point');
const mercurial = grammar.PATTERN_LIBRARY.MONAS.find(pattern => pattern.id === 'monas.mercurial-wave');
const representative = allPairs.find(pair => (
  pair.first.id === still.id &&
  pair.firstDirection === 1 &&
  pair.second.id === mercurial.id &&
  pair.secondDirection === 1
));
assert.ok(representative, 'expected safe->pressure representative pair');

const materialized = composition.materializePatternPair(representative, 0.5);
assert.equal(materialized.firstLength, still.values.length);
assert.equal(materialized.ratios.length, still.values.length + mercurial.values.length);
assert.equal(
  materialized.ratios[materialized.boundaryGateIndex],
  materialized.boundaryAnchor,
  'the next pattern must begin at the previous pattern endpoint exactly like PatternScheduler'
);
assert.equal(
  materialized.envelope.gapScale,
  Math.min(still.gapScale, mercurial.gapScale),
  'pair proof must use the tighter gap scale'
);
assert.equal(
  materialized.envelope.motionAmplitude,
  Math.max(still.motion, mercurial.motion),
  'pair proof must use the larger motion amplitude'
);

const solved = composition.classifyPatternPair(representative, {
  anchor: 0.5,
  viewportWidth: 374,
  viewportHeight: 882,
  baseSpeed: 2.9,
  nominalGap: 260,
  mode: 'ordinary',
  beamWidth: 600
});
assert.equal(solved.classification.classification, 'verified', 'baseline legal composition should have an 8px witness');
assert.equal(solved.classification.result.witnessValid, true, 'accepted composition witness must replay exactly');
assert.ok(solved.classification.result.minimumClearance >= 8 - 1e-9);

const audit = composition.auditLegalCompositions({
  coverage: 'bounded',
  pairs: [representative],
  scenarios: [{ id: 'fold-closed', width: 374, height: 882 }],
  anchors: [0.5],
  modes: ['ordinary'],
  baseSpeed: 2.9,
  nominalGap: 260,
  beamWidth: 600
});
assert.equal(audit.totalCases, 1);
assert.equal(audit.summary.verified, 1);
assert.equal(audit.summary.marginal, 0);
assert.equal(audit.summary.unverified, 0);

console.log('monas-compositional-reachability: all assertions passed');
