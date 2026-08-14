(function attachSexMagickRitualAscent(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickRitualAscent = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRitualAscentApi(root) {
  'use strict';

  const VERSION = 1;
  const INSTALL_TIMEOUT_MS = 12_000;

  const BAND_THEMES = Object.freeze([
    Object.freeze({ name: 'MALKUTH', meaning: 'KINGDOM' }),
    Object.freeze({ name: 'YESOD', meaning: 'FOUNDATION' }),
    Object.freeze({ name: 'TIPHARETH', meaning: 'BEAUTY' }),
    Object.freeze({ name: 'GEBURAH', meaning: 'SEVERITY' }),
    Object.freeze({ name: 'CHESED', meaning: 'MERCY' }),
    Object.freeze({ name: 'BINAH', meaning: 'UNDERSTANDING' }),
    Object.freeze({ name: 'CHOKMAH', meaning: 'WISDOM' }),
    Object.freeze({ name: 'KETHER', meaning: 'CROWN' })
  ]);

  const MISSION_COPY = Object.freeze({
    'ACCEPT THE WAGER': 'ENTER THE GATE',
    'REFUSE THE GATE': 'BANK THE GNOSIS'
  });

  let installed = false;
  let installTimer = null;
  let previousBandIndex = null;
  let bannerTimer = null;

  function finiteNumber(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
  }

  function visualQaActive() {
    try { return new URLSearchParams(root.location?.search || '').get('visualQa') === '1'; }
    catch (_error) { return false; }
  }

  function lowLevelDiagnosticActive() {
    try { return new URLSearchParams(root.location?.search || '').has('telemetryQa'); }
    catch (_error) { return false; }
  }

  function themeForBand(index, bands = root.SexMagickGateSlice?.BANDS || []) {
    const resolvedIndex = Math.max(0, Math.floor(finiteNumber(index, 0)));
    const band = bands[resolvedIndex] || bands[0] || null;
    const byName = BAND_THEMES.find(theme => theme.name === String(band?.name || '').toUpperCase());
    return Object.freeze({
      index: resolvedIndex,
      name: String(band?.name || byName?.name || 'MALKUTH').toUpperCase(),
      meaning: byName?.meaning || 'ASCENT'
    });
  }

  function bandProgress(state, bands = root.SexMagickGateSlice?.BANDS || []) {
    const gates = Math.max(0, Math.floor(finiteNumber(state?.gatesCleared, 0)));
    const index = Math.max(0, Math.min(
      Math.max(0, bands.length - 1),
      Math.floor(finiteNumber(state?.bandIndex, 0))
    ));
    const current = bands[index] || bands[0] || { name: 'MALKUTH', gateThreshold: 0 };
    const next = bands[index + 1] || null;
    const currentThreshold = Math.max(0, Math.floor(finiteNumber(current?.gateThreshold, 0)));
    const nextThreshold = next ? Math.max(currentThreshold + 1, Math.floor(finiteNumber(next.gateThreshold, currentThreshold + 1))) : null;
    const span = nextThreshold === null ? 0 : Math.max(1, nextThreshold - currentThreshold);
    const within = nextThreshold === null ? 0 : clamp(gates - currentThreshold, 0, span);
    const ratio = nextThreshold === null ? 1 : clamp(within / span, 0, 1);

    return Object.freeze({
      index,
      gates,
      currentName: String(current?.name || 'MALKUTH').toUpperCase(),
      currentThreshold,
      nextName: next ? String(next.name || '').toUpperCase() : null,
      nextThreshold,
      gatesToNext: nextThreshold === null ? 0 : Math.max(0, nextThreshold - gates),
      ratio,
      atCrown: nextThreshold === null
    });
  }

  function rewriteGateText(text) {
    const value = String(text ?? '').trim();
    if (!value) return value;
    if (/^THE GATE OPENS\b/i.test(value)) {
      return 'GATE OPEN  ·  ENTER → VOID ×10  /  PASS → BANK ×3';
    }
    if (/^WAGER ACCEPTED\b/i.test(value)) {
      const multiplier = value.match(/×\s*([\d.]+)/)?.[1];
      return multiplier ? `VOID TRIAL  ·  STAKE × ${multiplier}` : 'VOID TRIAL';
    }
    if (/^WAGER LOST\b/i.test(value)) {
      const multiplier = value.match(/×\s*([\d.]+)/)?.[1];
      return multiplier ? `VOID FAILED  ·  STAKE LOST × ${multiplier}` : 'VOID FAILED';
    }
    return value;
  }

  function rewriteMissionText(text) {
    const value = String(text ?? '');
    let next = value;
    for (const [from, to] of Object.entries(MISSION_COPY)) {
      next = next.replaceAll(from, to);
    }
    return next;
  }

  function dependenciesReady() {
    return (
      typeof Game !== 'undefined' &&
      typeof GameState !== 'undefined' &&
      Boolean(root.__SEX_MAGICK_GATE_SLICE__) &&
      Boolean(root.__SEX_MAGICK_MISSIONS__) &&
      Array.isArray(root.SexMagickGateSlice?.BANDS)
    );
  }

  function currentGame() {
    try { if (typeof game !== 'undefined' && game) return game; }
    catch (_error) {}
    return root.game || null;
  }

  function currentAccent(gameInstance) {
    const level = gameInstance?.gameLevels?.[gameInstance?.currentLevelIdx];
    if (/^#[0-9a-f]{6}$/i.test(String(level?.accent || ''))) return level.accent;
    try {
      const css = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      if (/^#[0-9a-f]{6}$/i.test(css)) return css;
    } catch (_error) {}
    return '#00e5ff';
  }

  function accessibility() {
    const state = root.__SEX_MAGICK_COLLISION__?.getAccessibility?.() || {};
    return {
      reducedMotion: Boolean(state.reducedMotion),
      lowFlash: Boolean(state.lowFlash)
    };
  }

  function ensureStyle() {
    if (document.getElementById('sex-magick-ritual-ascent-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-ritual-ascent-style';
    style.textContent = `
      #sex-magick-ascent-row {
        margin-top: 5px;
        padding-top: 4px;
        border-top: 1px solid color-mix(in srgb, var(--primary, #00e5ff) 32%, transparent);
        opacity: .72;
        font-size: .88em;
        letter-spacing: 1.25px;
      }
      #sex-magick-ascent-row[hidden] { display: none !important; }
      #sex-magick-ascent-meaning { color: rgba(255,255,255,.76); }
      #sex-magick-ascent-next { color: var(--primary, #00e5ff); }

      #sex-magick-ascent-banner {
        position: fixed;
        top: max(112px, calc(env(safe-area-inset-top) + 94px));
        left: 50%;
        z-index: 31;
        min-width: min(430px, calc(100vw - 44px));
        max-width: calc(100vw - 32px);
        transform: translateX(-50%);
        padding: 10px 18px 12px;
        border-top: 1px solid var(--sm-ascent-accent, #00e5ff);
        border-bottom: 1px solid var(--sm-ascent-accent, #00e5ff);
        background: linear-gradient(90deg, transparent, rgba(0,0,0,.78) 16%, rgba(0,0,0,.78) 84%, transparent);
        text-align: center;
        pointer-events: none;
        color: #f7ffff;
        text-shadow: 0 0 12px var(--sm-ascent-accent, #00e5ff);
        animation: sm-ascent-arrive 1.35s ease-out both;
      }
      #sex-magick-ascent-banner[hidden] { display: none !important; }
      #sex-magick-ascent-kicker {
        font: 8px/1.2 'Orbitron', monospace;
        letter-spacing: 5px;
        opacity: .68;
      }
      #sex-magick-ascent-name {
        margin-top: 3px;
        font: 18px/1.2 'Orbitron', monospace;
        letter-spacing: 4px;
        color: var(--sm-ascent-accent, #00e5ff);
      }
      #sex-magick-ascent-subtitle {
        margin-top: 2px;
        font: 9px/1.2 'Orbitron', monospace;
        letter-spacing: 3px;
        opacity: .78;
      }
      @keyframes sm-ascent-arrive {
        0% { opacity: 0; transform: translate(-50%, 10px) scale(.985); }
        16% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        74% { opacity: 1; }
        100% { opacity: 0; }
      }
      html.sex-magick-reduced-motion #sex-magick-ascent-banner {
        animation: none;
      }
      @media (max-width: 430px) {
        #sex-magick-ascent-banner { top: max(100px, calc(env(safe-area-inset-top) + 84px)); padding-inline: 10px; }
        #sex-magick-ascent-name { font-size: 15px; letter-spacing: 3px; }
        #sex-magick-ascent-subtitle { font-size: 8px; letter-spacing: 2px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHud() {
    ensureStyle();
    const gateHud = document.getElementById('gate-slice-hud');
    if (gateHud && !document.getElementById('sex-magick-ascent-row')) {
      const row = document.createElement('div');
      row.id = 'sex-magick-ascent-row';
      row.className = 'gate-slice-row';
      row.hidden = true;
      row.innerHTML = '<span id="sex-magick-ascent-meaning"></span><span id="sex-magick-ascent-next"></span>';
      gateHud.appendChild(row);
    }

    let banner = document.getElementById('sex-magick-ascent-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sex-magick-ascent-banner';
      banner.hidden = true;
      banner.innerHTML = `
        <div id="sex-magick-ascent-kicker">RITUAL ASCENT</div>
        <div id="sex-magick-ascent-name">MALKUTH</div>
        <div id="sex-magick-ascent-subtitle">KINGDOM</div>
      `;
      document.body.appendChild(banner);
    }
    return { gateHud, banner, row: document.getElementById('sex-magick-ascent-row') };
  }

  function hideUi() {
    const row = document.getElementById('sex-magick-ascent-row');
    const banner = document.getElementById('sex-magick-ascent-banner');
    if (row) row.hidden = true;
    if (banner) banner.hidden = true;
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
  }

  function rewriteVisibleCopy() {
    const telegraph = document.getElementById('gate-slice-telegraph');
    if (telegraph && !telegraph.hidden) {
      const rewritten = rewriteGateText(telegraph.textContent);
      if (rewritten !== telegraph.textContent) telegraph.textContent = rewritten;
    }

    for (const node of document.querySelectorAll('.sm-mission-name, #sex-magick-missions-announce')) {
      const rewritten = rewriteMissionText(node.textContent);
      if (rewritten !== node.textContent) node.textContent = rewritten;
    }
  }

  function renderAscent(gameInstance = currentGame()) {
    const { row } = ensureHud();
    const state = gameInstance?.gateSliceState;
    const active = Boolean(state && gameInstance?.gameMode === 'HEX' && gameInstance?.state !== GameState.START);
    if (!active) {
      if (row) row.hidden = true;
      return null;
    }

    const bands = root.SexMagickGateSlice.BANDS;
    const progress = bandProgress(state, bands);
    const theme = themeForBand(progress.index, bands);
    const meaning = document.getElementById('sex-magick-ascent-meaning');
    const next = document.getElementById('sex-magick-ascent-next');
    if (meaning) meaning.textContent = theme.meaning;
    if (next) {
      next.textContent = progress.atCrown
        ? 'CROWN · HELD'
        : `${progress.nextName} · ${progress.gatesToNext} GATES`;
    }
    if (row) row.hidden = false;
    return Object.freeze({ progress, theme });
  }

  function announceBand(gameInstance, index, options = {}) {
    if (visualQaActive() || lowLevelDiagnosticActive()) return null;
    const { banner } = ensureHud();
    if (!banner) return null;
    const bands = root.SexMagickGateSlice.BANDS;
    const theme = themeForBand(index, bands);
    const accent = currentAccent(gameInstance);
    const access = accessibility();

    banner.style.setProperty('--sm-ascent-accent', accent);
    document.getElementById('sex-magick-ascent-kicker').textContent = options.initial ? 'RITE OF HEXAGRAM' : 'RITUAL ASCENT';
    document.getElementById('sex-magick-ascent-name').textContent = theme.name;
    document.getElementById('sex-magick-ascent-subtitle').textContent = theme.meaning;
    banner.hidden = false;

    banner.classList.remove('sm-ascent-restart');
    void banner.offsetWidth;
    if (!access.reducedMotion) banner.classList.add('sm-ascent-restart');

    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      banner.hidden = true;
      bannerTimer = null;
    }, access.reducedMotion ? 900 : 1350);

    return Object.freeze({ index, ...theme, accent, reducedMotion: access.reducedMotion });
  }

  function sync(gameInstance = currentGame(), options = {}) {
    if (!gameInstance?.gateSliceState || gameInstance.gameMode !== 'HEX') {
      previousBandIndex = null;
      hideUi();
      return null;
    }

    rewriteVisibleCopy();
    const rendered = renderAscent(gameInstance);
    const index = Math.max(0, Math.floor(finiteNumber(gameInstance.gateSliceState.bandIndex, 0)));
    if (previousBandIndex === null) {
      previousBandIndex = index;
      if (options.announceInitial) announceBand(gameInstance, index, { initial: true });
    } else if (index !== previousBandIndex) {
      previousBandIndex = index;
      announceBand(gameInstance, index);
    }
    return rendered;
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_RITUAL_ASCENT__ || null;
    if (visualQaActive() || lowLevelDiagnosticActive() || !dependenciesReady()) return null;
    if (Game.prototype.__ritualAscentRuntimeInstalled && root.__SEX_MAGICK_RITUAL_ASCENT__) {
      installed = true;
      return root.__SEX_MAGICK_RITUAL_ASCENT__;
    }

    ensureHud();
    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalReturnToMenu = Game.prototype.returnToMenu;

    Game.prototype.startGame = function startGameWithRitualAscent(...args) {
      const result = originalStartGame.apply(this, args);
      previousBandIndex = null;
      sync(this, { announceInitial: this.gameMode === 'HEX' });
      return result;
    };

    Game.prototype.restartGame = function restartGameWithRitualAscent(...args) {
      const result = originalRestartGame.apply(this, args);
      previousBandIndex = null;
      sync(this, { announceInitial: this.gameMode === 'HEX' });
      return result;
    };

    Game.prototype.updateGameObjects = function updateGameObjectsWithRitualAscent(...args) {
      const result = originalUpdateGameObjects.apply(this, args);
      sync(this);
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithRitualAscent(...args) {
      hideUi();
      previousBandIndex = null;
      return originalReturnToMenu.apply(this, args);
    };

    Game.prototype.__ritualAscentRuntimeInstalled = true;
    installed = true;

    root.__SEX_MAGICK_RITUAL_ASCENT__ = Object.freeze({
      mode: 'm34-ritual-ascent-game-feel',
      version: VERSION,
      themes: BAND_THEMES,
      themeForBand,
      bandProgress,
      rewriteGateText,
      rewriteMissionText,
      rewriteVisibleCopy,
      refresh: () => sync(currentGame()),
      getSnapshot() {
        const gameInstance = currentGame();
        if (!gameInstance?.gateSliceState || gameInstance.gameMode !== 'HEX') {
          return { active: false, band: null, progress: null };
        }
        const bands = root.SexMagickGateSlice.BANDS;
        const progress = bandProgress(gameInstance.gateSliceState, bands);
        return {
          active: true,
          band: themeForBand(progress.index, bands),
          progress,
          telegraph: document.getElementById('gate-slice-telegraph')?.textContent || '',
          rowVisible: !document.getElementById('sex-magick-ascent-row')?.hidden,
          bannerVisible: !document.getElementById('sex-magick-ascent-banner')?.hidden
        };
      }
    });

    sync(currentGame());
    return root.__SEX_MAGICK_RITUAL_ASCENT__;
  }

  function scheduleInstall() {
    if (visualQaActive() || lowLevelDiagnosticActive() || installed || installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (dependenciesReady()) {
        clearInterval(installTimer);
        installTimer = null;
        install();
        return;
      }
      if (Date.now() - startedAt >= INSTALL_TIMEOUT_MS) {
        clearInterval(installTimer);
        installTimer = null;
        console.error('[SEX MAGICK] M34 ritual ascent dependencies did not become ready');
      }
    }, 20);
  }

  return Object.freeze({
    VERSION,
    BAND_THEMES,
    MISSION_COPY,
    finiteNumber,
    clamp,
    themeForBand,
    bandProgress,
    rewriteGateText,
    rewriteMissionText,
    install,
    scheduleInstall
  });
});
