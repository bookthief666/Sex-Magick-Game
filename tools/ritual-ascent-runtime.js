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
  let copyObserver = null;
  let lastAscentSignature = null;
  let uiActive = false;

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
    try {
      const params = new URLSearchParams(root.location?.search || '');
      return params.has('telemetryQa') || params.has('gateSliceQa');
    } catch (_error) {
      return false;
    }
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
    const nextThreshold = next
      ? Math.max(currentThreshold + 1, Math.floor(finiteNumber(next.gateThreshold, currentThreshold + 1)))
      : null;
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
    for (const [from, to] of Object.entries(MISSION_COPY)) next = next.replaceAll(from, to);
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

      /* Anchored to the bottom toast band, not floated over the play field.
         D-043 already moved this game's transient messages out of the middle
         once; this banner was authored on a branch that had never seen that
         decision and reintroduced the problem at top:112px, which on a 707x675
         Fold viewport is a 430px-wide slab sitting directly across the corridor
         the player is flying through. 206px clears the missions toast (170px),
         which clears the powerup toast (120px), which clears the two HUDs.
         See D-060. */
      #sex-magick-ascent-banner {
        position: fixed;
        /* D-065: the shared transient-notice band. Every transient message in
           the game sits at exactly this offset and notice-slot.js guarantees
           only one is visible at a time, so a single line of text at a small
           fixed offset can never migrate into the corridor - which is what
           D-064's "stack them upward" approach did (304px from the bottom of a
           643px viewport is 47% up: the middle). Clears the persistent
           #sex-magick-missions list (bottom:46px, up to ~70px tall). */
        bottom: max(128px, calc(env(safe-area-inset-bottom) + 122px));
        left: 50%;
        z-index: 34;
        min-width: min(430px, calc(100vw - 44px));
        max-width: calc(100vw - 32px);
        transform: translateX(-50%);
        /* D-065: one inline row, not three stacked lines. This was the largest
           thing on screen at a moment the player is mid-corridor; the ceremony
           now lives in the type and the accent rather than in the footprint. */
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 10px;
        white-space: nowrap;
        padding: 7px 16px;
        border-top: 1px solid var(--sm-ascent-accent, #00e5ff);
        border-bottom: 1px solid var(--sm-ascent-accent, #00e5ff);
        background: linear-gradient(90deg, transparent, rgba(0,0,0,.78) 16%, rgba(0,0,0,.78) 84%, transparent);
        text-align: center;
        pointer-events: none;
        color: #f7ffff;
        text-shadow: 0 0 12px var(--sm-ascent-accent, #00e5ff);
        animation: sm-ascent-arrive 1.35s ease-out both;
      }
      #sex-magick-ascent-banner.sm-ascent-restart {
        animation: sm-ascent-arrive-restart 1.35s ease-out both;
      }
      #sex-magick-ascent-banner[hidden] { display: none !important; }
      #sex-magick-ascent-kicker {
        font: 8px/1.2 'Orbitron', monospace;
        letter-spacing: 5px;
        opacity: .68;
      }
      #sex-magick-ascent-name {
        font: 14px/1.2 'Orbitron', monospace;
        letter-spacing: 3px;
        color: var(--sm-ascent-accent, #00e5ff);
      }
      #sex-magick-ascent-subtitle {
        font: 8px/1.2 'Orbitron', monospace;
        letter-spacing: 2px;
        opacity: .78;
      }
      @keyframes sm-ascent-arrive {
        0% { opacity: 0; transform: translate(-50%, -10px) scale(.985); }
        16% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        74% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes sm-ascent-arrive-restart {
        0% { opacity: 0; transform: translate(-50%, -10px) scale(.985); }
        16% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        74% { opacity: 1; }
        100% { opacity: 0; }
      }
      html.sex-magick-reduced-motion #sex-magick-ascent-banner,
      html.sex-magick-reduced-motion #sex-magick-ascent-banner.sm-ascent-restart {
        animation: none;
      }
      @media (max-width: 430px) {
        #sex-magick-ascent-banner {
          /* D-065: this rule used to also set  top: max(100px, ...)  , left over
             from D-060's original top-anchored design. Once D-060 switched the
             base rule to bottom, a narrow screen got *both* - and an element
             with a top and a bottom and no height stretches between them. On
             the owner's Fold cover screen (368px) that produced a 284px-tall
             empty box spanning 14%-55% of the display: the giant rectangle in
             the 2026-08-21 screenshot. Four fixes missed it because every audit
             grepped for bottom:, and this one said top:. Narrow screens get
             tighter padding here and nothing else - vertical position belongs
             to the base rule alone. */
          padding-inline: 10px;
        }
        #sex-magick-ascent-name { font-size: 12px; letter-spacing: 2px; }
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
    if (row && !row.hidden) row.hidden = true;
    if (banner && !banner.hidden) banner.hidden = true;
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    lastAscentSignature = null;
    uiActive = false;
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

  function installCopyObservers() {
    if (copyObserver || typeof MutationObserver === 'undefined') return Boolean(copyObserver);
    const targets = [
      document.getElementById('gate-slice-telegraph'),
      document.getElementById('sex-magick-missions'),
      document.getElementById('sex-magick-missions-announce')
    ].filter(Boolean);
    if (targets.length === 0) return false;

    copyObserver = new MutationObserver(() => rewriteVisibleCopy());
    for (const target of targets) {
      copyObserver.observe(target, { childList: true, characterData: true, subtree: true });
    }
    return true;
  }

  function renderAscent(gameInstance = currentGame()) {
    const state = gameInstance?.gateSliceState;
    const active = Boolean(state && gameInstance?.gameMode === 'HEX' && gameInstance?.state !== GameState.START);
    if (!active) return null;

    const bands = root.SexMagickGateSlice.BANDS;
    const progress = bandProgress(state, bands);
    const theme = themeForBand(progress.index, bands);
    const signature = `${progress.index}:${progress.gates}:${progress.nextThreshold ?? 'crown'}`;

    // Gate count and band transitions are sparse. Avoid touching layout/text on the
    // 60 Hz simulation path when nothing player-visible changed.
    if (signature !== lastAscentSignature || !uiActive) {
      const { row } = ensureHud();
      const meaning = document.getElementById('sex-magick-ascent-meaning');
      const next = document.getElementById('sex-magick-ascent-next');
      if (meaning && meaning.textContent !== theme.meaning) meaning.textContent = theme.meaning;
      const nextText = progress.atCrown
        ? 'CROWN · HELD'
        : `${progress.nextName} · ${progress.gatesToNext} GATES`;
      if (next && next.textContent !== nextText) next.textContent = nextText;
      if (row?.hidden) row.hidden = false;
      lastAscentSignature = signature;
      uiActive = true;
    }

    return Object.freeze({ progress, theme });
  }


  /**
   * D-065: hand the shared transient-notice slot to this element before showing
   * it, so no two notices are ever on screen at once. Optional by design - the
   * module is a plain script and a page that somehow loads without it still
   * announces, it just loses the mutual exclusion.
   */
  function claimNoticeSlot(id) {
    try { root.SexMagickNoticeSlot?.register(id); root.SexMagickNoticeSlot?.claim(id); }
    catch (_error) { /* never let slot arbitration break an announce */ }
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
    claimNoticeSlot('sex-magick-ascent-banner');
    banner.hidden = false;

    // Alternate between two visually identical keyframes. Reflow while the base
    // animation is active, then swap to the alternate name so every later band
    // transition restarts from frame zero instead of inheriting a completed CSS
    // animation from the initial MALKUTH banner.
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
      if (uiActive || previousBandIndex !== null || bannerTimer) {
        previousBandIndex = null;
        hideUi();
      }
      return null;
    }

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

  function refresh(gameInstance = currentGame()) {
    rewriteVisibleCopy();
    return sync(gameInstance);
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_RITUAL_ASCENT__ || null;
    if (visualQaActive() || lowLevelDiagnosticActive() || !dependenciesReady()) return null;
    if (Game.prototype.__ritualAscentRuntimeInstalled && root.__SEX_MAGICK_RITUAL_ASCENT__) {
      installed = true;
      return root.__SEX_MAGICK_RITUAL_ASCENT__;
    }

    ensureHud();
    installCopyObservers();
    rewriteVisibleCopy();

    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalReturnToMenu = Game.prototype.returnToMenu;

    Game.prototype.startGame = function startGameWithRitualAscent(...args) {
      const result = originalStartGame.apply(this, args);
      previousBandIndex = null;
      lastAscentSignature = null;
      rewriteVisibleCopy();
      sync(this, { announceInitial: this.gameMode === 'HEX' });
      return result;
    };

    Game.prototype.restartGame = function restartGameWithRitualAscent(...args) {
      const result = originalRestartGame.apply(this, args);
      previousBandIndex = null;
      lastAscentSignature = null;
      rewriteVisibleCopy();
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
      refresh,
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
          bannerVisible: !document.getElementById('sex-magick-ascent-banner')?.hidden,
          eventDrivenCopy: Boolean(copyObserver)
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
