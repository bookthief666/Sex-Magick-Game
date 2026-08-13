/**
 * The Rite board — a local, verified record of the player's own runs.
 *
 * The 1.0 board submitted an arbitrary integer to a shared hosted service with no
 * server-side validation, which D-004 ruled untrusted, and the Gate slice has
 * stubbed submission to local-only ever since. This module gives the owner a board
 * that works today without resolving that: it ranks the runs already stored in
 * `sex_magick_gate_slice_v1` by the thing 2.0 actually measures — gates cleared —
 * and shows which of them are internally consistent.
 *
 * It performs no network I/O of any kind, by design and not by omission, and
 * `test-leaderboard-runtime.js` asserts that against this file's own source.
 * Enabling shared submission is an owner decision with prerequisites that are not
 * mine to make; D-040 records them.
 *
 * On verification, plainly: these checks establish that a run is *self-consistent*,
 * which catches corruption and casual editing of stored JSON. They are not security.
 * Anything running in the player's own browser can produce a consistent forgery, so
 * a verified mark here must never be read as proof against a determined cheat. That
 * needs server-side validation, which a guest session on the 1.0 service does not
 * provide.
 */
(function attachSexMagickRiteBoard(root) {
  'use strict';

  const BOARD_VERSION = 1;
  const BOARD_SIZE = 5;
  const INSTALL_TIMEOUT_MS = 12_000;

  // Mirrors the Gate slice's own thresholds. Read from the slice when it is
  // present so the two can never drift; these are the fallback for pure use.
  const FALLBACK_BANDS = Object.freeze([
    'MALKUTH', 'YESOD', 'TIPHARETH', 'GEBURAH', 'CHESED', 'BINAH', 'CHOKMAH', 'KETHER'
  ]);
  const FALLBACK_THRESHOLDS = Object.freeze([0, 6, 16, 32, 48, 68, 92, 120]);

  let installed = false;
  let installTimer = null;

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function bandIndexFor(gatesCleared, thresholds) {
    let index = 0;
    for (let i = 0; i < thresholds.length; i += 1) {
      if (gatesCleared >= thresholds[i]) index = i;
    }
    return index;
  }

  function parseTime(value) {
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Is this run internally consistent?
   *
   * Every rule compares one recorded field against another recorded field, so a
   * run is judged only against itself. Nothing here trusts a single number in
   * isolation, because a single number is exactly what is easy to edit.
   */
  function validateRun(summary, options = {}) {
    const thresholds = options.thresholds || FALLBACK_THRESHOLDS;
    const reasons = [];

    if (!summary || typeof summary !== 'object') {
      return { valid: false, reasons: ['run is not an object'] };
    }

    const gates = summary.gatesCleared;
    if (!Number.isInteger(gates) || gates < 0) reasons.push('gatesCleared is not a whole count');

    const offers = summary.gateOffers;
    const entries = summary.gateEntries;
    const banks = summary.gateBanks;
    for (const [label, value] of [['gateOffers', offers], ['gateEntries', entries], ['gateBanks', banks]]) {
      if (!Number.isInteger(value) || value < 0) reasons.push(`${label} is not a whole count`);
    }
    if (Number.isInteger(offers) && Number.isInteger(entries) && Number.isInteger(banks)) {
      // A Gate can be entered or banked, and an offer can also simply expire, so
      // the two decisions may not exceed the offers that were actually made.
      if (entries + banks > offers) reasons.push('more Gate decisions than Gate offers');
    }

    const attempts = summary.voidAttempts;
    const survivals = summary.voidSurvivals;
    const deaths = summary.voidDeaths;
    if ([attempts, survivals, deaths].every(value => Number.isInteger(value) && value >= 0)) {
      if (survivals + deaths > attempts) reasons.push('more Void outcomes than Void attempts');
      if (Number.isInteger(entries) && attempts > entries) reasons.push('more Void attempts than Gate entries');
    } else {
      reasons.push('Void counters are not whole counts');
    }

    if (Number.isInteger(gates) && gates >= 0) {
      const expected = bandIndexFor(gates, thresholds);
      if (summary.bandIndex !== expected) {
        reasons.push(`band ${summary.bandIndex} does not match ${gates} gates (expected ${expected})`);
      }
    }

    if (isFiniteNumber(summary.gnosis) && isFiniteNumber(summary.gnosisCapacity)) {
      if (summary.gnosis < 0 || summary.gnosis > summary.gnosisCapacity) reasons.push('gnosis outside its capacity');
    }

    const started = parseTime(summary.startedAt);
    const ended = parseTime(summary.endedAt);
    if (started === null || ended === null) {
      reasons.push('run has no readable start and end time');
    } else {
      const durationMs = ended - started;
      if (durationMs <= 0) reasons.push('run ended before it started');
      // Gates arrive on a spawn interval, so a run cannot clear them arbitrarily
      // fast. The floor is generous - the owner's fastest measured pace is about
      // one gate per 1.6s - and exists to catch a fabricated total, not to judge play.
      else if (Number.isInteger(gates) && gates > 0) {
        const msPerGate = durationMs / gates;
        if (msPerGate < (options.minMsPerGate ?? 400)) {
          reasons.push(`${gates} gates in ${Math.round(durationMs / 100) / 10}s is faster than the spawn rate allows`);
        }
      }
    }

    if (summary.rite !== 'HEX') reasons.push('run is not a Rite of Hexagram run');

    return { valid: reasons.length === 0, reasons };
  }

  /**
   * Rank runs by what 2.0 measures. Gates first, then the deeper band, then score,
   * then the earlier run - so a tie is broken in favour of whoever got there first.
   */
  function rankRuns(history, options = {}) {
    const list = Array.isArray(history) ? history : [];
    const limit = options.limit ?? BOARD_SIZE;

    const scored = list.map(summary => {
      const verdict = validateRun(summary, options);
      return {
        runId: summary?.runId ?? null,
        gatesCleared: Number.isInteger(summary?.gatesCleared) ? summary.gatesCleared : 0,
        bandIndex: Number.isInteger(summary?.bandIndex) ? summary.bandIndex : 0,
        bandName: (options.bandNames || FALLBACK_BANDS)[summary?.bandIndex] || '—',
        score: isFiniteNumber(summary?.finalScore) ? summary.finalScore : 0,
        endedAt: typeof summary?.endedAt === 'string' ? summary.endedAt : null,
        endReason: typeof summary?.endReason === 'string' ? summary.endReason : null,
        verified: verdict.valid,
        reasons: verdict.reasons
      };
    });

    const verified = scored.filter(entry => entry.verified);
    verified.sort((a, b) => {
      if (b.gatesCleared !== a.gatesCleared) return b.gatesCleared - a.gatesCleared;
      if (b.bandIndex !== a.bandIndex) return b.bandIndex - a.bandIndex;
      if (b.score !== a.score) return b.score - a.score;
      return (parseTime(a.endedAt) ?? 0) - (parseTime(b.endedAt) ?? 0);
    });

    return {
      entries: verified.slice(0, limit).map((entry, index) => ({ ...entry, rank: index + 1 })),
      totalRuns: scored.length,
      verifiedRuns: verified.length,
      rejected: scored.filter(entry => !entry.verified)
    };
  }

  function formatDate(iso) {
    const time = parseTime(iso);
    if (time === null) return '';
    const date = new Date(time);
    const pad = value => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function visualQaActive() {
    try {
      return new URLSearchParams(root.location?.search || '').get('visualQa') === '1';
    } catch (_error) {
      return false;
    }
  }

  function readHistory() {
    try {
      const slice = root.__SEX_MAGICK_GATE_SLICE__;
      if (typeof slice?.getHistory === 'function') return slice.getHistory();
    } catch (_error) {}
    return [];
  }

  function sliceOptions() {
    try {
      const fingerprint = root.__SEX_MAGICK_GATE_SLICE__?.getFingerprint?.();
      if (fingerprint?.bandNames?.length) return { bandNames: fingerprint.bandNames };
    } catch (_error) {}
    return {};
  }

  function render() {
    const list = document.getElementById('leaderboardList');
    if (!list) return null;

    // The visual QA suite asserts this exact text and treats any live content as a
    // determinism hazard. The board is deliberately inert under that flag.
    if (visualQaActive()) return null;

    const container = document.querySelector('.leaderboard-container');
    const title = document.querySelector('.leaderboard-title');
    if (container) container.hidden = false;
    if (title) title.textContent = ':: THE RITE BOARD ::';

    const board = rankRuns(readHistory(), sliceOptions());

    if (board.entries.length === 0) {
      list.textContent = board.totalRuns > 0
        ? 'NO VERIFIED RUNS YET'
        : 'NO RUNS YET · WALK THE GATE';
      return board;
    }

    list.innerHTML = board.entries.map(entry => `
      <div class="leaderboard-row ${entry.rank === 1 ? 'rank-1' : ''}">
        <span>#${entry.rank} ${escapeHtml(entry.bandName)}</span>
        <span>${entry.gatesCleared} GATES · ${escapeHtml(formatDate(entry.endedAt))}</span>
      </div>
    `).join('');

    return board;
  }

  function dependenciesReady() {
    return typeof document !== 'undefined' && Boolean(document.getElementById('leaderboardList'));
  }

  /**
   * A run only reaches the history when it ends, so the board has to redraw on the
   * way back to the menu or the player's newest run is missing from it until reload.
   */
  function installMenuRefresh() {
    try {
      if (typeof Game === 'undefined' || !Game?.prototype || Game.prototype.__riteBoardInstalled) return;
      const originalReturnToMenu = Game.prototype.returnToMenu;
      if (typeof originalReturnToMenu !== 'function') return;
      Game.prototype.returnToMenu = function riteBoardReturnToMenu(...args) {
        const result = originalReturnToMenu.apply(this, args);
        try { render(); } catch (_error) {}
        return result;
      };
      Game.prototype.__riteBoardInstalled = true;
    } catch (_error) {}
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_RITE_BOARD__;
    if (!dependenciesReady()) return null;
    installed = true;

    root.__SEX_MAGICK_RITE_BOARD__ = Object.freeze({
      mode: 'local-verified-rite-board',
      version: BOARD_VERSION,
      networkSubmission: false,
      boardSize: BOARD_SIZE,
      validateRun,
      rankRuns,
      render,
      getBoard() {
        return rankRuns(readHistory(), sliceOptions());
      }
    });

    installMenuRefresh();
    render();
    return root.__SEX_MAGICK_RITE_BOARD__;
  }

  function scheduleInstall(timeoutMs = INSTALL_TIMEOUT_MS) {
    if (installed || installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  const api = Object.freeze({
    BOARD_VERSION,
    BOARD_SIZE,
    FALLBACK_BANDS,
    FALLBACK_THRESHOLDS,
    validateRun,
    rankRuns,
    bandIndexFor,
    render,
    install,
    scheduleInstall
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SexMagickRiteBoard = api;

  if (typeof document !== 'undefined') scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);
