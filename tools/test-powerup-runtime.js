'use strict';

const assert = require('node:assert/strict');
const powerups = require('./powerup-runtime.js');
const gate = require('./gate-slice-runtime.js');

const { POWERUPS, GATES_PER_CHARGE } = powerups;

function stateAtBand(bandIndex) {
  const state = powerups.createState();
  powerups.recordBand(state, bandIndex);
  return state;
}

// --- the ladder ----------------------------------------------------------
assert.deepEqual(powerups.validateLadder(), []);

// A shrinking cap or a non-positive cap must be rejected rather than shipped.
assert.ok(powerups.validateLadder([
  { id: 'x', label: 'X', detail: 'x', glyph: 'x', unlockBand: 0, capAt: b => (b >= 3 ? 1 : 2) }
]).some(error => error.includes('shrinks')));
assert.ok(powerups.validateLadder([
  { id: 'x', label: 'X', detail: 'x', glyph: 'x', unlockBand: 0, capAt: () => 0 }
]).some(error => error.includes('positive integer')));

// Unlock bands must exist in the band table the Gate slice actually ships.
for (const powerup of POWERUPS) {
  assert.ok(
    powerup.unlockBand < gate.BANDS.length,
    `${powerup.id} unlocks at band ${powerup.unlockBand}, beyond the ${gate.BANDS.length} bands that exist`
  );
}

// DISSOLUTION must stay gated behind the Gate, the Void and the risk bands, so a
// first-time player is not handed a wall-skip before meeting the curve.
{
  const dissolution = powerups.getPowerup('dissolution');
  assert.ok(dissolution.unlockBand >= 3, 'DISSOLUTION must not unlock before GEBURAH');
  assert.equal(gate.BANDS[dissolution.unlockBand].name, 'GEBURAH');
  assert.equal(gate.BANDS[powerups.getPowerup('aegis').unlockBand].name, 'YESOD');
}

// Nothing is available in MALKUTH.
{
  const fresh = powerups.createState();
  for (const powerup of POWERUPS) {
    assert.equal(powerups.isUnlocked(fresh, powerup.id), false, `${powerup.id} leaked into MALKUTH`);
    assert.equal(powerups.capacityFor(fresh, powerup.id), 0);
    assert.equal(powerups.chargesOf(fresh, powerup.id), 0);
  }
  // A locked power-up can never hold a charge, however hard you push.
  assert.equal(powerups.awardCharge(fresh), null, 'nothing unlocked means nothing awarded');
  fresh.charges.aegis = 99;
  assert.equal(powerups.chargesOf(fresh, 'aegis'), 0, 'a locked power-up reports zero regardless of stored value');
}

// --- unlock is monotonic -------------------------------------------------
{
  const state = powerups.createState();
  assert.deepEqual(powerups.recordBand(state, 1), ['aegis'], 'YESOD unseals AEGIS');
  assert.deepEqual(powerups.recordBand(state, 3), ['dissolution'], 'GEBURAH unseals DISSOLUTION');
  assert.deepEqual(powerups.recordBand(state, 3), [], 're-reaching a band unseals nothing new');

  // A bad run cannot revoke what the player already earned.
  assert.deepEqual(powerups.recordBand(state, 0), []);
  assert.equal(state.highestBand, 3, 'a run that ends in MALKUTH must not undo the ascent');
  assert.equal(powerups.isUnlocked(state, 'dissolution'), true);

  // Out-of-range input is clamped, not trusted.
  powerups.recordBand(state, 9999);
  assert.equal(state.highestBand, 7);
  powerups.recordBand(state, NaN);
  assert.equal(state.highestBand, 7);
}

// --- charges never exceed the cap, never go negative ---------------------
{
  for (const band of [1, 3, 6, 7]) {
    const state = stateAtBand(band);
    for (let attempt = 0; attempt < 50; attempt += 1) powerups.awardCharge(state);
    for (const powerup of POWERUPS) {
      const held = powerups.chargesOf(state, powerup.id);
      const cap = powerups.capacityFor(state, powerup.id);
      assert.ok(held <= cap, `${powerup.id} exceeded its cap at band ${band}: ${held} > ${cap}`);
      assert.ok(held >= 0);
      assert.ok(Number.isInteger(held));
    }
    // Everything full means further awards are a no-op, not an error.
    assert.equal(powerups.awardCharge(state), null, `band ${band} kept awarding past capacity`);
  }
}

// Spending is bounded below.
{
  const state = stateAtBand(1);
  assert.equal(powerups.spendCharge(state, 'aegis'), false, 'cannot spend what you do not have');
  powerups.awardCharge(state);
  assert.equal(powerups.spendCharge(state, 'aegis'), true);
  assert.equal(powerups.chargesOf(state, 'aegis'), 0);
  assert.equal(powerups.spendCharge(state, 'aegis'), false);
  assert.equal(powerups.spendCharge(state, 'not.a.powerup'), false);
}

// --- awards route to whichever has the most room -------------------------
{
  const state = stateAtBand(6); // aegis cap 3, dissolution cap 2
  assert.equal(powerups.awardCharge(state), 'aegis', 'the roomier slot wins first');

  // What matters is that awards spread across both rather than filling one and
  // then the other. Ties break toward the earlier ladder entry, so the exact
  // order is an implementation detail; the distribution is the contract.
  const spread = stateAtBand(6);
  const order = [];
  for (let attempt = 0; attempt < 5; attempt += 1) order.push(powerups.awardCharge(spread));
  assert.equal(powerups.chargesOf(spread, 'aegis'), 3);
  assert.equal(powerups.chargesOf(spread, 'dissolution'), 2);
  assert.ok(
    order.indexOf('dissolution') < 4,
    `the breaker must start filling before the shield is done, got ${order.join(',')}`
  );

  // Filling one must divert to the other rather than wasting the reward.
  const diverted = stateAtBand(6);
  diverted.charges.aegis = 3;
  assert.equal(powerups.awardCharge(diverted), 'dissolution', 'a full shield must divert to the breaker');
}

