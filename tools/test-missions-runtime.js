'use strict';

const assert = require('node:assert/strict');
const missions = require('./missions-runtime.js');
const gate = require('./gate-slice-runtime.js');

const { ACTIVE_SLOTS, RECENT_LIMIT, TIERS, CATALOGUE } = missions;

// Deterministic draw sequence, so rotation tests assert behaviour rather than luck.
function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

// --- catalogue -----------------------------------------------------------
assert.deepEqual(missions.validateCatalogue(), []);
assert.ok(CATALOGUE.length >= ACTIVE_SLOTS + RECENT_LIMIT);

// Malformed catalogues must be rejected rather than silently shipped.
assert.ok(missions.validateCatalogue([
  { id: 'x', label: 'X', detail: 'x', scope: 'nonsense', tier: 'light', target: 1, delta: () => 0 }
]).some(error => error.includes('unknown scope')));
assert.ok(missions.validateCatalogue([
  { id: 'x', label: 'X', detail: 'x', scope: 'run', tier: 'light', target: 0, delta: () => 0 }
]).some(error => error.includes('non-positive target')));
assert.ok(missions.validateCatalogue([
  { id: 'x', label: 'X', detail: 'x', scope: 'run', tier: 'light', target: 3, delta: () => 0, level: () => 0 }
]).some(error => error.includes('exactly one of delta or level')));

// Every mission must be reachable from state the Gate slice actually produces.
{
  const sliceFields = new Set(Object.keys(gate.createSliceState({ runId: 'probe' })));
  for (const field of ['gatesCleared', 'gateEntries', 'gateBanks', 'voidSurvivals', 'riskStreak', 'bandIndex', 'scoreBreakdown', 'lastClear']) {
    assert.ok(sliceFields.has(field), `the Gate slice no longer exposes ${field}; missions depend on it`);
  }
}

// --- progress is monotonic and bounded -----------------------------------
{
  const state = missions.createState();
  state.active = CATALOGUE.map(mission => mission.id);
  for (const mission of CATALOGUE) state.progress[mission.id] = 0;

  let previous = gate.createSliceState({ runId: 'a' });
  let current = gate.createSliceState({ runId: 'a' });

  // Replay a long, varied run: risk clears, climax clears, near misses, banks,
  // entries, Void survivals and a climbing band.
  for (let step = 1; step <= 400; step += 1) {
    previous = JSON.parse(JSON.stringify(current));
    current.gatesCleared += 1;
    current.bandIndex = gate.getBandIndex(current.gatesCleared);
    current.riskStreak = step % 17;
    current.lastClear = {
      gateNumber: current.gatesCleared,
      family: step % 4 === 0 ? 'climax' : 'pressure',
      zone: step % 3 === 0 ? 'risk-top' : 'center',
      riskActive: true,
      nearMiss: step % 40 === 0
    };
    if (step % 25 === 0) { current.gateEntries += 1; current.voidSurvivals += 1; }
    if (step % 30 === 0) { current.gateBanks += 1; current.scoreBreakdown.bank += 20; }

    const before = CATALOGUE.map(mission => state.progress[mission.id]);
    missions.advance(state, previous, current);
    const after = CATALOGUE.map(mission => state.progress[mission.id]);

    for (let index = 0; index < CATALOGUE.length; index += 1) {
      const mission = CATALOGUE[index];
      assert.ok(after[index] >= before[index], `${mission.id} went backwards`);
      assert.ok(after[index] <= mission.target, `${mission.id} exceeded its target`);
      assert.ok(Number.isInteger(after[index]), `${mission.id} produced a non-integer`);
    }
  }

  // A run that long must actually move several objectives, or the targets are
  // set so high the feature is decorative.
  const advanced = CATALOGUE.filter(mission => state.progress[mission.id] > 0);
  assert.ok(advanced.length >= 8, `only ${advanced.length} missions advanced across 400 gates`);
}

// A step where nothing happened must award nothing.
{
  const state = missions.createState();
  state.active = ['gates.total', 'risk.courted', 'climax.cleared'];
  for (const id of state.active) state.progress[id] = 0;
  const still = gate.createSliceState({ runId: 'idle' });
  missions.advance(state, still, JSON.parse(JSON.stringify(still)));
  assert.deepEqual(state.active.map(id => state.progress[id]), [0, 0, 0]);
}

