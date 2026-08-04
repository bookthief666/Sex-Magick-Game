'use strict';

const assert = require('node:assert/strict');
const gate = require('./gate-slice-runtime.js');

assert.equal(gate.queryEnabled({ search: '?gateSlice=1' }), true);
assert.equal(gate.queryEnabled({ search: '?gateSlice=0' }), false);
assert.equal(gate.getBandIndex(0), 0);
assert.equal(gate.getBandIndex(6), 1);
assert.equal(gate.getBandIndex(16), 2);
assert.equal(gate.getBandIndex(32), 3);

const topRisk = gate.classifyGateClear({ playerY: 130, gapTop: 100, gapSize: 180, playerHalf: 12 });
assert.equal(topRisk.zone, 'risk-top');
const center = gate.classifyGateClear({ playerY: 190, gapTop: 100, gapSize: 180, playerHalf: 12 });
assert.equal(center.zone, 'center');
const bottomRisk = gate.classifyGateClear({ playerY: 250, gapTop: 100, gapSize: 180, playerHalf: 12 });
assert.equal(bottomRisk.zone, 'risk-bottom');
const unsafe = gate.classifyGateClear({ playerY: 104, gapTop: 100, gapSize: 180, playerHalf: 12 });
assert.equal(unsafe.zone, 'unsafe');

let state = gate.createSliceState({ runId: 'test' });
let result = gate.applyGateClearState(state, {
  classification: { zone: 'risk-top', minimumClearance: 4 },
  family: 'pressure',
  riskActive: true
});
state = result.state;
assert.equal(state.gatesCleared, 1);
assert.equal(state.gnosis, 1);
assert.equal(state.riskStreak, 1);
assert.equal(result.result.bonusScore, 3, 'risk + near miss should add 3');

for (let index = 0; index < 9; index += 1) {
  result = gate.applyGateClearState(state, {
    classification: { zone: 'risk-bottom', minimumClearance: 10 },
    family: 'pressure',
    riskActive: true
  });
  state = result.state;
}
assert.equal(state.gnosis, 10);
assert.equal(state.gateReady, true);
assert.equal(state.riskStreak, 10);
assert.equal(gate.streakBonus(state.riskStreak), 2);

const offered = gate.offerGateState(state, { frame: 100, y: 300 });
state = offered.state;
assert.equal(state.gateOffers, 1);
assert.equal(state.gateReady, false);

const entered = gate.enterGateState(state);
state = entered.state;
assert.equal(entered.result.wager, 10);
assert.equal(state.gnosis, 0);
assert.equal(state.gateEntries, 1);
assert.equal(state.voidAttempts, 1);
assert.equal(gate.gateEntryRate(state), 1);

const survived = gate.completeVoidState(state, gate.VOID_DURATION_STEPS);
state = survived.state;
assert.equal(survived.result.reward, 100);
assert.equal(state.voidSurvivals, 1);
assert.equal(state.currentWager, 0);

let bankState = gate.createSliceState({ runId: 'bank' });
bankState.gnosis = 7.5;
bankState.gateOffers = 1;
const banked = gate.bankGateState(bankState);
assert.equal(banked.result.reward, 23);
assert.equal(banked.state.gnosis, 0);
assert.equal(banked.state.gateBanks, 1);
assert.equal(gate.gateEntryRate(banked.state), 0);

let timid = gate.createSliceState({ runId: 'timid' });
timid.gnosis = 2;
for (let index = 0; index < 3; index += 1) {
  timid = gate.applyGateClearState(timid, {
    classification: { zone: 'center', minimumClearance: 20 },
    family: 'safe',
    riskActive: true
  }).state;
}
assert.equal(timid.gnosis, 1, 'three timid clears must decay one Gnosis');
assert.equal(timid.timidGates, 0);

let failed = gate.createSliceState({ runId: 'failed' });
failed.currentWager = 6;
failed.voidAttempts = 1;
failed = gate.failVoidState(failed, 120).state;
assert.equal(failed.voidDeaths, 1);
assert.equal(failed.currentWager, 0);

console.log('gate-slice: all deterministic contracts passed');
