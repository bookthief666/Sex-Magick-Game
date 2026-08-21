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
assert.equal(typeof powerups.useDissolution, 'undefined', 'manual activation must be gone');

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

// --- D-060: AEGIS covers the floor, not just the walls -------------------
//
// Two things call gameOver(): a pillar collision and falling past
// `y > innerHeight - r * 1.5`. Until D-060 tryAbsorb only ever looked for
// overlapping pillars, so a floor death killed the player outright while the
// ward rings were still drawn around them. These pin the geometry that fix
// depends on; the absorb path itself is exercised in the browser suite.
{
  // The module resolves its root to globalThis, so that - not a synthesized
  // `window` - is where a viewport height has to be staged.
  const originalInnerHeight = globalThis.innerHeight;
  const restore = () => {
    if (originalInnerHeight === undefined) delete globalThis.innerHeight;
    else globalThis.innerHeight = originalInnerHeight;
  };
  globalThis.innerHeight = 1000;

  // An unknown viewport must never be read as a fall: the floor line would go
  // negative and AEGIS would spend a charge on any death at all.
  delete globalThis.innerHeight;
  assert.equal(
    powerups.isFloorDeath({ player: { y: 5, r: 20 } }),
    false,
    'no viewport height means no floor-death claim'
  );
  globalThis.innerHeight = 0;
  assert.equal(
    powerups.isFloorDeath({ player: { y: 5, r: 20 } }),
    false,
    'a zero viewport height means no floor-death claim'
  );
  globalThis.innerHeight = 1000;

  const radius = 20;
  // The death line index.html uses: 1000 - 20 * 1.5 = 970.
  const deathLine = 1000 - radius * powerups.FLOOR_DEATH_RADIUS_FACTOR;
  assert.equal(deathLine, 970);

  assert.equal(
    powerups.isFloorDeath({ player: { y: deathLine + 1, r: radius } }),
    true,
    'past the death line is a floor death'
  );
  assert.equal(
    powerups.isFloorDeath({ player: { y: deathLine, r: radius } }),
    false,
    'exactly on the line is not yet a death - index.html uses a strict >'
  );
  assert.equal(
    powerups.isFloorDeath({ player: { y: 10, r: radius } }),
    false,
    'high above the floor is not a floor death'
  );
  assert.equal(powerups.isFloorDeath({}), false, 'no player is not a floor death');
  assert.equal(powerups.isFloorDeath(null), false, 'no game is not a floor death');

  // The save must leave the player somewhere the very next death check passes,
  // whatever order the check and the position integration happen in.
  const player = { y: deathLine + 40, r: radius, vy: 12, jumpCooldown: 9 };
  powerups.liftFromFloor({ player });
  assert.ok(player.vy < 0, 'a floor save must send the player upward');
  assert.equal(
    player.vy,
    -7.5 * powerups.FLOOR_SAVE_LIFT_MULTIPLIER,
    'lift is the base jump impulse scaled by the documented multiplier'
  );
  assert.ok(
    !powerups.isFloorDeath({ player }),
    'after the save the player must no longer be past the death line'
  );
  assert.equal(
    player.y,
    deathLine - radius * powerups.FLOOR_SAVE_CLEARANCE_RADII,
    'the save puts the documented clearance between avatar and death line'
  );
  assert.equal(player.jumpCooldown, 0, 'a saved player may act immediately');

  // A viewport shorter than the clearance must not fling the player through the
  // ceiling, which index.html clamps at r * 1.5.
  globalThis.innerHeight = 40;
  const cramped = { y: 39, r: radius, vy: 12 };
  powerups.liftFromFloor({ player: cramped });
  assert.ok(
    cramped.y >= radius * powerups.FLOOR_DEATH_RADIUS_FACTOR,
    'the save must never place the player above the ceiling clamp'
  );

  powerups.liftFromFloor({});
  powerups.liftFromFloor(null);

  restore();
}
