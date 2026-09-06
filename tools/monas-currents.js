'use strict';

/**
 * M41 — the Rite of Monas gets challenge sections of its own.
 *
 * HEX has had them since M21: a wagered Void where banked Gnosis rides on
 * surviving faster walls, and a bonus corridor where a constellation is caught
 * star by star. MONAS had neither, and the owner's read after playing both is the
 * correct one — it is the simpler rite by a long way.
 *
 * The temptation is to give MONAS the same two sections. That would be wrong, and
 * not merely unimaginative: **the two rites reward opposite things.** HEX asks for
 * nerve — `riskStreak` counts clears taken deliberately close to the edge, and the
 * Void raises the speed until nerve fails. MONAS asks for flow — `coherence` rises
 * on smooth motion and falls on every direction reversal, and the Warp Surge is
 * what a long unbroken glide buys. A wager on speed and a constellation caught by
 * darting are both nerve mechanics, and dropping them into MONAS would make it a
 * worse copy of the other rite rather than a second one.
 *
 * So both sections here are built on *continuity* instead:
 *
 *   **The Undertow** wagers coherence rather than Gnosis, and what it asks is that
 *   you hold a line while the current pulls against it. Survival is not measured
 *   in frames endured but in how little you fought — a run that thrashes through
 *   it loses the wager even if the player never touches a wall. That is the only
 *   honest MONAS analogue of "survive the Void": the thing being risked and the
 *   thing being tested are the same quantity.
 *
 *   **The Caduceus** replaces a chain of stars with two intertwined strands. The
 *   reward does not scale on consecutive catches — it scales on *unbroken glide*,
 *   sampled while the section runs. Catching every star while jerking between the
 *   strands pays less than catching most of them on one clean sine. The strands
 *   exist so that the greedy line and the smooth line are different lines; a
 *   single strand would make it a straight corridor and the mechanic would be
 *   nothing.
 *
 * Canvas-free and DOM-free on purpose, exactly as `void-constellation.js` is: the
 * geometry and the scoring are the parts worth pinning in Node, and the drawing is
 * the part that has to be checked in a browser anyway.
 */
