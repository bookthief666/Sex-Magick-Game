'use strict';

const assert = require('node:assert/strict');
const grammar = require('./obstacle-grammar.js');
const reachability = require('./player-reachability.js');

const pattern = grammar.PATTERN_LIBRARY.HEX.find(item => item.id === 'hex.axis-hold');
const ratios = grammar.materializePattern(pattern, 0.22, 1);
const geometry = {
  viewportWidth: 390,
  viewportHeight: 844,
  speed: 8.5,
  gap: 110
};
const base140 = reachability.buildGateWindows(ratios, { ...geometry, pillarSpawnBase: 140 });
const base132 = reachability.buildGateWindows(ratios, { ...geometry, pillarSpawnBase: 132 });

assert.equal(reachability.SOLVER_VERSION, 2,
  'the exact-timeline replay fix must not publish evidence under the obsolete v1 solver identity');
assert.equal(Object.isFrozen(base132), true, 'searched gate array must be immutable');
assert.ok(base132.every(Object.isFrozen), 'every searched gate must be immutable');
assert.notDeepEqual(base140.map(gate => gate.spawnFrame), base132.map(gate => gate.spawnFrame),
  'negative control: the two spawn bases must produce different timelines');

const solved = reachability.solveGateSequence({
  rite: 'HEX',
  ratios,
  ...geometry,
  mobile: true,
  pillarSpawnBase: 132,
  breathPhase: 0,
  beamWidth: 2500,
  margin: 8
});

assert.equal(solved.solvable, true);
assert.equal(solved.witnessValid, true);
assert.equal(solved.replayUsedSearchGates, true,
  'replay must consume the exact array searched, not rebuild equivalent-looking gates');
assert.deepEqual(solved.replaySpawnFrames, solved.searchSpawnFrames,
  'search and replay spawnFrame arrays must be identical');

console.log('player replay timeline: exact immutable gate sequence verified');
