'use strict';

const assert = require('node:assert/strict');
const frontier = require('./monas-progression-frontier.js');

assert.equal(frontier.validateCandidateLadder(), true);
assert.equal(frontier.CANDIDATES[0].id, 'baseline');
assert.equal(frontier.CANDIDATES[0].baseSpeed, 2.9);
assert.equal(frontier.CANDIDATES[0].nominalGap, 260);
assert.equal(frontier.CANDIDATES.at(-1).baseSpeed, 5.7);
assert.equal(frontier.CANDIDATES.at(-1).nominalGap, 190);

const patterns = frontier.resolveTargetPatterns();
assert.deepEqual(patterns.map(pattern => pattern.id), [...frontier.TARGET_PATTERN_IDS]);
const pairs = frontier.resolveTargetPairs();
assert.deepEqual(pairs.map(pair => pair.id), [...frontier.TARGET_PAIR_IDS]);
assert.ok(pairs.every(pair => pair.transition), 'every targeted pair must be scheduler-legal');

const smoke = frontier.auditCandidate(frontier.CANDIDATES[0], {
  margin: 8,
  beamWidth: 600,
  patterns: patterns.filter(pattern => pattern.id === 'monas.caduceus-wave'),
  pairs: [],
  stopOnConcern: true
});
assert.equal(smoke.fullyVerified, true, 'known baseline caduceus target should remain verified at 8px');
assert.equal(smoke.firstConcern, null);
assert.ok(smoke.patternCasesRun > 0);

console.log('monas-progression-frontier: all assertions passed');
