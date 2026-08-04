'use strict';

const assert = require('node:assert/strict');
const grammar = require('./obstacle-grammar.js');
const reachability = require('./player-reachability.js');
const policy = require('./reachability-policy.js');

function approximately(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function testPhysicsProfiles() {
  const hex = reachability.advancePlayerState(
    { y: 400, vy: 0, cooldown: 0 },
    { rite: 'HEX', mobile: true, viewportHeight: 844, jump: true }
  );
  approximately(hex.vy, -7.05);
  approximately(hex.y, 392.95);
  assert.equal(hex.cooldown, 7);

  const monas = reachability.advancePlayerState(
    { y: 400, vy: 0, cooldown: 0 },
    { rite: 'MONAS', mobile: true, viewportHeight: 844, jump: true }
  );
  approximately(monas.vy, -6.8796);
  approximately(monas.y, 393.1204);
  assert.equal(monas.cooldown, 7);

  const topClamp = reachability.advancePlayerState(
    { y: 24, vy: -7, cooldown: 0 },
    { rite: 'HEX', mobile: false, viewportHeight: 844, jump: false }
  );
  assert.equal(topClamp.y, 24);
  assert.equal(topClamp.vy, 0);
}

function testCollisionWindows() {
  for (const speed of [2.9, 5.5, 8.5]) {
    const window = reachability.computeGateCollisionWindow({
      viewportWidth: 390,
      speed,
      spawnFrame: 100
    });
    assert.ok(window.duration >= 1);
    assert.ok(window.start >= 100);
    assert.ok(window.end >= window.start);

    const playerX = 390 * 0.25;
    const left = playerX - reachability.HITBOX_HALF;
    const right = playerX + reachability.HITBOX_HALF;
    for (let frame = window.start; frame <= window.end; frame += 1) {
      const age = frame - 100 + 1;
      const x = 390 - (speed * age);
      assert.ok(x < right && x + reachability.PILLAR_WIDTH > left);
    }
  }
}

function testReachabilityMatrix() {
  const unsafeReturnFlow = grammar.PATTERN_LIBRARY.MONAS.find(pattern => pattern.id === 'monas.return-flow');
  const unsafeResult = reachability.classifyGateSequence({
    rite: 'MONAS',
    ratios: grammar.materializePattern(unsafeReturnFlow, 0.22, 1),
    viewportWidth: 884,
    viewportHeight: 1104,
    mobile: false,
    speed: 8.5,
    gap: 110,
    breathPhase: 0,
    beamWidth: 5000
  });
  assert.equal(unsafeResult.classification, 'invalid');

  const adjustedReturnFlow = policy.applyPatternOverride(unsafeReturnFlow);
  const adjustedResult = reachability.classifyGateSequence({
    rite: 'MONAS',
    ratios: grammar.materializePattern(adjustedReturnFlow, 0.22, 1),
    viewportWidth: 884,
    viewportHeight: 1104,
    mobile: false,
    speed: 8.5,
    gap: 110,
    breathPhase: 0,
    beamWidth: 5000
  });
  assert.equal(adjustedResult.classification, 'verified');
  assert.equal(adjustedResult.verifiedMargin, 8);

  const auditScenarios = [
    { id: 'phone-hard', width: 390, height: 844, mobile: true, speed: 8.5, gap: 110, breathPhases: [0] },
    { id: 'fold-open-hard', width: 884, height: 1104, mobile: false, speed: 8.5, gap: 110, breathPhases: [0, 31] }
  ];
  const audit = reachability.auditPatternLibrary(grammar, {
    patternResolver: policy.applyPatternOverride,
    scenarios: auditScenarios,
    beamWidth: 1000
  });
  assert.equal(audit.totalCases, 252);
  assert.deepEqual(audit.summary, { verified: 252, marginal: 0, invalid: 0 });
  assert.equal(Object.keys(audit.patternVerdicts).length, 16);
  assert.ok(Object.values(audit.patternVerdicts).every(value => value === 'verified'));
  assert.ok(audit.cases.every(entry => entry.witnessValid));
  assert.ok(audit.cases.every(entry => entry.verifiedMargin === 8));
  assert.ok(audit.cases.every(entry => entry.minimumClearance >= 8 - 1e-9));

  const representativePatterns = [
    ['HEX', 'hex.lightning-flash'],
    ['MONAS', 'monas.serpent-current']
  ];
  const representativeScenarios = [
    { id: 'fold-closed-hard', width: 374, height: 882, mobile: true, speed: 8.5, gap: 110 },
    { id: 'desktop-hard', width: 1440, height: 900, mobile: false, speed: 8.5, gap: 110 },
    { id: 'desktop-mid', width: 1440, height: 900, mobile: false, speed: 5.5, gap: 150 },
    { id: 'phone-start', width: 390, height: 844, mobile: true, speed: 2.9, gap: 200 }
  ];
  for (const [rite, patternId] of representativePatterns) {
    const rawPattern = grammar.PATTERN_LIBRARY[rite].find(pattern => pattern.id === patternId);
    const pattern = policy.applyPatternOverride(rawPattern);
    for (const scenario of representativeScenarios) {
      const result = reachability.solveGateSequence({
        rite,
        ratios: grammar.materializePattern(pattern, 0.5, 1),
        viewportWidth: scenario.width,
        viewportHeight: scenario.height,
        mobile: scenario.mobile,
        speed: scenario.speed,
        gap: scenario.gap,
        breathPhase: 0,
        beamWidth: 1000,
        margin: 8
      });
      assert.equal(result.solvable, true, `${patternId} failed ${scenario.id}`);
      assert.equal(result.witnessValid, true, `${patternId} witness failed ${scenario.id}`);
    }
  }
  return audit;
}

function testFallbackPolicy() {
  const catalogIds = Object.values(grammar.PATTERN_LIBRARY)
    .flat()
    .map(pattern => pattern.id)
    .sort();
  assert.deepEqual([...policy.VERIFIED_PATTERN_IDS].sort(), catalogIds);

  const selected = grammar.PATTERN_LIBRARY.HEX.find(pattern => pattern.id === 'hex.staircase');
  const resolution = policy.resolvePatternCandidate({
    rite: 'HEX',
    selected,
    catalog: grammar.PATTERN_LIBRARY.HEX,
    verdicts: {
      ...policy.PATTERN_VERDICTS,
      'hex.staircase': 'invalid'
    }
  });
  assert.equal(resolution.fallbackApplied, true);
  assert.equal(resolution.rejectedPatternId, 'hex.staircase');
  assert.equal(resolution.pattern.id, 'hex.return-to-axis');

  const customVerdicts = Object.fromEntries(catalogIds.map(id => [id, 'invalid']));
  customVerdicts['hex.return-to-axis'] = 'verified';
  customVerdicts['monas.still-point'] = 'verified';
  policy.install(grammar, { verdicts: customVerdicts });
  const scheduler = new grammar.PatternScheduler({ seed: 12345, rite: 'HEX' });
  const active = scheduler.choosePattern();
  assert.equal(active.baseId, 'hex.return-to-axis');
  assert.equal(active.reachabilityFallback, true);
  assert.ok(scheduler.snapshot().reachabilityFallbackCount >= 1);
}

testPhysicsProfiles();
testCollisionWindows();
const audit = testReachabilityMatrix();
testFallbackPolicy();

console.log('player-reachability: all deterministic contracts passed');
console.log(JSON.stringify({
  solverVersion: audit.solverVersion,
  totalCases: audit.totalCases,
  summary: audit.summary,
  patternVerdicts: audit.patternVerdicts,
  scenarios: audit.scenarios.map(scenario => scenario.id)
}, null, 2));