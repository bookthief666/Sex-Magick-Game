'use strict';

/**
 * The single transient-notice slot.
 *
 * Four independent runtimes each raise short-lived messages at the player -
 * the gate telegraph, the ritual-ascent banner, the missions toast and the
 * power-up toast. Until D-065 each of them owned its own screen position, and
 * every attempt to keep them out of the play field had to reason about all four
 * at once. Four consecutive attempts (D-060, D-062, D-063, D-064) failed that
 * way: each fixed one element against one reference point, and each time a
 * different mechanism put text back across the corridor. D-064's approach -
 * stacking them upward so they cleared one another - was actively
 * self-defeating, since 304px above the bottom of a 643px viewport *is* the
 * middle of the screen.
 *
 * This module removes the class of bug rather than re-tuning it. Every notice
 * renders at the same low offset, and `claim()` guarantees only one is visible
 * at a time. A single line of text at a small fixed offset cannot migrate into
 * the corridor on any viewport, because its position no longer depends on what
 * else might be showing.
 *
 * Deliberately id-based rather than element-based: the runtimes build their
 * notices lazily and can rebuild them (see each `ensureHud()`), so holding
 * element references here would go stale. Ids are stable for the page's life.
 */
(function attachSexMagickNoticeSlot(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickNoticeSlot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNoticeSlotApi(root) {
  'use strict';

  const VERSION = 1;

  // Insertion-ordered and de-duplicated, so a runtime that re-registers after
  // rebuilding its DOM does not accumulate entries.
  const registered = new Set();

  function register(id) {
    const key = String(id || '').trim();
    if (!key) return false;
    registered.add(key);
    return true;
  }

  /**
   * Hide every registered notice except `keepId`. Called immediately before a
   * runtime reveals its own notice, so the slot holds exactly one message.
   *
   * Never throws: a notice failing to hide must not take down the gameplay path
   * that was trying to announce something. A missing element is normal - the
   * runtimes build their notices lazily, so a registered id may not exist yet.
   *
   * Returns the ids actually hidden, which is what the unit test asserts on.
   */
  function claim(keepId) {
    const keep = String(keepId || '').trim();
    const hidden = [];
    for (const id of registered) {
      if (id === keep) continue;
      try {
        const element = typeof document !== 'undefined' ? document.getElementById(id) : null;
        if (element && !element.hidden) {
          element.hidden = true;
          hidden.push(id);
        }
      } catch (_error) { /* a stubborn element is not worth a thrown announce */ }
    }
    return hidden;
  }

  function getRegistered() {
    return Array.from(registered);
  }

  /** Test seam only - the page itself never needs to forget a notice. */
  function resetForTest() {
    registered.clear();
  }

  /**
   * D-066: a build marker the page can be asked for directly.
   *
   * Five consecutive reports of "still broken" were investigated against the
   * repository's code while the owner's browser was running an older build -
   * the last three screenshots were all M39, two fixes behind. Reasoning about
   * a screenshot without knowing which build produced it wasted a lot of the
   * owner's time. `window.SexMagickNoticeSlot.buildMarker()` answers it in one
   * line from the device itself, with no git or server involved.
   */
  function buildMarker() {
    return 'M44 the ladder stops ending: HEX to 10.0, MONAS to 6.5, descent past the last band, orbs off the line';
  }

  return Object.freeze({
    VERSION,
    buildMarker,
    register,
    claim,
    getRegistered,
    resetForTest
  });
});
