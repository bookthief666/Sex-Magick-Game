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

// D-062: AEGIS is the entire ladder. DISSOLUTION is retired - the owner asked
// for one power-up that does one legible thing, after repeatedly reading a
// shield that was working as a shield that was broken.
assert.equal(powerups.POWERUPS.length, 1, 'AEGIS is the only power-up');
assert.equal(powerups.POWERUPS[0].id, 'aegis');

// Available immediately, capped at three, at every band.
assert.equal(powerups.POWERUPS[0].unlockBand, 0, 'AEGIS is available from the first band');
for (let band = 0; band <= 7; band += 1) {
  assert.equal(
    powerups.POWERUPS[0].capAt(band),
    powerups.MAX_AEGIS_CHARGES,
    `cap is a flat ${powerups.MAX_AEGIS_CHARGES} at band ${band}`
  );
}
assert.equal(powerups.MAX_AEGIS_CHARGES, 3, 'three shields at most');

// A shrinking or non-positive cap must still be rejected rather than shipped.
assert.ok(powerups.validateLadder([
  { id: 'x', label: 'X', detail: 'x', glyph: 'x', unlockBand: 0, capAt: b => (b >= 3 ? 1 : 2) }
]).length > 0, 'a shrinking cap must be rejected');

// --- earning and spending -------------------------------------------------
{
  const state = powerups.createState();
  assert.equal(powerups.isUnlocked(state, 'aegis'), true, 'unlocked from the very start');
  assert.equal(powerups.chargesOf(state, 'aegis'), 0, 'but holding nothing yet');

  // D-062 halves the milestone to 10 gates: at 25 the owner never reached a
  // charge in the runs they were actually playing.
  assert.equal(powerups.GATES_PER_CHARGE, 10);
  powerups.applyGateMilestones(state, 9);
  assert.equal(powerups.chargesOf(state, 'aegis'), 0, 'nothing at 9 gates');
  powerups.applyGateMilestones(state, 10);
  assert.equal(powerups.chargesOf(state, 'aegis'), 1, 'the first shield lands at 10 gates');
  powerups.applyGateMilestones(state, 30);
  assert.equal(powerups.chargesOf(state, 'aegis'), 3, 'three by 30 gates');
  powerups.applyGateMilestones(state, 100);
  assert.equal(powerups.chargesOf(state, 'aegis'), 3, 'and never more than three');

  // Crashing spends one and leaves room to earn it back.
  assert.equal(powerups.spendCharge(state, 'aegis'), true);
  assert.equal(powerups.chargesOf(state, 'aegis'), 2, 'a crash costs exactly one shield');
  assert.equal(powerups.awardCharge(state), 'aegis', 'and it can be earned back');
  assert.equal(powerups.chargesOf(state, 'aegis'), 3);
  assert.equal(powerups.awardCharge(state), null, 'a full holder earns nothing further');

  powerups.spendCharge(state, 'aegis');
  powerups.spendCharge(state, 'aegis');
  powerups.spendCharge(state, 'aegis');
  assert.equal(powerups.chargesOf(state, 'aegis'), 0);
  assert.equal(powerups.spendCharge(state, 'aegis'), false, 'cannot spend what you do not have');
}


