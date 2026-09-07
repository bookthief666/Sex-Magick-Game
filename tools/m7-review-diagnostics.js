(function attachSexMagickM7Diagnostics(root, factory) {
  'use strict';
  const dependency = (globalValue, localPath) => {
    if (globalValue) return globalValue;
    if (typeof require === 'function') return require(localPath);
    return null;
  };
  const api = factory(
    dependency(root.SexMagickPlayerReachability, './player-reachability.js'),
    dependency(root.SexMagickCompositionalReachability, './compositional-reachability.js'),
    dependency(root.SexMagickCompositionalRobustness, './compositional-robustness.js')
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickM7Diagnostics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createM7Diagnostics(reachability, composition, robustness) {
  'use strict';

  if (!reachability || !composition || !robustness) {
    throw new Error('Milestone 7 diagnostics require reachability, composition, and robustness APIs');
  }

  const DIAGNOSTICS_VERSION = 1;
  const DEFAULT_BUFFER_VARIANTS = Object.freeze([0, 3, 4, 6]);
  const DEFAULT_MARGINS = Object.freeze([0, 8]);

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function normalizeJumpFrames(frames) {
    return [...new Set((frames || []).map(value => Math.max(0, Math.floor(finite(value)))))].sort((a, b) => a - b);
  }

  function analyzeJumpSpacing(frames, cooldown) {
    const normalized = normalizeJumpFrames(frames);
    const resolvedCooldown = Math.max(0, Math.floor(finite(cooldown)));
    const intervals = [];
    for (let index = 1; index < normalized.length; index += 1) intervals.push(normalized[index] - normalized[index - 1]);
    const tightCount = intervals.filter(value => value === resolvedCooldown).length;
    const belowCooldownCount = intervals.filter(value => value < resolvedCooldown).length;
    return {
      jumpCount: normalized.length,
      intervalCount: intervals.length,
      cooldown: resolvedCooldown,
      minimum: intervals.length ? Math.min(...intervals) : null,
      maximum: intervals.length ? Math.max(...intervals) : null,
      mean: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
      tightCount,
      tightRate: intervals.length ? tightCount / intervals.length : 0,
      belowCooldownCount,
      intervals
    };
  }

  function gapAtSpawnFrame(baseGap, spawnFrame, amplitude = 10, frequency = 0.05) {
    return finite(baseGap, 110) + Math.sin(finite(spawnFrame) * finite(frequency, 0.05)) * finite(amplitude, 10);
  }

  function buildBreathingGateWindows(ratios, options = {}) {
    const speed = Math.max(0.001, finite(options.speed, 3));
    const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const baseGap = Math.max((reachability.HITBOX_HALF * 2) + 1, finite(options.baseGap, options.gap ?? 110));
    const spawnRate = reachability.computeSpawnRate(speed, options.pillarSpawnBase);
    const amplitude = Math.max(0, finite(options.gapAmplitude, 10));
    const frequency = finite(options.gapFrequency, 0.05);

    return ratios.map((ratio, index) => {
      const spawnFrame = index * spawnRate;
      const gap = Math.max((reachability.HITBOX_HALF * 2) + 1, gapAtSpawnFrame(baseGap, spawnFrame, amplitude, frequency));
      const collision = reachability.computeGateCollisionWindow({
        viewportWidth,
        speed,
        spawnFrame
      });
      return {
        index,
        ratio,
        spawnFrame,
        top: reachability.computeTopFromRatio(viewportHeight, gap, ratio),
        gap,
        ...collision
      };
    });
  }

  function activeGatesAtFrame(gates, frame) {
    return gates.filter(gate => frame >= gate.start && frame <= gate.end);
  }

  function cloneInitialState(value) {
    return {
      y: finite(value?.y),
      vy: finite(value?.vy),
      cooldown: Math.max(0, Math.floor(finite(value?.cooldown)))
    };
  }

  function applyBufferedImpulse(state, rite, mobile) {
    const profile = reachability.getPhysicsProfile(rite, mobile);
    return {
      ...state,
      vy: profile.jumpImpulse,
      cooldown: profile.jumpCooldown,
      jumped: true
    };
  }

  function replayBufferedWitness(options = {}) {
    const rite = composition.normalizeRite(options.rite);
    const mobile = Boolean(options.mobile);
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const margin = Math.max(0, finite(options.margin, 0));
    const breathPhase = Math.floor(finite(options.breathPhase, 0));
    const inputBufferFrames = Math.max(0, Math.floor(finite(options.inputBufferFrames, 0)));
    const requestedFrames = new Set(normalizeJumpFrames(options.jumpFrames));
    const gates = options.gates || buildBreathingGateWindows(options.ratios || [], options);
    if (!gates.length) return { valid: false, reason: 'no-gates', minimumClearance: null };

    let state = cloneInitialState(options.initialState);
    let pendingFrames = 0;
    let minimumClearance = Infinity;
    const input = { immediate: 0, buffered: 0, bufferedFired: 0, rejected: 0, expired: 0, coalesced: 0 };

    for (let frame = gates[0].start; frame <= gates[gates.length - 1].end; frame += 1) {
      const active = activeGatesAtFrame(gates, frame);
      for (const gate of active) {
        const breathe = Math.sin((frame + breathPhase) * 0.05) * 5;
        const top = gate.top + breathe;
        const topClearance = (state.y - reachability.HITBOX_HALF) - top;
        const bottomClearance = (top + gate.gap) - (state.y + reachability.HITBOX_HALF);
        minimumClearance = Math.min(minimumClearance, topClearance, bottomClearance);
        if (topClearance < margin || bottomClearance < margin) {
          return { valid: false, failedFrame: frame, failedGateIndex: gate.index, minimumClearance, input, finalState: state };
        }
      }

      let jumpNow = false;
      if (requestedFrames.has(frame)) {
        if (state.cooldown === 0) {
          jumpNow = true;
          input.immediate += 1;
          pendingFrames = 0;
        } else if (inputBufferFrames > 0 && state.cooldown <= inputBufferFrames) {
          if (pendingFrames > 0) input.coalesced += 1;
          else {
            pendingFrames = state.cooldown;
            input.buffered += 1;
          }
        } else {
          input.rejected += 1;
        }
      }

      state = reachability.advancePlayerState(state, {
        rite,
        mobile,
        viewportHeight,
        jump: jumpNow
      });
      if (!state) {
        return { valid: false, failedFrame: frame, failedGateIndex: active[0]?.index ?? null, minimumClearance, input, finalState: null };
      }

      if (pendingFrames > 0 && !jumpNow) {
        if (state.cooldown === 0) {
          state = applyBufferedImpulse(state, rite, mobile);
          pendingFrames = 0;
          input.bufferedFired += 1;
        } else {
          pendingFrames -= 1;
          if (pendingFrames <= 0) {
            pendingFrames = 0;
            input.expired += 1;
          }
        }
      }
    }

    return { valid: true, minimumClearance, input, finalState: state };
  }

  function evaluateSolutionDiagnostics(solution, options = {}) {
    if (!solution?.solvable || !solution?.witnessValid) {
      return { diagnosticsVersion: DIAGNOSTICS_VERSION, valid: false, reason: 'invalid-solution' };
    }

    const cases = robustness.buildPerturbationCases(solution.jumpFrames, {
      maximumDistance: options.maximumDistance ?? 3,
      maximumCases: options.maximumCases ?? 60
    });
    const builtCases = Array.isArray(cases) ? cases : cases.cases;
    const ratios = solution.generated.sequence.map(spec => spec.topRatio);
    const buffers = options.bufferVariants || DEFAULT_BUFFER_VARIANTS;
    const margins = options.margins || DEFAULT_MARGINS;
    const profile = reachability.getPhysicsProfile(solution.rite, Boolean(options.mobile));
    const spacing = analyzeJumpSpacing(solution.jumpFrames, profile.jumpCooldown);
    const variants = [];

    for (const inputBufferFrames of buffers) {
      for (const margin of margins) {
        const results = builtCases.map(testCase => ({
          ...testCase,
          ...replayBufferedWitness({
            rite: solution.rite,
            ratios,
            viewportWidth: options.viewportWidth,
            viewportHeight: options.viewportHeight,
            mobile: options.mobile,
            speed: options.speed,
            baseGap: options.baseGap ?? options.gap,
            gapAmplitude: options.gapAmplitude ?? 0,
            breathPhase: options.breathPhase,
            margin,
            inputBufferFrames,
            initialState: solution.initialState,
            jumpFrames: testCase.jumpFrames
          })
        }));
        const validCount = results.filter(result => result.valid).length;
        const distanceOne = results.filter(result => result.distance === 1);
        variants.push({
          inputBufferFrames,
          margin,
          caseCount: results.length,
          validCount,
          survivalRate: results.length ? validCount / results.length : 0,
          distanceOneRate: distanceOne.length ? distanceOne.filter(result => result.valid).length / distanceOne.length : 0,
          results
        });
      }
    }

    return {
      diagnosticsVersion: DIAGNOSTICS_VERSION,
      valid: true,
      spacing,
      variants
    };
  }

  function bitForInitialState(initialStateId) {
    const value = Math.max(0, Math.floor(finite(initialStateId)));
    if (value >= 31) throw new RangeError('initialStateId must fit in a 31-bit provenance mask');
    return (1 << value) >>> 0;
  }

  function mergeProvenanceMasks(...masks) {
    return masks.reduce((value, mask) => (value | (finite(mask) >>> 0)) >>> 0, 0);
  }

  function countProvenance(mask) {
    let value = finite(mask) >>> 0;
    let count = 0;
    while (value) {
      value &= value - 1;
      count += 1;
    }
    return count;
  }

  function auditInitialStatesIndependently(options = {}) {
    const generated = options.generated || composition.generatePatternSequence(options);
    const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const mobile = options.mobile == null ? viewportWidth <= 768 : Boolean(options.mobile);
    const ratios = generated.sequence.map(spec => spec.topRatio);
    const gates = buildBreathingGateWindows(ratios, {
      viewportWidth,
      viewportHeight,
      speed: options.speed,
      baseGap: options.baseGap ?? options.gap,
      gapAmplitude: options.gapAmplitude ?? 0
    });
    const first = gates[0];
    const initialBreathe = Math.sin((first.start + finite(options.breathPhase, 0)) * 0.05) * 5;
    const centerY = first.top + initialBreathe + first.gap / 2;
    const initialStates = options.initialStates || composition.createInitialStateCloud({
      rite: generated.rite,
      mobile,
      viewportHeight,
      centerY
    });

    const results = initialStates.map(initialState => {
      const solution = composition.solveComposition({
        generated,
        viewportWidth,
        viewportHeight,
        mobile,
        speed: options.speed,
        gap: options.baseGap ?? options.gap,
        breathPhase: options.breathPhase,
        margin: options.margin ?? 0,
        beamWidth: options.beamWidth,
        initialStates: [initialState]
      });
      return {
        initialStateId: initialState.initialStateId,
        solvable: solution.solvable,
        witnessValid: solution.witnessValid,
        minimumClearance: solution.minimumClearance ?? null
      };
    });

    return {
      total: results.length,
      solvableCount: results.filter(result => result.solvable && result.witnessValid).length,
      results
    };
  }

  return Object.freeze({
    DIAGNOSTICS_VERSION,
    DEFAULT_BUFFER_VARIANTS,
    DEFAULT_MARGINS,
    normalizeJumpFrames,
    analyzeJumpSpacing,
    gapAtSpawnFrame,
    buildBreathingGateWindows,
    replayBufferedWitness,
    evaluateSolutionDiagnostics,
    bitForInitialState,
    mergeProvenanceMasks,
    countProvenance,
    auditInitialStatesIndependently
  });
});
