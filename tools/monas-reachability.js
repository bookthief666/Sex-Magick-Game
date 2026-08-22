'use strict';

/**
 * M31 — MONAS hold/release reachability.
 *
 * The older player-reachability solver still models MONAS as a tap-to-jump avatar.
 * M27-M29 replaced that control law with a continuous hold/release glide, so that
 * solver can no longer be used as evidence for MONAS progression.
 *
 * This module deliberately reuses only neutral geometry from that solver. Player
 * motion comes directly from monas-runtime.js's advanceGlide(), and wall motion is
 * reduced to the phase-independent corridor guaranteed by obstacle-variety-runtime:
 * [top + amplitude, top + gap - amplitude]. A successful witness is replayed with
 * exact floating-point state before it is accepted. Search exhaustion is therefore
 * reported as "unverified", never as proof that a sequence is impossible.
 */

const monas = require('./monas-runtime.js');
const progression = require('./monas-progression-runtime.js');
const neutral = require('./player-reachability.js');
const grammar = require('./obstacle-grammar.js');
const variety = require('./obstacle-variety-runtime.js');

const SOLVER_VERSION = 1;
const PLAYER_RADIUS = neutral.PLAYER_RADIUS;
const HITBOX_HALF = neutral.HITBOX_HALF;
const PILLAR_SPAWN_BASE = neutral.PILLAR_SPAWN_BASE;
const TOP_CLAMP = PLAYER_RADIUS * 1.5;
// Read the constants from the outer progression wrapper that owns shipped MONAS
// geometry. Duplicating them here would let the proof drift away from play.
const SURGE_GAP_MULTIPLIER = progression.SURGE_GAP_MULTIPLIER;
const SPAWN_GAP_OSCILLATION_PX = progression.GAP_OSCILLATION_PX;
const Y_QUANTUM = 2;
const VY_QUANTUM = 0.5;
const DEFAULT_BEAM_WIDTH = 700;
const DEFAULT_MARGINS = Object.freeze([8, 4, 0]);
const DEFAULT_ANCHORS = Object.freeze([0.22, 0.5, 0.78]);
const DEFAULT_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'fold-closed', width: 374, height: 882 }),
  Object.freeze({ id: 'fold-open', width: 884, height: 1104 }),
  Object.freeze({ id: 'phone-reference', width: 390, height: 844 })
]);

function finite(value, fallback = 0) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeMode(value) {
  return value === 'surge' ? 'surge' : 'ordinary';
}

/**
 * Convert a nominal progression setting into the hardest spawn-phase conditions.
 *
 * The base game oscillates getCurrentGap() by +/-10 before the pattern/variety
 * layer sees it. The default offset is therefore -10. During Warp Surge the game
 * multiplies horizontal speed by 1.45 and the resulting gap by 1.18.
 */
function resolveRunConditions(options = {}) {
  const mode = normalizeMode(options.mode);
  const baseSpeed = Math.max(0.001, finite(options.baseSpeed ?? options.speed, 2.9));
  const nominalGap = Math.max(1, finite(options.nominalGap ?? options.gap, 260));
  const spawnGapOffset = finite(options.spawnGapOffset, -SPAWN_GAP_OSCILLATION_PX);
  const rawSpawnGap = Math.max(1, nominalGap + spawnGapOffset);
  const speed = baseSpeed * (mode === 'surge' ? monas.SURGE_SPEED_MULTIPLIER : 1);
  const spawnGap = rawSpawnGap * (mode === 'surge' ? SURGE_GAP_MULTIPLIER : 1);
  return Object.freeze({
    mode,
    baseSpeed,
    nominalGap,
    spawnGapOffset,
    rawSpawnGap,
    speed,
    spawnGap
  });
}

/** Exact live MONAS vertical step, minus cosmetic trail/rotation work. */
function advanceControlState(state, options = {}) {
  const height = Math.max(1, finite(options.viewportHeight, 844));
  const held = Boolean(options.held);
  const previousReleaseAge = Math.max(0, Math.floor(finite(state?.releaseAge, monas.HANG_FRAMES)));
  // Live Player.update stores an ever-growing counter. advanceGlide clamps it at
  // HANG_FRAMES, so capping it here is behaviorally exact and keeps state finite.
  const releaseAge = held ? 0 : Math.min(monas.HANG_FRAMES, previousReleaseAge + 1);
  const stepped = monas.advanceGlide(
    { y: finite(state?.y, height / 2), vy: finite(state?.vy, 0) },
    { held, framesSinceRelease: releaseAge }
  );

  let y = stepped.y;
  let vy = stepped.vy;
  const bottomDeath = height - TOP_CLAMP;
  if (y > bottomDeath) return null;
  if (y < TOP_CLAMP) {
    y = TOP_CLAMP;
    vy = 0;
  }

  return { y, vy, held, releaseAge };
}

