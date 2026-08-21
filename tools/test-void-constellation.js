'use strict';

/**
 * The Void as a clearable section.
 *
 * The properties worth pinning are the ones a naive re-implementation would get
 * subtly wrong and nobody would notice for weeks: the completion bonus paying
 * more than once, a shield being awarded twice by two updates landing on the
 * frame the set completes, and the streak lifting the star order without bound
 * so the third catch of a late Void is already a dodecagram.
 */

const assert = require('node:assert/strict');
const constellation = require('./void-constellation.js');
const polygram = require('./polygram.js');

// --- set size -------------------------------------------------------------
{
  assert.equal(constellation.starCountForBand(0), constellation.MIN_STARS);
  assert.equal(constellation.starCountForBand(1), constellation.MIN_STARS,
    'the size steps every two bands, not every band');
  assert.equal(constellation.starCountForBand(2), constellation.MIN_STARS + 1);
  assert.equal(constellation.starCountForBand(99), constellation.MAX_STARS, 'saturates');

  // Garbage in must not produce a Void that can never be cleared.
  for (const bad of [undefined, null, NaN, -7, 'kether', {}]) {
    const count = constellation.starCountForBand(bad);
    assert.ok(Number.isInteger(count), `starCountForBand(${String(bad)}) must be an integer`);
    assert.ok(count >= constellation.MIN_STARS && count <= constellation.MAX_STARS);
  }

  // Monotonic: a later band is never a shorter test.
  for (let band = 1; band < 24; band += 1) {
    assert.ok(constellation.starCountForBand(band) >= constellation.starCountForBand(band - 1));
  }
}

// --- star value -----------------------------------------------------------
{
  assert.equal(constellation.starValue(5), constellation.BASE_STAR_VALUE);
  assert.equal(
    constellation.starValue(6),
    constellation.BASE_STAR_VALUE + constellation.VALUE_PER_EXTRA_POINT
  );
  assert.equal(
    constellation.starValue(12),
    constellation.BASE_STAR_VALUE + (7 * constellation.VALUE_PER_EXTRA_POINT)
  );
  // Below a pentagram is not a thing; treat it as one rather than paying less.
  assert.equal(constellation.starValue(3), constellation.BASE_STAR_VALUE);
  assert.equal(constellation.starValue(undefined), constellation.BASE_STAR_VALUE);

  // The owner asked for stars worth *significantly* more than the old flat +10,
  // and categorically better than an orb's +5.
  assert.ok(constellation.starValue(5) >= 20, 'even the humblest star beats four orbs');
  assert.ok(constellation.starValue(12) > constellation.starValue(5) * 2.5,
    'a dodecagram must feel like a different object from a pentagram');
}

// --- order progression ----------------------------------------------------
{
  const state = constellation.createConstellation(0);
  assert.equal(constellation.nextOrderIndex(state), 0, 'a fresh MALKUTH Void opens on a pentagram');

  // The streak lifts the *next* star, which is what makes the section escalate
  // in the player's hands rather than on a timer.
  state.streak = 3;
  assert.equal(constellation.nextOrderIndex(state), 3);

  // Bounded, so a long streak in a late band cannot run off the order table.
  state.streak = 999;
  assert.equal(constellation.nextOrderIndex(state), constellation.MAX_STREAK_LIFT);

  const late = constellation.createConstellation(6);
  late.streak = 999;
  const index = constellation.nextOrderIndex(late);
  assert.ok(Number.isInteger(index) && index >= 0);
  // The consumer is polygram.orderForBand, which saturates rather than throwing -
  // this asserts the pairing, not just each half.
  assert.equal(polygram.orderForBand(index).points, 12);
  assert.ok(polygram.orderForBand(constellation.nextOrderIndex(state)).points >= 5);
}

