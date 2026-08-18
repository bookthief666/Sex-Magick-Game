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
  const INSTALL_TIMEOUT_MS = 12_000;

  /**
   * The rules themselves live in `rite-validation.js`, because the global board
   * (D-044) validates on the edge and both sides must run the same copy - a second
   * copy in the Worker would drift the first time a threshold moved. This module
   * keeps its own public surface unchanged and delegates the judging.
   *
   * Resolved rather than imported at module scope so the load order of plain
   * `<script>` tags cannot matter: in the browser the validation module attaches to
   * the same global, in Node it is required.
   */
  function validation() {
    if (root.SexMagickRiteValidation) return root.SexMagickRiteValidation;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./rite-validation.js');
    }
    return null;
  }

  const core = validation();
  const BOARD_SIZE = core ? core.BOARD_SIZE : 5;
  const FALLBACK_BANDS = core ? core.FALLBACK_BANDS : Object.freeze([
    'MALKUTH', 'YESOD', 'TIPHARETH', 'GEBURAH', 'CHESED', 'BINAH', 'CHOKMAH', 'KETHER'
  ]);
  const FALLBACK_THRESHOLDS = core ? core.FALLBACK_THRESHOLDS : Object.freeze([0, 6, 16, 32, 48, 68, 92, 120]);

  let installed = false;
  let installTimer = null;

  function isFiniteNumber(value) {
    return validation().isFiniteNumber(value);
  }

  function bandIndexFor(gatesCleared, thresholds) {
    return validation().bandIndexFor(gatesCleared, thresholds);
  }

  function parseTime(value) {
    return validation().parseTime(value);
  }

  function validateRun(summary, options = {}) {
    return validation().validateRun(summary, options);
  }

  function rankRuns(history, options = {}) {
    return validation().rankRuns(history, options);
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
