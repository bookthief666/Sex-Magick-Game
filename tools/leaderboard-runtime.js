/**
 * The Rite board — a local, verified record of the player's own runs.
 *
 * The 1.0 board submitted an arbitrary integer to a shared hosted service with no
 * server-side validation, which D-004 ruled untrusted. This module ranks the runs
 * already stored by the two 2.0 rite recorders and shows which of them are
 * internally consistent. HEX and MONAS remain separate categories because they run
 * different ladders and measure different play.
 *
 * It performs no network I/O of any kind, by design and not by omission, and
 * `test-leaderboard-runtime.js` asserts that against this file's own source. Shared
 * submission lives in `global-board-runtime.js`; the local board remains useful
 * offline and remains incapable of phoning anywhere.
 *
 * On verification, plainly: these checks establish that a run is *self-consistent*,
 * which catches corruption and casual editing of stored JSON. They are not security.
 * Anything running in the player's own browser can produce a consistent forgery, so
 * a verified mark here must never be read as proof against a determined cheat.
 */
(function attachSexMagickRiteBoard(root) {
  'use strict';

  const BOARD_VERSION = 1;
  const INSTALL_TIMEOUT_MS = 12_000;

  /**
   * The rules themselves live in `rite-validation.js`, because the global board
   * validates on the edge and both sides must run the same copy. Resolved rather
   * than imported at module scope so plain-script load order remains free.
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
  const FALLBACK_THRESHOLDS = core ? core.FALLBACK_THRESHOLDS : Object.freeze([0, 9, 22, 40, 62, 88, 118, 152]);
  const MONAS_BANDS = core ? core.MONAS_BANDS : Object.freeze([
    'STILL', 'CURRENT-I', 'CURRENT-II', 'AXIS', 'ORBIT', 'CROWN', 'ASCENT', 'TORRENT', 'MAELSTROM'
  ]);

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

  function readHistory(rite = 'HEX') {
    try {
      if (rite === 'MONAS') {
        const monas = root.__SEX_MAGICK_MONAS__;
        if (typeof monas?.getHistory === 'function') return monas.getHistory();
        return [];
      }
      const slice = root.__SEX_MAGICK_GATE_SLICE__;
      if (typeof slice?.getHistory === 'function') return slice.getHistory();
    } catch (_error) {}
    return [];
  }

  /**
   * The menu has one compact board surface, so show the rite the player most
   * recently completed. This keeps the categories separate without doubling the
   * Fold layout. On a fresh install with no history, HEX remains the initial view.
   */
  function newestCompletedRite() {
    const candidates = [];
    for (const rite of ['HEX', 'MONAS']) {
      const history = readHistory(rite);
      if (Array.isArray(history) && history[0]) candidates.push({ rite, run: history[0] });
    }
    if (candidates.length === 0) return 'HEX';
    candidates.sort((a, b) => (parseTime(b.run?.endedAt) ?? 0) - (parseTime(a.run?.endedAt) ?? 0));
    return candidates[0].rite;
  }

  function boardOptions(rite) {
    if (rite === 'MONAS') return { rite: 'MONAS', bandNames: MONAS_BANDS };
    try {
      const fingerprint = root.__SEX_MAGICK_GATE_SLICE__?.getFingerprint?.();
      if (fingerprint?.bandNames?.length) {
        return { rite: 'HEX', bandNames: fingerprint.bandNames };
      }
    } catch (_error) {}
    return { rite: 'HEX', bandNames: FALLBACK_BANDS };
  }

  function render(requestedRite = null) {
    const list = document.getElementById('leaderboardList');
    if (!list) return null;

    // The visual QA suite asserts this surface and treats live content as a
    // determinism hazard. The board is deliberately inert under that flag.
    if (visualQaActive()) return null;

    const rite = requestedRite === 'MONAS' ? 'MONAS'
      : requestedRite === 'HEX' ? 'HEX'
      : newestCompletedRite();
    const container = document.querySelector('.leaderboard-container');
    const title = document.querySelector('.leaderboard-title');
    if (container) container.hidden = false;
    if (title) title.textContent = `:: THE RITE BOARD · ${rite} ::`;

    const board = rankRuns(readHistory(rite), boardOptions(rite));

    if (board.entries.length === 0) {
      list.textContent = board.totalRuns > 0
        ? `NO VERIFIED ${rite} RUNS YET`
        : rite === 'MONAS'
          ? 'NO MONAS RUNS YET · HOLD THE CURRENT'
          : 'NO HEX RUNS YET · WALK THE GATE';
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
   * A recorder can sit outside this wrapper in the prototype chain. Render on the
   * next task after returning to menu so whichever rite just ended has committed
   * its summary before we choose the most recent history.
   */
  function installMenuRefresh() {
    try {
      if (typeof Game === 'undefined' || !Game?.prototype || Game.prototype.__riteBoardInstalled) return;
      const originalReturnToMenu = Game.prototype.returnToMenu;
      if (typeof originalReturnToMenu !== 'function') return;
      Game.prototype.returnToMenu = function riteBoardReturnToMenu(...args) {
        const result = originalReturnToMenu.apply(this, args);
        setTimeout(() => {
          try { render(); } catch (_error) {}
        }, 0);
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
      getActiveRite: newestCompletedRite,
      getBoard(rite = newestCompletedRite()) {
        const resolved = rite === 'MONAS' ? 'MONAS' : 'HEX';
        return rankRuns(readHistory(resolved), boardOptions(resolved));
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
    MONAS_BANDS,
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