// A risk clear must not also count as a climax clear, and vice versa.
{
  const state = missions.createState();
  state.active = ['risk.courted', 'climax.cleared', 'nearmiss.total'];
  for (const id of state.active) state.progress[id] = 0;
  const previous = gate.createSliceState({ runId: 'zone' });
  const next = JSON.parse(JSON.stringify(previous));
  next.gatesCleared = 1;
  next.lastClear = { family: 'pressure', zone: 'risk-top', riskActive: true, nearMiss: false };
  missions.advance(state, previous, next);
  assert.equal(state.progress['risk.courted'], 1);
  assert.equal(state.progress['climax.cleared'], 0);
  assert.equal(state.progress['nearmiss.total'], 0);
}

// A risk-zone clear in a band where risk is inactive must not count.
{
  const state = missions.createState();
  state.active = ['risk.courted'];
  state.progress['risk.courted'] = 0;
  const previous = gate.createSliceState({ runId: 'inactive' });
  const next = JSON.parse(JSON.stringify(previous));
  next.gatesCleared = 1;
  next.lastClear = { family: 'safe', zone: 'risk-top', riskActive: false, nearMiss: false };
  missions.advance(state, previous, next);
  assert.equal(state.progress['risk.courted'], 0, 'MALKUTH has risk inactive; those clears must not count');
}

// --- scope ---------------------------------------------------------------
{
  const state = missions.createState();
  state.active = ['gates.total', 'run.gates', 'band.geburah'];
  state.progress['gates.total'] = 40;
  state.progress['run.gates'] = 20;
  state.progress['band.geburah'] = 0;

  missions.resetRunScoped(state);
  assert.equal(state.progress['gates.total'], 40, 'cumulative progress must survive a new run');
  assert.equal(state.progress['run.gates'], 0, 'run-scoped progress must reset');
}

// REFUSE THE GATE must collapse the moment a Gate is entered.
{
  const state = missions.createState();
  state.active = ['run.abstain'];
  state.progress['run.abstain'] = 0;
  const base = gate.createSliceState({ runId: 'abstain' });

  const banked = JSON.parse(JSON.stringify(base));
  banked.gateBanks = 2;
  missions.advance(state, base, banked);
  assert.equal(state.progress['run.abstain'], 2);

  // Level missions report a high-water mark, so entering a Gate stops further
  // credit even though it cannot claw back what was already earned this run.
  const entered = JSON.parse(JSON.stringify(banked));
  entered.gateEntries = 1;
  entered.gateBanks = 3;
  missions.advance(state, banked, entered);
  assert.equal(state.progress['run.abstain'], 2, 'entering a Gate must stop abstinence credit');

  missions.resetRunScoped(state);
  assert.equal(state.progress['run.abstain'], 0, 'and the next run starts clean');
}

// --- rotation ------------------------------------------------------------
{
  const state = missions.createState();
  missions.fillActive(state, sequence([0.1, 0.5, 0.9]));
  assert.equal(state.active.length, ACTIVE_SLOTS);
  assert.equal(new Set(state.active).size, ACTIVE_SLOTS, 'no duplicate active missions');
  assert.equal(new Set(state.active.map(id => missions.getMission(id).tier)).size, ACTIVE_SLOTS,
    'the active set must span tiers so something is always reachable');

  const completedId = state.active[1];
  missions.rotate(state, completedId, sequence([0.3]));

  assert.equal(state.active.length, ACTIVE_SLOTS, 'the slot must be refilled');
  assert.ok(!state.active.includes(completedId), 'a completed mission leaves the active set');
  assert.equal(state.completed[completedId], 1);
  assert.equal(state.progress[completedId], 0, 'progress resets so the mission can return later');
  assert.equal(state.recent[0], completedId);
  assert.equal(new Set(state.active).size, ACTIVE_SLOTS);
}

// Rotating repeatedly must never duplicate, never empty a slot, and never throw.
{
  const state = missions.createState();
  const random = sequence([0.05, 0.37, 0.61, 0.88, 0.44, 0.72, 0.13]);
  missions.fillActive(state, random);
  for (let round = 0; round < 60; round += 1) {
    const target = state.active[round % ACTIVE_SLOTS];
    missions.rotate(state, target, random);
    assert.equal(state.active.length, ACTIVE_SLOTS, `slot lost on round ${round}`);
    assert.equal(new Set(state.active).size, ACTIVE_SLOTS, `duplicate on round ${round}`);
    assert.ok(state.recent.length <= RECENT_LIMIT, 'the recent ring must stay bounded');
  }
}

