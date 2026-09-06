/**
 * The global Rite board — the client half.
 *
 * ## Why this is a separate file
 *
 * `leaderboard-runtime.js` performs no network I/O, and
 * `test-leaderboard-runtime.js` asserts that against the module's own source,
 * pattern-matching for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` and
 * `lootlocker`. That guarantee is worth more than the convenience of one file: the
 * local Rite board is what every player gets, it works offline, and it should stay
 * provably incapable of phoning anywhere. So submission lives here instead, and the
 * local board keeps its invariant untouched.
 *
 * ## Activation
 *
 * The global board installs when a deployed board URL is configured. The
 * `?globalBoard=1` flag can still force it on for tests/previews and
 * `?globalBoard=0` remains the emergency off switch. With the board disabled this
 * module registers no hooks and issues no board requests.
 *
 * ## What submission claims
 *
 * The Worker re-judges every run with the same rules this page uses
 * (`rite-validation.js`), against a single-use token it issued, bounded by its own
 * clock and rate limited per identity. That closes what D-004 objected to - an
 * arbitrary integer accepted with no server-side check.
 *
 * It is **not** anti-cheat, and nothing here should say otherwise. A self-reported
 * summary is still a self-report. The board's own copy says "server-validated",
 * which is the true and narrower claim; see D-044.
 */
