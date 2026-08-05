'use strict';
const assert = require('node:assert/strict');
const Analysis = require('./performance-evidence-analysis.js');

function makeReport({ preset, repeat, p95 = 16.8, p99 = 18.5, critical = 0, dropped = 0, samples = 3600, sessionId, profile, requestedDpr, assetMode = 'offline', suspensionGaps = 0, active = false }) {
  const definition = Analysis.presetDefinition(preset);
  const durationMs = samples * 16.667;
  return {
    mode: Analysis.REPORT_MODE,
    version: 1,
    active,
    generatedAtMs: durationMs + 100,
    environment: { visibilityState: 'visible' },
    measurement: {
      schemaVersion: 1,
      protocol: Analysis.PROTOCOL,
      source: 'test',
      sessionId: sessionId || `${preset}-r${repeat}`,
      preset,
      repeat,
      requestedDpr: requestedDpr ?? definition?.requestedDpr,
      expectedProfile: definition?.profile
    },
    segments: [{
      id: 1,
      startedAtMs: 100,
      endedAtMs: durationMs + 100,
      context: {
        profile: profile ?? definition?.profile,
        effectiveDpr: definition?.tier === 'native' ? 2.625 : definition?.tier === '2x' ? 2 : 1,
        logicalWidth: definition?.profile === 'fold-open' ? 884 : 368,
        logicalHeight: definition?.profile === 'fold-open' ? 1104 : 869,
        backingWidth: 100,
        backingHeight: 100,
        backingPixels: 10000,
        renderMode: 'logical-css-pixels-with-bounded-dpr-backing',
        assetMode
      },
      frameIntervals: { count: samples, p50: 16.667, p95, p99 },
      drawDurations: { p95: 1.2 },
      callbackDurations: { p95: 2.1 },
      longFrameRate: p95 > 25 ? 0.1 : 0,
      criticalFrameRate: critical,
      droppedSimulationMs: dropped,
      suspensionGaps,
      suspensionResets: 0,
      contextTransitionFramesIgnored: 0,
      longTasks: { count: 0, totalDurationMs: 0 }
    }]
  };
}

assert.equal(Analysis.median([3, 1, 2]), 2);
assert.equal(Analysis.median([1, 2, 3, 4]), 2.5);
assert.equal(Analysis.medianAbsoluteDeviation([10, 10, 12]), 0);
assert.equal(Analysis.fingerprintReport({ b: 2, a: 1 }), Analysis.fingerprintReport({ a: 1, b: 2 }));
assert.notEqual(Analysis.fingerprintReport({ a: 1 }), Analysis.fingerprintReport({ a: 2 }));

const complete = [];
for (const preset of Object.keys(Analysis.PRESETS)) {
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    let p95 = 17 + repeat * 0.1;
    let p99 = 19 + repeat * 0.1;
    let critical = 0.001;
    let dropped = 10;
    if (preset === 'open-native') { p95 = 24 + repeat * 0.1; p99 = 31; critical = 0.01; dropped = 100; }
    complete.push({ sourceLabel: `${preset}-${repeat}.json`, report: makeReport({ preset, repeat, p95, p99, critical, dropped }) });
  }
}
const analysis = Analysis.analyzeReports(complete);
assert.equal(analysis.summary.acceptedReportCount, 18);
assert.equal(analysis.summary.eligibleRunCount, 18);
assert.equal(analysis.recommendations.find(item => item.profile === 'fold-closed').recommendation, 'closed-native');
assert.equal(analysis.recommendations.find(item => item.profile === 'fold-open').recommendation, 'open-2x');
assert.equal(analysis.groups.find(group => group.preset === 'open-native').status, 'over-provisional-budget');
assert.equal(analysis.groups.find(group => group.preset === 'closed-native').status, 'sustainable-candidate');

const insufficient = Analysis.analyzeReports(complete.filter(item => !item.sourceLabel.startsWith('closed-css-3')));
const closedInsufficient = insufficient.recommendations.find(item => item.profile === 'fold-closed');
assert.equal(closedInsufficient.status, 'insufficient-evidence');
assert.deepEqual(closedInsufficient.missingPresets, ['closed-css']);

const duplicate = makeReport({ preset: 'closed-css', repeat: 1 });
const duplicates = Analysis.analyzeReports([{ sourceLabel: 'a', report: duplicate }, { sourceLabel: 'b', report: structuredClone(duplicate) }]);
assert.equal(duplicates.summary.acceptedReportCount, 1);
assert.equal(duplicates.summary.rejectedReportCount, 1);
assert.deepEqual(duplicates.rejectedReports[0].errors, ['duplicate-report']);

const mismatch = Analysis.analyzeReports([{ sourceLabel: 'mismatch', report: makeReport({ preset: 'closed-css', repeat: 1, profile: 'fold-open' }) }], { minSamplesPerRun: 1 });
assert.equal(mismatch.runs[0].eligible, false);
assert.ok(mismatch.runs[0].exclusionReasons.includes('preset-profile-mismatch'));

const interrupted = Analysis.analyzeReports([{ sourceLabel: 'interrupted', report: makeReport({ preset: 'closed-css', repeat: 1, suspensionGaps: 1 }) }], { minSamplesPerRun: 1 });
assert.ok(interrupted.runs[0].exclusionReasons.includes('suspension-gap-detected'));

const legacy = makeReport({ preset: 'closed-css', repeat: 1 });
delete legacy.measurement;
const legacyAnalysis = Analysis.analyzeReports([{ sourceLabel: 'legacy', report: legacy }], { minSamplesPerRun: 1 });
assert.equal(legacyAnalysis.summary.acceptedReportCount, 1);
assert.equal(legacyAnalysis.runs[0].eligible, false);
assert.ok(legacyAnalysis.runs[0].exclusionReasons.includes('protocol-mismatch'));
assert.ok(legacyAnalysis.runs[0].exclusionReasons.includes('missing-session-id'));

const unstable = [];
for (let repeat = 1; repeat <= 3; repeat += 1) {
  unstable.push({ report: makeReport({ preset: 'closed-css', repeat, p95: [15, 20, 25][repeat - 1], p99: 26 }) });
}
const unstableGroup = Analysis.analyzeReports(unstable).groups.find(group => group.preset === 'closed-css');
assert.equal(unstableGroup.thresholdChecks.repeatStability, false);

console.log('m12-performance-evidence-analysis: all deterministic checks passed');
