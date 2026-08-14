'use strict';

const fs = require('node:fs');
const path = require('node:path');
const reach = require('./monas-reachability.js');
const composition = require('./monas-compositional-reachability.js');

const OUTPUT = path.join(process.cwd(), 'artifacts', 'm31-monas-boundary-audit.json');
const SCENARIOS = reach.DEFAULT_SCENARIOS.filter(scenario => scenario.id === 'fold-closed' || scenario.id === 'fold-open');
const ANCHORS = [0.22, 0.5, 0.78];
const MARGINS = [8, 4, 0];
const BEAM_WIDTH = 550;
const COORDINATES = [
  { id: 'adjacent-control', baseSpeed: 5.3, nominalGap: 200, compositionCoverage: 'bounded' },
  { id: 'search-ceiling', baseSpeed: 5.7, nominalGap: 190, compositionCoverage: 'full' }
];

function concernCount(summary) {
  return (summary?.marginal || 0) + (summary?.unverified || 0);
}

function auditCoordinate(coordinate) {
  const ordinary = reach.auditMonasPatternLibrary({
    mode: 'ordinary',
    baseSpeed: coordinate.baseSpeed,
    nominalGap: coordinate.nominalGap,
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH
  });
  const surge = reach.auditMonasPatternLibrary({
    mode: 'surge',
    baseSpeed: coordinate.baseSpeed,
    nominalGap: coordinate.nominalGap,
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH
  });
  const composed = composition.auditLegalCompositions({
    coverage: coordinate.compositionCoverage,
    modes: ['ordinary', 'surge'],
    baseSpeed: coordinate.baseSpeed,
    nominalGap: coordinate.nominalGap,
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH
  });
  const concerns = concernCount(ordinary.summary) + concernCount(surge.summary) + concernCount(composed.summary);

  return {
    coordinate: { ...coordinate },
    ordinaryPatterns: ordinary,
    surgePatterns: surge,
    composition: composed,
    concerns,
    fullyVerifiedAt8px: concerns === 0
  };
}

const report = {
  milestone: 'M31',
  purpose: 'Confirm the targeted progression frontier ceiling before any live MONAS progression change',
  claimBoundary: '5.7/190 receives the complete scheduler-legal variant-pair cross-product at three anchors; 5.3/200 is the adjacent bounded control. Exact 8px witness replay is required for acceptance.',
  scenarios: SCENARIOS,
  anchors: ANCHORS,
  margins: MARGINS,
  beamWidth: BEAM_WIDTH,
  coordinates: [],
  concerns: 0,
  error: null
};

try {
  for (const coordinate of COORDINATES) {
    const result = auditCoordinate(coordinate);
    report.coordinates.push(result);
    report.concerns += result.concerns;
  }
} catch (error) {
  report.error = error?.stack || String(error);
  report.concerns += 1;
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  error: report.error,
  concerns: report.concerns,
  coordinates: report.coordinates.map(result => ({
    ...result.coordinate,
    fullyVerifiedAt8px: result.fullyVerifiedAt8px,
    ordinaryPatterns: result.ordinaryPatterns.summary,
    surgePatterns: result.surgePatterns.summary,
    composition: result.composition.summary,
    auditedVariantPairs: result.composition.auditedVariantPairs,
    allLegalVariantPairs: result.composition.allLegalVariantPairs,
    compositionCases: result.composition.totalCases
  }))
}, null, 2));

if (report.concerns > 0) process.exitCode = 1;
