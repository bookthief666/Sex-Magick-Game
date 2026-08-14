'use strict';

const fs = require('node:fs');
const path = require('node:path');
const reach = require('./monas-reachability.js');
const composition = require('./monas-compositional-reachability.js');

const full = process.argv.includes('--full');
const outputPath = path.join(process.cwd(), 'artifacts', 'm31-monas-reachability.json');
const scenarios = reach.DEFAULT_SCENARIOS.filter(scenario => scenario.id === 'fold-closed' || scenario.id === 'fold-open');
const beamWidth = full ? 900 : 500;
const patternAnchors = full ? reach.DEFAULT_ANCHORS : [0.22, 0.5, 0.78];
const compositionAnchors = full ? reach.DEFAULT_ANCHORS : [0.5];

function countConcerns(summary) {
  return (summary?.marginal || 0) + (summary?.unverified || 0);
}

const report = {
  milestone: 'M31',
  purpose: 'MONAS hold/release reachability before progression tuning',
  claimBoundary: 'Accepted witnesses replay exactly. Search exhaustion is unverified, never impossible. No live progression values are changed by this audit.',
  configuration: {
    full,
    baseSpeed: 2.9,
    nominalGap: 260,
    beamWidth,
    scenarios,
    patternAnchors,
    compositionAnchors,
    modes: ['ordinary', 'surge']
  },
  patternAudits: {},
  compositionAudit: null,
  concerns: 0,
  error: null
};

try {
  for (const mode of ['ordinary', 'surge']) {
    report.patternAudits[mode] = reach.auditMonasPatternLibrary({
      mode,
      baseSpeed: 2.9,
      nominalGap: 260,
      scenarios,
      anchors: patternAnchors,
      beamWidth
    });
    report.concerns += countConcerns(report.patternAudits[mode].summary);
  }

  report.compositionAudit = composition.auditLegalCompositions({
    coverage: full ? 'full' : 'bounded',
    modes: ['ordinary', 'surge'],
    baseSpeed: 2.9,
    nominalGap: 260,
    scenarios,
    anchors: compositionAnchors,
    beamWidth
  });
  report.concerns += countConcerns(report.compositionAudit.summary);
} catch (error) {
  report.error = error?.stack || String(error);
  report.concerns += 1;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

const compact = {
  full,
  ordinaryPatterns: report.patternAudits.ordinary?.summary || null,
  surgePatterns: report.patternAudits.surge?.summary || null,
  composition: report.compositionAudit?.summary || null,
  compositionPairs: report.compositionAudit?.auditedVariantPairs || 0,
  compositionCases: report.compositionAudit?.totalCases || 0,
  concerns: report.concerns,
  error: report.error
};
console.log(JSON.stringify(compact, null, 2));

if (report.concerns > 0) process.exitCode = 1;
