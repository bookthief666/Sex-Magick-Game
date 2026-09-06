'use strict';

/**
 * M31 — exploratory MONAS progression frontier.
 *
 * This is not a progression table. It probes progressively harder candidate
 * conditions against the pattern/transition cases that were tightest in the
 * verified 2.9 / 260 baseline artifact. A candidate is "fullyVerified" only when
 * every targeted case produces an exact replayable witness at the requested 8px
 * margin. Harder candidate concerns are evidence, not CI failures.
 */

const grammar = require('./obstacle-grammar.js');
const reach = require('./monas-reachability.js');
const composition = require('./monas-compositional-reachability.js');

const FRONTIER_VERSION = 1;
const TARGET_PATTERN_IDS = Object.freeze([
  'monas.caduceus-wave',
  'monas.serpent-current',
  'monas.lunar-sweep',
  'monas.mercurial-wave'
]);
const TARGET_PAIR_IDS = Object.freeze([
  'monas.orbit-settle:mirror=>monas.mercurial-wave:base',
  'monas.mercurial-wave:base=>monas.caduceus-wave:mirror',
  'monas.caduceus-wave:mirror=>monas.return-flow:base',
  'monas.lunar-sweep:base=>monas.serpent-current:base',
  'monas.mercurial-wave:base=>monas.serpent-current:mirror',
  'monas.return-flow:base=>monas.lunar-sweep:mirror'
]);
const CANDIDATES = Object.freeze([
  Object.freeze({ id: 'baseline', baseSpeed: 2.9, nominalGap: 260 }),
  Object.freeze({ id: 'p1', baseSpeed: 3.3, nominalGap: 250 }),
  Object.freeze({ id: 'p2', baseSpeed: 3.7, nominalGap: 240 }),
  Object.freeze({ id: 'p3', baseSpeed: 4.1, nominalGap: 230 }),
  Object.freeze({ id: 'p4', baseSpeed: 4.5, nominalGap: 220 }),
  Object.freeze({ id: 'p5', baseSpeed: 4.9, nominalGap: 210 }),
  Object.freeze({ id: 'p6', baseSpeed: 5.3, nominalGap: 200 }),
  Object.freeze({ id: 'p7', baseSpeed: 5.7, nominalGap: 190 })
]);
const TARGET_ANCHORS = Object.freeze([0.22, 0.5, 0.78]);
const TARGET_SCENARIOS = Object.freeze(
  reach.DEFAULT_SCENARIOS.filter(scenario => scenario.id === 'fold-closed' || scenario.id === 'fold-open')
);
const TARGET_MODES = Object.freeze(['ordinary', 'surge']);
const DEFAULT_MARGIN = 8;
const DEFAULT_BEAM_WIDTH = 550;

function patternDirections(pattern) {
  return pattern?.mirror ? [1, -1] : [1];
}

function resolveTargetPatterns() {
  const byId = new Map(grammar.PATTERN_LIBRARY.MONAS.map(pattern => [pattern.id, pattern]));
  return TARGET_PATTERN_IDS.map(id => {
    const pattern = byId.get(id);
    if (!pattern) throw new Error(`Missing targeted MONAS pattern: ${id}`);
    return pattern;
  });
}

function resolveTargetPairs() {
  const byId = new Map(composition.buildLegalVariantPairs().map(pair => [pair.id, pair]));
  return TARGET_PAIR_IDS.map(id => {
    const pair = byId.get(id);
    if (!pair) throw new Error(`Missing targeted legal MONAS pair: ${id}`);
    return pair;
  });
}

function validateCandidateLadder(candidates = CANDIDATES) {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('Progression frontier requires candidates');
  for (let index = 1; index < candidates.length; index += 1) {
    const previous = candidates[index - 1];
    const current = candidates[index];
    if (!(current.baseSpeed > previous.baseSpeed)) {
      throw new Error(`Candidate ${current.id} must increase base speed over ${previous.id}`);
    }
    if (!(current.nominalGap < previous.nominalGap)) {
      throw new Error(`Candidate ${current.id} must decrease nominal gap from ${previous.id}`);
    }
  }
  return true;
}

function caseConcern(classification) {
  return classification.classification !== 'verified' || !classification.result?.witnessValid;
}