// Before GEBURAH every award has to land on AEGIS.
{
  const state = stateAtBand(1);
  assert.equal(powerups.awardCharge(state), 'aegis');
  assert.equal(powerups.awardCharge(state), null, 'AEGIS caps at 1 in YESOD and nothing else is unlocked');
}

// --- gate milestones fire once per threshold -----------------------------
{
  const state = stateAtBand(6);
  // Frame-by-frame observation must not re-award at the same gate count.
  let awarded = 0;
  for (let gates = 0; gates <= GATES_PER_CHARGE * 2; gates += 1) {
    for (let repeat = 0; repeat < 3; repeat += 1) {
      awarded += powerups.applyGateMilestones(state, gates).length;
    }
  }
  assert.equal(awarded, 2, `expected one charge per ${GATES_PER_CHARGE} gates, got ${awarded}`);
  assert.equal(state.gateChargeMarker, 2);
}

// A jump of several thresholds in one observation awards for each.
{
  const state = stateAtBand(6);
  const awarded = powerups.applyGateMilestones(state, GATES_PER_CHARGE * 3);
  assert.equal(awarded.length, 3, 'a multi-threshold jump must award for every threshold crossed');
  assert.equal(state.gateChargeMarker, 3);
}

// Milestones respect capacity: crossing thresholds while full awards nothing.
{
  const state = stateAtBand(1);
  powerups.applyGateMilestones(state, GATES_PER_CHARGE * 10);
  assert.equal(powerups.chargesOf(state, 'aegis'), 1, 'capacity still bounds milestone awards');
  assert.equal(state.gateChargeMarker, 10, 'but the marker still advances so it cannot re-fire');
}

// --- a run resets charges but not the ascent -----------------------------
{
  const state = stateAtBand(6);
  powerups.awardCharge(state);
  powerups.awardCharge(state);
  powerups.applyGateMilestones(state, GATES_PER_CHARGE);
  powerups.spendCharge(state, 'aegis');

  powerups.beginRunState(state);
  assert.equal(powerups.chargesOf(state, 'aegis'), 0, 'charges must not carry between runs');
  assert.equal(powerups.chargesOf(state, 'dissolution'), 0);
  assert.equal(state.gateChargeMarker, 0, 'the milestone marker must reset with the run');
  assert.equal(state.earned, 0);
  assert.equal(state.highestBand, 6, 'the ascent survives the run');
  assert.equal(powerups.isUnlocked(state, 'dissolution'), true);
}

// --- persistence ---------------------------------------------------------
{
  const storage = powerups.createMemoryStorage();
  const state = stateAtBand(5);
  powerups.awardCharge(state);
  powerups.awardCharge(state);
  assert.equal(powerups.writeState(storage, state), true);

  const restored = powerups.readState(storage);
  assert.equal(restored.highestBand, 5, 'the ascent persists');
  assert.equal(powerups.chargesOf(restored, 'aegis'), 0, 'charges must never be restored');
  assert.equal(powerups.chargesOf(restored, 'dissolution'), 0);

  // Only the ascent is written. Nothing about the run leaves memory.
  const persisted = storage.snapshot()[powerups.STORAGE_KEY];
  const parsed = JSON.parse(persisted);
  assert.deepEqual(Object.keys(parsed).sort(), ['highestBand', 'version']);
  for (const forbidden of ['charges', 'runId', 'score', 'startedAt', 'device', 'sessionId', 'http']) {
    assert.equal(persisted.includes(forbidden), false, `persisted power-ups leaked ${forbidden}`);
  }
}

// Absent, corrupt and hostile storage all degrade to a locked fresh state.
for (const raw of [null, '', 'not json', '{}', '[]', '{"version":999,"highestBand":7}', '{"version":1,"highestBand":"seven"}']) {
  const storage = powerups.createMemoryStorage(raw === null ? {} : { [powerups.STORAGE_KEY]: raw });
  const state = powerups.readState(storage);
  assert.ok(Number.isInteger(state.highestBand), `payload ${JSON.stringify(raw)} broke highestBand`);
  assert.ok(state.highestBand >= 0 && state.highestBand <= 7);
  assert.doesNotThrow(() => powerups.describe(state));
}

// A stored band beyond the table is clamped rather than trusted.
{
  const storage = powerups.createMemoryStorage({
    [powerups.STORAGE_KEY]: JSON.stringify({ version: 1, highestBand: 500 })
  });
  assert.equal(powerups.readState(storage).highestBand, 7);
}

{
  const hostile = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => powerups.readState(hostile));
  assert.equal(powerups.writeState(hostile, powerups.createState()), false);
}

// --- display -------------------------------------------------------------
{
  const state = stateAtBand(3);
  const shown = powerups.describe(state);
  assert.equal(shown.length, POWERUPS.length);
  for (const entry of shown) {
    assert.ok(entry.label.length > 0 && entry.detail.length > 0 && entry.glyph.length > 0);
    assert.ok(entry.charges >= 0 && entry.charges <= entry.capacity);
    assert.equal(entry.unlocked, state.highestBand >= entry.unlockBand);
  }
}

console.log(`powerups v${powerups.POWERUP_VERSION}: all deterministic contracts passed`);
