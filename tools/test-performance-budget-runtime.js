'use strict';

const assert = require('node:assert/strict');
const perf = require('./performance-budget-runtime.js');

function nearlyEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

(function testPercentilesAndSummaries() {
  assert.equal(perf.percentile([], 0.5), null);
  assert.equal(perf.percentile([4], 0.5), 4);
  nearlyEqual(perf.percentile([1, 2, 3, 4], 0.5), 2.5);
  nearlyEqual(perf.percentile([1, 2, 3, 4], 0.95), 3.85);

  const summary = perf.summarizeSamples([4, 1, 3, 2]);
  assert.deepEqual(summary, {
    count: 4,
    min: 1,
    p50: 2.5,
    p95: 3.85,
    p99: 3.97,
    max: 4,
    mean: 2.5
  });
})();

(function testBoundedRingBuffer() {
  const buffer = perf.createRingBuffer(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  assert.deepEqual(buffer.values(), [1, 2, 3]);
  buffer.push(4);
  assert.deepEqual(buffer.values(), [2, 3, 4]);
  assert.equal(buffer.size, 3);
  assert.equal(buffer.capacity, 3);
  buffer.clear();
  assert.deepEqual(buffer.values(), []);
})();

(function testOptionDefaultsAndExplicitValues() {
  const defaults = perf.parsePerformanceOptions({ search: '' });
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.panel, false);
  nearlyEqual(defaults.targetFrameMs, 1000 / 60);
  assert.equal(defaults.longFrameMs, 25);
  assert.equal(defaults.criticalFrameMs, 50);
  assert.equal(defaults.warmupFrames, 120);
  assert.equal(defaults.sampleLimit, 3600);

  const explicit = perf.parsePerformanceOptions({
    search: '?perfProbe=1&perfPanel=true&perfTargetFrameMs=8.33&perfLongFrameMs=20&perfCriticalFrameMs=40&perfWarmupFrames=0&perfSampleFrames=240&perfMaxSegments=4'
  });
  assert.equal(explicit.enabled, true);
  assert.equal(explicit.panel, true);
  assert.equal(explicit.targetFrameMs, 8.33);
  assert.equal(explicit.longFrameMs, 20);
  assert.equal(explicit.criticalFrameMs, 40);
  assert.equal(explicit.warmupFrames, 0);
  assert.equal(explicit.sampleLimit, 240);
  assert.equal(explicit.maxSegments, 4);
})();

(function testContextNormalizationAndKeying() {
  const context = perf.normalizeContext({
    profile: 'fold-closed',
    logicalWidth: 368.2,
    logicalHeight: 868.7,
    effectiveDpr: 2.6252,
    backingWidth: 966,
    backingHeight: 2281,
    backingPixels: 2203446,
    assetMode: 'offline'
  });
  assert.equal(context.logicalWidth, 368);
  assert.equal(context.logicalHeight, 869);
  assert.equal(context.effectiveDpr, 2.625);
  assert.match(perf.contextKey(context), /fold-closed\|368x869\|dpr:2.625/);
})();