function auditCandidate(candidate, options = {}) {
  const margin = Number.isFinite(options.margin) ? options.margin : DEFAULT_MARGIN;
  const beamWidth = Number.isFinite(options.beamWidth) ? options.beamWidth : DEFAULT_BEAM_WIDTH;
  const stopOnConcern = options.stopOnConcern !== false;
  const patterns = options.patterns || resolveTargetPatterns();
  const pairs = options.pairs || resolveTargetPairs();
  const patternCases = [];
  const compositionCases = [];
  let firstConcern = null;

  outerPatterns:
  for (const pattern of patterns) {
    for (const direction of patternDirections(pattern)) {
      for (const anchor of TARGET_ANCHORS) {
        const ratios = grammar.materializePattern(pattern, anchor, direction);
        for (const scenario of TARGET_SCENARIOS) {
          for (const mode of TARGET_MODES) {
            const classification = reach.classifyHoldSequence({
              ratios,
              viewportWidth: scenario.width,
              viewportHeight: scenario.height,
              baseSpeed: candidate.baseSpeed,
              nominalGap: candidate.nominalGap,
              mode,
              gapScale: pattern.gapScale,
              motionAmplitude: pattern.motion,
              margins: [margin],
              beamWidth
            });
            const entry = {
              kind: 'pattern',
              patternId: pattern.id,
              direction,
              anchor,
              scenarioId: scenario.id,
              mode,
              classification: classification.classification,
              verifiedMargin: classification.verifiedMargin,
              witnessValid: Boolean(classification.result?.witnessValid),
              minimumClearance: classification.result?.minimumClearance ?? null,
              speed: classification.result?.conditions?.speed ?? null,
              spawnGap: classification.result?.conditions?.spawnGap ?? null,
              spawnRate: classification.result?.spawnRate ?? null
            };
            patternCases.push(entry);
            if (!firstConcern && caseConcern(classification)) firstConcern = entry;
            if (firstConcern && stopOnConcern) break outerPatterns;
          }
        }
      }
    }
  }

  if (!firstConcern || !stopOnConcern) {
    outerPairs:
    for (const pair of pairs) {
      for (const scenario of TARGET_SCENARIOS) {
        for (const mode of TARGET_MODES) {
          const audited = composition.classifyPatternPair(pair, {
            anchor: 0.5,
            viewportWidth: scenario.width,
            viewportHeight: scenario.height,
            baseSpeed: candidate.baseSpeed,
            nominalGap: candidate.nominalGap,
            mode,
            margins: [margin],
            beamWidth
          });
          const classification = audited.classification;
          const entry = {
            kind: 'composition',
            pairId: pair.id,
            transition: pair.transition,
            scenarioId: scenario.id,
            mode,
            classification: classification.classification,
            verifiedMargin: classification.verifiedMargin,
            witnessValid: Boolean(classification.result?.witnessValid),
            minimumClearance: classification.result?.minimumClearance ?? null,
            speed: classification.result?.conditions?.speed ?? null,
            spawnGap: classification.result?.conditions?.spawnGap ?? null,
            spawnRate: classification.result?.spawnRate ?? null,
            envelopeGapScale: audited.materialized.envelope.gapScale,
            envelopeMotionAmplitude: audited.materialized.envelope.motionAmplitude
          };
          compositionCases.push(entry);
          if (!firstConcern && caseConcern(classification)) firstConcern = entry;
          if (firstConcern && stopOnConcern) break outerPairs;
        }
      }
    }
  }

  return {
    candidate: { ...candidate },
    margin,
    beamWidth,
    fullyVerified: firstConcern === null,
    firstConcern,
    patternCasesRun: patternCases.length,
    compositionCasesRun: compositionCases.length,
    patternCases,
    compositionCases
  };
}

function scanFrontier(options = {}) {
  const candidates = options.candidates || CANDIDATES;
  validateCandidateLadder(candidates);
  const patterns = resolveTargetPatterns();
  const pairs = resolveTargetPairs();
  const results = [];

  for (const candidate of candidates) {
    results.push(auditCandidate(candidate, {
      ...options,
      patterns,
      pairs,
      stopOnConcern: true
    }));
  }

  let contiguousFrontierIndex = -1;
  for (let index = 0; index < results.length; index += 1) {
    if (!results[index].fullyVerified) break;
    contiguousFrontierIndex = index;
  }
  const verifiedAfterConcern = results
    .slice(contiguousFrontierIndex + 2)
    .filter(result => result.fullyVerified)
    .map(result => result.candidate.id);

  return {
    frontierVersion: FRONTIER_VERSION,
    claimBoundary: 'Exploratory targeted scan only. A candidate marked fullyVerified has exact 8px witnesses for the targeted tight cases; it is not yet a live progression band.',
    targetPatternIds: [...TARGET_PATTERN_IDS],
    targetPairIds: [...TARGET_PAIR_IDS],
    targetAnchors: [...TARGET_ANCHORS],
    targetScenarios: TARGET_SCENARIOS.map(scenario => ({ ...scenario })),
    targetModes: [...TARGET_MODES],
    margin: Number.isFinite(options.margin) ? options.margin : DEFAULT_MARGIN,
    beamWidth: Number.isFinite(options.beamWidth) ? options.beamWidth : DEFAULT_BEAM_WIDTH,
    candidateCount: candidates.length,
    contiguousFrontier: contiguousFrontierIndex >= 0 ? results[contiguousFrontierIndex].candidate : null,
    firstConcernCandidate: results[contiguousFrontierIndex + 1]?.candidate || null,
    verifiedAfterConcern,
    results
  };
}

module.exports = Object.freeze({
  FRONTIER_VERSION,
  TARGET_PATTERN_IDS,
  TARGET_PAIR_IDS,
  CANDIDATES,
  TARGET_ANCHORS,
  TARGET_SCENARIOS,
  TARGET_MODES,
  DEFAULT_MARGIN,
  DEFAULT_BEAM_WIDTH,
  patternDirections,
  resolveTargetPatterns,
  resolveTargetPairs,
  validateCandidateLadder,
  auditCandidate,
  scanFrontier
});
