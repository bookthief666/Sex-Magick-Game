'use strict';

/**
 * The edge economy, without a ladder attached.
 *
 * Gnosis is banked by clearing a wall through the top or bottom third of its
 * corridor rather than down the middle: risk pays, timidity decays, and a run of
 * consecutive edged clears pays a precision bonus on top. None of that reasoning
 * involves gates, bands, or which rite is being played - it needs a classified
 * clear and the player's current bank, and nothing else.
 *
 * It lived inside `applyGateClearState` anyway, welded to HEX's ladder: that
 * function increments `gatesCleared` and recomputes `bandIndex` from *HEX's*
 * `BANDS` in the same breath as it awards Gnosis. M42 gives MONAS the same edge
 * meter, and calling that function from MONAS would have stamped HEX's band
 * thresholds onto a rite with its own six-band ladder - which is D-072's mistake
 * in miniature, and the sort of thing that reads as a progression bug months
 * later.
 *
 * The alternative was a second copy of the rules in `monas-runtime.js`. D-044
 * argued that case already and the argument holds here: one copy of a scoring
 * rule, or the two drift, silently, in whichever direction nobody is watching.
 * So the economy moves here and both rites call it. `applyGateClearState`
 * delegates and keeps its own ladder bookkeeping, which is why the existing Gate
 * slice contracts pass unchanged - that is the evidence the extraction preserved
 * behaviour rather than an assertion that it did.
 */
(function attachSexMagickGnosisEdge(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickGnosisEdge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGnosisEdgeApi(_root) {
  'use strict';

  const VERSION = 1;

  /** Consecutive non-risk clears that cost the player a point of Gnosis. */
  const TIMID_DECAY_AFTER = 3;

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function whole(value, fallback = 0) {
    return Math.max(0, Math.floor(finite(value, fallback)));
  }

  /** Gnosis is carried at half-point resolution, so it must be rounded like one. */
  function roundHalf(value) {
    return Math.round(finite(value, 0) * 2) / 2;
  }

  /**
   * What an edged clear is worth, by the family of wall it was taken through.
   *
   * A climax wall edged is worth four times a safe one, which is what stops the
   * meter filling fastest during the easiest stretch of a run.
   */
  function familyWeight(family) {
    switch (String(family || '').toLowerCase()) {
      case 'climax': return 2;
      case 'pressure': return 1;
      case 'safe':
      case 'recovery':
      default: return 0.5;
    }
  }

  function streakBonus(streak) {
    const resolved = whole(streak, 0);
    if (resolved >= 7) return 2;
    if (resolved >= 3) return 1;
    return 0;
  }

  /**
   * Apply one cleared wall to an edge bank.
   *
   * `edge` is `{ gnosis, gnosisCapacity, riskStreak, timidGates }` and is not
   * mutated; the updated bank is returned alongside what happened, so a caller
   * can score, announce and record from one result rather than diffing state.
   *
   * `riskActive` is the band's, not the rite's: bands that have not opened their
   * risk zones neither pay for an edge nor punish the middle, which is what makes
   * the early game teachable.
   */
  function applyEdgeClear(edge, options = {}) {
    const classification = options.classification || {};
    const family = String(options.family || 'safe').toLowerCase();
    const riskActive = options.riskActive !== false;
    const nearMissThreshold = Math.max(0, finite(options.nearMissThreshold, 0));

    const capacity = Math.max(0, finite(edge?.gnosisCapacity, 0));
    const next = {
      gnosis: Math.max(0, finite(edge?.gnosis, 0)),
      gnosisCapacity: capacity,
      riskStreak: whole(edge?.riskStreak, 0),
      timidGates: whole(edge?.timidGates, 0)
    };

    const zone = String(classification.zone || '');
    const isRisk = riskActive && (zone === 'risk-top' || zone === 'risk-bottom');
    const clearance = finite(classification.minimumClearance, Number.POSITIVE_INFINITY);
    const isNearMiss = clearance >= 0 && clearance < nearMissThreshold;

    let gnosisGained = 0;
    let gnosisDecayed = 0;
    let bonusScore = 0;
    let precisionBonus = 0;

    if (isRisk) {
      gnosisGained = familyWeight(family);
      next.gnosis = roundHalf(Math.min(next.gnosisCapacity, next.gnosis + gnosisGained));
      next.riskStreak += 1;
      next.timidGates = 0;
      bonusScore += 2;
      precisionBonus = streakBonus(next.riskStreak);
      bonusScore += precisionBonus;
    } else {
      next.riskStreak = 0;
      if (riskActive) {
        next.timidGates += 1;
        if (next.timidGates >= TIMID_DECAY_AFTER && next.gnosis > 0) {
          gnosisDecayed = Math.min(1, next.gnosis);
          next.gnosis = roundHalf(Math.max(0, next.gnosis - gnosisDecayed));
          next.timidGates = 0;
        }
      }
    }

    if (isNearMiss) bonusScore += 1;

    return {
      edge: next,
      zone,
      family,
      riskActive,
      isRisk,
      gnosisGained,
      gnosisDecayed,
      precisionBonus,
      nearMiss: isNearMiss,
      bonusScore,
      full: next.gnosisCapacity > 0 && next.gnosis >= next.gnosisCapacity
    };
  }

  return Object.freeze({
    VERSION,
    TIMID_DECAY_AFTER,
    roundHalf,
    familyWeight,
    streakBonus,
    applyEdgeClear
  });
});
