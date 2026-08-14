'use strict';

const fs = require('node:fs');
const path = require('node:path');
const frontier = require('./monas-progression-frontier.js');

const outputPath = path.join(process.cwd(), 'artifacts', 'm31-monas-progression-frontier.json');
let report;
let error = null;

try {
  report = frontier.scanFrontier({ margin: 8, beamWidth: 550 });
  if (!report.results[0]?.fullyVerified) {
    throw new Error('Known 2.9 / 260 baseline no longer verifies in the targeted frontier scan');
  }
} catch (caught) {
  error = caught?.stack || String(caught);
  report = {
    frontierVersion: frontier.FRONTIER_VERSION,
    error,
    candidates: frontier.CANDIDATES.map(candidate => ({ ...candidate }))
  };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  error,
  contiguousFrontier: report.contiguousFrontier || null,
  firstConcernCandidate: report.firstConcernCandidate || null,
  verifiedAfterConcern: report.verifiedAfterConcern || [],
  candidates: Array.isArray(report.results)
    ? report.results.map(result => ({
        id: result.candidate.id,
        baseSpeed: result.candidate.baseSpeed,
        nominalGap: result.candidate.nominalGap,
        fullyVerified: result.fullyVerified,
        patternCasesRun: result.patternCasesRun,
        compositionCasesRun: result.compositionCasesRun,
        firstConcern: result.firstConcern
          ? {
              kind: result.firstConcern.kind,
              patternId: result.firstConcern.patternId || null,
              pairId: result.firstConcern.pairId || null,
              scenarioId: result.firstConcern.scenarioId,
              mode: result.firstConcern.mode,
              classification: result.firstConcern.classification,
              speed: result.firstConcern.speed,
              spawnGap: result.firstConcern.spawnGap
            }
          : null
      }))
    : []
}, null, 2));

// Harder candidates are exploratory. Only a scanner/configuration regression is a
// CI failure; finding the frontier is the purpose of this job.
if (error) process.exitCode = 1;
