'use strict';

/**
 * Contracts for the shared edge economy.
 *
 * These are the rules both rites now run on, so the thing worth pinning is the
 * *shape* of the incentive - that edging pays, that the middle costs you, and
 * that a band with its risk zones closed does neither - rather than the exact
 * numbers, which are tuning.
 */

const assert = require('node:assert/strict');
const edge = require('./gnosis-edge.js');

function section(name, fn) {
  fn();
  console.log(`  ok  ${name}`);
}

const BANK = { gnosis: 0, gnosisCapacity: 10, riskStreak: 0, timidGates: 0 };
const risk = zone => ({ zone, minimumClearance: 30 });
const centre = { zone: 'center', minimumClearance: 60 };

console.log('gnosis-edge contracts');

section('edging pays and the middle does not', () => {
  const edged = edge.applyEdgeClear(BANK, { classification: risk('risk-top'), family: 'pressure' });
  assert.ok(edged.gnosisGained > 0, 'a risk-zone clear must bank Gnosis');
  assert.equal(edged.edge.riskStreak, 1);

  const timid = edge.applyEdgeClear(BANK, { classification: centre, family: 'pressure' });
  assert.equal(timid.gnosisGained, 0, 'a centred clear banks nothing');
  assert.equal(timid.edge.riskStreak, 0);
});

section('both edges count, not just the top', () => {
  const top = edge.applyEdgeClear(BANK, { classification: risk('risk-top'), family: 'safe' });
  const bottom = edge.applyEdgeClear(BANK, { classification: risk('risk-bottom'), family: 'safe' });
  assert.equal(top.gnosisGained, bottom.gnosisGained);
  assert.equal(bottom.isRisk, true);
});

section('a harder wall is worth more to edge', () => {
  const weights = ['safe', 'recovery', 'pressure', 'climax']
    .map(family => edge.applyEdgeClear(BANK, { classification: risk('risk-top'), family }).gnosisGained);
  const [safe, recovery, pressure, climax] = weights;
  assert.equal(safe, recovery, 'safe and recovery are the same easy tier');
  assert.ok(pressure > safe, 'pressure must beat safe');
  assert.ok(climax > pressure, 'climax must beat pressure');
});

section('a band with risk closed neither pays nor punishes', () => {
  const paid = edge.applyEdgeClear(BANK, { classification: risk('risk-top'), family: 'climax', riskActive: false });
  assert.equal(paid.gnosisGained, 0, 'no Gnosis before the risk zones open');
  let bank = { ...BANK, gnosis: 4 };
  for (let clear = 0; clear < 9; clear += 1) {
    bank = edge.applyEdgeClear(bank, { classification: centre, family: 'safe', riskActive: false }).edge;
  }
  assert.equal(bank.gnosis, 4, 'and no decay either - the early game is teachable');
});

section('three timid clears cost a point, then the count resets', () => {
  let bank = { ...BANK, gnosis: 5 };
  let decayed = 0;
  for (let clear = 0; clear < 3; clear += 1) {
    const applied = edge.applyEdgeClear(bank, { classification: centre, family: 'safe' });
    bank = applied.edge;
    decayed += applied.gnosisDecayed;
  }
  assert.equal(decayed, 1, 'exactly one point lost across three timid clears');
  assert.equal(bank.gnosis, 4);
  assert.equal(bank.timidGates, 0, 'the counter resets so decay is periodic, not a cliff');
});

section('the bank cannot exceed capacity or go negative', () => {
  let bank = { ...BANK, gnosis: 9.5 };
  for (let clear = 0; clear < 8; clear += 1) {
    bank = edge.applyEdgeClear(bank, { classification: risk('risk-top'), family: 'climax' }).edge;
  }
  assert.equal(bank.gnosis, 10, 'capped at capacity');

  let empty = { ...BANK, gnosis: 0 };
  for (let clear = 0; clear < 12; clear += 1) {
    empty = edge.applyEdgeClear(empty, { classification: centre, family: 'safe' }).edge;
  }
  assert.equal(empty.gnosis, 0, 'and never below zero');
});

section('the streak bonus steps at 3 and 7 and a miss resets it', () => {
  let bank = { ...BANK };
  const bonuses = [];
  for (let clear = 0; clear < 8; clear += 1) {
    const applied = edge.applyEdgeClear(bank, { classification: risk('risk-top'), family: 'safe' });
    bank = applied.edge;
    bonuses.push(applied.precisionBonus);
  }
  assert.deepEqual(bonuses, [0, 0, 1, 1, 1, 1, 2, 2]);
  const broken = edge.applyEdgeClear(bank, { classification: centre, family: 'safe' });
  assert.equal(broken.edge.riskStreak, 0, 'one centred clear ends the streak');
});

section('a near miss pays only inside its threshold', () => {
  const wide = edge.applyEdgeClear(BANK, { classification: { zone: 'center', minimumClearance: 30 }, nearMissThreshold: 10 });
  assert.equal(wide.nearMiss, false);
  const graze = edge.applyEdgeClear(BANK, { classification: { zone: 'center', minimumClearance: 4 }, nearMissThreshold: 10 });
  assert.equal(graze.nearMiss, true);
  assert.ok(graze.bonusScore > wide.bonusScore);
});

section('the caller cannot be handed a mutated bank', () => {
  const original = { ...BANK, gnosis: 3 };
  const snapshot = JSON.stringify(original);
  edge.applyEdgeClear(original, { classification: risk('risk-top'), family: 'climax' });
  assert.equal(JSON.stringify(original), snapshot, 'the input bank must be left alone');
});

section('garbage in does not produce garbage out', () => {
  for (const bad of [null, undefined, {}, { gnosis: NaN, gnosisCapacity: NaN }, { gnosis: -5, gnosisCapacity: 10 }]) {
    const applied = edge.applyEdgeClear(bad, { classification: risk('risk-top'), family: 'climax' });
    assert.ok(Number.isFinite(applied.edge.gnosis) && applied.edge.gnosis >= 0,
      `gnosis must stay a real non-negative number for ${JSON.stringify(bad)}`);
    assert.ok(Number.isFinite(applied.bonusScore));
  }
});

console.log('gnosis-edge v1: all deterministic contracts passed');
