'use strict';

const assert = require('node:assert/strict');
const grammar = require('./obstacle-grammar.js');
const policy = require('./reachability-policy.js');
const reachability = require('./player-reachability.js');
const composition = require('./compositional-reachability.js');
const robustnessPolicy = require('./compositional-robustness.js');

policy.install(grammar);

function summarizeCase(entry) {
  return {
    rite: entry.rite,
    seed: `0x${entry.seed.toString(16).padStart(8, '0')}`,
    scenario: entry.scenarioId,
    breathPhase: entry.breathPhase,
    digest: entry.digest,
    patternCount: entry.patternCount,
    gateCount: entry.gateCount,
    solvable: entry.solvable,
    witnessValid: entry.witnessValid,
    survivingStates: entry.survivingStateCount,
    survivingInitialStates: entry.solution.survivingInitialStateCount || 0,
    boundaries: entry.boundaryCount,
    jumps: entry.jumpCount,
    minimumClearance: entry.minimumClearance,
    robustness: entry.robustnessClassification,
    robustnessRate: entry.robustnessRate,
    distanceOneRate: entry.distanceOneRate,
    perturbationCoverage: entry.coverage,
    failedPatternId: entry.failedPatternId
  };
}

const deterministicA = composition.generatePatternSequence({
  rite: 'MONAS', seed: 0x12345678, patternCycles: 1, viewportHeight: 844, gap: 110
});
const deterministicB = composition.generatePatternSequence({
  rite: 'MONAS', seed: 0x12345678, patternCycles: 1, viewportHeight: 844, gap: 110
});

assert.equal(deterministicA.patternCount, grammar.FAMILY_CYCLE.length);
assert.equal(deterministicA.digest, deterministicB.digest);
assert.deepEqual(
  deterministicA.sequence.map(spec => [spec.patternId, spec.topRatio, spec.reachabilityAdjusted, spec.reachabilityFallback]),
  deterministicB.sequence.map(spec => [spec.patternId, spec.topRatio, spec.reachabilityAdjusted, spec.reachabilityFallback])
);
assert.equal(deterministicA.reachabilityPolicyVersion, policy.POLICY_VERSION);
assert.ok(deterministicA.sequence.some(spec => spec.reachabilityAdjusted), 'Seeded Monas cycle should exercise a measured policy adjustment');

const initialCloud = composition.createInitialStateCloud({
  rite: 'MONAS', mobile: true, viewportHeight: 844, centerY: 422
});
assert.equal(initialCloud.length, 27);
assert.equal(new Set(initialCloud.map(state => composition.stateKey(state))).size, 27);

// M40.3: a full cycle must be survivable back to back at *every* tier, not
// only the base rotation. The crown tier schedules three climaxes per cycle,
// which is exactly the case where each pattern can verify in isolation while
// the sequence is still compositionally unsurvivable.
const focusedCases = [];
for (const rite of ['HEX', 'MONAS']) {
 for (const bandIndex of [0, 2, 4, 6]) {
  const activeCycle = grammar.cycleForBand(bandIndex);
  const generated = composition.generatePatternSequence({
    rite, seed: 0x12345678, patternCycles: 1, viewportHeight: 844, gap: 110, bandIndex
  });
  const solution = composition.solveComposition({
    generated,
    viewportWidth: 390,
    viewportHeight: 844,
    mobile: true,
    speed: 8.5,
    gap: 110,
    breathPhase: 0,
    margin: 8,
    beamWidth: 1200
  });
  assert.equal(solution.solvable, true, `${rite} band ${bandIndex} full family cycle was not compositionally reachable`);
  assert.equal(solution.witnessValid, true, `${rite} band ${bandIndex} witness did not replay exactly`);
  assert.equal(solution.boundaryResults.length, activeCycle.length);
  assert.equal(solution.initialStateCount, 27);
  assert.ok(solution.survivingStateCount > 0);
  assert.ok(solution.survivingInitialStateCount > 0);
  assert.ok(solution.minimumClearance >= 8);
  assert.deepEqual(solution.boundaryResults.map(boundary => boundary.family), activeCycle);

  const robustness = robustnessPolicy.evaluateWitnessRobustness(solution, {
    viewportWidth: 390,
    viewportHeight: 844,
    mobile: true,
    speed: 8.5,
    gap: 110,
    breathPhase: 0,
    margin: 8,
    maximumDistance: 3,
    maximumCases: 60
  });
  assert.equal(robustness.baseValid, true);
  assert.ok(robustness.caseCount > 1);
  assert.ok(robustness.validCount >= 1);
  assert.ok(robustness.overallRate >= 0 && robustness.overallRate <= 1);
  assert.ok(robustness.results.some(result => !result.valid), `${rite} perturbation audit failed to distinguish the exact witness from timing errors`);
  assert.ok(robustness.coverage.sampledJumpCount > 0);
  assert.equal(robustness.coverage.firstSampledIndex, 0);
  assert.equal(robustness.coverage.lastSampledIndex, solution.jumpFrames.length - 1);
  focusedCases.push({ rite, bandIndex, generated, solution, robustness });
 }
}

