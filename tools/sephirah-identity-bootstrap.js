(function attachLivingSephirothBootstrap(root) {
  'use strict';

  if (typeof document === 'undefined') return;

  const VERSION = 2;
  const IDENTITY_SCRIPT_ID = 'sex-magick-sephirah-identity-runtime';
  const INSTALL_TIMEOUT_MS = 12_000;
  const REDUCED_MOTION_SPEED_CAP = 0.08;
  const REDUCED_MOTION_OPACITY_CAP = 0.18;

  let installTimer = null;
  let previousBand = null;
  let installed = false;
  let settingsListener = null;
  const originals = {};

  function excluded() {
    try {
      const params = new URLSearchParams(root.location?.search || '');
      return (
        params.get('visualQa') === '1' ||
        params.has('telemetryQa') ||
        params.has('gateSliceQa') ||
        params.get('gateSlice') === '0'
      );
    } catch (_error) {
      return false;
    }
  }

  function currentGame() {
    try { if (typeof game !== 'undefined' && game) return game; }
    catch (_error) {}
    return root.game || null;
  }

  function ensureIdentityRuntime() {
    if (root.SexMagickSephirahIdentity) return Promise.resolve(root.SexMagickSephirahIdentity);
    let script = document.getElementById(IDENTITY_SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = IDENTITY_SCRIPT_ID;
      script.src = 'tools/sephirah-identity-runtime.js';
      script.async = false;
      document.head.appendChild(script);
    }
    return new Promise((resolve, reject) => {
      if (root.SexMagickSephirahIdentity) {
        resolve(root.SexMagickSephirahIdentity);
        return;
      }
      const timeout = setTimeout(() => reject(new Error('M35 identity runtime load timeout')), INSTALL_TIMEOUT_MS);
      const finish = () => {
        if (!root.SexMagickSephirahIdentity) return;
        clearTimeout(timeout);
        resolve(root.SexMagickSephirahIdentity);
      };
      script.addEventListener('load', finish, { once: true });
      const probe = setInterval(() => {
        if (!root.SexMagickSephirahIdentity) return;
        clearInterval(probe);
        finish();
      }, 20);
      setTimeout(() => clearInterval(probe), INSTALL_TIMEOUT_MS + 100);
    });
  }

  function dependenciesReady() {
    return Boolean(
      typeof Game !== 'undefined' &&
      root.SexMagickSephirahIdentity &&
      root.__SEX_MAGICK_RITUAL_ASCENT__ &&
      root.SexMagickGateSlice?.BANDS &&
      currentGame()
    );
  }

  function activeBandFor(gameInstance) {
    if (!gameInstance?.gateSliceState || gameInstance.gameMode !== 'HEX') return null;
    try {
      if (
        typeof GameState !== 'undefined' &&
        (gameInstance.state === GameState.START || gameInstance.state === GameState.GAME_OVER || gameInstance.state === GameState.SETTINGS)
      ) return null;
    } catch (_error) {}
    return root.SexMagickSephirahIdentity.bandNameFor(gameInstance);
  }

  function applyAccessibilityMotionCap(gameInstance) {
    const access = root.__SEX_MAGICK_COLLISION__?.getAccessibility?.() || {};
    if (!access.reducedMotion || gameInstance?.gameMode !== 'HEX' || !gameInstance?.gateSliceState) return false;
    const particles = Array.isArray(gameInstance.backgroundParticles) ? gameInstance.backgroundParticles : [];
    for (const particle of particles) {
      particle.speed = Math.min(Number(particle.speed) || 0, REDUCED_MOTION_SPEED_CAP);
      particle.opacity = Math.min(Number(particle.opacity) || 0, REDUCED_MOTION_OPACITY_CAP);
    }
    return true;
  }

  function deactivate(gameInstance) {
    if (!gameInstance || !root.SexMagickSephirahIdentity) return null;
    // Preserve the real particle array/settings while presenting an inactive rite
    // to the identity runtime. This restores baseline overlays/particles and mutes
    // the undertone without mutating the game's actual mode or Gate state.
    const inactiveView = Object.create(gameInstance);
    inactiveView.gameMode = 'MONAS';
    inactiveView.gateSliceState = null;
    const result = root.SexMagickSephirahIdentity.sync(inactiveView, { transition: 'steady' });
    previousBand = null;
    return result;
  }

  function syncNow(gameInstance = currentGame(), hint = 'steady') {
    if (!gameInstance || !root.SexMagickSephirahIdentity) return null;
    const band = activeBandFor(gameInstance);
    if (!band) return deactivate(gameInstance);

    let transition = hint;
    if (band && previousBand === null && hint === 'steady') transition = 'initial';
    else if (band && previousBand && band !== previousBand) transition = 'band';

    const result = root.SexMagickSephirahIdentity.sync(gameInstance, { transition });
    previousBand = band;
    applyAccessibilityMotionCap(gameInstance);
    return result;
  }

  function wrapLifecycle() {
    if (Game.prototype.__livingSephirothLifecycleInstalled) return;

    originals.startGame = Game.prototype.startGame;
    originals.restartGame = Game.prototype.restartGame;
    originals.checkLevel = Game.prototype.checkLevel;
    originals.startVoidMode = Game.prototype.startVoidMode;
    originals.endVoidMode = Game.prototype.endVoidMode;
    originals.gameOver = Game.prototype.gameOver;
    originals.returnToMenu = Game.prototype.returnToMenu;
    originals.togglePause = Game.prototype.togglePause;

    Game.prototype.startGame = function startGameWithLivingSephiroth(...args) {
      const result = originals.startGame.apply(this, args);
      syncNow(this, 'initial');
      return result;
    };

    Game.prototype.restartGame = function restartGameWithLivingSephiroth(...args) {
      const result = originals.restartGame.apply(this, args);
      previousBand = null;
      syncNow(this, 'initial');
      return result;
    };

    Game.prototype.checkLevel = function checkLevelWithLivingSephiroth(...args) {
      const before = activeBandFor(this);
      const result = originals.checkLevel.apply(this, args);
      const after = activeBandFor(this);
      syncNow(this, before && after && before !== after ? 'band' : 'steady');
      return result;
    };

    Game.prototype.startVoidMode = function startVoidWithLivingSephiroth(...args) {
      const result = originals.startVoidMode.apply(this, args);
      syncNow(this, 'steady');
      return result;
    };

    Game.prototype.endVoidMode = function endVoidWithLivingSephiroth(...args) {
      const result = originals.endVoidMode.apply(this, args);
      syncNow(this, 'steady');
      return result;
    };

    Game.prototype.gameOver = function gameOverWithLivingSephiroth(...args) {
      const result = originals.gameOver.apply(this, args);
      deactivate(this);
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithLivingSephiroth(...args) {
      const result = originals.returnToMenu.apply(this, args);
      deactivate(this);
      return result;
    };

    Game.prototype.togglePause = function togglePauseWithLivingSephiroth(...args) {
      const result = originals.togglePause.apply(this, args);
      try {
        if (typeof GameState !== 'undefined' && this.state === GameState.PAUSED) deactivate(this);
        else syncNow(this, 'steady');
      } catch (_error) { syncNow(this, 'steady'); }
      return result;
    };

    Game.prototype.__livingSephirothLifecycleInstalled = true;
  }

  function installSettingsListener() {
    if (settingsListener) return;
    settingsListener = event => {
      const id = event.target?.id || '';
      if (!['musicToggle', 'sfxToggle', 'reducedMotionToggle', 'lowFlashToggle'].includes(id)) return;
      const gameInstance = currentGame();
      if (!gameInstance) return;
      // Re-enter from a clean baseline so changing STILLNESS immediately reapplies
      // the current profile rather than waiting for the next Sephirah.
      deactivate(gameInstance);
      syncNow(gameInstance, 'steady');
    };
    document.addEventListener('change', settingsListener);
  }

  function install() {
    if (installed || excluded() || !dependenciesReady()) return null;
    installed = true;
    wrapLifecycle();
    installSettingsListener();
    syncNow(currentGame());

    root.__SEX_MAGICK_M35_BOOTSTRAP__ = Object.freeze({
      mode: 'm35-living-sephiroth-bootstrap',
      version: VERSION,
      lifecycle: 'event-driven',
      getSnapshot() {
        return root.SexMagickSephirahIdentity?.getSnapshot?.(currentGame()) || null;
      },
      refresh() { return syncNow(currentGame()); },
      deactivate() { return deactivate(currentGame()); },
      stop() {
        if (settingsListener) document.removeEventListener('change', settingsListener);
        settingsListener = null;
      }
    });
    return root.__SEX_MAGICK_M35_BOOTSTRAP__;
  }

  async function scheduleInstall() {
    if (excluded() || installed || installTimer) return;
    try { await ensureIdentityRuntime(); }
    catch (error) {
      console.error('[SEX MAGICK] M35 identity runtime failed to load', error);
      return;
    }

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
        console.error('[SEX MAGICK] M35 living Sephiroth dependencies did not become ready');
      }
    }, 20);
  }

  root.SexMagickLivingSephirothBootstrap = Object.freeze({
    VERSION,
    currentGame,
    activeBandFor,
    applyAccessibilityMotionCap,
    ensureIdentityRuntime,
    install,
    scheduleInstall
  });

  scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);