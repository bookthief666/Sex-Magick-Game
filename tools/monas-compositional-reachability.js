'use strict';

/**
 * M31 — compositional MONAS reachability.
 *
 * The PatternScheduler does not choose arbitrary families: it walks FAMILY_CYCLE.
 * This module therefore audits only transitions the shipped scheduler can actually
 * emit. Each pair uses a conservative geometry envelope (the tighter gapScale and
 * larger motion amplitude across the two patterns), so an accepted witness is safe
 * for both real patterns. Search exhaustion remains "unverified", never impossible.
 */

const grammar = require('./obstacle-grammar.js');
const reach = require('./monas-reachability.js');

const COMPOSITION_VERSION = 1;

function finite(value, fallback = 0) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function deriveLegalFamilyTransitions(cycle = grammar.FAMILY_CYCLE) {
  if (!Array.isArray(cycle) || cycle.length === 0) return [];
  const seen = new Set();
  const transitions = [];
  for (let index = 0; index < cycle.length; index += 1) {
    const from = cycle[index];
    const to = cycle[(index + 1) % cycle.length];
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    transitions.push(Object.freeze({ from, to, key }));
  }
  return transitions;
}

const LEGAL_FAMILY_TRANSITIONS = Object.freeze(deriveLegalFamilyTransitions());

function patternDirections(pattern) {
  return pattern?.mirror ? [1, -1] : [1];
}

function variantId(pattern, direction) {
  return `${pattern.id}:${direction < 0 ? 'mirror' : 'base'}`;
}

function buildLegalVariantPairs(library = grammar.PATTERN_LIBRARY.MONAS) {
  const byFamily = new Map();
  for (const pattern of library || []) {
    if (!byFamily.has(pattern.family)) byFamily.set(pattern.family, []);
    byFamily.get(pattern.family).push(pattern);
  }

  const pairs = [];
  for (const transition of LEGAL_FAMILY_TRANSITIONS) {
    const firstPatterns = byFamily.get(transition.from) || [];
    const secondPatterns = byFamily.get(transition.to) || [];
    for (const first of firstPatterns) {
      for (const firstDirection of patternDirections(first)) {
        for (const second of secondPatterns) {
          for (const secondDirection of patternDirections(second)) {
            pairs.push(Object.freeze({
              transition: transition.key,
              first,
              firstDirection,
              firstVariant: variantId(first, firstDirection),
              second,
              secondDirection,
              secondVariant: variantId(second, secondDirection),
              id: `${variantId(first, firstDirection)}=>${variantId(second, secondDirection)}`
            }));
          }
        }
      }
    }
  }
  return pairs;
}

/**
 * Bounded PR coverage: for every legal family transition, cover every available
 * first-side variant and every available second-side variant at least once. This is
 * much smaller than the full cross product but cannot silently omit a named pattern
 * or mirror orientation. The full pair set remains available for manual/deep audit.
 */
function selectCoveragePairs(pairs = buildLegalVariantPairs()) {
  const selected = new Map();
  const byTransition = new Map();
  for (const pair of pairs) {
    if (!byTransition.has(pair.transition)) byTransition.set(pair.transition, []);
    byTransition.get(pair.transition).push(pair);
  }

  for (const transition of LEGAL_FAMILY_TRANSITIONS) {
    const group = byTransition.get(transition.key) || [];
    const firstSeen = new Set();
    const secondSeen = new Set();

    for (const pair of group) {
      if (!firstSeen.has(pair.firstVariant)) {
        selected.set(pair.id, pair);
        firstSeen.add(pair.firstVariant);
      }
    }
    for (const pair of group) {
      if (!secondSeen.has(pair.secondVariant)) {
        selected.set(pair.id, pair);
        secondSeen.add(pair.secondVariant);
      }
    }
  }

  return [...selected.values()];
}

function pairConservativeEnvelope(pair) {
  const firstScale = finite(pair?.first?.gapScale, 1);
  const secondScale = finite(pair?.second?.gapScale, 1);
  const firstMotion = Math.max(0, finite(pair?.first?.motion, grammar.DEFAULT_MOTION_PX));
  const secondMotion = Math.max(0, finite(pair?.second?.motion, grammar.DEFAULT_MOTION_PX));
  return Object.freeze({
    gapScale: Math.min(firstScale, secondScale),
    motionAmplitude: Math.max(firstMotion, secondMotion)
  });
}

function materializePatternPair(pair, anchor = 0.5) {
  if (!pair?.first || !pair?.second) throw new TypeError('materializePatternPair requires a legal pattern pair');
  const firstRatios = grammar.materializePattern(pair.first, anchor, pair.firstDirection);
  const boundaryAnchor = firstRatios[firstRatios.length - 1];
  const secondRatios = grammar.materializePattern(pair.second, boundaryAnchor, pair.secondDirection);
  return Object.freeze({
    ratios: Object.freeze([...firstRatios, ...secondRatios]),
    firstLength: firstRatios.length,
    boundaryGateIndex: firstRatios.length,
    boundaryAnchor,
    envelope: pairConservativeEnvelope(pair)
  });
}

