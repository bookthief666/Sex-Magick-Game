(function attachLivingSephirothBootstrap(root) {
  'use strict';

  if (typeof document === 'undefined') return;

  const VERSION = 1;
  const IDENTITY_SCRIPT_ID = 'sex-magick-sephirah-identity-runtime';
  const POLL_MS = 100;
  const INSTALL_TIMEOUT_MS = 12_000;

  let pollTimer = null;
  let installTimer = null;
  let previousBand = null;
  let installed = false;

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
      root.SexMagickSephirahIdentity &&
      root.__SEX_MAGICK_RITUAL_ASCENT__ &&
      root.SexMagickGateSlice?.BANDS &&
      currentGame()
    );
  }

  function tick() {
    const gameInstance = currentGame();
    if (!gameInstance) return;
    const active = Boolean(gameInstance.gateSliceState && gameInstance.gameMode === 'HEX');
    const band = active
      ? root.SexMagickSephirahIdentity.bandNameFor(gameInstance)
      : null;
    let transition = 'steady';
    if (band && previousBand === null) transition = 'initial';
    else if (band && previousBand && band !== previousBand) transition = 'band';

    root.SexMagickSephirahIdentity.sync(gameInstance, { transition });
    previousBand = band;
  }

  function install() {
    if (installed || excluded() || !dependenciesReady()) return null;
    installed = true;
    tick();
    pollTimer = setInterval(tick, POLL_MS);

    root.__SEX_MAGICK_M35_BOOTSTRAP__ = Object.freeze({
      mode: 'm35-living-sephiroth-bootstrap',
      version: VERSION,
      pollMs: POLL_MS,
      getSnapshot() {
        return root.SexMagickSephirahIdentity?.getSnapshot?.(currentGame()) || null;
      },
      refresh: tick,
      stop() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
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
    POLL_MS,
    currentGame,
    ensureIdentityRuntime,
    install,
    scheduleInstall
  });

  scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);