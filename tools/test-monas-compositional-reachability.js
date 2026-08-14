'use strict';

const assert = require('node:assert/strict');
const grammar = require('./obstacle-grammar.js');
const reach = require('./monas-reachability.js');
const composition = require('./monas-compositional-reachability.js');

assert.deepEqual(
  composition.LEGAL_FAMILY_TRANSITIONS.map(entry => entry.key),
  ['safe->pressure', 'pressure->recovery', 'recovery->pressure', 'pressure->climax', 'climax->recovery', 'recovery->safe'],
  'composition must follow the scheduler family cycle, including the wrap back to safe'
);

const allPairs = composition.buildLegalVariantPairs();
const bounded = composition.selectCoveragePairs(allPairs);
assert.ok(allPairs.length > bounded.length, 'bounded PR coverage must be smaller than the full cross product');
assert.ok(bounded.length > 0, 'bounded coverage must retain legal pairs');

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