(function testCollectorAccountingAndClassification() {
  const collector = perf.createCollector({
    targetFrameMs: 1000 / 60,
    longFrameMs: 25,
    criticalFrameMs: 50,
    warmupFrames: 0,
    sampleLimit: 10,
    maxSegments: 3
  });
  const context = {
    profile: 'fold-closed',
    logicalWidth: 368,
    logicalHeight: 869,
    effectiveDpr: 2.625,
    backingWidth: 966,
    backingHeight: 2281,
    backingPixels: 2203446,
    renderMode: 'logical-css-pixels-with-bounded-dpr-backing',
    assetMode: 'offline'
  };

  collector.start(5);
  collector.setNavigationSnapshot({ domContentLoadedMs: 100, loadEventMs: 150 });
  collector.setAssetSnapshot({ durationMs: 60, assetMode: 'offline' });
  collector.recordFrameTimestamp(0, context, { frames: 0, score: 0 });
  const intervals = [16, 17, 16, 26, 16, 51, 16, 17, 16, 16];
  let timestamp = 0;
  collector.recordClock({ droppedMs: 0, suspensionResets: 0 });
  for (let index = 0; index < intervals.length; index += 1) {
    timestamp += intervals[index];
    collector.recordFrameTimestamp(timestamp, context, { frames: index + 1, score: index });
    collector.recordDrawDuration(4 + index * 0.1);
    collector.recordCallbackDuration(6 + index * 0.1);
    collector.recordClock({ droppedMs: index >= 7 ? 16.667 : 0, suspensionResets: index >= 8 ? 1 : 0 });
  }
  collector.recordLongTask(75, 120);

  const snapshot = collector.getSnapshot(timestamp);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.segments.length, 1);
  assert.equal(snapshot.startup.navigation.loadEventMs, 150);
  assert.equal(snapshot.startup.assets.durationMs, 60);
  const segment = snapshot.segments[0];
  assert.equal(segment.frameIntervals.count, 10);
  assert.equal(segment.longFrames, 2);
  assert.equal(segment.criticalFrames, 1);
  assert.equal(segment.longTasks.count, 1);
  assert.equal(segment.longTasks.totalDurationMs, 75);
  assert.equal(segment.droppedSimulationMs, 16.667);
  assert.equal(segment.suspensionResets, 1);
  assert.equal(segment.classification, 'over-observed-budget');
  assert.equal(snapshot.aggregate.sampledFrames, 10);
})();

(function testWarmupSuspensionAndSegmentBounds() {
  const collector = perf.createCollector({
    warmupFrames: 2,
    sampleLimit: 5,
    maxSegments: 2,
    targetFrameMs: 16.667,
    longFrameMs: 25,
    criticalFrameMs: 50
  });
  collector.start(0);

  const context = profile => ({
    profile,
    logicalWidth: 100,
    logicalHeight: 200,
    effectiveDpr: 1,
    backingWidth: 100,
    backingHeight: 200,
    backingPixels: 20000,
    assetMode: 'offline'
  });

  collector.recordFrameTimestamp(0, context('a'));
  collector.recordFrameTimestamp(16, context('a'));
  collector.recordFrameTimestamp(32, context('a'));
  collector.recordFrameTimestamp(48, context('a'));
  collector.recordFrameTimestamp(400, context('a'));
  let snapshot = collector.getSnapshot(400);
  assert.equal(snapshot.segments[0].frameIntervals.count, 1);
  assert.equal(snapshot.segments[0].suspensionGaps, 1);

  collector.recordFrameTimestamp(416, context('b'));
  collector.recordFrameTimestamp(432, context('b'));
  collector.recordFrameTimestamp(448, context('c'));
  snapshot = collector.getSnapshot(448);
  assert.equal(snapshot.segments.length, 2);
  assert.deepEqual(snapshot.segments.map(segment => segment.context.profile), ['b', 'c']);
})();

(function testBudgetClasses() {
  const options = {
    sampleLimit: 120,
    longFrameMs: 25,
    criticalFrameMs: 50,
    targetFrameMs: 16.667
  };
  const base = {
    frameIntervals: { count: 120, p95: 16.8 },
    drawDurations: { p95: 4 },
    longFrames: 0,
    criticalFrames: 0,
    droppedSimulationMs: 0,
    longTasks: { count: 0, totalDurationMs: 0 }
  };
  assert.equal(perf.classifyBudget(base, options), 'within-observed-budget');
  assert.equal(perf.classifyBudget({ ...base, longFrames: 10 }, options), 'watch');
  assert.equal(perf.classifyBudget({ ...base, droppedSimulationMs: 16.667 }, options), 'over-observed-budget');
  assert.equal(perf.classifyBudget({ ...base, frameIntervals: { count: 20, p95: 16 } }, options), 'insufficient-samples');
})();

console.log('performance-budget-runtime: all deterministic contracts passed');
