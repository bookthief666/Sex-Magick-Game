(function attachSexMagickReachability(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickReachability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReachabilityApi() {
  'use strict';

  const SOLVER_VERSION = 1;
  const PLAYER_RADIUS = 16;
  const HITBOX_OFFSET = 4;
  const HITBOX_HALF = PLAYER_RADIUS - HITBOX_OFFSET;
  const PILLAR_WIDTH = 45;
  const TOP_CLAMP_MULTIPLIER = 1.5;
  const MAX_FALL_SPEED = 11;
  const PILLAR_SPAWN_BASE = 140;

  const DEFAULT_SCENARIOS = Object.freeze([
    Object.freeze({ id: 'phone-start', width: 390, height: 844, mobile: true, speed: 2.9, gap: 200, breathPhases: Object.freeze([0]) }),
    Object.freeze({ id: 'phone-hard', width: 390, height: 844, mobile: true, speed: 8.5, gap: 110, breathPhases: Object.freeze([0, 31]) }),
    Object.freeze({ id: 'fold-closed-hard', width: 374, height: 882, mobile: true, speed: 8.5, gap: 110, breathPhases: Object.freeze([0]) }),
    Object.freeze({ id: 'fold-open-hard', width: 884, height: 1104, mobile: false, speed: 8.5, gap: 110, breathPhases: Object.freeze([0, 31]) }),
    Object.freeze({ id: 'desktop-hard', width: 1440, height: 900, mobile: false, speed: 8.5, gap: 110, breathPhases: Object.freeze([0]) }),
    Object.freeze({ id: 'desktop-mid', width: 1440, height: 900, mobile: false, speed: 5.5, gap: 150, breathPhases: Object.freeze([0]) })
  ]);

  const DEFAULT_ANCHORS = Object.freeze([0.22, 0.5, 0.78]);
  const DEFAULT_BREATH_PHASES = Object.freeze([0, 31]);
  const DEFAULT_MARGINS = Object.freeze([8, 4, 0]);

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeRite(value) {
    return value === 'MONAS' ? 'MONAS' : 'HEX';
  }

  function getPhysicsProfile(rite, mobile) {
    const normalized = normalizeRite(rite);
    return Object.freeze({
      rite: normalized,
      gravity: normalized === 'MONAS' ? 0.18 : 0.45,
      damping: normalized === 'MONAS' ? 0.98 : 1,
      jumpImpulse: normalized === 'MONAS' ? -7.2 : -7.5,
      jumpCooldown: mobile ? 8 : 5,
      maxFallSpeed: MAX_FALL_SPEED
    });
  }

  function advancePlayerState(state, options = {}) {
    const profile = getPhysicsProfile(options.rite, Boolean(options.mobile));
    const height = Math.max(1, finite(options.viewportHeight, 844));
    const topClamp = PLAYER_RADIUS * TOP_CLAMP_MULTIPLIER;
    const bottomDeath = height - topClamp;

    let y = finite(state?.y, height / 2);
    let vy = finite(state?.vy, 0);
    let cooldown = Math.max(0, Math.floor(finite(state?.cooldown, 0)));
    const jump = Boolean(options.jump) && cooldown === 0;

    if (jump) {
      vy = profile.jumpImpulse;
      cooldown = profile.jumpCooldown;
    }

    vy += profile.gravity;
    vy *= profile.damping;
    if (vy > profile.maxFallSpeed) vy = profile.maxFallSpeed;
    y += vy;

    if (y > bottomDeath) return null;
    if (y < topClamp) {
      y = topClamp;
      vy = 0;
    }
    if (cooldown > 0) cooldown -= 1;

    return { y, vy, cooldown, jumped: jump };
  }

  function computeSpawnRate(speed, pillarSpawnBase = PILLAR_SPAWN_BASE) {
    const resolvedSpeed = Math.max(0.001, finite(speed, 3));
    const base = Math.max(1, finite(pillarSpawnBase, PILLAR_SPAWN_BASE));
    return Math.max(20, Math.floor(base / (resolvedSpeed / 3)));
  }

  function computeTopFromRatio(viewportHeight, gap, ratio) {
    const height = Math.max(0, finite(viewportHeight, 0));
    const resolvedGap = Math.max(0, finite(gap, 0));
    const minimumTop = 30;
    const maximumTop = Math.max(minimumTop, height - resolvedGap - 50);
    return minimumTop + ((maximumTop - minimumTop) * clamp(finite(ratio, 0.5), 0.22, 0.78));
  }

  function computeGateCollisionWindow(options = {}) {
    const width = Math.max(1, finite(options.viewportWidth, 390));
    const speed = Math.max(0.001, finite(options.speed, 3));
    const spawnFrame = Math.max(0, Math.floor(finite(options.spawnFrame, 0)));
    const playerX = width * 0.25;
    const playerLeft = playerX - HITBOX_HALF;
    const playerRight = playerX + HITBOX_HALF;

    const firstAge = Math.floor((width - playerRight) / speed) + 1;
    const firstNonOverlapAge = Math.ceil((width + PILLAR_WIDTH - playerLeft) / speed);
    const lastAge = Math.max(firstAge, firstNonOverlapAge - 1);

    return {
      start: spawnFrame + firstAge - 1,
      end: spawnFrame + lastAge - 1,
      duration: lastAge - firstAge + 1,
      firstAge,
      lastAge
    };
  }

  function buildGateWindows(ratios, options = {}) {
    const speed = Math.max(0.001, finite(options.speed, 3));
    const width = Math.max(1, finite(options.viewportWidth, 390));
    const height = Math.max(1, finite(options.viewportHeight, 844));
    const gap = Math.max((HITBOX_HALF * 2) + 1, finite(options.gap, 200));
    const spawnRate = computeSpawnRate(speed, options.pillarSpawnBase);

    return ratios.map((ratio, index) => {
      const collision = computeGateCollisionWindow({
        viewportWidth: width,
        speed,
        spawnFrame: index * spawnRate
      });
      return {
        index,
        ratio,
        top: computeTopFromRatio(height, gap, ratio),
        gap,
        ...collision
      };
    });
  }

  function isStateSafeForGate(state, gate, absoluteFrame, margin = 0, breathPhase = 0) {
    const breathe = Math.sin((absoluteFrame + breathPhase) * 0.05) * 5;
    const top = gate.top + breathe;
    return (
      state.y - HITBOX_HALF >= top + margin &&
      state.y + HITBOX_HALF <= top + gate.gap - margin
    );
  }

  function stateKey(state) {
    return `${Math.round(state.y)}|${Math.round(state.vy * 2) / 2}|${state.cooldown}`;
  }

  function nextGateTarget(gates, frame) {
    const gate = gates.find(candidate => candidate.start >= frame) || gates[gates.length - 1];
    return gate.top + (gate.gap / 2);
  }

  function pruneStates(states, limit, targetY) {
    if (states.size <= limit) return states;

    const bands = new Map();
    for (const state of states.values()) {
      const band = Math.floor(state.y / 12);
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band).push(state);
    }

    const perBand = Math.max(3, Math.floor(limit / Math.max(1, bands.size)));
    const selected = [];
    const score = state => Math.abs(state.y - targetY) + (Math.abs(state.vy) * 2);

    for (const bandStates of bands.values()) {
      bandStates.sort((left, right) => score(left) - score(right));
      selected.push(...bandStates.slice(0, perBand));
    }

    selected.sort((left, right) => score(left) - score(right));
    const output = new Map();
    for (const state of selected.slice(0, limit)) output.set(stateKey(state), state);
    return output;
  }

  function reconstructJumpFrames(path) {
    const frames = [];
    for (let node = path; node; node = node.previous) frames.push(node.frame);
    frames.reverse();
    return frames;
  }

  function solveGateSequence(options = {}) {
    const rite = normalizeRite(options.rite);
    const ratios = Array.isArray(options.ratios) ? options.ratios.map(Number) : [];
    if (ratios.length === 0) throw new TypeError('solveGateSequence requires at least one gate ratio');

    const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const gap = Math.max((HITBOX_HALF * 2) + 1, finite(options.gap, 200));
    const speed = Math.max(0.001, finite(options.speed, 3));
    const mobile = options.mobile == null ? viewportWidth <= 768 : Boolean(options.mobile);
    const margin = Math.max(0, finite(options.margin, 0));
    const breathPhase = Math.floor(finite(options.breathPhase, 0));
    const beamWidth = Math.max(100, Math.floor(finite(options.beamWidth, 2500)));
    const gates = buildGateWindows(ratios, {
      viewportWidth,
      viewportHeight,
      gap,
      speed,
      pillarSpawnBase: options.pillarSpawnBase
    });

    const firstFrame = gates[0].start;
    const finalFrame = gates[gates.length - 1].end;
    const initialBreathe = Math.sin((firstFrame + breathPhase) * 0.05) * 5;
    const initialState = {
      y: gates[0].top + initialBreathe + (gap / 2),
      vy: 0,
      cooldown: 0,
      path: null
    };

    let states = new Map([[stateKey(initialState), initialState]]);
    let peakStates = states.size;

    for (let frame = firstFrame; frame <= finalFrame; frame += 1) {
      const activeGates = gates.filter(gate => frame >= gate.start && frame <= gate.end);
      const nextStates = new Map();

      for (const state of states.values()) {
        let safe = true;
        for (const gate of activeGates) {
          if (!isStateSafeForGate(state, gate, frame, margin, breathPhase)) {
            safe = false;
            break;
          }
        }
        if (!safe) continue;

        for (const requestJump of [false, true]) {
          if (requestJump && state.cooldown !== 0) continue;
          const advanced = advancePlayerState(state, {
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
            path: advanced.jumped
              ? { frame, previous: state.path }
              : state.path
          };
          const key = stateKey(candidate);
          if (!nextStates.has(key)) nextStates.set(key, candidate);
        }
      }

      states = pruneStates(nextStates, beamWidth, nextGateTarget(gates, frame + 1));
      peakStates = Math.max(peakStates, states.size);
      if (states.size === 0) {
        return {
          solverVersion: SOLVER_VERSION,
          solvable: false,
          rite,
          margin,
          failedFrame: frame,
          failedGateIndex: activeGates[0]?.index ?? null,
          peakStates,
          spawnRate: computeSpawnRate(speed, options.pillarSpawnBase),
          gates
        };
      }
    }

    const finalState = states.values().next().value;
    const jumpFrames = reconstructJumpFrames(finalState.path);
    const result = {
      solverVersion: SOLVER_VERSION,
      solvable: true,
      rite,
      margin,
      peakStates,
      finalState: {
        y: finalState.y,
        vy: finalState.vy,
        cooldown: finalState.cooldown
      },
      jumpFrames,
      spawnRate: computeSpawnRate(speed, options.pillarSpawnBase),
      gates
    };

    const replay = replayWitness({ ...options, rite, ratios, margin, jumpFrames });
    result.witnessValid = replay.valid;
    result.minimumClearance = replay.minimumClearance;
    if (!replay.valid) {
      result.solvable = false;
      result.failedFrame = replay.failedFrame;
      result.failedGateIndex = replay.failedGateIndex;
    }
    return result;
  }

  function replayWitness(options = {}) {
    const rite = normalizeRite(options.rite);
    const ratios = Array.isArray(options.ratios) ? options.ratios.map(Number) : [];
    const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
    const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
    const gap = Math.max((HITBOX_HALF * 2) + 1, finite(options.gap, 200));
    const speed = Math.max(0.001, finite(options.speed, 3));
    const mobile = options.mobile == null ? viewportWidth <= 768 : Boolean(options.mobile);
    const margin = Math.max(0, finite(options.margin, 0));
    const breathPhase = Math.floor(finite(options.breathPhase, 0));
    const jumps = new Set((options.jumpFrames || []).map(value => Math.floor(Number(value))));
    const gates = buildGateWindows(ratios, { viewportWidth, viewportHeight, gap, speed });
    const firstFrame = gates[0].start;
    const finalFrame = gates[gates.length - 1].end;
    const initialBreathe = Math.sin((firstFrame + breathPhase) * 0.05) * 5;
    let state = { y: gates[0].top + initialBreathe + (gap / 2), vy: 0, cooldown: 0 };
    let minimumClearance = Infinity;

    for (let frame = firstFrame; frame <= finalFrame; frame += 1) {
      const activeGates = gates.filter(gate => frame >= gate.start && frame <= gate.end);
      for (const gate of activeGates) {
        const breathe = Math.sin((frame + breathPhase) * 0.05) * 5;
        const top = gate.top + breathe;
        const topClearance = (state.y - HITBOX_HALF) - top;
        const bottomClearance = (top + gate.gap) - (state.y + HITBOX_HALF);
        minimumClearance = Math.min(minimumClearance, topClearance, bottomClearance);
        if (topClearance < margin || bottomClearance < margin) {
          return {
            valid: false,
            failedFrame: frame,
            failedGateIndex: gate.index,
            minimumClearance
          };
        }
      }

      state = advancePlayerState(state, {
        rite,
        mobile,
        viewportHeight,
        jump: jumps.has(frame)
      });
      if (!state) {
        return {
          valid: false,
          failedFrame: frame,
          failedGateIndex: activeGates[0]?.index ?? null,
          minimumClearance
        };
      }
    }

    return { valid: true, minimumClearance, finalState: state };
  }

  function classifyGateSequence(options = {}) {
    const margins = Array.isArray(options.margins) && options.margins.length
      ? options.margins
      : DEFAULT_MARGINS;

    for (const margin of margins) {
      const result = solveGateSequence({ ...options, margin });
      if (result.solvable && result.witnessValid) {
        return {
          classification: margin >= 8 ? 'verified' : 'marginal',
          verifiedMargin: margin,
          result
        };
      }
    }

    return {
      classification: 'invalid',
      verifiedMargin: -1,
      result: solveGateSequence({ ...options, margin: 0 })
    };
  }

  function listPatternVariants(pattern) {
    return pattern?.mirror ? [1, -1] : [1];
  }

  function auditPatternLibrary(grammar, options = {}) {
    if (!grammar?.PATTERN_LIBRARY || typeof grammar.materializePattern !== 'function') {
      throw new TypeError('auditPatternLibrary requires the obstacle grammar API');
    }

    const scenarios = options.scenarios || DEFAULT_SCENARIOS;
    const anchors = options.anchors || DEFAULT_ANCHORS;
    const breathPhases = options.breathPhases || DEFAULT_BREATH_PHASES;
    const patternResolver = typeof options.patternResolver === 'function'
      ? options.patternResolver
      : pattern => pattern;
    const cases = [];

    for (const rite of ['HEX', 'MONAS']) {
      for (const pattern of grammar.PATTERN_LIBRARY[rite]) {
        const auditedPattern = patternResolver(pattern, rite) || pattern;
        for (const direction of listPatternVariants(auditedPattern)) {
          for (const anchor of anchors) {
            const ratios = grammar.materializePattern(auditedPattern, anchor, direction);
            for (const scenario of scenarios) {
              const scenarioPhases = scenario.breathPhases || breathPhases;
              for (const breathPhase of scenarioPhases) {
                const classification = classifyGateSequence({
                  rite,
                  ratios,
                  viewportWidth: scenario.width,
                  viewportHeight: scenario.height,
                  mobile: scenario.mobile,
                  speed: scenario.speed,
                  gap: scenario.gap,
                  breathPhase,
                  beamWidth: options.beamWidth || 2500
                });
                cases.push({
                  rite,
                  patternId: pattern.id,
                  family: pattern.family,
                  direction,
                  anchor,
                  scenarioId: scenario.id,
                  breathPhase,
                  classification: classification.classification,
                  verifiedMargin: classification.verifiedMargin,
                  spawnRate: classification.result.spawnRate,
                  jumpCount: classification.result.jumpFrames?.length || 0,
                  minimumClearance: classification.result.minimumClearance ?? null,
                  witnessValid: Boolean(classification.result.witnessValid)
                });
              }
            }
          }
        }
      }
    }

    const summary = cases.reduce((counts, entry) => {
      counts[entry.classification] += 1;
      return counts;
    }, { verified: 0, marginal: 0, invalid: 0 });

    const patternVerdicts = {};
    for (const entry of cases) {
      const current = patternVerdicts[entry.patternId] || 'verified';
      if (entry.classification === 'invalid') patternVerdicts[entry.patternId] = 'invalid';
      else if (entry.classification === 'marginal' && current !== 'invalid') patternVerdicts[entry.patternId] = 'marginal';
      else if (!patternVerdicts[entry.patternId]) patternVerdicts[entry.patternId] = 'verified';
    }

    return {
      solverVersion: SOLVER_VERSION,
      summary,
      totalCases: cases.length,
      scenarios: scenarios.map(scenario => ({ ...scenario })),
      anchors: [...anchors],
      breathPhases: [...breathPhases],
      patternVerdicts,
      cases
    };
  }

  return Object.freeze({
    SOLVER_VERSION,
    PLAYER_RADIUS,
    HITBOX_OFFSET,
    HITBOX_HALF,
    PILLAR_WIDTH,
    MAX_FALL_SPEED,
    PILLAR_SPAWN_BASE,
    DEFAULT_SCENARIOS,
    DEFAULT_ANCHORS,
    DEFAULT_BREATH_PHASES,
    DEFAULT_MARGINS,
    finite,
    clamp,
    normalizeRite,
    getPhysicsProfile,
    advancePlayerState,
    computeSpawnRate,
    computeTopFromRatio,
    computeGateCollisionWindow,
    buildGateWindows,
    isStateSafeForGate,
    replayWitness,
    solveGateSequence,
    classifyGateSequence,
    auditPatternLibrary
  });
});