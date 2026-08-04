'use strict';

const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  STORAGE_KEY,
  STEP_MS,
  createMemoryStorage,
  safeReadRuns,
  createRunId,
  inferScoreSource,
  isFastRetryKey,
  sanitizeTiming,
  RunTelemetryStore
} = require('./run-telemetry.js');

function testMalformedStorageFallback() {
  const storage = createMemoryStorage({ [STORAGE_KEY]: '{not-json' });
  assert.deepEqual(safeReadRuns(storage), []);
}

function testRunIdAndScoreSources() {
  const id = createRunId({
    epochMs: 1_700_000_000_000,
    cryptoObject: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' }
  });
  assert.equal(id, 'run_loyw3v28_1234567812341234');
  assert.equal(inferScoreSource(1), 'gate');
  assert.equal(inferScoreSource(5), 'orb');
  assert.equal(inferScoreSource(10), 'void-pentagram');
  assert.equal(inferScoreSource(6), 'mixed-or-unknown');
}

function testFastRetryKeys() {
  assert.equal(isFastRetryKey({ code: 'KeyR', repeat: false }), true);
  assert.equal(isFastRetryKey({ code: 'Space', repeat: false }), true);
  assert.equal(isFastRetryKey({ code: 'Enter', repeat: false }), true);
  assert.equal(isFastRetryKey({ code: 'KeyR', repeat: true }), false);
  assert.equal(isFastRetryKey({ code: 'Escape', repeat: false }), false);
}

function testTimingSanitization() {
  assert.deepEqual(
    sanitizeTiming({
      mode: 'fixed-step-runtime',
      stepMs: STEP_MS,
      maxStepsPerFrame: 5,
      suspensionResetMs: 250,
      simulationFrames: 120,
      score: 9,
      pendingRaf: true,
      clock: {
        totalSteps: 120,
        droppedMs: 16.5,
        suspensionResets: 1,
        accumulatorMs: 2.25,
        ignoredSecret: 'not retained'
      },
      playerId: 'must-not-survive'
    }),
    {
      mode: 'fixed-step-runtime',
      stepMs: STEP_MS,
      maxStepsPerFrame: 5,
      suspensionResetMs: 250,
      simulationFrames: 120,
      score: 9,
      pendingRaf: true,
      clock: {
        totalSteps: 120,
        droppedMs: 16.5,
        suspensionResets: 1,
        accumulatorMs: 2.25
      }
    }
  );
}

function testLifecycleAndPersistence() {
  let epochMs = 1_700_000_000_000;
  let monotonicMs = 1000;
  let idCounter = 0;
  const storage = createMemoryStorage();
  const store = new RunTelemetryStore({
    storage,
    maxRuns: 2,
    maxEvents: 20,
    nowEpochMs: () => epochMs,
    nowMonotonicMs: () => monotonicMs,
    idFactory: () => `run-test-${++idCounter}`
  });
  const game = {
    frames: 0,
    score: 0,
    highScore: 12,
    currentLevelIdx: 0
  };

  const first = store.begin({ rite: 'HEX', startReason: 'menu', game });
  assert.equal(first.runId, 'run-test-1');
  assert.equal(first.rite, 'HEX');
  assert.equal(first.lifecycleEvents[0].type, 'start');

  monotonicMs += 100;
  game.frames = 6;
  game.score = 1;
  store.recordScore(1, game);

  monotonicMs += 50;
  store.pause(game);
  monotonicMs += 500;
  store.resume(game);

  monotonicMs += 100;
  game.frames = 12;
  game.score = 6;
  game.currentLevelIdx = 1;
  store.recordScore(5, game);
  store.currentRun.voidEntries += 1;
  store.recordLifecycle('void-enter', game);

  monotonicMs += 250;
  epochMs += 1000;
  const completed = store.end({
    reason: 'death',
    game,
    timing: {
      mode: 'fixed-step-runtime',
      stepMs: STEP_MS,
      maxStepsPerFrame: 5,
      suspensionResetMs: 250,
      simulationFrames: game.frames,
      score: game.score,
      pendingRaf: false,
      clock: { totalSteps: 12, droppedMs: 0, suspensionResets: 0, accumulatorMs: 0 }
    }
  });

  assert.equal(completed.schemaVersion, SCHEMA_VERSION);
  assert.equal(completed.endReason, 'death');
  assert.equal(completed.finalScore, 6);
  assert.equal(completed.highScoreAtEnd, 12);
  assert.equal(completed.wallDurationMs, 1000);
  assert.equal(completed.activeDurationMs, 500);
  assert.equal(completed.simulationFrames, 12);
  assert.equal(completed.simulationDurationMs, Math.round(12 * STEP_MS));
  assert.equal(completed.levelIndex, 1);
  assert.equal(completed.voidEntries, 1);
  assert.deepEqual(completed.scoreEvents.map(event => [event.delta, event.source]), [
    [1, 'gate'],
    [5, 'orb']
  ]);
  assert.equal(completed.lifecycleEvents.at(-1).type, 'end');
  assert.equal(completed.timing.clock.totalSteps, 12);
  assert.equal(store.currentRun, null);
  assert.equal(store.recentRuns.length, 1);

  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].runId, 'run-test-1');
  const serialized = JSON.stringify(persisted);
  for (const forbidden of ['player_identifier', 'session_token', 'userAgent', 'ipAddress', 'deviceId']) {
    assert.equal(serialized.includes(forbidden), false, `telemetry must not persist ${forbidden}`);
  }

  monotonicMs += 10;
  epochMs += 10;
  store.begin({ rite: 'MONAS', startReason: 'retry', game: { ...game, frames: 0, score: 0 } });
  store.end({ reason: 'menu', game: { ...game, frames: 2, score: 0 } });
  monotonicMs += 10;
  epochMs += 10;
  store.begin({ rite: 'HEX', startReason: 'retry', game: { ...game, frames: 0, score: 0 } });
  store.end({ reason: 'menu', game: { ...game, frames: 3, score: 0 } });

  assert.equal(store.recentRuns.length, 2, 'retention must prune older runs');
  assert.deepEqual(store.recentRuns.map(run => run.runId), ['run-test-3', 'run-test-2']);

  store.clearHistory();
  assert.deepEqual(store.recentRuns, []);
  assert.equal(storage.getItem(STORAGE_KEY), null);
}

testMalformedStorageFallback();
testRunIdAndScoreSources();
testFastRetryKeys();
testTimingSanitization();
testLifecycleAndPersistence();

console.log('run-telemetry: all deterministic contracts passed');
