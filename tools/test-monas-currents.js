'use strict';

/**
 * Contracts for MONAS's two challenge sections.
 *
 * The assertions worth having here are the ones about *what the sections reward*,
 * because that is the whole reason they are not copies of HEX's. A test that only
 * checked "a node pays points" would pass for a design that had nothing to do with
 * gliding.
 */

const assert = require('node:assert/strict');
const currents = require('./monas-currents.js');

function section(name, fn) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log('monas-currents contracts');

section('smoothness is defined and clamped for every input a draw call could see', () => {
  assert.equal(currents.smoothnessOf(0, 0), 1, 'a section that has not started is smooth, not NaN');
  assert.equal(currents.smoothnessOf(0, 600), 1, 'no reversals is perfectly smooth');
  assert.equal(currents.smoothnessOf(1e9, 600), 0, 'thrashing clamps at zero rather than going negative');
  for (const bad of [NaN, undefined, null, Infinity, -5, '3', {}]) {
    const value = currents.smoothnessOf(bad, bad);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `smoothness must stay in 0..1 for ${String(bad)}`);
  }
});

section('the Undertow stakes a fraction of coherence, never the whole bank', () => {
  const stake = currents.undertowStake(10);
  assert.ok(stake > 0 && stake < 10, `stake ${stake} must leave coherence behind for the surge`);
  assert.equal(currents.undertowStake(0), 0);
  assert.equal(currents.undertowStake(-4), 0, 'a negative bank cannot stake anything');
});

section('a ridden Undertow returns more than its stake; a thrashed one returns nothing', () => {
  const ridden = currents.createUndertow(10);
  for (let frame = 0; frame < currents.UNDERTOW_FRAMES; frame += 1) currents.tickUndertow(ridden, false);
  assert.equal(currents.isUndertowOver(ridden), true);
  const clean = currents.settleUndertow(ridden);
  assert.equal(clean.survived, true);
  assert.ok(clean.returned > ridden.stake, `a clean ride must profit (${clean.returned} vs stake ${ridden.stake})`);

  const thrashed = currents.createUndertow(10);
  // Well beyond the threshold: a reversal every other frame is 30/s against 3.2.
  for (let frame = 0; frame < currents.UNDERTOW_FRAMES; frame += 1) currents.tickUndertow(thrashed, frame % 2 === 0);
  const lost = currents.settleUndertow(thrashed);
  assert.equal(lost.survived, false, 'fighting the current the whole way loses the wager');
  assert.equal(lost.returned, 0);
});

section('the Undertow settles once', () => {
  const state = currents.createUndertow(8);
  for (let frame = 0; frame < currents.UNDERTOW_FRAMES; frame += 1) currents.tickUndertow(state, false);
  const first = currents.settleUndertow(state);
  const second = currents.settleUndertow(state);
  assert.equal(first.settled, true);
  assert.equal(second.settled, false, 'a second settle must pay nothing');
  assert.equal(second.returned, 0);
});

section('a settled Undertow stops advancing', () => {
  const state = currents.createUndertow(8);
  for (let frame = 0; frame < currents.UNDERTOW_FRAMES; frame += 1) currents.tickUndertow(state, false);
  currents.settleUndertow(state);
  const elapsed = state.framesElapsed;
  currents.tickUndertow(state, true);
  assert.equal(state.framesElapsed, elapsed, 'ticking after settlement must not change the record');
});

section('the Caduceus scales its set with the band, within bounds', () => {
  assert.equal(currents.nodeCountForBand(0), currents.MIN_NODES);
  assert.equal(currents.nodeCountForBand(1000), currents.MAX_NODES, 'the set is capped, not unbounded');
  assert.equal(currents.nodeCountForBand(-3), currents.MIN_NODES, 'a nonsense band falls back to the floor');
});

section('the strands alternate, so the braid can be anticipated', () => {
  const sides = [0, 1, 2, 3, 4, 5].map(currents.strandFor);
  assert.deepEqual(sides, ['left', 'right', 'left', 'right', 'left', 'right']);
});

section('gliding pays more than darting - the whole point of the section', () => {
  const smooth = currents.createCaduceus(0);
  for (let frame = 0; frame < 120; frame += 1) currents.tickCaduceus(smooth, false);
  const smoothAward = currents.catchNode(smooth).awarded;

  const jerky = currents.createCaduceus(0);
  for (let frame = 0; frame < 120; frame += 1) currents.tickCaduceus(jerky, frame % 2 === 0);
  const jerkyAward = currents.catchNode(jerky).awarded;

  assert.ok(smoothAward > jerkyAward,
    `a glided node (${smoothAward}) must pay more than a thrashed one (${jerkyAward})`);
  assert.equal(jerkyAward, currents.BASE_NODE_VALUE, 'a fully thrashed node pays the base and no lift');
  assert.equal(smoothAward, Math.round(currents.BASE_NODE_VALUE * (1 + currents.CADUCEUS_GLIDE_MULTIPLE)));
});

section('catching every node while thrashing pays less than most of them smoothly', () => {
  const greedy = currents.createCaduceus(0);
  for (let index = 0; index < greedy.total; index += 1) {
    for (let frame = 0; frame < 20; frame += 1) currents.tickCaduceus(greedy, true);
    currents.catchNode(greedy);
  }
  currents.claimCaduceusCompletion(greedy);

  const glider = currents.createCaduceus(0);
  for (let index = 0; index < glider.total - 1; index += 1) {
    for (let frame = 0; frame < 20; frame += 1) currents.tickCaduceus(glider, false);
    currents.catchNode(glider);
  }
  currents.missNode(glider);

  assert.ok(glider.score > greedy.score,
    `the smooth partial clear (${glider.score}) must beat the thrashed full clear (${greedy.score})`);
});

section('the payout spread is what makes the section about gliding', () => {
  const run = reversedEvery => {
    const state = currents.createCaduceus(0);
    for (let index = 0; index < state.total; index += 1) {
      for (let frame = 0; frame < 20; frame += 1) {
        currents.tickCaduceus(state, reversedEvery ? frame % reversedEvery === 0 : false);
      }
      currents.catchNode(state);
    }
    currents.claimCaduceusCompletion(state);
    return state.score;
  };
  const glided = run(0);
  const thrashed = run(2);
  assert.ok(glided >= thrashed * 3,
    `a clean clear (${glided}) should pay several times a thrashed one (${thrashed}), or the section is decorative`);
});

section('the completion bonus is paid once and only on a real clear', () => {
  const state = currents.createCaduceus(0);
  for (let frame = 0; frame < 60; frame += 1) currents.tickCaduceus(state, false);
  assert.equal(currents.claimCaduceusCompletion(state), 0, 'an uncleared set pays no completion');
  for (let index = 0; index < state.total; index += 1) currents.catchNode(state);
  assert.equal(currents.isCaduceusCleared(state), true);
  const first = currents.claimCaduceusCompletion(state);
  const second = currents.claimCaduceusCompletion(state);
  assert.ok(first > 0, 'a cleared set must pay a completion');
  assert.equal(second, 0, 'a double-observed clearing frame must not pay twice');
});

section('describe never throws on a missing or partial state', () => {
  assert.equal(currents.describe(null), null);
  const state = currents.createCaduceus(2);
  const shape = currents.describe(state);
  assert.equal(shape.cleared, false);
  assert.ok(Number.isFinite(shape.smoothness));
});

console.log('monas-currents v1: all deterministic contracts passed');
