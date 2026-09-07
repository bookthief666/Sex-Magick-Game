'use strict';

const assert = require('node:assert/strict');
const board = require('./leaderboard-runtime.js');

function run(overrides = {}) {
  const startedAt = overrides.startedAt ?? '2026-08-13T10:00:00.000Z';
  const endedAt = overrides.endedAt ?? '2026-08-13T10:05:00.000Z';
  return {
    version: 2,
    runId: 'gate_test',
    rite: 'HEX',
    startedAt,
    endedAt,
    endReason: 'crash',
    gatesCleared: 20,
    bandIndex: 1,
    gnosis: 4,
    gnosisCapacity: 10,
    gateOffers: 3,
    gateEntries: 2,
    gateBanks: 1,
    voidAttempts: 2,
    voidSurvivals: 1,
    voidDeaths: 1,
    finalScore: 140,
    ...overrides
  };
}

// --- validateRun --------------------------------------------------------------

{
  const verdict = board.validateRun(run());
  assert.equal(verdict.valid, true, `a well-formed run should validate: ${verdict.reasons.join(', ')}`);
}

{
  // The band must follow from the gates, so editing one without the other shows.
  const verdict = board.validateRun(run({ bandIndex: 7 }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /band 7 does not match 20 gates/);
}

{
  // A raised gate total alone is caught by the band it no longer matches, and by
  // the pace it implies.
  const verdict = board.validateRun(run({ gatesCleared: 9999 }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /faster than the spawn rate allows/);
}

{
  const verdict = board.validateRun(run({ gateEntries: 5, gateBanks: 5, gateOffers: 3 }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /more Gate decisions than Gate offers/);
}

{
  const verdict = board.validateRun(run({ voidAttempts: 1, voidSurvivals: 3, voidDeaths: 0 }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /more Void outcomes than Void attempts/);
}

{
  const verdict = board.validateRun(run({ voidAttempts: 9, gateEntries: 2 }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /more Void attempts than Gate entries/);
}

{
  const verdict = board.validateRun(run({ endedAt: '2026-08-13T09:00:00.000Z' }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /ended before it started/);
}

{
  const verdict = board.validateRun(run({ gnosis: 99 }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /gnosis outside its capacity/);
}

{
  const verdict = board.validateRun(run({ rite: 'MONAS' }));
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /not a Rite of Hexagram run/);
}

{
  assert.equal(board.validateRun(null).valid, false);
  assert.equal(board.validateRun('nonsense').valid, false);
}

{
  // A zero-gate run is legitimate: the player died before clearing anything, and
  // the pace rule must not divide by it.
  const verdict = board.validateRun(run({ gatesCleared: 0, bandIndex: 0 }));
  assert.equal(verdict.valid, true, verdict.reasons.join(', '));
}

// --- band thresholds ----------------------------------------------------------

{
  const thresholds = board.FALLBACK_THRESHOLDS;
  assert.equal(board.bandIndexFor(0, thresholds), 0);
  assert.equal(board.bandIndexFor(8, thresholds), 0);
  assert.equal(board.bandIndexFor(9, thresholds), 1);
  assert.equal(board.bandIndexFor(151, thresholds), 6);
  assert.equal(board.bandIndexFor(152, thresholds), 7);
  assert.equal(board.bandIndexFor(400, thresholds), 7);
}

// --- rankRuns -----------------------------------------------------------------

{
  const history = [
    run({ runId: 'a', gatesCleared: 20, bandIndex: 1, finalScore: 100 }),
    run({ runId: 'b', gatesCleared: 50, bandIndex: 3, finalScore: 300, endedAt: '2026-08-13T10:20:00.000Z' }),
    run({ runId: 'c', gatesCleared: 6, bandIndex: 0, finalScore: 40 })
  ];
  const result = board.rankRuns(history);
  assert.deepEqual(result.entries.map(entry => entry.runId), ['b', 'a', 'c']);
  assert.deepEqual(result.entries.map(entry => entry.rank), [1, 2, 3]);
  assert.equal(result.verifiedRuns, 3);
  assert.equal(result.totalRuns, 3);
  assert.equal(result.entries[0].bandName, 'GEBURAH');
}

{
  // Equal gates and band: the higher score leads, then the earlier run.
  const history = [
    run({ runId: 'late', finalScore: 10, endedAt: '2026-08-13T10:30:00.000Z' }),
    run({ runId: 'high', finalScore: 900, endedAt: '2026-08-13T10:40:00.000Z' }),
    run({ runId: 'early', finalScore: 10, endedAt: '2026-08-13T10:10:00.000Z' })
  ];
  const result = board.rankRuns(history);
  assert.deepEqual(result.entries.map(entry => entry.runId), ['high', 'early', 'late']);
}

{
  // An inconsistent run is excluded from the board, not silently ranked, and the
  // reason it was excluded survives for anyone who looks.
  const history = [run({ runId: 'clean' }), run({ runId: 'edited', gatesCleared: 5000 })];
  const result = board.rankRuns(history);
  assert.deepEqual(result.entries.map(entry => entry.runId), ['clean']);
  assert.equal(result.verifiedRuns, 1);
  assert.equal(result.totalRuns, 2);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].runId, 'edited');
  assert.ok(result.rejected[0].reasons.length > 0);
}

{
  const result = board.rankRuns([], {});
  assert.deepEqual(result.entries, []);
  assert.equal(result.totalRuns, 0);
  assert.equal(result.verifiedRuns, 0);
}

{
  assert.deepEqual(board.rankRuns(null).entries, []);
  assert.deepEqual(board.rankRuns('nope').entries, []);
}

{
  // The board is capped, and the cap is the top of the ranking, not the first five
  // encountered.
  const history = Array.from({ length: 12 }, (_, index) => run({
    runId: `r${index}`,
    gatesCleared: index,
    bandIndex: board.bandIndexFor(index, board.FALLBACK_THRESHOLDS)
  }));
  const result = board.rankRuns(history);
  assert.equal(result.entries.length, board.BOARD_SIZE);
  assert.deepEqual(result.entries.map(entry => entry.gatesCleared), [11, 10, 9, 8, 7]);
  assert.equal(result.verifiedRuns, 12);
}

// --- the module makes no network calls ---------------------------------------

{
  const source = require('node:fs').readFileSync(require.resolve('./leaderboard-runtime.js'), 'utf8');
  for (const pattern of [/fetch\s*\(/, /XMLHttpRequest/, /navigator\s*\.\s*sendBeacon/, /new\s+WebSocket/, /lootlocker/i]) {
    assert.doesNotMatch(source, pattern, `the Rite board must perform no network I/O (${pattern})`);
  }
}

console.log('leaderboard-runtime: all assertions passed');
