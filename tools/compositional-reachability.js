(function attachSexMagickCompositionalReachability(root, factory) {
  'use strict';

  const dependency = (globalValue, localPath) => {
    if (globalValue) return globalValue;
    if (typeof require === 'function') return require(localPath);
    return null;
  };

  const api = factory(
    dependency(root.SexMagickObstacleGrammar, './obstacle-grammar.js'),
    dependency(root.SexMagickReachabilityPolicy, './reachability-policy.js'),
    dependency(root.SexMagickReachability, './player-reachability.js')
  );

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickCompositionalReachability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCompositionApi(grammar, policy, reachability) {
  'use strict';

  if (!grammar || !policy || !reachability) {
    throw new Error('Compositional reachability requires obstacle grammar, reachability policy, and player reachability APIs');
  }

  const COMPOSITION_VERSION = 1;
  const DEFAULT_PATTERN_CYCLES = 1;
  const DEFAULT_BEAM_WIDTH = 1800;
  const DEFAULT_MAX_PERTURBATION_CASES = 180;
  const DEFAULT_PERTURBATION_DISTANCE = 3;
  const ROBUST_DISTANCE_ONE_RATE = 0.7;
  const ROBUST_OVERALL_RATE = 0.45;

  const DEFAULT_SCENARIOS = Object.freeze([
    Object.freeze({ id: 'phone-hard', width: 390, height: 844, mobile: true, speed: 8.5, gap: 110, breathPhases: Object.freeze([0, 31]) }),
    Object.freeze({ id: 'fold-open-hard', width: 884, height: 1104, mobile: false, speed: 8.5, gap: 110, breathPhases: Object.freeze([0, 31]) })
  ]);
  const DEFAULT_SEEDS = Object.freeze([0x12345678, 0xdecafbad]);

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeRite(value) {
    return value === 'MONAS' ? 'MONAS' : 'HEX';
  }

  function normalizeSeed(value) {
    const numeric = Math.floor(finite(Number(value), 0)) >>> 0;
    return numeric === 0 ? 0x6d2b79f5 : numeric;
  }

  function stateKey(state) {
    return [
      Math.round(finite(state.y) * 2) / 2,
      Math.round(finite(state.vy) * 4) / 4,
      Math.max(0, Math.floor(finite(state.cooldown)))
    ].join('|');
  }

  function cloneState(state) {
    return {
      y: finite(state?.y),
      vy: finite(state?.vy),
      cooldown: Math.max(0, Math.floor(finite(state?.cooldown))),
      initialStateId: state?.initialStateId || null,
      path: state?.path || null
    };
  }

  function createInitialStateCloud(options = {}) {
    const rite = normalizeRite(options.rite);
    const mobile = Boolean(options.mobile);
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const centerY = finite(options.centerY, viewportHeight / 2);
    const cooldownMaximum = reachability.getPhysicsProfile(rite, mobile).jumpCooldown;
    const yOffsets = options.yOffsets || [-16, 0, 16];
    const velocities = options.velocities || [-4, 0, 4];
    const cooldowns = options.cooldowns || [0, Math.max(1, Math.floor(cooldownMaximum / 2)), Math.max(0, cooldownMaximum - 1)];
    const states = [];
    let serial = 0;

    for (const yOffset of yOffsets) {
      for (const vy of velocities) {
        for (const cooldown of cooldowns) {
          states.push({
            y: centerY + finite(yOffset),
            vy: finite(vy),
            cooldown: clamp(Math.floor(finite(cooldown)), 0, cooldownMaximum),
            initialStateId: `initial-${serial}`,
            path: null
          });
          serial += 1;
        }
      }
    }
    return states;
  }

  function fnv1a32(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function sequenceDigest(sequence) {
    const canonical = sequence.map(spec => [
      spec.patternSerial,
      spec.basePatternId,
      spec.variant,
      spec.patternStep,
      Number(spec.topRatio).toFixed(6),
      spec.reachabilityPolicyVersion || 0,
      spec.reachabilityAdjusted ? 1 : 0,
      spec.reachabilityFallback ? 1 : 0
    ].join(':')).join('|');
    return `fnv1a32:${fnv1a32(canonical)}`;
  }

  function generatePatternSequence(options = {}) {
    policy.install(grammar);
    const rite = normalizeRite(options.rite);
    const seed = normalizeSeed(options.seed);
    const patternCycles = Math.max(1, Math.floor(finite(options.patternCycles, DEFAULT_PATTERN_CYCLES)));
    const targetPatterns = patternCycles * grammar.FAMILY_CYCLE.length;
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const gap = Math.max((reachability.HITBOX_HALF * 2) + 1, finite(options.gap, 110));
    const scheduler = new grammar.PatternScheduler({ seed, rite, initialRatio: finite(options.initialRatio, 0.5) });
    const sequence = [];

    while (sequence.length === 0 || sequence[sequence.length - 1].patternSerial < targetPatterns) {
      const spec = scheduler.next({ viewportHeight, gap, orbChance: 0 });
      if (spec.patternSerial > targetPatterns) break;
      sequence.push({ ...spec });
      if (sequence.length > 600) throw new Error('Pattern sequence exceeded safety limit');
    }

    return {
      compositionVersion: COMPOSITION_VERSION,
      grammarVersion: grammar.GRAMMAR_VERSION,
      reachabilityPolicyVersion: policy.POLICY_VERSION,
      seed,
      rite,
      patternCycles,
      patternCount: targetPatterns,
      gateCount: sequence.length,
      digest: sequenceDigest(sequence),
      sequence
    };
  }

  function reconstructJumpFrames(path) {
    const frames = [];
    for (let node = path; node; node = node.previous) frames.push(node.frame);
    frames.reverse();
    return frames;
  }

  function targetForFrame(gates, frame) {
    const upcoming = gates.find(gate => gate.start >= frame) || gates[gates.length - 1];
    return upcoming.top + (upcoming.gap / 2);
  }

  function candidateScore(state, targetY) {
    return Math.abs(state.y - targetY) + (Math.abs(state.vy) * 2.5) + (state.cooldown * 0.35);
  }

  function pruneStates(states, limit, targetY) {
    if (states.size <= limit) return states;
    const bands = new Map();
    for (const state of states.values()) {
      const band = Math.floor(state.y / 10);
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band).push(state);
    }

    const perBand = Math.max(2, Math.floor(limit / Math.max(1, bands.size)));
    const selected = [];
    for (const bandStates of bands.values()) {
      bandStates.sort((left, right) => candidateScore(left, targetY) - candidateScore(right, targetY));
      selected.push(...bandStates.slice(0, perBand));
    }
    selected.sort((left, right) => candidateScore(left, targetY) - candidateScore(right, targetY));

    const output = new Map();
    for (const state of selected.slice(0, limit)) output.set(stateKey(state), state);
    return output;
  }

  function activeGatesAtFrame(gates, frame) {
    return gates.filter(gate => frame >= gate.start && frame <= gate.end);
  }

  function buildBoundaryMetadata(sequence, gates) {
    const boundaries = [];
    for (let index = 0; index < sequence.length; index += 1) {
      const spec = sequence[index];
      const next = sequence[index + 1];
      if (next && next.patternSerial === spec.patternSerial) continue;
      boundaries.push({
        gateIndex: index,
        frame: gates[index].end,
        patternSerial: spec.patternSerial,
        basePatternId: spec.basePatternId,
        patternId: spec.patternId,
        family: spec.family,
        variant: spec.variant
      });
    }
    return boundaries;
  }

  function replayCompositionWitness(options = {}) {
    const rite = normalizeRite(options.rite);
    const ratios = options.ratios || [];
    const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const speed = Math.max(0.001, finite(options.speed, 8.5));
    const gap = Math.max((reachability.HITBOX_HALF * 2) + 1, finite(options.gap, 110));
    const mobile = options.mobile == null ? viewportWidth <= 768 : Boolean(options.mobile);
    const breathPhase = Math.floor(finite(options.breathPhase, 0));
    const margin = Math.max(0, finite(options.margin, 0));
    const gates = reachability.buildGateWindows(ratios, { viewportWidth, viewportHeight, speed, gap });
    const jumps = new Set((options.jumpFrames || []).map(value => Math.floor(Number(value))));
    let state = cloneState(options.initialState);
    let minimumClearance = Infinity;

    for (let frame = gates[0].start; frame <= gates[gates.length - 1].end; frame += 1) {
      const active = activeGatesAtFrame(gates, frame);
      for (const gate of active) {
        const breathe = Math.sin((frame + breathPhase) * 0.05) * 5;
        const top = gate.top + breathe;
        const topClearance = (state.y - reachability.HITBOX_HALF) - top;
        const bottomClearance = (top + gate.gap) - (state.y + reachability.HITBOX_HALF);
        minimumClearance = Math.min(minimumClearance, topClearance, bottomClearance);
        if (topClearance < margin || bottomClearance < margin) {
          return { valid: false, failedFrame: frame, failedGateIndex: gate.index, minimumClearance };
        }
      }

      state = reachability.advancePlayerState(state, {
        rite,
        mobile,
        viewportHeight,
        jump: jumps.has(frame)
      });
      if (!state) {
        return {
          valid: false,
          failedFrame: frame,
          failedGateIndex: active[0]?.index ?? null,
          minimumClearance
        };
      }
    }

    return { valid: true, minimumClearance, finalState: state };
  }

  function solveComposition(options = {}) {
    const generated = options.generated || generatePatternSequence(options);
    const ratios = generated.sequence.map(spec => spec.topRatio);
    const rite = generated.rite;
    const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const speed = Math.max(0.001, finite(options.speed, 8.5));
    const gap = Math.max((reachability.HITBOX_HALF * 2) + 1, finite(options.gap, 110));
    const mobile = options.mobile == null ? viewportWidth <= 768 : Boolean(options.mobile);
    const breathPhase = Math.floor(finite(options.breathPhase, 0));
    const margin = Math.max(0, finite(options.margin, 0));
    const beamWidth = Math.max(200, Math.floor(finite(options.beamWidth, DEFAULT_BEAM_WIDTH)));
    const gates = reachability.buildGateWindows(ratios, { viewportWidth, viewportHeight, speed, gap });
    const firstFrame = gates[0].start;
    const finalFrame = gates[gates.length - 1].end;
    const initialBreathe = Math.sin((firstFrame + breathPhase) * 0.05) * 5;
    const firstCenter = gates[0].top + initialBreathe + (gap / 2);
    const initialStates = (options.initialStates || createInitialStateCloud({ rite, mobile, viewportHeight, centerY: firstCenter })).map(cloneState);
    const initialById = new Map(initialStates.map(state => [state.initialStateId, cloneState(state)]));
    let states = new Map();
    for (const state of initialStates) states.set(stateKey(state), state);

    const boundaries = buildBoundaryMetadata(generated.sequence, gates);
    const boundaryByFrame = new Map(boundaries.map(boundary => [boundary.frame, boundary]));
    const boundaryResults = [];
    let peakStates = states.size;

    for (let frame = firstFrame; frame <= finalFrame; frame += 1) {
      const active = activeGatesAtFrame(gates, frame);
      const nextStates = new Map();

      for (const state of states.values()) {
        let safe = true;
        for (const gate of active) {
          if (!reachability.isStateSafeForGate(state, gate, frame, margin, breathPhase)) {
            safe = false;
            break;
          }
        }
        if (!safe) continue;

        for (const requestJump of [false, true]) {
          if (requestJump && state.cooldown !== 0) continue;
          const advanced = reachability.advancePlayerState(state, {
            rite,
            mobile,
            viewportHeight,
            jump: requestJump
          });
          if (!advanced) continue;

          const candidate = {
            y: advanced.y,
            vy: advanced.vy,
            cooldown: advanced.cooldown,
            initialStateId: state.initialStateId,
            path: advanced.jumped ? { frame, previous: state.path } : state.path
          };
          const key = stateKey(candidate);
          const existing = nextStates.get(key);
          if (!existing || candidateScore(candidate, targetForFrame(gates, frame + 1)) < candidateScore(existing, targetForFrame(gates, frame + 1))) {
            nextStates.set(key, candidate);
          }
        }
      }

      states = pruneStates(nextStates, beamWidth, targetForFrame(gates, frame + 1));
      peakStates = Math.max(peakStates, states.size);

      const boundary = boundaryByFrame.get(frame);
      if (boundary) {
        const values = [...states.values()];
        const ys = values.map(state => state.y);
        const velocities = values.map(state => state.vy);
        boundaryResults.push({
          ...boundary,
          survivingStates: states.size,
          yRange: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
          velocityRange: velocities.length ? [Math.min(...velocities), Math.max(...velocities)] : null,
          cooldownDiversity: new Set(values.map(state => state.cooldown)).size,
          initialStateDiversity: new Set(values.map(state => state.initialStateId)).size
        });
      }

      if (states.size === 0) {
        return {
          compositionVersion: COMPOSITION_VERSION,
          solvable: false,
          generated,
          rite,
          margin,
          beamWidth,
          initialStateCount: initialStates.length,
          failedFrame: frame,
          failedGateIndex: active[0]?.index ?? null,
          failedPattern: generated.sequence[active[0]?.index ?? 0] || null,
          peakStates,
          boundaryResults
        };
      }
    }

    const finalTarget = gates[gates.length - 1].top + (gap / 2);
    const finalState = [...states.values()].sort((left, right) => candidateScore(left, finalTarget) - candidateScore(right, finalTarget))[0];
    const jumpFrames = reconstructJumpFrames(finalState.path);
    const initialState = initialById.get(finalState.initialStateId);
    const replay = replayCompositionWitness({
      rite,
      ratios,
      viewportWidth,
      viewportHeight,
      speed,
      gap,
      mobile,
      breathPhase,
      margin,
      initialState,
      jumpFrames
    });

    return {
      compositionVersion: COMPOSITION_VERSION,
      solvable: Boolean(replay.valid),
      witnessValid: Boolean(replay.valid),
      generated,
      rite,
      margin,
      beamWidth,
      initialStateCount: initialStates.length,
      survivingStateCount: states.size,
      survivingInitialStateCount: new Set([...states.values()].map(state => state.initialStateId)).size,
      peakStates,
      boundaryResults,
      initialState,
      finalState: replay.finalState || null,
      jumpFrames,
      minimumClearance: replay.minimumClearance,
      failedFrame: replay.valid ? null : replay.failedFrame,
      failedGateIndex: replay.valid ? null : replay.failedGateIndex
    };
  }

  function normalizeJumpFrames(frames) {
    return [...new Set(frames.map(value => Math.max(0, Math.floor(Number(value)))))].sort((left, right) => left - right);
  }

  function buildPerturbationCases(jumpFrames, options = {}) {
    const base = normalizeJumpFrames(jumpFrames || []);
    const maximumDistance = Math.max(1, Math.floor(finite(options.maximumDistance, DEFAULT_PERTURBATION_DISTANCE)));
    const maximumCases = Math.max(1, Math.floor(finite(options.maximumCases, DEFAULT_MAX_PERTURBATION_CASES)));
    const cases = [{ id: 'base', distance: 0, kind: 'base', jumpFrames: base }];

    for (let distance = 1; distance <= maximumDistance; distance += 1) {
      for (const direction of [-1, 1]) {
        cases.push({
          id: `global-${direction < 0 ? 'early' : 'late'}-${distance}`,
          distance,
          kind: 'global',
          jumpFrames: normalizeJumpFrames(base.map(frame => frame + (direction * distance)))
        });
      }
    }

    outer:
    for (let jumpIndex = 0; jumpIndex < base.length; jumpIndex += 1) {
      for (let distance = 1; distance <= maximumDistance; distance += 1) {
        for (const direction of [-1, 1]) {
          const changed = [...base];
          changed[jumpIndex] += direction * distance;
          cases.push({
            id: `single-${jumpIndex}-${direction < 0 ? 'early' : 'late'}-${distance}`,
            distance,
            kind: 'single',
            jumpIndex,
            jumpFrame: base[jumpIndex],
            jumpFrames: normalizeJumpFrames(changed)
          });
          if (cases.length >= maximumCases) break outer;
        }
      }
    }
    return cases.slice(0, maximumCases);
  }

  function evaluateWitnessRobustness(solution, options = {}) {
    if (!solution?.solvable || !solution.witnessValid) {
      return {
        classification: 'invalid',
        baseValid: false,
        caseCount: 0,
        validCount: 0,
        overallRate: 0,
        distanceRates: {}
      };
    }

    const ratios = solution.generated.sequence.map(spec => spec.topRatio);
    const cases = buildPerturbationCases(solution.jumpFrames, options);
    const results = cases.map(testCase => {
      const replay = replayCompositionWitness({
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

    const validCount = results.filter(result => result.valid).length;
    const maximumDistance = Math.max(1, Math.floor(finite(options.maximumDistance, DEFAULT_PERTURBATION_DISTANCE)));
    const distanceRates = {};
    for (let distance = 0; distance <= maximumDistance; distance += 1) {
      const atDistance = results.filter(result => result.distance === distance);
      if (atDistance.length) distanceRates[distance] = atDistance.filter(result => result.valid).length / atDistance.length;
    }

    const overallRate = results.length ? validCount / results.length : 0;
    const distanceOneRate = distanceRates[1] || 0;
    const baseValid = Boolean(results.find(result => result.kind === 'base')?.valid);
    const classification = baseValid && distanceOneRate >= ROBUST_DISTANCE_ONE_RATE && overallRate >= ROBUST_OVERALL_RATE
      ? 'robust-candidate'
      : baseValid
        ? 'technically-reachable-fragile'
        : 'invalid';

    return {
      classification,
      baseValid,
      caseCount: results.length,
      validCount,
      overallRate,
      distanceOneRate,
      distanceRates,
      minimumSuccessfulClearance: Math.min(...results.filter(result => result.valid).map(result => result.minimumClearance)),
      results
    };
  }

  function auditCompositionMatrix(options = {}) {
    const scenarios = options.scenarios || DEFAULT_SCENARIOS;
    const seeds = options.seeds || DEFAULT_SEEDS;
    const rites = options.rites || ['HEX', 'MONAS'];
    const patternCycles = Math.max(1, Math.floor(finite(options.patternCycles, DEFAULT_PATTERN_CYCLES)));
    const cases = [];

    for (const rite of rites) {
      for (const seed of seeds) {
        for (const scenario of scenarios) {
          for (const breathPhase of scenario.breathPhases || [0]) {
            const generated = generatePatternSequence({
              rite,
              seed,
              patternCycles,
              viewportHeight: scenario.height,
              gap: scenario.gap
            });
            const solution = solveComposition({
              generated,
              viewportWidth: scenario.width,
              viewportHeight: scenario.height,
              mobile: scenario.mobile,
              speed: scenario.speed,
              gap: scenario.gap,
              breathPhase,
              beamWidth: options.beamWidth || DEFAULT_BEAM_WIDTH,
              margin: options.margin || 0
            });
            const robustness = evaluateWitnessRobustness(solution, {
              viewportWidth: scenario.width,
              viewportHeight: scenario.height,
              mobile: scenario.mobile,
              speed: scenario.speed,
              gap: scenario.gap,
              breathPhase,
              maximumDistance: options.maximumDistance || DEFAULT_PERTURBATION_DISTANCE,
              maximumCases: options.maximumPerturbationCases || DEFAULT_MAX_PERTURBATION_CASES,
              margin: options.margin || 0
            });
            cases.push({
              rite,
              seed: normalizeSeed(seed),
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
              failedPatternId: solution.failedPattern?.basePatternId || null,
              solution,
              robustness
            });
          }
        }
      }
    }

    const summary = cases.reduce((counts, entry) => {
      if (!entry.solvable) counts.invalid += 1;
      else if (entry.robustnessClassification === 'robust-candidate') counts.robustCandidate += 1;
      else counts.fragile += 1;
      return counts;
    }, { robustCandidate: 0, fragile: 0, invalid: 0 });

    return {
      compositionVersion: COMPOSITION_VERSION,
      solverVersion: reachability.SOLVER_VERSION,
      grammarVersion: grammar.GRAMMAR_VERSION,
      reachabilityPolicyVersion: policy.POLICY_VERSION,
      patternCycles,
      totalCases: cases.length,
      summary,
      cases
    };
  }

  return Object.freeze({
    COMPOSITION_VERSION,
    DEFAULT_PATTERN_CYCLES,
    DEFAULT_BEAM_WIDTH,
    DEFAULT_MAX_PERTURBATION_CASES,
    DEFAULT_PERTURBATION_DISTANCE,
    ROBUST_DISTANCE_ONE_RATE,
    ROBUST_OVERALL_RATE,
    DEFAULT_SCENARIOS,
    DEFAULT_SEEDS,
    finite,
    clamp,
    normalizeRite,
    normalizeSeed,
    stateKey,
    createInitialStateCloud,
    sequenceDigest,
    generatePatternSequence,
    replayCompositionWitness,
    solveComposition,
    buildPerturbationCases,
    evaluateWitnessRobustness,
    auditCompositionMatrix
  });
});