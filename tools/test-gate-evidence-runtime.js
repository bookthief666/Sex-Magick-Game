'use strict';

const assert = require('node:assert/strict');
const evidence = require('./gate-evidence-runtime.js');

const records = [];
for (let index = 0; index < 25; index += 1) {
  records.push({
    runId: `run-${index}`,
    endedAt: `2026-08-04T00:${String(index).padStart(2, '0')}:00.000Z`,
    gatesCleared: index + 1,
    gateOffers: index % 3 === 0 ? 1 : 0,
    gateEntries: index % 6 === 0 ? 1 : 0,
    gateBanks: index % 6 === 3 ? 1 : 0,
    voidAttempts: index % 6 === 0 ? 1 : 0,
    voidSurvivals: index % 12 === 0 ? 1 : 0,
    voidDeaths: index % 12 === 6 ? 1 : 0,
    unsafeCrossings: index === 4 ? 1 : 0
  });
}
records.push({ ...records[4], gatesCleared: 99 });

const unique = evidence.uniqueRunRecords(records);
assert.equal(unique.length, 25, 'session evidence must not truncate to the local 20-run history limit');
assert.equal(unique.find(run => run.runId === 'run-4').gatesCleared, 99, 'later snapshot must replace duplicate run ID');

const aggregate = evidence.aggregateRuns(records);
assert.equal(aggregate.runsObserved, 25);
assert.equal(aggregate.completedRuns, 25);
assert.equal(aggregate.unsafeCrossings, 1);
assert.ok(aggregate.gatesCleared > 25);
assert.ok(aggregate.gateOffers > 0);
assert.ok(aggregate.gateEntryRate >= 0 && aggregate.gateEntryRate <= 1);
assert.ok(aggregate.gateBankRate >= 0 && aggregate.gateBankRate <= 1);
assert.ok(aggregate.voidSurvivalRate >= 0 && aggregate.voidSurvivalRate <= 1);

const decision = evidence.createDecisionRecord(
  { serial: 7, offeredAtFrame: 100, x: 500, y: 300 },
  { frames: 100, player: { x: 80, y: 420 } }
);
assert.equal(decision.startVerticalError, 120);

evidence.updateDecisionRecord(
  decision,
  { serial: 7, offeredAtFrame: 100, x: 300, y: 300 },
  { frames: 130, player: { x: 80, y: 330 } }
);
assert.equal(decision.framesVisible, 30);
assert.equal(decision.minimumVerticalError, 30);
assert.equal(decision.movementTowardPx, 90);
assert.equal(decision.movedTowardGate, true);

const finalized = evidence.finalizeDecision(decision, 'entry', { frames: 145 });
assert.equal(finalized.resolution, 'entry');
assert.equal(finalized.resolvedAtFrame, 145);
assert.equal(finalized.framesVisible, 45);

console.log('gate-evidence-runtime: all session contracts passed');