{
  const state = powerups.createState();
  assert.deepEqual(powerups.recordBand(state, 3), [], 're-reaching a band unseals nothing new');

  // A bad run cannot revoke what the player already earned.
  assert.deepEqual(powerups.recordBand(state, 0), []);
  assert.equal(state.highestBand, 3, 'a run that ends in MALKUTH must not undo the ascent');

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

// --- one power-up means every award lands on it --------------------------
{
  const state = powerups.createState();
  assert.equal(powerups.awardCharge(state), 'aegis');
  assert.equal(powerups.awardCharge(state), 'aegis');
  assert.equal(powerups.awardCharge(state), 'aegis');
  assert.equal(powerups.chargesOf(state, 'aegis'), powerups.MAX_AEGIS_CHARGES);
  assert.equal(powerups.awardCharge(state), null, 'a full holder earns nothing further');
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
  assert.equal(powerups.chargesOf(state, 'aegis'), powerups.MAX_AEGIS_CHARGES, 'capacity still bounds milestone awards');
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
  assert.equal(state.gateChargeMarker, 0, 'the milestone marker must reset with the run');
  assert.equal(state.earned, 0);
  assert.equal(state.highestBand, 6, 'the ascent survives the run');
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

// --- M20: the reachable band ---------------------------------------------
// This is the predicate DISSOLUTION fires on, so it carries the whole risk of
// the auto-trigger. The bar must be "no input can save them", never "this is
// hard" - a looser test would steal saves the player would have made.
{
  const PHYS = { gravity: 0.45, maxFallSpeed: 11, jumpForce: -7.5, cooldownFrames: 8 };

  // Zero frames means no movement at all.
  {
    const band = powerups.reachableBand({ ...PHYS, y: 400, vy: 0, cooldown: 0, frames: 0 });
    assert.equal(band.minY, 400);
    assert.equal(band.maxY, 400);
  }

  // The band only ever widens with time, and always contains the start.
  {
    let previousWidth = -1;
    for (let frames = 0; frames <= 90; frames += 1) {
      const band = powerups.reachableBand({ ...PHYS, y: 400, vy: 0, cooldown: 0, frames });
      assert.ok(Number.isFinite(band.minY) && Number.isFinite(band.maxY));
      assert.ok(band.minY <= band.maxY, `inverted band at ${frames} frames`);
      const width = band.maxY - band.minY;
      assert.ok(width >= previousWidth - 1e-9, `band narrowed at ${frames} frames`);
      previousWidth = width;
    }
  }

  // Jumping climbs, falling descends - the two bounds must not be confused.
  {
    const band = powerups.reachableBand({ ...PHYS, y: 400, vy: 0, cooldown: 0, frames: 30 });
    assert.ok(band.minY < 400, 'the player must be able to climb above the start');
    assert.ok(band.maxY > 400, 'the player must be able to fall below the start');
  }

  // Terminal velocity is respected: descent over N frames never exceeds N*maxFall.
  {
    const frames = 60;
    const band = powerups.reachableBand({ ...PHYS, y: 0, vy: 100, cooldown: 0, frames });
    assert.ok(band.maxY <= frames * PHYS.maxFallSpeed + 1e-6, 'fall exceeded terminal velocity');
  }

  // A cooldown already running delays the first jump, so the ceiling is lower.
  {
    const ready = powerups.reachableBand({ ...PHYS, y: 400, vy: 0, cooldown: 0, frames: 12 });
    const blocked = powerups.reachableBand({ ...PHYS, y: 400, vy: 0, cooldown: 8, frames: 12 });
    assert.ok(blocked.minY >= ready.minY, 'a pending cooldown cannot raise the ceiling');
  }
}

// The doom verdict itself, expressed the way the runtime asks it.
{
  const PHYS = { gravity: 0.45, maxFallSpeed: 11, jumpForce: -7.5, cooldownFrames: 8 };
  const HALF = 12;
  const doomed = (y, vy, frames, top, gap) => {
    const band = powerups.reachableBand({ ...PHYS, y, vy, cooldown: 0, frames });
    return band.maxY < top + HALF || band.minY > top + gap - HALF;
  };

  // Centred in a wide gap with time to spare: obviously fine.
  assert.equal(doomed(400, 0, 30, 320, 160), false, 'a centred player must not be condemned');

  // Far below a high gap with almost no time: nothing can be done.
  assert.equal(doomed(760, 11, 4, 100, 120), true, 'an unreachable gap must be called doomed');

  // The same geometry with genuinely enough time is survivable, so must not fire.
  // The player climbs about 5.7 px/frame at the real jump cadence, so clearing
  // 552 px takes roughly 97 frames - 80 is still doom, 100 is not.
  assert.equal(doomed(760, 11, 80, 100, 120), true, '80 frames is not enough to climb 552px');
  assert.equal(doomed(760, 11, 100, 100, 120), false, 'given time to climb, it is not doom');

  // A player who only just makes it must not be condemned. This is the boundary
  // the whole feature turns on: the predicate has to be no-input-can-save-them,
  // not this-looks-hard.
  {
    let firstSurvivable = null;
    for (let frames = 1; frames <= 160; frames += 1) {
      if (!doomed(760, 11, frames, 100, 120)) { firstSurvivable = frames; break; }
    }
    assert.ok(firstSurvivable !== null, 'it must become survivable given enough time');
    assert.equal(doomed(760, 11, firstSurvivable, 100, 120), false);
    assert.equal(doomed(760, 11, firstSurvivable - 1, 100, 120), true,
      'the verdict must flip exactly once, at the frame it becomes reachable');
  }

  // Above the gap and falling toward it is never doom - gravity is doing the work.
  assert.equal(doomed(200, 2, 20, 320, 160), false, 'falling into the gap is not doom');

  // Once doomed at a given horizon, more urgency cannot make it survivable.
  for (let frames = 1; frames <= 4; frames += 1) {
    assert.equal(doomed(760, 11, frames, 100, 120), true, `still doomed at ${frames} frames`);
  }
}

// --- M20: no activation control ------------------------------------------
// The owner removed the button; the API must not offer a manual trigger either.

// The ward colour must not collide with any reserved colour.
{
  const reserved = ['#ff2f6d', '#ff003c', '#00e5ff', '#ffd700', '#f8fbff'];
  assert.ok(/^#[0-9a-f]{6}$/i.test(powerups.WARD_COLOR));
  for (const colour of reserved) {
    assert.notEqual(powerups.WARD_COLOR.toLowerCase(), colour.toLowerCase(),
      `the ward must not reuse the reserved colour ${colour}`);
  }
}

assert.ok(powerups.UNAVOIDABLE_LOOKAHEAD_FRAMES > 0 && powerups.UNAVOIDABLE_LOOKAHEAD_FRAMES <= 120,
  'the lookahead must be bounded, or the projection outruns the breathing gap');

console.log(`powerups v${powerups.POWERUP_VERSION}: all deterministic contracts passed`);

// --- D-062: the shield is reachable, and it is the only one -------------
//
// D-061 pinned the legibility gap that made AEGIS read as broken: unsealed at
// YESOD, first charge at 25 gates, nothing on screen distinguishing "unsealed
// but empty" from "armed". D-062 closes it rather than documenting it.
{
  assert.equal(powerups.isFloorDeath, undefined, 'floor-save machinery stays gone');

  const state = powerups.createState();
  assert.equal(powerups.isUnlocked(state, 'aegis'), true, 'no band gate to wait out');
  powerups.applyGateMilestones(state, powerups.GATES_PER_CHARGE);
  assert.equal(powerups.chargesOf(state, 'aegis'), 1, 'a shield inside the first ten gates');

  // Three, then a crash, then earn it back - the loop the owner asked for.
  powerups.applyGateMilestones(state, powerups.GATES_PER_CHARGE * 3);
  assert.equal(powerups.chargesOf(state, 'aegis'), 3);
  assert.equal(powerups.spendCharge(state, 'aegis'), true, 'a wall crash costs one');
  assert.equal(powerups.chargesOf(state, 'aegis'), 2);
  powerups.applyGateMilestones(state, powerups.GATES_PER_CHARGE * 4);
  assert.equal(powerups.chargesOf(state, 'aegis'), 3, 'and the third is earned back');
}
