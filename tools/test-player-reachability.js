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
  // Derived rather than hardcoded: M40.3 grew the library from 16 patterns to
  // 28, and a literal case count asserts the library's size rather than its
  // reachability. What must hold is that *every* case verifies and none is
  // marginal or invalid - that is the property new patterns have to earn.
  const libraryPatternCount =
    grammar.PATTERN_LIBRARY.HEX.length + grammar.PATTERN_LIBRARY.MONAS.length;
  assert.equal(Object.keys(audit.patternVerdicts).length, libraryPatternCount);
  assert.ok(audit.totalCases >= 252, `audit coverage shrank to ${audit.totalCases} cases`);
  assert.deepEqual(
    audit.summary,
    { verified: audit.totalCases, marginal: 0, invalid: 0 },
    'every pattern in the library must be provably clearable at the hard scenarios'
  );
  assert.ok(Object.values(audit.patternVerdicts).every(value => value === 'verified'));
  assert.ok(audit.cases.every(entry => entry.witnessValid));
  assert.ok(audit.cases.every(entry => entry.verifiedMargin === 8));

  // M17 extended the difficulty curve past GEBURAH, where it used to stop. Every
  // new band is audited at its own speed and at the bottom of the +/-10px
  // breathing getCurrentGap applies, because those are the configurations the
  // game can now actually reach - the 2026-08-12 pilot spent 196 of its 507 gate
  // clears past the old ceiling.
  //
  // The variety runtime guarantees that scaling and wall motion never leave a
  // corridor narrower than VERIFIED_STATIC_GAP, and that floor is the phone-hard
  // scenario already audited above, so these scenarios cover the static geometry
  // and the clamp covers the moving geometry on top of it.
  const gate = require('./gate-slice-runtime.js');
  const variety = require('./obstacle-variety-runtime.js');
  // Identify the bands M17 added by position, not by gate threshold. D-067
  // re-spaced the thresholds and a `> 32` filter silently changed which bands
  // this audit covered - the audit must track the bands themselves, not where
  // the ladder happens to place them this week.
  const extendedBands = gate.BANDS.slice(4);
  assert.equal(extendedBands.length, 4, 'M17 added four bands past GEBURAH');
  assert.deepEqual(
    extendedBands.map(band => band.name),
    ['CHESED', 'BINAH', 'CHOKMAH', 'KETHER'],
    'the four post-GEBURAH bands'
  );

  // M44: each rite is audited against the ladder it actually runs.
  //
  // This used to build scenarios from HEX's bands alone and hand them to both
  // rites. That is what pinned the speed ceiling at 8.5: D-072 proved HEX clean at
  // 9.0, 9.5 and 10.0, but the raise failed this assertion because seven MONAS
  // patterns cannot hold KETHER - at a speed MONAS never reaches, since the Gate
  // slice returns early unless `gameMode === 'HEX'` and MONAS has its own ladder in
  // `monas-progression-runtime.js`. The audit was constraining the ceiling with a
  // condition the game cannot produce.
  //
  // The replacement is stricter, not looser. MONAS's own bands were never
  // specifically covered here - they were only ever incidentally cleared by being
  // easier than HEX's - so this adds coverage the audit did not have while
  // removing coverage of a state that cannot exist.
  const monasProgression = require('./monas-progression-runtime.js');

  function bandScenariosFor(bands, label, speedCeiling) {
    return bands.flatMap(band => {
      const gap = band.gap - 10;
      const name = band.name || band.id;
      assert.ok(
        gap >= variety.VERIFIED_STATIC_GAP,
        `${label} ${name} breathes below the verified corridor floor at ${gap}px`
      );
      assert.ok(
        band.speed <= speedCeiling,
        `${label} ${name} exceeds its audited speed envelope at ${band.speed}`
      );
      return [
        { id: `${name}-phone`, width: 390, height: 844, mobile: true, speed: band.speed, gap, breathPhases: [0] },
        { id: `${name}-fold`, width: 884, height: 1104, mobile: false, speed: band.speed, gap, breathPhases: [0, 31] }
      ];
    });
  }

  const hexBandScenarios = bandScenariosFor(extendedBands, 'HEX', gate.MAX_VALIDATED_SPEED);
  // MONAS's whole ladder, not a tail of it: it is short enough that auditing all of
  // it costs little, and picking a slice would reintroduce exactly the positional
  // fragility the `extendedBands` comment above warns about.
  const monasBandScenarios = bandScenariosFor(
    monasProgression.BANDS, 'MONAS', monasProgression.MAX_VALIDATED_SPEED
  );

  const bandAudit = reachability.auditPatternLibrary(grammar, {
    patternResolver: policy.applyPatternOverride,
    scenariosByRite: { HEX: hexBandScenarios, MONAS: monasBandScenarios },
    // Kept as the fallback so a rite this forgets to describe is over-constrained
    // rather than silently skipped.
    scenarios: hexBandScenarios,
    beamWidth: 1000
  });
  // Derived for the same reason as the library audit above: the case count
  // tracks the library's size, the contract is that every case verifies.
  assert.ok(bandAudit.totalCases >= 1008, `band audit coverage shrank to ${bandAudit.totalCases}`);
  assert.deepEqual(
    bandAudit.summary,
    { verified: bandAudit.totalCases, marginal: 0, invalid: 0 },
    'every pattern must clear every post-GEBURAH band'
  );
  assert.ok(bandAudit.cases.every(entry => entry.witnessValid));
  assert.ok(bandAudit.cases.every(entry => entry.verifiedMargin === 8));
  assert.ok(bandAudit.cases.every(entry => entry.minimumClearance >= 8 - 1e-9));
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

  const ledger = new grammar.PatternRunLedger({ storage: grammar.createMemoryStorage() });
  ledger.begin({ runId: 'run_policy_test', seed: 12345, rite: 'HEX', startReason: 'qa' });
  const spec = scheduler.next({ viewportHeight: 844, gap: 200, orbChance: 0 });
  ledger.recordSpawn(spec, { frames: 140, score: 0 });
  const evidence = ledger.snapshot().current;
  const event = evidence.patternEvents[0];
  assert.equal(evidence.reachabilityPolicyVersion, policy.POLICY_VERSION);
  assert.equal(event.reachabilityPolicyVersion, policy.POLICY_VERSION);
  assert.equal(event.reachabilityVerdict, 'verified');
  assert.equal(event.reachabilityFallback, true);
  // M40.3: which pattern the seeded scheduler reaches for first depends on the
  // library's size, so naming it here asserted the catalogue rather than the
  // fallback behaviour. What must hold is that whatever was rejected was a real
  // catalogue pattern, and that the fallback stood in for it.
  assert.ok(
    catalogIds.includes(event.rejectedPatternId),
    `rejected id ${event.rejectedPatternId} is not a catalogue pattern`
  );
  assert.notEqual(
    event.rejectedPatternId,
    policy.FALLBACK_PATTERN_IDS.HEX,
    'the fallback cannot be the thing that was rejected'
  );
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