// --- a perfect Void -------------------------------------------------------
{
  const state = constellation.createConstellation(0);
  const total = state.total;
  let paid = 0;
  let starPoints = 0;

  for (let i = 0; i < total; i += 1) {
    const order = polygram.orderForBand(constellation.nextOrderIndex(state));
    starPoints += constellation.starValue(order.points);
    const result = constellation.catchStar(state, order.points);
    paid += result.awarded;
    assert.equal(result.streak, i + 1, 'a clean run keeps the streak');
  }

  assert.ok(constellation.isCleared(state), 'catching every star clears the set');
  assert.equal(state.caught, total);
  assert.equal(state.points, paid, 'the state banks exactly what the caller was told to pay');
  assert.equal(state.points, starPoints * (1 + constellation.COMPLETION_BONUS_RATIO));

  // The whole point of the redesign: clearing is plainly better than collecting.
  assert.ok(paid > starPoints, 'completion must pay a bonus');
  assert.ok(paid > total * 10 * 4, 'a cleared Void dwarfs the old flat +10 per star');

  // The shield is claimable exactly once, however many times the caller polls.
  assert.equal(constellation.claimCompletion(state), true);
  assert.equal(constellation.claimCompletion(state), false, 'no second shield');
  assert.equal(constellation.claimCompletion(state), false);

  // A late catch after the set is closed pays nothing and does not re-complete.
  const after = constellation.catchStar(state, 12);
  assert.equal(after.awarded, 0);
  assert.equal(state.caught, total, 'a closed set does not keep counting');
}

// --- a missed star --------------------------------------------------------
{
  const state = constellation.createConstellation(4);
  constellation.catchStar(state, 5);
  constellation.catchStar(state, 6);
  assert.equal(state.streak, 2);

  const miss = constellation.missStar(state);
  assert.equal(miss.streak, 0, 'a miss resets the streak - that is the tension');
  assert.equal(miss.perfectLost, true);
  assert.equal(state.missed, 1);
  assert.equal(constellation.nextOrderIndex(state), state.bandIndex, 'and the order drops back');
  assert.equal(state.bestStreak, 2, 'but the best run is remembered');

  // Points already banked survive the miss.
  assert.ok(state.points > 0);

  // Missing enough stars makes completion unreachable; that must not deadlock or
  // silently award the shield.
  for (let i = state.caught; i < state.total; i += 1) constellation.missStar(state);
  assert.equal(constellation.isCleared(state), false);
  assert.equal(constellation.claimCompletion(state), false, 'a half-cleared Void pays no shield');

  const cold = constellation.missStar(constellation.createConstellation(0));
  assert.equal(cold.perfectLost, false, 'losing a streak of zero is not a loss');
}

// --- glitch intensity -----------------------------------------------------
{
  const state = constellation.createConstellation(3);
  const first = constellation.glitchIntensity(state);
  assert.ok(first >= 0 && first <= 1);

  state.streak = 1;
  const early = constellation.glitchIntensity(state);
  state.streak = constellation.MAX_STREAK_LIFT;
  const late = constellation.glitchIntensity(state);
  assert.ok(late > early, 'the spectacle is earned, not constant');
  assert.ok(late <= 1);

  state.completed = true;
  assert.equal(constellation.glitchIntensity(state), 1, 'clearing a set is the loudest moment');

  // Never NaN, whatever the caller hands over - this drives a draw call.
  for (const bad of [null, undefined, {}, { streak: NaN }, { streak: -3 }]) {
    const value = constellation.glitchIntensity(bad);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1,
      `glitchIntensity(${JSON.stringify(bad)}) must stay in 0..1`);
  }
}

// --- describe / defensive -------------------------------------------------
{
  assert.equal(constellation.describe(null), null);
  const state = constellation.createConstellation(2);
  constellation.catchStar(state, 7);
  const view = constellation.describe(state);
  assert.equal(view.caught, 1);
  assert.equal(view.remaining, state.total - 1);
  assert.equal(view.total + 0, state.total);

  // A null state must not throw on any entry point; the Void teardown path can
  // race a catch, and a thrown error there kills the frame.
  assert.deepEqual(constellation.catchStar(null, 5), { awarded: 0, completed: false, completionBonus: 0 });
  assert.deepEqual(constellation.missStar(null), { streak: 0, perfectLost: false });
  assert.equal(constellation.isCleared(null), false);
  assert.equal(constellation.claimCompletion(null), false);
  assert.equal(constellation.nextOrderIndex(null), 0);
}

console.log('void-constellation: a Void can be cleared, and it pays exactly once');
