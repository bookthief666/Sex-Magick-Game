'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const reach = require('./monas-reachability.js');
const composition = require('./monas-compositional-reachability.js');
const grammar = require('./obstacle-grammar.js');
const policy = require('./reachability-policy.js');
const progression = require('./monas-progression-runtime.js');

const OUTPUT = path.join(process.cwd(), 'docs', 'qa', 'm44-monas-shipped-boundary-audit.json');
const CHECKPOINT_DIR = process.env.MONAS_AUDIT_CHECKPOINT_DIR
  ? path.resolve(process.env.MONAS_AUDIT_CHECKPOINT_DIR)
  : null;
const SCENARIOS = reach.DEFAULT_SCENARIOS.filter(scenario => scenario.id === 'fold-closed' || scenario.id === 'fold-open');
const ANCHORS = [0.22, 0.5, 0.78];
const MARGINS = [8, 4, 0];
const BEAM_WIDTH = 550;
const SHIPPED_LIBRARY = grammar.PATTERN_LIBRARY.MONAS.map(pattern => policy.applyPatternOverride(pattern));

function shippedBandCoordinate(bandId, id, compositionCoverage = 'bounded') {
  const band = progression.BANDS.find(entry => entry.id === bandId);
  if (!band) throw new Error(`Missing shipped MONAS band ${bandId}`);
  return { id, baseSpeed: band.speed, nominalGap: band.gap, compositionCoverage, expectation: 'verified' };
}

const COORDINATES = [
  shippedBandCoordinate('ascent', 'adjacent-control'),
  { id: 'old-search-ceiling-control', baseSpeed: 5.7, nominalGap: 190, compositionCoverage: 'full', expectation: 'verified' },
  shippedBandCoordinate('torrent', 'torrent-live-band'),
  shippedBandCoordinate('maelstrom', 'maelstrom-live-band'),
  {
    id: 'portal-search-ceiling',
    baseSpeed: progression.MAX_VALIDATED_SPEED,
    nominalGap: progression.MIN_VALIDATED_GAP,
    compositionCoverage: 'full',
    expectation: 'verified'
  },
  { id: 'impossible-negative-control', baseSpeed: 14.0, nominalGap: 120, compositionCoverage: 'bounded', expectation: 'rejected' }
];

const FINGERPRINT_FILES = [
  'monas-reachability.js',
  'monas-compositional-reachability.js',
  'monas-progression-runtime.js',
  'monas-runtime.js',
  'obstacle-grammar.js',
  'obstacle-variety-runtime.js',
  'player-reachability.js',
  'reachability-policy.js',
  'run-m31-monas-boundary-audit.js'
];

function checkpointFingerprint(coordinate) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({
    node: process.version,
    coordinate,
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH,
    library: SHIPPED_LIBRARY
  }));
  for (const file of FINGERPRINT_FILES) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(__dirname, file)));
  }
  return hash.digest('hex');
}

function checkpointPath(coordinate) {
  if (!CHECKPOINT_DIR) return null;
  return path.join(CHECKPOINT_DIR, `${coordinate.id}.json`);
}

function loadCheckpoint(coordinate) {
  const file = checkpointPath(coordinate);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.fingerprint !== checkpointFingerprint(coordinate)) return null;
    if (saved.coordinateId !== coordinate.id || !saved.result) return null;
    return saved.result;
  } catch (_error) {
    return null;
  }
}

