(function attachSexMagickLeaderboardProfile(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickLeaderboardProfile = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.scheduleInstall();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLeaderboardProfileApi(root) {
  'use strict';

  const VERSION = 1;
  const STORAGE_KEY = 'sex_magick_board_name';
  const MAX_HANDLE_LENGTH = 18;
  const INSTALL_TIMEOUT_MS = 12_000;

  let installed = false;
  let installTimer = null;

  /** Keep this byte-for-byte equivalent in meaning to worker/board.js. */
  function sanitiseHandle(value, fallback = 'ANON') {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').trim();
    return cleaned.slice(0, MAX_HANDLE_LENGTH) || fallback;
  }

  function readHandle() {
    try {
      return sanitiseHandle(root.localStorage?.getItem(STORAGE_KEY), 'ANON');
    } catch (_error) {
      return 'ANON';
    }
  }

  function writeHandle(value) {
    const cleaned = sanitiseHandle(value, '');
    try {
      if (cleaned) root.localStorage?.setItem(STORAGE_KEY, cleaned);
      else root.localStorage?.removeItem(STORAGE_KEY);
    } catch (_error) {}
    return cleaned || 'ANON';
  }

  function queryValue(name) {
    try { return new URLSearchParams(root.location?.search || '').get(name); }
    catch (_error) { return null; }
  }

  function shouldRender() {
    if (queryValue('visualQa') === '1') return false;
    if (queryValue('globalBoard') === '0') return false;
    return true;
  }

  function ensureStyle() {
    if (document.getElementById('sex-magick-board-profile-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-board-profile-style';
    style.textContent = `
      #sex-magick-board-profile {
        width: 100%;
        box-sizing: border-box;
        margin-top: 12px;
        padding-top: 11px;
        border-top: 1px solid rgba(255,255,255,.12);
        font-family: 'Orbitron', monospace;
      }
      #sex-magick-board-profile-label {
        display: block;
        margin-bottom: 7px;
        color: rgba(255,255,255,.64);
        font-size: 9px;
        letter-spacing: 2.2px;
        text-align: left;
      }
      #sex-magick-board-profile-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: stretch;
      }
      #sex-magick-board-handle,
      #sex-magick-board-bind {
        min-height: 44px;
        box-sizing: border-box;
        border: 1px solid rgba(255,255,255,.28);
        background: rgba(0,0,0,.58);
        color: #fff;
        font: 11px/1 'Orbitron', monospace;
        letter-spacing: 1.6px;
        outline: none;
      }
      #sex-magick-board-handle {
        width: 100%;
        min-width: 0;
        padding: 0 11px;
        text-transform: uppercase;
      }
      #sex-magick-board-handle:focus {
        border-color: var(--primary);
        box-shadow: 0 0 10px color-mix(in srgb, var(--primary) 42%, transparent);
      }
      #sex-magick-board-bind {
        padding: 0 13px;
        cursor: pointer;
        color: var(--primary);
      }
      #sex-magick-board-bind:active { transform: translateY(1px); }
      #sex-magick-board-profile-note {
        min-height: 13px;
        margin-top: 6px;
        color: rgba(255,255,255,.36);
        font-size: 8px;
        line-height: 1.45;
        letter-spacing: 1.2px;
        text-align: left;
      }
      @media (max-width: 420px) {
        #sex-magick-board-profile-row { gap: 6px; }
        #sex-magick-board-handle,
        #sex-magick-board-bind { font-size: 10px; }
        #sex-magick-board-bind { padding: 0 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_LEADERBOARD_PROFILE__ || null;
    if (!shouldRender()) return null;

    const board = document.querySelector('.leaderboard-container');
    const list = document.getElementById('leaderboardList');
    if (!board || !list) return null;

    installed = true;
    ensureStyle();

    const shell = document.createElement('div');
    shell.id = 'sex-magick-board-profile';

    const label = document.createElement('label');
    label.id = 'sex-magick-board-profile-label';
    label.htmlFor = 'sex-magick-board-handle';
    label.textContent = 'GLOBAL HANDLE';

    const row = document.createElement('div');
    row.id = 'sex-magick-board-profile-row';

    const input = document.createElement('input');
    input.id = 'sex-magick-board-handle';
    input.type = 'text';
    input.maxLength = MAX_HANDLE_LENGTH;
    input.placeholder = 'ANON';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.inputMode = 'text';
    input.setAttribute('aria-label', 'Global leaderboard handle');
    const current = readHandle();
    input.value = current === 'ANON' ? '' : current;

    const button = document.createElement('button');
    button.id = 'sex-magick-board-bind';
    button.type = 'button';
    button.textContent = 'BIND';

    const note = document.createElement('div');
    note.id = 'sex-magick-board-profile-note';
    note.setAttribute('aria-live', 'polite');
    note.textContent = current === 'ANON'
      ? 'NEW GLOBAL SCORES WILL USE ANON · 18 CHAR MAX'
      : `BOUND AS ${current}`;

    const cleanLiveValue = () => {
      const caret = input.selectionStart;
      const cleaned = sanitiseHandle(input.value, '');
      if (input.value !== cleaned) {
        input.value = cleaned;
        try {
          const next = Math.min(Number.isInteger(caret) ? caret : cleaned.length, cleaned.length);
          input.setSelectionRange(next, next);
        } catch (_error) {}
      }
      return cleaned;
    };

    const persist = () => {
      const bound = writeHandle(cleanLiveValue());
      input.value = bound === 'ANON' ? '' : bound;
      note.textContent = bound === 'ANON'
        ? 'NEW GLOBAL SCORES WILL USE ANON · 18 CHAR MAX'
        : `BOUND AS ${bound}`;
      return bound;
    };

    input.addEventListener('input', cleanLiveValue);
    input.addEventListener('change', persist);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      persist();
      input.blur();
    });
    // Prevent the game's full-screen gameplay pointer policies from treating a
    // profile edit as flight input if this control is ever visible during a state
    // transition. collision-runtime.js also excludes input/button controls.
    input.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      persist();
    });

    row.append(input, button);
    shell.append(label, row, note);
    list.insertAdjacentElement('afterend', shell);

    root.__SEX_MAGICK_LEADERBOARD_PROFILE__ = Object.freeze({
      mode: 'local-global-board-handle',
      version: VERSION,
      storageKey: STORAGE_KEY,
      maxLength: MAX_HANDLE_LENGTH,
      readHandle,
      writeHandle,
      sanitiseHandle,
      getSnapshot() {
        return { handle: readHandle(), rendered: Boolean(document.getElementById('sex-magick-board-profile')) };
      }
    });

    return root.__SEX_MAGICK_LEADERBOARD_PROFILE__;
  }

  function scheduleInstall(timeoutMs = INSTALL_TIMEOUT_MS) {
    if (installed || installTimer || !shouldRender()) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  return Object.freeze({
    VERSION,
    STORAGE_KEY,
    MAX_HANDLE_LENGTH,
    sanitiseHandle,
    readHandle,
    writeHandle,
    install,
    scheduleInstall
  });
});