/**
 * Runtime pattern geometry reduced to a corridor that is safe at every motion
 * phase. The centre remains identical to the runtime pillar's centre.
 */
function conservativeGeometry(options = {}) {
  const resolved = variety.resolvePillarGeometry({
    gap: options.gap,
    top: options.top,
    gapScale: options.gapScale,
    motionAmplitude: options.motionAmplitude,
    motionPhase: 0,
    minimumGap: variety.VERIFIED_STATIC_GAP
  });
  const top = resolved.top + resolved.motionAmplitude;
  const gap = resolved.gap - (2 * resolved.motionAmplitude);
  return {
    top,
    gap,
    centre: top + (gap / 2),
    runtimeTop: resolved.top,
    runtimeGap: resolved.gap,
    motionAmplitude: resolved.motionAmplitude,
    gapScale: resolved.gapScale,
    phaseIndependent: variety.motionRespectsVerifiedCorridor(resolved.gap, resolved.motionAmplitude)
  };
}

function buildConservativeGateWindows(ratios, options = {}) {
  if (!Array.isArray(ratios) || ratios.length === 0) {
    throw new TypeError('buildConservativeGateWindows requires at least one ratio');
  }
  const viewportWidth = Math.max(1, finite(options.viewportWidth, 390));
  const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
  const conditions = resolveRunConditions(options);
  const spawnRate = grammar.computeSpawnRate(conditions.speed, PILLAR_SPAWN_BASE);
  const gapScale = finite(options.gapScale, 1);
  const motionAmplitude = Math.max(0, finite(options.motionAmplitude, grammar.DEFAULT_MOTION_PX));

  const gates = ratios.map((ratio, index) => {
    const baseTop = grammar.computeTopFromRatio(viewportHeight, conditions.spawnGap, finite(ratio, 0.5));
    const corridor = conservativeGeometry({
      gap: conditions.spawnGap,
      top: baseTop,
      gapScale,
      motionAmplitude
    });
    const collision = neutral.computeGateCollisionWindow({
      viewportWidth,
      speed: conditions.speed,
      spawnFrame: index * spawnRate
    });
    return {
      index,
      ratio: finite(ratio, 0.5),
      baseTop,
      baseGap: conditions.spawnGap,
      ...corridor,
      ...collision
    };
  });

  return { conditions, spawnRate, gates };
}

function isStateSafeForGate(state, gate, margin = 0) {
  const resolvedMargin = Math.max(0, finite(margin, 0));
  return (
    state.y - HITBOX_HALF >= gate.top + resolvedMargin &&
    state.y + HITBOX_HALF <= gate.top + gate.gap - resolvedMargin
  );
}

function stateKey(state) {
  const y = Math.round(state.y / Y_QUANTUM);
  const vy = Math.round(state.vy / VY_QUANTUM);
  return `${y}|${vy}|${state.held ? 1 : 0}|${state.releaseAge}`;
}

function stateScore(state, targetY) {
  return Math.abs(state.y - targetY) + (Math.abs(state.vy) * 1.5);
}

function pruneStates(states, limit, targetY) {
  if (states.size <= limit) return states;
  const bands = new Map();
  for (const state of states.values()) {
    const band = Math.floor(state.y / 12);
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band).push(state);
  }

  const perBand = Math.max(2, Math.floor(limit / Math.max(1, bands.size)));
  const selected = [];
  for (const bandStates of bands.values()) {
    bandStates.sort((left, right) => stateScore(left, targetY) - stateScore(right, targetY));
    selected.push(...bandStates.slice(0, perBand));
  }
  selected.sort((left, right) => stateScore(left, targetY) - stateScore(right, targetY));

  const output = new Map();
  for (const state of selected.slice(0, limit)) output.set(stateKey(state), state);
  return output;
}

function nextGateTarget(gates, frame) {
  const gate = gates.find(candidate => candidate.start >= frame) || gates[gates.length - 1];
  return gate.centre;
}

function reconstructTransitions(path) {
  const transitions = [];
  for (let node = path; node; node = node.previous) {
    transitions.push({ frame: node.frame, held: node.held });
  }
  transitions.reverse();
  return transitions;
}