const matrix = robustnessPolicy.auditMatrix({
  seeds: [0x12345678, 0xdecafbad],
  scenarios: [
    { id: 'phone-hard', width: 390, height: 844, mobile: true, speed: 8.5, gap: 110, breathPhases: [0, 31] },
    { id: 'fold-open-hard', width: 884, height: 1104, mobile: false, speed: 8.5, gap: 110, breathPhases: [0, 31] }
  ],
  patternCycles: 1,
  margin: 8,
  beamWidth: 900,
  maximumDistance: 3,
  maximumCases: 60
});

assert.equal(matrix.totalCases, 16);
assert.equal(matrix.summary.invalid, 0, JSON.stringify(matrix.cases.filter(entry => !entry.solvable).map(summarizeCase), null, 2));
assert.ok(matrix.cases.every(entry => entry.witnessValid));
assert.ok(matrix.cases.every(entry => entry.boundaryCount === grammar.FAMILY_CYCLE.length));
assert.ok(matrix.cases.every(entry => entry.minimumClearance >= 8));
assert.ok(matrix.cases.every(entry => entry.solution.survivingInitialStateCount > 0));
assert.ok(matrix.cases.every(entry => entry.robustnessClassification !== 'invalid'));
assert.ok(matrix.cases.every(entry => entry.coverage?.sampledJumpCount > 0));
assert.ok(matrix.cases.every(entry => entry.coverage?.firstSampledIndex === 0));
assert.ok(matrix.cases.every(entry => entry.coverage?.lastSampledIndex === entry.jumpCount - 1));

const longCases = [];
for (const rite of ['HEX', 'MONAS']) {
  const generated = composition.generatePatternSequence({
    rite, seed: 0x0badf00d, patternCycles: 2, viewportHeight: 844, gap: 110
  });
  const solution = composition.solveComposition({
    generated,
    viewportWidth: 390,
    viewportHeight: 844,
    mobile: true,
    speed: 8.5,
    gap: 110,
    breathPhase: 31,
    margin: 8,
    beamWidth: 1200
  });
  assert.equal(solution.solvable, true, `${rite} two-cycle sequence failed`);
  assert.equal(solution.witnessValid, true);
  assert.equal(solution.boundaryResults.length, grammar.FAMILY_CYCLE.length * 2);
  assert.ok(solution.minimumClearance >= 8);
  longCases.push({
    rite,
    digest: generated.digest,
    gates: generated.gateCount,
    boundaries: solution.boundaryResults.length,
    survivingStates: solution.survivingStateCount,
    survivingInitialStates: solution.survivingInitialStateCount,
    jumps: solution.jumpFrames.length,
    minimumClearance: solution.minimumClearance
  });
}

console.log('compositional-reachability: all deterministic contracts passed');
console.log(JSON.stringify({
  compositionVersion: composition.COMPOSITION_VERSION,
  robustnessVersion: robustnessPolicy.ROBUSTNESS_VERSION,
  solverVersion: reachability.SOLVER_VERSION,
  grammarVersion: grammar.GRAMMAR_VERSION,
  reachabilityPolicyVersion: policy.POLICY_VERSION,
  initialStateCloud: initialCloud.length,
  matrixSummary: matrix.summary,
  matrixCases: matrix.cases.map(summarizeCase),
  focusedRobustness: focusedCases.map(entry => ({
    rite: entry.rite,
    digest: entry.generated.digest,
    gates: entry.generated.gateCount,
    jumps: entry.solution.jumpFrames.length,
    minimumClearance: entry.solution.minimumClearance,
    classification: entry.robustness.classification,
    caseCount: entry.robustness.caseCount,
    validCount: entry.robustness.validCount,
    overallRate: entry.robustness.overallRate,
    distanceRates: entry.robustness.distanceRates,
    coverage: entry.robustness.coverage
  })),
  longCases
}, null, 2));