(function attachSexMagickMonasCurrents(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickMonasCurrents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMonasCurrentsApi(_root) {
  'use strict';

  const VERSION = 1;

  // --- the Undertow -----------------------------------------------------------

  /** Frames the section runs. Five seconds, matching the Void's own length. */
  const UNDERTOW_FRAMES = 300;

  /**
   * How much of the bank a wager costs, as a fraction.
   *
   * M42 restakes this on **Gnosis** rather than coherence. Both rites now bank
   * Gnosis by edging (`gnosis-edge.js`), and wagering the same currency in both
   * keeps one economy rather than two - the alternative had MONAS's portal
   * spending the meter that also buys the Warp Surge, so every entry cost a surge
   * and nobody would take it twice.
   *
   * Still a fraction rather than the whole bank: an emptied meter means the next
   * portal is a long way off, and a section the player cannot afford to fail is a
   * section they stop entering.
   */
  const UNDERTOW_STAKE_RATIO = 0.5;

  /** What a survived wager returns, as a multiple of the stake. */
  const UNDERTOW_RETURN_MULTIPLE = 2.5;

  /**
   * Reversals per second above which the section is being fought rather than
   * ridden. Measured against MONAS's own coherence model, where a reversal is the
   * event that costs coherence in ordinary play.
   */
  const UNDERTOW_THRASH_PER_SECOND = 3.2;

  // --- the Caduceus -----------------------------------------------------------

  const CADUCEUS_FRAMES = 360;
  const MIN_NODES = 6;
  const MAX_NODES = 12;

  /** Points for a node caught with no glide behind it. */
  const BASE_NODE_VALUE = 20;

  /**
   * The multiplier a perfectly smooth section earns on top of the base.
   *
   * The reward is `base * (1 + smoothness * CADUCEUS_GLIDE_MULTIPLE)`, so a
   * thrashed clear pays the base and a clean one pays 3.5x it. That ratio is what
   * makes gliding the point rather than a bonus.
   */
  const CADUCEUS_GLIDE_MULTIPLE = 2.5;

  /**
   * Paid once, on catching every node, scaled the same way by smoothness.
   *
   * Deliberately smaller than the nodes it completes. The first tuning set this at
   * 240 and the unit test caught what that did: a thrashed full clear paid 360
   * against 350 for a smooth near-clear, so the optimal line was to dart at every
   * node and take the completion anyway - which makes a section built to reward
   * gliding reward the opposite. At 120 the completion is still roughly half a
   * clean clear's total and worth chasing, but it can no longer buy its way past
   * the smoothness the rest of the section is scored on.
   */
  const CADUCEUS_COMPLETION_BASE = 120;

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function whole(value, fallback = 0) {
    return Math.max(0, Math.floor(finite(value, fallback)));
  }

  function clamp(value, minimum, maximum) {
    const resolved = finite(value, minimum);
    if (resolved < minimum) return minimum;
    if (resolved > maximum) return maximum;
    return resolved;
  }

  /**
   * Smoothness in 0..1 from reversals observed over frames elapsed.
   *
   * Clamped at both ends and defined at zero frames, because it drives both a
   * payout and a draw call: a NaN here would either pay nothing or pay everything,
   * and both are worse than a defined 1.0 for a section that has not started.
   */
  function smoothnessOf(reversals, frames) {
    const elapsed = whole(frames, 0);
    if (elapsed <= 0) return 1;
    const perSecond = (whole(reversals, 0) / elapsed) * 60;
    return clamp(1 - (perSecond / UNDERTOW_THRASH_PER_SECOND), 0, 1);
  }

  // --- Undertow ---------------------------------------------------------------

  function undertowStake(banked) {
    const bank = Math.max(0, finite(banked, 0));
    return Math.round(bank * UNDERTOW_STAKE_RATIO * 10) / 10;
  }

  /**
   * @param {number} gnosis  the bank to stake half of.
   * @param {number} [frames] how long the current runs. M44: the owner asked for
   *   sections that start short and lengthen as a run goes on, so the duration is
   *   the caller's to decide. Defaults to the shipped length, which keeps every
   *   existing caller and unit test on exactly the behaviour they were written
   *   against.
   */
  function createUndertow(gnosis = 0, frames = UNDERTOW_FRAMES) {
    const stake = undertowStake(gnosis);
    const length = Math.max(1, Math.floor(Number.isFinite(frames) ? frames : UNDERTOW_FRAMES));
    return {
      framesRemaining: length,
      // Held so a caller - and the closing-in vignette - can ask how far through
      // the wager the run is. `framesRemaining` alone cannot say that once the
      // length stopped being a constant.
      totalFrames: length,
      framesElapsed: 0,
      reversals: 0,
      stake,
      settled: false,
      survived: false,
      returned: 0
    };
  }

  /**
   * Advance one frame. `reversed` is the same signal MONAS's coherence already
   * watches — a change in the sign of vertical velocity.
   */
  function tickUndertow(state, reversed = false) {
    if (!state || state.settled) return state;
    state.framesElapsed += 1;
    state.framesRemaining = Math.max(0, state.framesRemaining - 1);
    if (reversed) state.reversals += 1;
    return state;
  }

  function undertowSmoothness(state) {
    if (!state) return 0;
    return smoothnessOf(state.reversals, state.framesElapsed);
  }

  function isUndertowOver(state) {
    return Boolean(state) && state.framesRemaining <= 0;
  }

  /**
   * Settle the wager, once.
   *
   * Survival is `smoothness > 0`, which is to say the player was not thrashing at
   * or beyond the threshold for the whole section. The return scales with how far
   * above that they were, so riding it cleanly is worth more than scraping it -
   * a binary payout would make the smooth line and the barely-adequate line the
   * same choice.
   */
  function settleUndertow(state) {
    if (!state || state.settled) return { settled: false, returned: 0, survived: Boolean(state?.survived) };
    state.settled = true;
    const smoothness = undertowSmoothness(state);
    state.survived = smoothness > 0;
    state.returned = state.survived
      ? Math.round(state.stake * UNDERTOW_RETURN_MULTIPLE * smoothness * 10) / 10
      : 0;
    return { settled: true, returned: state.returned, survived: state.survived, smoothness };
  }

  // --- Caduceus ---------------------------------------------------------------

  function nodeCountForBand(bandIndex) {
    return clamp(MIN_NODES + whole(bandIndex, 0), MIN_NODES, MAX_NODES);
  }

  function createCaduceus(bandIndex = 0) {
    return {
      framesRemaining: CADUCEUS_FRAMES,
      framesElapsed: 0,
      reversals: 0,
      total: nodeCountForBand(bandIndex),
      spawned: 0,
      caught: 0,
      missed: 0,
      score: 0,
      completionClaimed: false
    };
  }

  function tickCaduceus(state, reversed = false) {
    if (!state) return state;
    state.framesElapsed += 1;
    state.framesRemaining = Math.max(0, state.framesRemaining - 1);
    if (reversed) state.reversals += 1;
    return state;
  }

  function caduceusSmoothness(state) {
    if (!state) return 0;
    return smoothnessOf(state.reversals, state.framesElapsed);
  }

  /**
   * Which strand the next node belongs to.
   *
   * Strictly alternating rather than random: the two strands are supposed to read
   * as a braid the player can anticipate, and a random side would make the smooth
   * line unknowable in advance, which is the opposite of what this section asks
   * for.
   */
  function strandFor(index) {
    return whole(index, 0) % 2 === 0 ? 'left' : 'right';
  }

  function nodeValue(smoothness) {
    const lift = 1 + (clamp(smoothness, 0, 1) * CADUCEUS_GLIDE_MULTIPLE);
    return Math.round(BASE_NODE_VALUE * lift);
  }

  function catchNode(state) {
    if (!state) return { awarded: 0, caught: 0 };
    const smoothness = caduceusSmoothness(state);
    const awarded = nodeValue(smoothness);
    state.caught += 1;
    state.score += awarded;
    return { awarded, caught: state.caught, smoothness };
  }

  function missNode(state) {
    if (!state) return { missed: 0 };
    state.missed += 1;
    return { missed: state.missed };
  }

  function isCaduceusCleared(state) {
    return Boolean(state) && state.total > 0 && state.caught >= state.total;
  }

  /**
   * The completion bonus, once and only once.
   *
   * `completionClaimed` is checked and set here rather than by the caller for the
   * same reason `void-constellation.js` does it: the clearing frame can be
   * observed twice - once by the catch that completed it and once by the section's
   * own end - and a caller-side guard has to be right in both places.
   */
  function claimCaduceusCompletion(state) {
    if (!state || state.completionClaimed || !isCaduceusCleared(state)) return 0;
    state.completionClaimed = true;
    const smoothness = caduceusSmoothness(state);
    const awarded = Math.round(CADUCEUS_COMPLETION_BASE * (1 + (smoothness * CADUCEUS_GLIDE_MULTIPLE)));
    state.score += awarded;
    return awarded;
  }

  function describe(state) {
    if (!state) return null;
    return {
      framesRemaining: state.framesRemaining,
      framesElapsed: state.framesElapsed,
      smoothness: caduceusSmoothness(state),
      total: state.total,
      caught: state.caught,
      missed: state.missed,
      score: state.score,
      cleared: isCaduceusCleared(state)
    };
  }

  return Object.freeze({
    VERSION,
    UNDERTOW_FRAMES,
    UNDERTOW_STAKE_RATIO,
    UNDERTOW_RETURN_MULTIPLE,
    UNDERTOW_THRASH_PER_SECOND,
    CADUCEUS_FRAMES,
    MIN_NODES,
    MAX_NODES,
    BASE_NODE_VALUE,
    CADUCEUS_GLIDE_MULTIPLE,
    CADUCEUS_COMPLETION_BASE,
    smoothnessOf,
    undertowStake,
    createUndertow,
    tickUndertow,
    undertowSmoothness,
    isUndertowOver,
    settleUndertow,
    nodeCountForBand,
    createCaduceus,
    tickCaduceus,
    caduceusSmoothness,
    strandFor,
    nodeValue,
    catchNode,
    missNode,
    isCaduceusCleared,
    claimCaduceusCompletion,
    describe
  });
});