(function attachSexMagickGlobalBoard(root) {
  'use strict';

  const GLOBAL_BOARD_VERSION = 1;
  const REQUIRED_QUERY_VALUE = '1';
  const INSTALL_TIMEOUT_MS = 12_000;
  const REQUEST_TIMEOUT_MS = 8_000;

  // Live Worker. Overridable per-load by `?globalBoardUrl=`, which is how the
  // browser suite points at a local stub and how a preview deployment can be tried
  // without editing the file.
  const DEFAULT_BOARD_URL = 'https://sex-magick-rite-board.manuel-orrantia.workers.dev';

  let installed = false;
  let installTimer = null;
  let runToken = null;
  let runTokenRite = null;
  let lastSubmittedRunId = null;
  let lastResult = null;

  function queryValue(name) {
    try {
      return new URLSearchParams(root.location?.search || '').get(name);
    } catch (_error) {
      return null;
    }
  }

  /**
   * Whether the global board runs.
   *
   * It is on when a board URL is configured, because that is the condition that
   * actually matters: a shared board cannot precede its own server.
   *
   * The flag survives as an override in both directions. `?globalBoard=1` forces
   * it on, which is how the browser suite drives a local stub through
   * `?globalBoardUrl=`; `?globalBoard=0` forces it off, which is the fastest way to
   * take the board out of a live build without changing the Worker.
   */
  function queryEnabled() {
    const flag = queryValue('globalBoard');
    if (flag === REQUIRED_QUERY_VALUE) return true;
    if (flag === '0') return false;
    return Boolean(boardUrl());
  }

  function boardUrl() {
    const override = queryValue('globalBoardUrl');
    const base = override || DEFAULT_BOARD_URL;
    return typeof base === 'string' ? base.replace(/\/+$/, '') : '';
  }

  function visualQaActive() {
    return queryValue('visualQa') === '1';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  /**
   * Every request goes through here so that a Worker that is slow, down, or simply
   * unavailable can never hang the menu or throw into a game hook. A failed global
   * board degrades to the local one, which is always present.
   */
  async function request(path, options = {}) {
    const base = boardUrl();
    if (!base) return { ok: false, error: 'no board url configured' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}${path}`, { ...options, signal: controller.signal });
      const body = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    } finally {
      clearTimeout(timer);
    }
  }

  function playerName() {
    try {
      return root.localStorage?.getItem('sex_magick_board_name') || 'ANON';
    } catch (_error) {
      return 'ANON';
    }
  }

  /**
   * Ask for a token at run start. The Worker times the run from this call, so it
   * must happen when play begins rather than when it ends - a token minted at
   * submission time would prove nothing about how long the run took.
   */
  async function beginRun(rite = 'HEX') {
    const resolvedRite = rite === 'MONAS' ? 'MONAS' : 'HEX';
    runToken = null;
    runTokenRite = resolvedRite;
    const result = await request('/run/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rite: resolvedRite })
    });
    if (result.ok && result.body?.token) runToken = result.body.token;
    else runTokenRite = null;
    return runToken;
  }

  /**
   * The newest finished run. When a token rite is known, restrict the lookup to
   * that rite so a stale run from the other history can never be paired with the
   * current token while lifecycle wrappers are settling.
   */
  function newestRun(rite = null) {
    const candidates = [];
    try {
      const hex = root.__SEX_MAGICK_GATE_SLICE__?.getHistory?.();
      if ((!rite || rite === 'HEX') && Array.isArray(hex) && hex.length > 0) candidates.push(hex[0]);
    } catch (_error) { /* a rite that is not installed simply has no runs */ }
    try {
      const monas = root.__SEX_MAGICK_MONAS__?.getHistory?.();
      if ((!rite || rite === 'MONAS') && Array.isArray(monas) && monas.length > 0) candidates.push(monas[0]);
    } catch (_error) {}

    if (candidates.length === 0) return null;
    return candidates.reduce((newest, entry) => {
      const a = Date.parse(newest?.endedAt || '') || 0;
      const b = Date.parse(entry?.endedAt || '') || 0;
      return b > a ? entry : newest;
    });
  }

  /**
   * Submit the run that just ended, if there is one and it has not already gone up.
   * Guarding on runId matters because death, retry and returning to the menu can all
   * finish the same run through different wrappers.
   */
  async function submitNewestRun() {
    const summary = newestRun(runTokenRite);
    if (!summary || !summary.runId) return { skipped: 'no completed run' };
    if (summary.runId === lastSubmittedRunId) return { skipped: 'already submitted' };
    if (!runToken) return { skipped: 'no run token' };

    lastSubmittedRunId = summary.runId;
    const token = runToken;
    runToken = null;
    runTokenRite = null;

    const result = await request('/run/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, summary, name: playerName() })
    });

    lastResult = result.ok
      ? { accepted: true, rank: result.body?.rank ?? null, rite: summary.rite, runId: summary.runId }
      : {
          accepted: false,
          reasons: result.body?.reasons || [result.error || `HTTP ${result.status}`],
          rite: summary.rite,
          runId: summary.runId
        };
    return lastResult;
  }

  async function fetchBoard(rite = 'HEX') {
    const result = await request(`/board/${rite}`);
    return result.ok ? result.body : null;
  }

  /**
   * Render the global board beneath the local one, rather than replacing it. The
   * local board is the player's own verified history and works with no network;
   * this is an addition to it, and if the Worker is unreachable the player simply
   * still has their own board.
   */
  function renderInto(board) {
    const container = document.querySelector('.leaderboard-container');
    if (!container || visualQaActive()) return null;

    let section = document.getElementById('global-rite-board');
    if (!section) {
      section = document.createElement('div');
      section.id = 'global-rite-board';
      container.appendChild(section);
    }

    if (!board || !Array.isArray(board.entries) || board.entries.length === 0) {
      section.textContent = board ? 'GLOBAL BOARD EMPTY' : 'GLOBAL BOARD UNREACHABLE';
      return board;
    }

    const rows = board.entries.slice(0, 5).map((entry, index) => `
      <div class="leaderboard-row ${index === 0 ? 'rank-1' : ''}">
        <span>#${index + 1} ${escapeHtml(entry.name || 'ANON')}</span>
        <span>${Number(entry.gatesCleared) || 0} GATES</span>
      </div>
    `).join('');

    // The qualifier is not decoration. The Worker validates consistency and
    // controls the clock; it does not prove the run happened. Saying so here keeps
    // the UI honest about exactly what D-044 claims.
    section.innerHTML = `
      <div class="leaderboard-title">:: GLOBAL BOARD ::</div>
      ${rows}
      <div id="global-rite-board-note">SERVER-VALIDATED · NOT ANTI-CHEAT</div>
    `;
    return board;
  }

  async function refresh(rite = 'HEX') {
    return renderInto(await fetchBoard(rite));
  }

  /**
   * A run recorder can wrap `gameOver` either inside or outside this module. Queue
   * submission to the next task so every outer wrapper has had a chance to write
   * its finished summary first. This closes the real-device hole where MONAS could
   * finish and remain on GAME OVER without ever reaching the only old submission
   * hook (`returnToMenu`).
   */
  function queueCompletedRunSubmission() {
    setTimeout(() => {
      const completedRun = newestRun(runTokenRite);
      if (!completedRun?.runId || !completedRun?.endedAt) return;
      const completedRite = completedRun.rite === 'MONAS' ? 'MONAS' : 'HEX';
      submitNewestRun()
        .then(() => refresh(completedRite))
        .catch(() => {});
    }, 0);
  }

  function dependenciesReady() {
    return typeof document !== 'undefined'
      && typeof Game !== 'undefined'
      && Boolean(Game?.prototype)
      && Boolean(document.querySelector('.leaderboard-container'));
  }

  function installHooks() {
    if (Game.prototype.__globalBoardInstalled) return;

    const originalStartGame = Game.prototype.startGame;
    const originalGameOver = Game.prototype.gameOver;
    const originalReturnToMenu = Game.prototype.returnToMenu;

    Game.prototype.startGame = function globalBoardStartGame(...args) {
      const result = originalStartGame.apply(this, args);
      // Fire and forget: the token request must never delay the first frame, and a
      // run that starts without one simply does not submit.
      try { beginRun(this.gameMode === 'MONAS' ? 'MONAS' : 'HEX'); } catch (_error) {}
      return result;
    };

    if (typeof originalGameOver === 'function') {
      Game.prototype.gameOver = function globalBoardGameOver(...args) {
        const result = originalGameOver.apply(this, args);
        queueCompletedRunSubmission();
        return result;
      };
    }

    Game.prototype.returnToMenu = function globalBoardReturnToMenu(...args) {
      const result = originalReturnToMenu.apply(this, args);
      // Menu is still a submission seam for runs ended without `gameOver`. The
      // helper also refreshes the same rite that was submitted, so a MONAS player
      // never lands on the HEX global board merely because the menu is generic.
      queueCompletedRunSubmission();
      return result;
    };

    Game.prototype.__globalBoardInstalled = true;
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_GLOBAL_BOARD__;
    if (!queryEnabled()) return null;
    if (!dependenciesReady()) return null;
    installed = true;

    installHooks();

    // The Gate slice preflight sets this line to "GATE SLICE — LOCAL ONLY" before
    // anything else runs, which is true right up until this module installs. It is
    // corrected here rather than there because this is the only code that knows the
    // global board is actually in play.
    try {
      const status = document.getElementById('uploadStatus');
      if (status && !visualQaActive()) status.textContent = 'GLOBAL BOARD — SERVER-VALIDATED';
    } catch (_error) {}

    refresh().catch(() => {});

    root.__SEX_MAGICK_GLOBAL_BOARD__ = Object.freeze({
      version: GLOBAL_BOARD_VERSION,
      mode: 'server-validated-global-board',
      boardUrl: boardUrl(),
      beginRun,
      submitNewestRun,
      fetchBoard,
      refresh,
      getLastResult() { return lastResult; },
      getRunToken() { return runToken; },
      getRunTokenRite() { return runTokenRite; }
    });
    return root.__SEX_MAGICK_GLOBAL_BOARD__;
  }

  function scheduleInstall(timeoutMs = INSTALL_TIMEOUT_MS) {
    if (installed || installTimer || !queryEnabled()) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  const api = Object.freeze({
    GLOBAL_BOARD_VERSION,
    queryEnabled,
    boardUrl,
    install,
    scheduleInstall
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SexMagickGlobalBoard = api;

  if (typeof document !== 'undefined') scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);