function saveCheckpoint(coordinate, result) {
  const file = checkpointPath(coordinate);
  if (!file) return;
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({
    fingerprint: checkpointFingerprint(coordinate),
    coordinateId: coordinate.id,
    result
  })}\n`);
  fs.renameSync(temporary, file);
}

function concernCount(summary) {
  return (summary?.marginal || 0) + (summary?.unverified || 0);
}

function auditCoordinate(coordinate) {
  const ordinary = reach.auditMonasPatternLibrary({
    library: SHIPPED_LIBRARY,
    mode: 'ordinary',
    baseSpeed: coordinate.baseSpeed,
    nominalGap: coordinate.nominalGap,
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH
  });
  const surge = reach.auditMonasPatternLibrary({
    library: SHIPPED_LIBRARY,
    mode: 'surge',
    baseSpeed: coordinate.baseSpeed,
    nominalGap: coordinate.nominalGap,
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH
  });
  const composed = composition.auditLegalCompositions({
    library: SHIPPED_LIBRARY,
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
  const rejectionSignals = {
    ordinary: concernCount(ordinary.summary),
    surge: concernCount(surge.summary),
    composition: concernCount(composed.summary)
  };
  const expectationMet = coordinate.expectation === 'rejected'
    ? Object.values(rejectionSignals).every(count => count > 0)
    : concerns === 0;

  return {
    coordinate: { ...coordinate },
    ordinaryPatterns: ordinary,
    surgePatterns: surge,
    composition: composed,
    concerns,
    fullyVerifiedAt8px: concerns === 0,
    expectationMet
  };
}

function createReport() {
  return {
    milestone: 'M44-corrected',
    purpose: 'Prove the live M44 MONAS ladder and portal against the policy-adjusted scheduler catalog and exact hold/release law',
    claimBoundary: '5.3/200 and 5.7/190 remain controls. Live 6.1/180 and 6.5/170 are audited in ordinary and surge flight; portal ceiling 7.0/160 receives the complete scheduler-legal variant-pair cross-product. Exact replay at 8px is required. 14/120 must reject.',
    policyVersion: policy.POLICY_VERSION,
    compositionVersion: composition.COMPOSITION_VERSION,
    shippedPatternIds: SHIPPED_LIBRARY.map(pattern => pattern.id),
    adjustedPatternLengths: Object.fromEntries(SHIPPED_LIBRARY.map(pattern => [pattern.id, pattern.values.length])),
    legalFamilyTransitions: composition.LEGAL_FAMILY_TRANSITIONS.map(entry => entry.key),
    scenarios: SCENARIOS,
    anchors: ANCHORS,
    margins: MARGINS,
    beamWidth: BEAM_WIDTH,
    coordinates: [],
    expectationFailures: 0,
    error: null
  };
}

function auditInWorker(coordinate) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { coordinate } });
    let settled = false;
    worker.once('message', message => {
      settled = true;
      if (message?.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (!settled) reject(new Error(`MONAS boundary worker exited ${code} without a result`));
    });
  });
}

async function auditCoordinates() {
  const requested = Number.parseInt(process.env.MONAS_AUDIT_WORKERS || '', 10);
  const workerCount = Math.max(1, Math.min(
    COORDINATES.length,
    Number.isFinite(requested) ? requested : Math.min(6, os.availableParallelism())
  ));
  console.error(`[MONAS boundary] ${COORDINATES.length} coordinates across ${workerCount} workers`);
  const results = new Array(COORDINATES.length);
  const schedule = [];
  for (let index = 0; index < COORDINATES.length; index += 1) {
    const coordinate = COORDINATES[index];
    const checkpoint = loadCheckpoint(coordinate);
    if (checkpoint) {
      results[index] = checkpoint;
      console.error(`[MONAS boundary] resumed ${coordinate.id} from matching checkpoint`);
    } else {
      schedule.push({ coordinate, index });
    }
  }
  schedule
    .sort((left, right) => {
      const leftPriority = left.coordinate.compositionCoverage === 'full' ? 0 : 1;
      const rightPriority = right.coordinate.compositionCoverage === 'full' ? 0 : 1;
      return leftPriority - rightPriority || left.index - right.index;
    });
  let cursor = 0;

  async function consume() {
    while (cursor < schedule.length) {
      const scheduled = schedule[cursor];
      cursor += 1;
      const { coordinate, index } = scheduled;
      console.error(`[MONAS boundary] auditing ${coordinate.id} at ${coordinate.baseSpeed}/${coordinate.nominalGap}`);
      const result = await auditInWorker(coordinate);
      results[index] = result;
      saveCheckpoint(coordinate, result);
      console.error(`[MONAS boundary] ${coordinate.id}: ${result.expectationMet ? 'expectation met' : 'FAILED'} (${result.concerns} concerns)`);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}

async function main() {
  const report = createReport();
  try {
    report.coordinates = await auditCoordinates();
    report.expectationFailures = report.coordinates.filter(result => !result.expectationMet).length;
  } catch (error) {
    report.error = error?.stack || String(error);
    report.expectationFailures += 1;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    error: report.error,
    expectationFailures: report.expectationFailures,
    coordinates: report.coordinates.map(result => ({
      ...result.coordinate,
      fullyVerifiedAt8px: result.fullyVerifiedAt8px,
      expectationMet: result.expectationMet,
      ordinaryPatterns: result.ordinaryPatterns.summary,
      surgePatterns: result.surgePatterns.summary,
      composition: result.composition.summary,
      auditedVariantPairs: result.composition.auditedVariantPairs,
      allLegalVariantPairs: result.composition.allLegalVariantPairs,
      compositionCases: result.composition.totalCases
    }))
  }, null, 2));

  if (report.expectationFailures > 0) process.exitCode = 1;
}

if (isMainThread) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
} else {
  try {
    parentPort.postMessage({ result: auditCoordinate(workerData.coordinate) });
  } catch (error) {
    parentPort.postMessage({ error: error?.stack || String(error) });
  }
}
