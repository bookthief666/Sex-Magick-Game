'use strict';

/**
 * The Void, as a section you can *clear* rather than merely survive.
 *
 * Before M40.6 the Void spawned pentagrams at a flat +10 each with no
 * relationship between them: a scattering of pickups against a black screen,
 * worth about as much as two orbs. The owner asked for them to be worth
 * significantly more and for the section to have "a fun result or some fun
 * reward we havent thought of yet".
 *
 * A constellation is a known set of stars for one Void. Three things follow
 * from making the set finite and known:
 *
 *   - **A streak means something.** Catching consecutive stars raises the order
 *     of the *next* one - pentagram, hexagram, heptagram - and a miss drops it
 *     back. The section escalates in the player's hands rather than on a timer,
 *     and the polygram sequence becomes a readout of how well it is going.
 *   - **There is something to complete.** Catching every star pays a large
 *     bonus and is what awards the AEGIS charge (D-067), so the shield is the
 *     trophy for *beating* a challenge section rather than for entering one.
 *   - **The spectacle can be earned.** `glitchIntensity` scales with the
 *     streak, so the picture-glitch reward starts subtle and ends loud.
 *
 * Deliberately pure: no canvas, no timers, no game object. The caller owns
 * rendering and spawn timing; this owns what a catch is worth and what the run
 * of catches means.
 */
(function attachSexMagickVoidConstellation(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickVoidConstellation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVoidConstellationApi(root) {
  'use strict';

  const VERSION = 1;

  // A corridor is short - 300 frames, five seconds. Sized so the set spans most
  // of it at a spacing that leaves a miss possible: fewer and the section ends
  // with seconds of empty black after the last star, many more and they arrive
  // too fast for the streak to read.
  const MIN_STARS = 6;
  const MAX_STARS = 10;

  /**
   * Base value of a star, before its order multiplies it.
   *
   * The old flat pentagram paid 10 against +1 per wall cleared and +5 per orb.
   * A star is the reward for entering the wager, so it should read as
   * categorically better than an orb rather than marginally better.
   */
  const BASE_STAR_VALUE = 25;

  // Each point above a pentagram's five adds this much again to the base, so a
  // dodecagram is worth roughly three times a pentagram before the streak
  // multiplier is applied.
  const VALUE_PER_EXTRA_POINT = 7;

  // Completing the set pays this multiple of the stars already collected -
  // large enough that clearing a Void is plainly better than half-clearing two.
  const COMPLETION_BONUS_RATIO = 1;

  // The streak lifts the order of the *next* star by one per consecutive catch.
  // Capped so the escalation is legible rather than instantly maxed.
  const MAX_STREAK_LIFT = 6;

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function whole(value, fallback = 0) {
    return Math.max(0, Math.floor(finite(value, fallback)));
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /**
   * How many stars this Void holds. Scales gently with the band so a late Void
   * is a longer test, without becoming a different activity.
   */
  function starCountForBand(bandIndex) {
    const band = whole(bandIndex, 0);
    return clamp(MIN_STARS + Math.floor(band / 2), MIN_STARS, MAX_STARS);
  }

  function createConstellation(bandIndex = 0) {
    return {
      version: VERSION,
      bandIndex: whole(bandIndex, 0),
      total: starCountForBand(bandIndex),
      caught: 0,
      missed: 0,
      streak: 0,
      bestStreak: 0,
      points: 0,
      completed: false,
      // Set once when the last star is caught, so the caller can pay it exactly
      // once no matter how often it polls.
      completionAwarded: false
    };
  }

  /**
   * The order of the star about to be presented: the band's base order lifted by
   * the current streak. Returns an index into a polygram order table rather than
   * a point count, so this module stays independent of the geometry module.
   */
  function nextOrderIndex(state) {
    const base = whole(state?.bandIndex, 0);
    const lift = clamp(whole(state?.streak, 0), 0, MAX_STREAK_LIFT);
    return base + lift;
  }

  /** What a star of `points` points is worth, before the streak multiplier. */
  function starValue(points) {
    const order = Math.max(5, whole(points, 5));
    return BASE_STAR_VALUE + ((order - 5) * VALUE_PER_EXTRA_POINT);
  }

  /**
   * How violently the background should glitch on this catch, 0..1.
   * Subtle at the start of a streak, loudest as a set is completed.
   */
  function glitchIntensity(state) {
    const streak = clamp(whole(state?.streak, 0), 0, MAX_STREAK_LIFT);
    const base = streak / MAX_STREAK_LIFT;
    return clamp(state?.completed ? 1 : 0.25 + (base * 0.75), 0, 1);
  }

  /**
   * Catch a star worth `points` points. Mutates and returns a result describing
   * what the caller should pay and show.
   */
  function catchStar(state, points) {
    if (!state || state.completed) return { awarded: 0, completed: false, completionBonus: 0 };
    const value = starValue(points);

    state.caught += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.points += value;

    let completionBonus = 0;
    if (state.caught >= state.total) {
      state.completed = true;
      // Paid on the points banked from the stars themselves, so a perfect run
      // of high-order stars is worth more to complete than a scrappy one.
      completionBonus = Math.round(state.points * COMPLETION_BONUS_RATIO);
      state.points += completionBonus;
    }

    return {
      awarded: value + completionBonus,
      starValue: value,
      completionBonus,
      completed: state.completed,
      streak: state.streak,
      glitchIntensity: glitchIntensity(state)
    };
  }

  /**
   * A star left the screen uncaught. The streak resets - that is the whole
   * tension of the section - but progress toward completion is simply lost,
   * since `caught` can no longer reach `total`.
   */
  function missStar(state) {
    if (!state || state.completed) return { streak: 0, perfectLost: false };
    const perfectLost = state.streak > 0;
    state.missed += 1;
    state.streak = 0;
    return { streak: 0, perfectLost };
  }

  /** True when every star in the set was caught - the shield condition. */
  function isCleared(state) {
    return Boolean(state && state.completed);
  }

  /**
   * Claim the completion reward exactly once. The caller polls this rather than
   * tracking its own flag, so a shield cannot be awarded twice by a double
   * update on the frame the set completes.
   */
  function claimCompletion(state) {
    if (!isCleared(state) || state.completionAwarded) return false;
    state.completionAwarded = true;
    return true;
  }

  function describe(state) {
    if (!state) return null;
    return {
      caught: state.caught,
      total: state.total,
      streak: state.streak,
      bestStreak: state.bestStreak,
      points: state.points,
      completed: state.completed,
      remaining: Math.max(0, state.total - state.caught)
    };
  }

  return Object.freeze({
    VERSION,
    MIN_STARS,
    MAX_STARS,
    BASE_STAR_VALUE,
    VALUE_PER_EXTRA_POINT,
    COMPLETION_BONUS_RATIO,
    MAX_STREAK_LIFT,
    starCountForBand,
    createConstellation,
    nextOrderIndex,
    starValue,
    glitchIntensity,
    catchStar,
    missStar,
    isCleared,
    claimCompletion,
    describe
  });
});
