(function attachSexMagickCompositionalRobustness(root, factory) {
  'use strict';
  const dependency = (globalValue, localPath) => {
    if (globalValue) return globalValue;
    if (typeof require === 'function') return require(localPath);
    return null;
  };
  const api = factory(
    dependency(root.SexMagickCompositionalReachability, './compositional-reachability.js')
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickCompositionalRobustness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCompositionalRobustnessApi(composition) {
  'use strict';

  if (!composition) throw new Error('Compositional robustness requires the compositional reachability API');

  const ROBUSTNESS_VERSION = 1;
  const DEFAULT_MAXIMUM_DISTANCE = 3;
  const DEFAULT_MAXIMUM_CASES = 180;
  const DISTANCE_ONE_THRESHOLD = 0.7;
  const OVERALL_THRESHOLD = 0.45;

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalizeJumpFrames(frames) {
    return [...new Set((frames || []).map(value => Math.max(0, Math.floor(Number(value)))))].sort((a, b) => a - b);
  }

  function chooseDistributedIndices(count, slots) {
    const resolvedCount = Math.max(0, Math.floor(finite(count)));
    const resolvedSlots = Math.max(0, Math.min(resolvedCount, Math.floor(finite(slots))));
    if (resolvedSlots === 0) return [];
    if (resolvedSlots === 1) return [Math.floor((resolvedCount - 1) / 2)];
    const indices = new Set();
    for (let slot = 0; slot < resolvedSlots; slot += 1) {
      indices.add(Math.round((slot * (resolvedCount - 1)) / (resolvedSlots - 1)));
    }
    return [...indices].sort((a, b) => a - b);
  }

  function buildPerturbationCases(jumpFrames, options = {}) {
    const base = normalizeJumpFrames(jumpFrames);
    const maximumDistance = Math.max(1, Math.floor(finite(options.maximumDistance, DEFAULT_MAXIMUM_DISTANCE)));
    const maximumCases = Math.max(1, Math.floor(finite(options.maximumCases, DEFAULT_MAXIMUM_CASES)));
    const cases = [{ id: 'base', kind: 'base', distance: 0, jumpFrames: base }];

    for (let distance = 1; distance <= maximumDistance && cases.length < maximumCases; distance += 1) {
      for (const direction of [-1, 1]) {
        if (cases.length >= maximumCases) break;
        cases.push({
          id: `global-${direction < 0 ? 'early' : 'late'}-${distance}`,
          kind: 'global',
          distance,
          jumpFrames: normalizeJumpFrames(base.map(frame => frame + (direction * distance)))
        });
      }
    }

    const perJumpCaseCount = maximumDistance * 2;
    const remaining = Math.max(0, maximumCases - cases.length);
    const jumpSlots = perJumpCaseCount > 0 ? Math.min(base.length, Math.floor(remaining / perJumpCaseCount)) : 0;
    const sampledJumpIndices = chooseDistributedIndices(base.length, jumpSlots);

    for (const jumpIndex of sampledJumpIndices) {
      for (let distance = 1; distance <= maximumDistance; distance += 1) {
        for (const direction of [-1, 1]) {
          if (cases.length >= maximumCases) break;
          const changed = [...base];
          changed[jumpIndex] += direction * distance;
          cases.push({
            id: `single-${jumpIndex}-${direction < 0 ? 'early' : 'late'}-${distance}`,
            kind: 'single',
            distance,
            jumpIndex,
            jumpFrame: base[jumpIndex],
            jumpFrames: normalizeJumpFrames(changed)
          });
        }
      }
    }

    return {
      cases: cases.slice(0, maximumCases),
      coverage: {
        totalJumps: base.length,
        sampledJumpCount: sampledJumpIndices.length,
        sampledJumpIndices,
        firstSampledIndex: sampledJumpIndices[0] ?? null,
        lastSampledIndex: sampledJumpIndices[sampledJumpIndices.length - 1] ?? null,
        indexCoverageRate: base.length ? sampledJumpIndices.length / base.length : 1
      }
    };
  }

  function evaluateWitnessRobustness(solution, options = {}) {
    if (!solution?.solvable || !solution.witnessValid) {
      return {
        robustnessVersion: ROBUSTNESS_VERSION,
        classification: 'invalid',
        baseValid: false,
        caseCount: 0,
        validCount: 0,
        overallRate: 0,
        distanceOneRate: 0,
        distanceRates: {},
        coverage: null,
        results: []
      };
    }

    const built = buildPerturbationCases(solution.jumpFrames, options);
    const ratios = solution.generated.sequence.map(spec => spec.topRatio);
    const results = built.cases.map(testCase => {
      const replay = composition.replayCompositionWitness({
        rite: solution.rite,
        ratios,
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
        speed: options.speed,
        gap: options.gap,
        mobile: options.mobile,
        breathPhase: options.breathPhase,
        margin: options.margin || 0,
        initialState: solution.initialState,
        jumpFrames: testCase.jumpFrames
      });
      return { ...testCase, valid: replay.valid, minimumClearance: replay.minimumClearance };
    });

    const valid = results.filter(result => result.valid);
    const maximumDistance = Math.max(1, Math.floor(finite(options.maximumDistance, DEFAULT_MAXIMUM_DISTANCE)));
    const distanceRates = {};
    for (let distance = 0; distance <= maximumDistance; distance += 1) {
      const group = results.filter(result => result.distance === distance);
      if (group.length) distanceRates[distance] = group.filter(result => result.valid).length / group.length;
    }

    const validCount = valid.length;
    const overallRate = results.length ? validCount / results.length : 0;
    const distanceOneRate = distanceRates[1] || 0;
    const baseValid = Boolean(results.find(result => result.kind === 'base')?.valid);
    const classification = baseValid && distanceOneRate >= DISTANCE_ONE_THRESHOLD && overallRate >= OVERALL_THRESHOLD
      ? 'robust-candidate'
      : baseValid
        ? 'technically-reachable-fragile'
        : 'invalid';

    return {
      robustnessVersion: ROBUSTNESS_VERSION,
      classification,
      baseValid,
      caseCount: results.length,
      validCount,
      overallRate,
      distanceOneRate,
      distanceRates,
      coverage: built.coverage,
      minimumSuccessfulClearance: valid.length ? Math.min(...valid.map(result => result.minimumClearance)) : null,
      results
    };
  }

  function auditMatrix(options = {}) {
    const scenarios = options.scenarios || composition.DEFAULT_SCENARIOS;
    const seeds = options.seeds || composition.DEFAULT_SEEDS;
    const rites = options.rites || ['HEX', 'MONAS'];
    const cases = [];

    for (const rite of rites) {
      for (const seed of seeds) {
        for (const scenario of scenarios) {
          for (const breathPhase of scenario.breathPhases || [0]) {
            const generated = composition.generatePatternSequence({
              rite,
              seed,
              patternCycles: options.patternCycles || 1,
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
              margin: options.margin || 0,
              beamWidth: options.beamWidth || composition.DEFAULT_BEAM_WIDTH
            });
            const robustness = evaluateWitnessRobustness(solution, {
              viewportWidth: scenario.width,
              viewportHeight: scenario.height,
              mobile: scenario.mobile,
              speed: scenario.speed,
              gap: scenario.gap,
              breathPhase,
              margin: options.margin || 0,
              maximumDistance: options.maximumDistance || DEFAULT_MAXIMUM_DISTANCE,
              maximumCases: options.maximumCases || DEFAULT_MAXIMUM_CASES
            });
            cases.push({
              rite,
              seed: composition.normalizeSeed(seed),
              scenarioId: scenario.id,
              breathPhase,
              digest: generated.digest,
              patternCount: generated.patternCount,
              gateCount: generated.gateCount,
              solvable: solution.solvable,
              witnessValid: solution.witnessValid,
              survivingStateCount: solution.survivingStateCount || 0,
              boundaryCount: solution.boundaryResults?.length || 0,
              jumpCount: solution.jumpFrames?.length || 0,
              minimumClearance: solution.minimumClearance ?? null,
              robustnessClassification: robustness.classification,
              robustnessRate: robustness.overallRate,
              distanceOneRate: robustness.distanceOneRate,
              coverage: robustness.coverage,
              failedPatternId: solution.failedPattern?.basePatternId || null,
              solution,
              robustness
            });
          }
        }
      }
    }

    const summary = cases.reduce((counts, entry) => {
      if (!entry.solvable || entry.robustnessClassification === 'invalid') counts.invalid += 1;
      else if (entry.robustnessClassification === 'robust-candidate') counts.robustCandidate += 1;
      else counts.fragile += 1;
      return counts;
    }, { robustCandidate: 0, fragile: 0, invalid: 0 });

    return {
      robustnessVersion: ROBUSTNESS_VERSION,
      compositionVersion: composition.COMPOSITION_VERSION,
      totalCases: cases.length,
      summary,
      cases
    };
  }

  return Object.freeze({
    ROBUSTNESS_VERSION,
    DEFAULT_MAXIMUM_DISTANCE,
    DEFAULT_MAXIMUM_CASES,
    DISTANCE_ONE_THRESHOLD,
    OVERALL_THRESHOLD,
    normalizeJumpFrames,
    chooseDistributedIndices,
    buildPerturbationCases,
    evaluateWitnessRobustness,
    auditMatrix
  });
});