function replayHoldWitness(options = {}) {
  const ratios = Array.isArray(options.ratios) ? options.ratios.map(Number) : [];
  const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
  const margin = Math.max(0, finite(options.margin, 0));
  const transitions = Array.isArray(options.transitions) ? options.transitions : [];
  const built = buildConservativeGateWindows(ratios, options);
  const gates = built.gates;
  const firstFrame = gates[0].start;
  const finalFrame = gates[gates.length - 1].end;
  let state = {
    y: gates[0].centre,
    vy: 0,
    held: false,
    releaseAge: monas.HANG_FRAMES
  };
  let transitionIndex = 0;
  let minimumClearance = Infinity;

  for (let frame = firstFrame; frame <= finalFrame; frame += 1) {
    const activeGates = gates.filter(gate => frame >= gate.start && frame <= gate.end);
    for (const gate of activeGates) {
      const topClearance = (state.y - HITBOX_HALF) - gate.top;
      const bottomClearance = (gate.top + gate.gap) - (state.y + HITBOX_HALF);
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

    while (transitionIndex < transitions.length && transitions[transitionIndex].frame === frame) {
      state.held = Boolean(transitions[transitionIndex].held);
      transitionIndex += 1;
    }
    const advanced = advanceControlState(state, {
      viewportHeight,
      held: state.held
    });
    if (!advanced) {
      return {
        valid: false,
        failedFrame: frame,
        failedGateIndex: activeGates[0]?.index ?? null,
        minimumClearance
      };
    }
    state = advanced;
  }

  return {
    valid: true,
    minimumClearance,
    finalState: state,
    conditions: built.conditions,
    gates
  };
}

function solveHoldSequence(options = {}) {
  const ratios = Array.isArray(options.ratios) ? options.ratios.map(Number) : [];
  if (ratios.length === 0) throw new TypeError('solveHoldSequence requires at least one gate ratio');

  const viewportHeight = Math.max(1, finite(options.viewportHeight, 844));
  const margin = Math.max(0, finite(options.margin, 0));
  const beamWidth = Math.max(100, Math.floor(finite(options.beamWidth, DEFAULT_BEAM_WIDTH)));
  const built = buildConservativeGateWindows(ratios, options);
  const gates = built.gates;
  const firstFrame = gates[0].start;
  const finalFrame = gates[gates.length - 1].end;
  const initialState = {
    y: gates[0].centre,
    vy: 0,
    held: false,
    releaseAge: monas.HANG_FRAMES,
    path: null
  };

  let states = new Map([[stateKey(initialState), initialState]]);
  let peakStates = states.size;

  for (let frame = firstFrame; frame <= finalFrame; frame += 1) {
    const activeGates = gates.filter(gate => frame >= gate.start && frame <= gate.end);
    const nextStates = new Map();

    for (const state of states.values()) {
      if (!activeGates.every(gate => isStateSafeForGate(state, gate, margin))) continue;

      for (const requestHeld of [false, true]) {
        const advanced = advanceControlState(state, {
          viewportHeight,
          held: requestHeld
        });
        if (!advanced) continue;

        const candidate = {
          ...advanced,
          path: requestHeld !== state.held
            ? { frame, held: requestHeld, previous: state.path }
            : state.path
        };
        const key = stateKey(candidate);
        const existing = nextStates.get(key);
        const targetY = nextGateTarget(gates, frame + 1);
        if (!existing || stateScore(candidate, targetY) < stateScore(existing, targetY)) {
          nextStates.set(key, candidate);
        }
      }
    }

    states = pruneStates(nextStates, beamWidth, nextGateTarget(gates, frame + 1));
    peakStates = Math.max(peakStates, states.size);
    if (states.size === 0) {
      return {
        solverVersion: SOLVER_VERSION,
        witnessFound: false,
        witnessValid: false,
        margin,
        searchExhaustedAtFrame: frame,
        failedGateIndex: activeGates[0]?.index ?? null,
        peakStates,
        conditions: built.conditions,
        spawnRate: built.spawnRate,
        gates
      };
    }
  }

  const ranked = [...states.values()].sort((left, right) => {
    return stateScore(left, gates[gates.length - 1].centre) - stateScore(right, gates[gates.length - 1].centre);
  });

  for (const finalState of ranked) {
    const transitions = reconstructTransitions(finalState.path);
    const replay = replayHoldWitness({ ...options, ratios, margin, transitions });
    if (replay.valid) {
      return {
        solverVersion: SOLVER_VERSION,
        witnessFound: true,
        witnessValid: true,
        margin,
        peakStates,
        conditions: built.conditions,
        spawnRate: built.spawnRate,
        transitions,
        transitionCount: transitions.length,
        minimumClearance: replay.minimumClearance,
        finalState: replay.finalState,
        gates
      };
    }
  }

  return {
    solverVersion: SOLVER_VERSION,
    witnessFound: true,
    witnessValid: false,
    margin,
    peakStates,
    conditions: built.conditions,
    spawnRate: built.spawnRate,
    gates
  };
}

function classifyHoldSequence(options = {}) {
  const margins = Array.isArray(options.margins) && options.margins.length
    ? options.margins.map(value => Math.max(0, finite(value, 0)))
    : DEFAULT_MARGINS;

  let lastResult = null;
  for (const margin of margins) {
    const result = solveHoldSequence({ ...options, margin });
    lastResult = result;
    if (result.witnessFound && result.witnessValid) {
      return {
        classification: margin >= 8 ? 'verified' : 'marginal',
        verifiedMargin: margin,
        result
      };
    }
  }

  return {
    classification: 'unverified',
    verifiedMargin: -1,
    result: lastResult
  };
}

function listPatternVariants(pattern) {
  return pattern?.mirror ? [1, -1] : [1];
}

function auditMonasPatternLibrary(options = {}) {
  const scenarios = Array.isArray(options.scenarios) && options.scenarios.length
    ? options.scenarios
    : DEFAULT_SCENARIOS;
  const anchors = Array.isArray(options.anchors) && options.anchors.length
    ? options.anchors
    : DEFAULT_ANCHORS;
  const patternIds = Array.isArray(options.patternIds) && options.patternIds.length
    ? new Set(options.patternIds)
    : null;
  // The installed scheduler does not necessarily materialize the raw catalog.
  // reachability-policy.js replaces five MONAS value sequences before they reach
  // play, including expanding return-flow from five walls to twelve. Accept the
  // exact catalog being audited so the hold/release proof and the shipped
  // scheduler cannot silently describe different obstacle timelines.
  const library = Array.isArray(options.library) && options.library.length
    ? options.library
    : grammar.PATTERN_LIBRARY.MONAS;
  const cases = [];

  for (const pattern of library) {
    if (patternIds && !patternIds.has(pattern.id)) continue;
    for (const direction of listPatternVariants(pattern)) {
      for (const anchor of anchors) {
        const ratios = grammar.materializePattern(pattern, anchor, direction);
        for (const scenario of scenarios) {
          const classification = classifyHoldSequence({
            ...options,
            ratios,
            viewportWidth: scenario.width,
            viewportHeight: scenario.height,
            gapScale: pattern.gapScale,
            motionAmplitude: pattern.motion
          });
          cases.push({
            mode: normalizeMode(options.mode),
            patternId: pattern.id,
            family: pattern.family,
            patternLength: pattern.values.length,
            direction,
            anchor,
            scenarioId: scenario.id,
            classification: classification.classification,
            verifiedMargin: classification.verifiedMargin,
            transitionCount: classification.result?.transitionCount ?? null,
            minimumClearance: classification.result?.minimumClearance ?? null,
            speed: classification.result?.conditions?.speed ?? null,
            spawnGap: classification.result?.conditions?.spawnGap ?? null,
            spawnRate: classification.result?.spawnRate ?? null,
            witnessValid: Boolean(classification.result?.witnessValid)
          });
        }
      }
    }
  }

  const summary = cases.reduce((counts, entry) => {
    counts[entry.classification] += 1;
    return counts;
  }, { verified: 0, marginal: 0, unverified: 0 });

  const patternVerdicts = {};
  for (const entry of cases) {
    const current = patternVerdicts[entry.patternId] || 'verified';
    if (entry.classification === 'unverified') patternVerdicts[entry.patternId] = 'unverified';
    else if (entry.classification === 'marginal' && current !== 'unverified') patternVerdicts[entry.patternId] = 'marginal';
    else if (!patternVerdicts[entry.patternId]) patternVerdicts[entry.patternId] = 'verified';
  }

  return {
    solverVersion: SOLVER_VERSION,
    mode: normalizeMode(options.mode),
    baseSpeed: finite(options.baseSpeed ?? options.speed, 2.9),
    nominalGap: finite(options.nominalGap ?? options.gap, 260),
    spawnGapOffset: finite(options.spawnGapOffset, -SPAWN_GAP_OSCILLATION_PX),
    summary,
    totalCases: cases.length,
    scenarios: scenarios.map(scenario => ({ ...scenario })),
    anchors: [...anchors],
    libraryPatternIds: library.map(pattern => pattern.id),
    patternVerdicts,
    cases
  };
}

module.exports = Object.freeze({
  SOLVER_VERSION,
  PLAYER_RADIUS,
  HITBOX_HALF,
  TOP_CLAMP,
  SURGE_GAP_MULTIPLIER,
  SPAWN_GAP_OSCILLATION_PX,
  Y_QUANTUM,
  VY_QUANTUM,
  DEFAULT_BEAM_WIDTH,
  DEFAULT_MARGINS,
  DEFAULT_ANCHORS,
  DEFAULT_SCENARIOS,
  finite,
  clamp,
  normalizeMode,
  resolveRunConditions,
  advanceControlState,
  conservativeGeometry,
  buildConservativeGateWindows,
  isStateSafeForGate,
  replayHoldWitness,
  solveHoldSequence,
  classifyHoldSequence,
  auditMonasPatternLibrary
});