function classifyPatternPair(pair, options = {}) {
  const materialized = materializePatternPair(pair, finite(options.anchor, 0.5));
  const classification = reach.classifyHoldSequence({
    ...options,
    ratios: materialized.ratios,
    gapScale: materialized.envelope.gapScale,
    motionAmplitude: materialized.envelope.motionAmplitude
  });
  return Object.freeze({ pair, materialized, classification });
}

function auditLegalCompositions(options = {}) {
  const coverage = options.coverage === 'full' ? 'full' : 'bounded';
  const allPairs = buildLegalVariantPairs(options.library || grammar.PATTERN_LIBRARY.MONAS);
  const pairs = Array.isArray(options.pairs) && options.pairs.length
    ? options.pairs
    : (coverage === 'full' ? allPairs : selectCoveragePairs(allPairs));
  const scenarios = Array.isArray(options.scenarios) && options.scenarios.length
    ? options.scenarios
    : reach.DEFAULT_SCENARIOS.filter(scenario => scenario.id === 'fold-closed' || scenario.id === 'fold-open');
  const anchors = Array.isArray(options.anchors) && options.anchors.length
    ? options.anchors
    : (coverage === 'full' ? reach.DEFAULT_ANCHORS : [0.5]);
  const modes = Array.isArray(options.modes) && options.modes.length
    ? options.modes.map(reach.normalizeMode)
    : ['ordinary', 'surge'];
  const cases = [];

  for (const pair of pairs) {
    for (const anchor of anchors) {
      for (const scenario of scenarios) {
        for (const mode of modes) {
          const audited = classifyPatternPair(pair, {
            ...options,
            anchor,
            mode,
            viewportWidth: scenario.width,
            viewportHeight: scenario.height
          });
          const classification = audited.classification;
          cases.push({
            transition: pair.transition,
            pairId: pair.id,
            firstPatternId: pair.first.id,
            firstDirection: pair.firstDirection,
            secondPatternId: pair.second.id,
            secondDirection: pair.secondDirection,
            anchor,
            scenarioId: scenario.id,
            mode,
            classification: classification.classification,
            verifiedMargin: classification.verifiedMargin,
            witnessValid: Boolean(classification.result?.witnessValid),
            minimumClearance: classification.result?.minimumClearance ?? null,
            transitionCount: classification.result?.transitionCount ?? null,
            speed: classification.result?.conditions?.speed ?? null,
            spawnGap: classification.result?.conditions?.spawnGap ?? null,
            spawnRate: classification.result?.spawnRate ?? null,
            envelopeGapScale: audited.materialized.envelope.gapScale,
            envelopeMotionAmplitude: audited.materialized.envelope.motionAmplitude
          });
        }
      }
    }
  }

  const summary = cases.reduce((counts, entry) => {
    counts[entry.classification] += 1;
    return counts;
  }, { verified: 0, marginal: 0, unverified: 0 });

  const transitionVerdicts = {};
  for (const transition of LEGAL_FAMILY_TRANSITIONS) transitionVerdicts[transition.key] = 'verified';
  for (const entry of cases) {
    const current = transitionVerdicts[entry.transition] || 'verified';
    if (entry.classification === 'unverified') transitionVerdicts[entry.transition] = 'unverified';
    else if (entry.classification === 'marginal' && current !== 'unverified') transitionVerdicts[entry.transition] = 'marginal';
  }

  return {
    compositionVersion: COMPOSITION_VERSION,
    solverVersion: reach.SOLVER_VERSION,
    coverage,
    legalFamilyTransitions: LEGAL_FAMILY_TRANSITIONS.map(entry => entry.key),
    allLegalVariantPairs: allPairs.length,
    auditedVariantPairs: pairs.length,
    baseSpeed: finite(options.baseSpeed ?? options.speed, 2.9),
    nominalGap: finite(options.nominalGap ?? options.gap, 260),
    scenarios: scenarios.map(scenario => ({ ...scenario })),
    anchors: [...anchors],
    modes: [...modes],
    summary,
    transitionVerdicts,
    totalCases: cases.length,
    cases
  };
}

module.exports = Object.freeze({
  COMPOSITION_VERSION,
  LEGAL_FAMILY_TRANSITIONS,
  finite,
  deriveLegalFamilyTransitions,
  patternDirections,
  variantId,
  buildLegalVariantPairs,
  selectCoveragePairs,
  pairConservativeEnvelope,
  materializePatternPair,
  classifyPatternPair,
  auditLegalCompositions
});
