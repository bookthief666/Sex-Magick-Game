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

// --- M16.1 entry aperture -------------------------------------------------
// The ring the player aims at must be the ring they hit. Regression guard for
// the 2026-08-12 pilot defect where entry was 31 px inside a 52 px drawn ring.
assert.ok(
  gate.GATE_ENTRY_RADIUS < gate.GATE_OUTER_RADIUS,
  'the aperture must sit inside the outer glow, so aim is still required'
);
assert.ok(
  gate.GATE_OUTER_RADIUS - gate.GATE_ENTRY_RADIUS >= 10,
  'the spokes drawn between the aperture and the outer ring need real room'
);
// Every near bank recorded in the pilot must now resolve as an entry, and every
// far bank must still resolve as a bank. Nothing was observed between 42 and 82.
for (const distance of [31.08, 32.16, 37.3, 40.58, 41.95]) {
  assert.ok(distance <= gate.GATE_ENTRY_RADIUS, `pilot near-bank ${distance} must now enter`);
}
for (const distance of [82.17, 85.2, 95.28, 117.12, 237.73]) {
  assert.ok(distance > gate.GATE_ENTRY_RADIUS, `pilot far-bank ${distance} must still bank`);
}

// --- M16.2 seeded Gate placement -----------------------------------------
const HEIGHT = 823; // the Fold 6 open profile the pilot ran at

// Deterministic: same inputs, same placement.
assert.equal(
  gate.chooseGateY({ canvasHeight: HEIGHT, playerY: 400, unitRandom: 0.42, travelFrames: 200 }),
  gate.chooseGateY({ canvasHeight: HEIGHT, playerY: 400, unitRandom: 0.42, travelFrames: 200 })
);

// Placement must stay inside the corridor and off both edges, across the whole
// unit interval and from any player position.
for (let step = 0; step <= 20; step += 1) {
  for (const playerY of [0, 120, 400, 700, HEIGHT]) {
    const y = gate.chooseGateY({
      canvasHeight: HEIGHT,
      playerY,
      unitRandom: step / 20,
      travelFrames: 200
    });
    assert.ok(Number.isFinite(y), 'placement must always be finite');
    assert.ok(
      y >= HEIGHT * gate.GATE_MIN_RATIO - 1e-6 && y <= HEIGHT * gate.GATE_MAX_RATIO + 1e-6,
      `placement ${y} escaped the corridor`
    );
    assert.ok(
      y >= gate.GATE_EDGE_MARGIN_PX && y <= HEIGHT - gate.GATE_EDGE_MARGIN_PX,
      `placement ${y} hugged an edge`
    );
  }
}

// The whole point of M16.2: real spread, not the two-position alternation that
// produced exactly 296.28 and 526.72 for all 28 offers in the pilot.
const spread = new Set();
for (let step = 0; step <= 40; step += 1) {
  spread.add(Math.round(gate.chooseGateY({
    canvasHeight: HEIGHT,
    playerY: 400,
    unitRandom: step / 40,
    travelFrames: 400
  })));
}
assert.ok(spread.size > 20, `expected a spread of placements, got ${spread.size}`);

// Consecutive Gates must differ, so a seeded stream cannot rediscover the
// alternation by accident.
const separation = HEIGHT * gate.GATE_MIN_SEPARATION_RATIO;
for (let step = 0; step <= 20; step += 1) {
  const previousY = 411;
  const y = gate.chooseGateY({
    canvasHeight: HEIGHT,
    playerY: 411,
    previousY,
    unitRandom: step / 20,
    travelFrames: 400
  });
  assert.ok(
    Math.abs(y - previousY) >= separation - 1e-6,
    `placement ${y} sat inside the separation band around ${previousY}`
  );
}

// Reachability: a Gate must never spawn further away than the player can travel
// while it is on screen.
for (let step = 0; step <= 20; step += 1) {
  const playerY = 200;
  const travelFrames = 60;
  const y = gate.chooseGateY({ canvasHeight: HEIGHT, playerY, unitRandom: step / 20, travelFrames });
  const reach = Math.max(60, travelFrames * gate.GATE_VERTICAL_PX_PER_FRAME);
  assert.ok(
    Math.abs(y - playerY) <= reach + 1e-6,
    `placement ${y} was ${Math.abs(y - playerY)} px from the player but only ${reach} px was reachable`
  );
}

// Degenerate inputs must still yield a placeable Gate rather than NaN.
for (const height of [0, 1, 50, 200]) {
  const y = gate.chooseGateY({ canvasHeight: height, playerY: 10, unitRandom: 0.7, travelFrames: 100 });
  assert.ok(Number.isFinite(y), `height ${height} produced a non-finite placement`);
}

assert.equal(gate.sampleIntervals([[0, 0]], 0.5), null, 'an empty window has no sample');
assert.equal(gate.sampleIntervals([[0, 10], [20, 30]], 0.75), 25, 'width-proportional sampling');

// --- M16.3 closest-approach sampling -------------------------------------
// Replays a pillar sweeping past a falling player, which is exactly the case
// that produced the four phantom "unsafe crossings" in the pilot: the player
// threads the gap cleanly, then falls out of it before the pillar is marked.
{
  // Gap spans 100..280, so the safe band for a 12 px half-height is 112..268.
  // The pillar centre starts 40 px right of the player and closes at 8 px/frame,
  // so the crossing lands on frame 5 with the player at y=205 - inside the gap.
  // The player keeps falling for another 20 frames and ends at y=425, far below
  // it, which is the frame the old code used to read.
  const pillar = { x: 150, w: 20, top: 100, gap: 180 };
  const player = { x: 120, y: 150 };
  const instance = { player, obstacles: [pillar] };

  for (let frame = 0; frame < 25; frame += 1) {
    gate.samplePillarApproaches(instance);
    pillar.x -= 8;                             // pillar sweeps left
    player.y += 11;                            // player falls at MAX_FALL_SPEED
  }

  const approach = pillar.__gateSliceApproach;
  assert.ok(approach, 'a swept pillar must carry an approach snapshot');
  assert.equal(approach.dx, 0, 'the centre crossing is the closest approach');
  assert.equal(approach.playerY, 205, 'snapshot must capture the crossing, not the aftermath');
  assert.equal(player.y, 425, 'the player has since fallen well clear of the gap');

  // The snapshot classifies as a safe centre clear...
  const honest = gate.classifyGateClear({
    playerY: approach.playerY,
    gapTop: approach.gapTop,
    gapSize: approach.gapSize,
    playerHalf: 12
  });
  assert.equal(honest.zone, 'center', 'the real crossing was through the centre');
  assert.ok(honest.minimumClearance > 0, 'the real crossing had positive clearance');

  // ...whereas the old live-value read would have called the same clear unsafe.
  const stale = gate.classifyGateClear({
    playerY: player.y,
    gapTop: pillar.top,
    gapSize: pillar.gap,
    playerHalf: 12
  });
  assert.equal(stale.zone, 'unsafe', 'the stale read is what produced phantom crossings');
}

// A later, worse frame must never overwrite a better earlier approach.
{
  const pillar = { x: 130, w: 20, top: 0, gap: 400 };
  const instance = { player: { x: 130, y: 50 }, obstacles: [pillar] };
  gate.samplePillarApproaches(instance);
  const first = pillar.__gateSliceApproach;
  instance.player.x = 400;
  instance.player.y = 999;
  gate.samplePillarApproaches(instance);
  assert.equal(pillar.__gateSliceApproach, first, 'a receding pillar must keep its closest sample');
  assert.equal(pillar.__gateSliceApproach.playerY, 50);
}

console.log('gate-slice: all deterministic contracts passed');
