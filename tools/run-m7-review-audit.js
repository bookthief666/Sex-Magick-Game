'use strict';

const grammar = require('./obstacle-grammar.js');
const policy = require('./reachability-policy.js');
const composition = require('./compositional-reachability.js');
const diagnostics = require('./m7-review-diagnostics.js');

policy.install(grammar);

const seeds = [0x12345678, 0xdecafbad];
const scenarios = [
  { id: 'phone-hard', width: 390, height: 844, mobile: true, speed: 8.5, gap: 110, breathPhases: [0, 31] },
  { id: 'fold-open-hard', width: 884, height: 1104, mobile: false, speed: 8.5, gap: 110, breathPhases: [0, 31] }
];

function compactVariant(variant) {
  return {
    buffer: variant.inputBufferFrames,
    margin: variant.margin,
    cases: variant.caseCount,
    valid: variant.validCount,
    rate: Number(variant.survivalRate.toFixed(4)),
    distanceOneRate: Number(variant.distanceOneRate.toFixed(4))
  };
}

const cases = [];
for (const rite of ['HEX', 'MONAS']) {
  for (const seed of seeds) {
    for (const scenario of scenarios) {
      for (const breathPhase of scenario.breathPhases) {
        const generated = composition.generatePatternSequence({
          rite,
          seed,
          patternCycles: 1,
          viewportHeight: scenario.height,
          gap: scenario.gap
        });
        const solution = composition.solveComposition({
          generated,
          viewportWidth: scenario.width,
          viewportHeight: scenario.height,
          mobile: scenario.mobile,
          speed: scenario.speed,
          gap: scenario.gap,
          breathPhase,
          margin: 8,
          beamWidth: 900
        });
        if (!solution.solvable || !solution.witnessValid) {
          throw new Error(`${rite}/${seed.toString(16)}/${scenario.id}/${breathPhase} has no accepted witness`);
        }

        const constantGap = diagnostics.evaluateSolutionDiagnostics(solution, {
          viewportWidth: scenario.width,
          viewportHeight: scenario.height,
          mobile: scenario.mobile,
          speed: scenario.speed,
          gap: scenario.gap,
          baseGap: scenario.gap,
          gapAmplitude: 0,
          breathPhase,
          maximumDistance: 3,
          maximumCases: 60
        });
        const breathingGap = diagnostics.evaluateSolutionDiagnostics(solution, {
          viewportWidth: scenario.width,
          viewportHeight: scenario.height,
          mobile: scenario.mobile,
          speed: scenario.speed,
          gap: scenario.gap,
          baseGap: scenario.gap,
          gapAmplitude: 10,
          breathPhase,
          bufferVariants: [0, 3],
          margins: [0, 8],
          maximumDistance: 3,
          maximumCases: 60
        });

        cases.push({
          rite,
          seed: `0x${seed.toString(16).padStart(8, '0')}`,
          scenario: scenario.id,
          breathPhase,
          digest: generated.digest,
          gates: generated.gateCount,
          jumps: solution.jumpFrames.length,
          acceptedMinimumClearance: Number(solution.minimumClearance.toFixed(3)),
          spacing: {
            cooldown: constantGap.spacing.cooldown,
            intervals: constantGap.spacing.intervalCount,
            minimum: constantGap.spacing.minimum,
            maximum: constantGap.spacing.maximum,
            mean: constantGap.spacing.mean == null ? null : Number(constantGap.spacing.mean.toFixed(3)),
            tightCount: constantGap.spacing.tightCount,
            tightRate: Number(constantGap.spacing.tightRate.toFixed(4)),
            belowCooldownCount: constantGap.spacing.belowCooldownCount
          },
          constantGap: constantGap.variants.map(compactVariant),
          breathingGap: breathingGap.variants.map(compactVariant)
        });
      }
    }
  }
}

function range(values) {
  return values.length ? [Math.min(...values), Math.max(...values)] : [null, null];
}

function ratesFor(source, buffer, margin) {
  return cases.map(entry => entry[source].find(item => item.buffer === buffer && item.margin === margin)?.rate ?? 0);
}

const summary = {
  cases: cases.length,
  allWitnessesValid: cases.every(entry => entry.acceptedMinimumClearance >= 8),
  tightSpacingRateRange: range(cases.map(entry => entry.spacing.tightRate)),
  constantGap: {
    unbufferedSurvivalRange: range(ratesFor('constantGap', 0, 0)),
    buffer3SurvivalRange: range(ratesFor('constantGap', 3, 0)),
    unbufferedSafety8Range: range(ratesFor('constantGap', 0, 8)),
    buffer3Safety8Range: range(ratesFor('constantGap', 3, 8)),
    buffer4SurvivalRange: range(ratesFor('constantGap', 4, 0)),
    buffer6SurvivalRange: range(ratesFor('constantGap', 6, 0))
  },
  breathingGap: {
    unbufferedSurvivalRange: range(ratesFor('breathingGap', 0, 0)),
    buffer3SurvivalRange: range(ratesFor('breathingGap', 3, 0)),
    unbufferedSafety8Range: range(ratesFor('breathingGap', 0, 8)),
    buffer3Safety8Range: range(ratesFor('breathingGap', 3, 8))
  }
};

console.log('m7-review-audit: completed');
console.log(JSON.stringify({
  diagnosticsVersion: diagnostics.DIAGNOSTICS_VERSION,
  grammarVersion: grammar.GRAMMAR_VERSION,
  reachabilityPolicyVersion: policy.POLICY_VERSION,
  summary,
  cases
}, null, 2));