// Rotating a mission that is not active is a no-op, not a corruption.
{
  const state = missions.createState();
  missions.fillActive(state, sequence([0.2]));
  const before = [...state.active];
  missions.rotate(state, 'not.a.mission', sequence([0.5]));
  assert.deepEqual(state.active, before);
}

// --- persistence ---------------------------------------------------------
{
  const storage = missions.createMemoryStorage();
  const state = missions.createState();
  missions.fillActive(state, sequence([0.2, 0.6, 0.95]));
  // Stay under the drawn mission's own target; over-target values are clamped on
  // read, which is asserted separately below.
  const tracked = state.active[0];
  const partial = Math.max(1, Math.floor(missions.getMission(tracked).target / 2));
  state.progress[tracked] = partial;
  assert.equal(missions.writeState(storage, state), true);

  const restored = missions.readState(storage);
  assert.deepEqual(restored.active, state.active);
  assert.equal(restored.progress[tracked], partial);
}

// Absent, corrupt, and hostile storage all degrade to a usable fresh state.
for (const raw of [null, '', 'not json', '{}', '[]', '{"version":999}', '{"version":1,"active":"nope"}']) {
  const storage = missions.createMemoryStorage(raw === null ? {} : { [missions.STORAGE_KEY]: raw });
  const state = missions.readState(storage);
  assert.ok(Array.isArray(state.active), `storage payload ${JSON.stringify(raw)} broke the active list`);
  assert.doesNotThrow(() => missions.fillActive(state, sequence([0.5])));
  assert.equal(state.active.length, ACTIVE_SLOTS);
}

// Unknown ids and out-of-range progress are discarded rather than trusted.
{
  const storage = missions.createMemoryStorage({
    [missions.STORAGE_KEY]: JSON.stringify({
      version: 1,
      active: ['gates.total', 'gates.total', 'ghost.mission'],
      progress: { 'gates.total': 999999, 'ghost.mission': 5, 'run.gates': -3 },
      completed: { 'ghost.mission': 2 },
      recent: ['ghost.mission', 'run.gates']
    })
  });
  const state = missions.readState(storage);
  assert.deepEqual(state.active, ['gates.total'], 'duplicates and unknown ids are dropped');
  assert.equal(state.progress['gates.total'], missions.getMission('gates.total').target, 'progress is clamped to target');
  assert.equal(state.progress['run.gates'], 0, 'negative progress is clamped to zero');
  assert.equal('ghost.mission' in state.progress, false);
  assert.equal('ghost.mission' in state.completed, false);
  assert.deepEqual(state.recent, ['run.gates']);
}

// A read-only storage must not throw, just fail to persist.
{
  const hostile = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => missions.readState(hostile));
  assert.equal(missions.writeState(hostile, missions.createState()), false);
}

// --- privacy -------------------------------------------------------------
// The stored payload carries mission ids and integers, nothing else. This mirrors
// the boundary the telemetry and grammar privacy tests already enforce.
{
  const storage = missions.createMemoryStorage();
  const state = missions.createState();
  missions.fillActive(state, sequence([0.2, 0.6, 0.95]));
  state.progress[state.active[0]] = 1;
  missions.rotate(state, state.active[0], sequence([0.4]));
  missions.writeState(storage, state);

  const persisted = storage.snapshot()[missions.STORAGE_KEY];
  assert.ok(persisted.length > 0);
  for (const forbidden of ['runId', 'startedAt', 'endedAt', 'score', 'device', 'userAgent', 'http', 'sessionId']) {
    assert.equal(persisted.includes(forbidden), false, `persisted missions leaked ${forbidden}`);
  }

  const parsed = JSON.parse(persisted);
  assert.deepEqual(Object.keys(parsed).sort(), ['active', 'completed', 'progress', 'recent', 'version']);
  for (const value of Object.values(parsed.progress)) assert.ok(Number.isInteger(value));
  for (const value of Object.values(parsed.completed)) assert.ok(Number.isInteger(value));
}

// --- display -------------------------------------------------------------
{
  const state = missions.createState();
  missions.fillActive(state, sequence([0.2, 0.6, 0.95]));
  const shown = missions.describe(state);
  assert.equal(shown.length, ACTIVE_SLOTS);
  for (const entry of shown) {
    assert.ok(entry.label.length > 0 && entry.detail.length > 0);
    assert.ok(entry.progress >= 0 && entry.progress <= entry.target);
    assert.ok(TIERS.includes(entry.tier));
    assert.equal(entry.complete, entry.progress >= entry.target);
  }
}

console.log(`missions v${missions.MISSIONS_VERSION}: all deterministic contracts passed`);
