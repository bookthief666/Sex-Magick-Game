'use strict';

/**
 * M32 — live MONAS progression ownership.
 *
 * M31 proved a HOLD/RELEASE reachability envelope but deliberately changed no live
 * difficulty values. This layer consumes only the conservative lower portion of
 * that verified frontier and makes MONAS progression independent of both score and
 * the optional Gate-slice bootstrap.
 *
 * It installs *after* monas-runtime.js. That ordering is intentional: MONAS becomes
 * the outer owner of checkLevel/getCurrentGap/updateGameObjects while delegating all
 * non-MONAS calls to whatever was already underneath (base game on the ordinary
 * URL, Gate wrapper when ?gateSlice=1 is present).
 */
(function attachSexMagickMonasProgression(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickMonasProgression = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMonasProgressionApi(root) {
  'use strict';

  const PROGRESSION_VERSION = 1;
  const INSTALL_TIMEOUT_MS = 12_000;
  const SURGE_GAP_MULTIPLIER = 1.18;

  // Every speed/gap pair below is one of the exact M31 frontier coordinates.
  //
  // M43 extends the ladder to the two coordinates D-053 held back as "validated
  // tuning headroom, not live bands": 5.3 / 200 and the 5.7 / 190 search ceiling.
  // The reason for holding them was never missing evidence - D-050's frontier
  // verified every coordinate from 2.9 / 260 through 5.7 / 190, and D-051's
  // boundary job fully verified 5.7 / 190 across the complete scheduler-legal
  // pattern-variant pair cross-product. It was that shipping a harder number needs
  // a reason, and until M43 there was none.
  //
  // Now there is. The ladder had never actually governed play: `monas-runtime.js`
  // overwrote `gameSpeed` every frame from a flat ramp, so a run climbed 0.007 per
  // gate and levelled off long before the crown band. With that clobber removed the
  // top of the ladder is reached for the first time, and the owner's report - that
  // MONAS stops speeding up - is about the ceiling as much as the climb.
  //
  // The Fold 6 feel/readability gate D-053 named is still owed, and is still owed
  // for the bands below these two. It gates the release, not the tuning.
  const BANDS = Object.freeze([
    Object.freeze({ id: 'still', gateThreshold: 0,  speed: 2.9, gap: 260 }),
    Object.freeze({ id: 'current-i', gateThreshold: 8,  speed: 3.3, gap: 250 }),
    Object.freeze({ id: 'current-ii', gateThreshold: 20, speed: 3.7, gap: 240 }),
    Object.freeze({ id: 'axis', gateThreshold: 36, speed: 4.1, gap: 230 }),
    Object.freeze({ id: 'orbit', gateThreshold: 56, speed: 4.5, gap: 220 }),
    Object.freeze({ id: 'crown', gateThreshold: 80, speed: 4.9, gap: 210 }),
    Object.freeze({ id: 'ascent', gateThreshold: 110, speed: 5.3, gap: 200 }),
    Object.freeze({ id: 'ceiling', gateThreshold: 150, speed: 5.7, gap: 190 })
  ]);

  let installed = false;
  let installTimer = null;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function isMonas(gameInstance) {
    return gameInstance?.gameMode === 'MONAS';
  }

  function getBandIndex(gatesPassed) {
    const gates = Math.max(0, Math.floor(finite(gatesPassed, 0)));
    let index = 0;
    for (let candidate = 1; candidate < BANDS.length; candidate += 1) {
      if (gates >= BANDS[candidate].gateThreshold) index = candidate;
    }
    return index;
  }

  function getBand(gatesPassed) {
    return BANDS[getBandIndex(gatesPassed)];
  }

  function gapFor(gatesPassed, frames = 0, surgeActive = false) {
    const band = getBand(gatesPassed);
    const breathing = Math.sin(finite(frames, 0) * 0.05) * 10;
    const base = band.gap + breathing;
    return surgeActive ? base * SURGE_GAP_MULTIPLIER : base;
  }

  function validateBands(bands = BANDS) {
    if (!Array.isArray(bands) || bands.length === 0) throw new Error('MONAS progression requires at least one band');
    if (bands[0].gateThreshold !== 0) throw new Error('MONAS progression must begin at gate 0');
    for (let index = 1; index < bands.length; index += 1) {
      const previous = bands[index - 1];
      const current = bands[index];
      if (!(current.gateThreshold > previous.gateThreshold)) throw new Error(`Band ${current.id} must advance gate threshold`);
      if (!(current.speed > previous.speed)) throw new Error(`Band ${current.id} must increase speed`);
      if (!(current.gap < previous.gap)) throw new Error(`Band ${current.id} must decrease gap`);
    }
    return true;
  }

  function clearGateResidue(gameInstance) {
    if (!gameInstance) return;
    // Gate's restart wrapper predates MONAS parity and creates a Gate state after
    // every retry regardless of gameMode. M32 normalises the MONAS path after that
    // wrapper returns so ?gateSlice=1 cannot change rite semantics.
    gameInstance.gateSliceState = null;
    gameInstance.gateSliceOffer = null;
    gameInstance.__gateSliceVoidActive = false;
    gameInstance.__gateSliceVoidStartedAt = 0;
    gameInstance.__bonusCorridorFrames = 0;
    gameInstance.__bonusCorridorLastGate = -1;
    gameInstance.voidMode = false;
    gameInstance.voidTimer = 0;
    try { document.getElementById('game-container')?.classList.remove('void-active'); } catch (_error) {}
    try {
      const gateHud = document.getElementById('gate-slice-hud');
      if (gateHud) gateHud.hidden = true;
    } catch (_error) {}
  }

  function decorateState(state) {
    return {
      ...state,
      progressionVersion: PROGRESSION_VERSION,
      progressionBandIndex: 0,
      progressionChanges: 0
    };
  }

  /**
   * D-045 found the base game's own adjustForScreenSize() gives a portrait phone a
   * slower, wider corridor (0.9x speed) that M26's per-frame CONFIG-driven
   * escalation was silently overwriting every frame. This ladder was authored on an
   * independent branch unaware of that fix, and its absolute per-band speeds
   * overwrote the portrait accommodation right back the moment the two lines
   * merged - band 0 shipped as a flat 2.9 regardless of geometry, when the base
   * game's own rule for that screen is 2.61.
   *
   * monas-runtime.js's adjustForScreenSize wrapper already captures what the base
   * game decided, unmutated, as `__monasGeometryBaseSpeed` (see its own comment).
   * Composing here - scaling every band by the ratio between that captured value
   * and the shipped desktop base - keeps this ladder's escalation shape while
   * restoring the accommodation it was clobbering. On desktop the ratio is 1 and
   * every value below remains exactly what shipped; the portrait crown band (gate
   * 80) becomes ~4.41 instead of 4.9.
   */
  function geometrySpeedFactor(gameInstance) {
    const geometryBase = finite(gameInstance?.__monasGeometryBaseSpeed, NaN);
    const desktopBase = typeof CONFIG !== 'undefined' ? finite(CONFIG.INITIAL_GAME_SPEED, BANDS[0].speed) : BANDS[0].speed;
    if (!Number.isFinite(geometryBase) || !(desktopBase > 0)) return 1;
    return geometryBase / desktopBase;
  }

  function applyProgression(gameInstance, options = {}) {
    if (!isMonas(gameInstance) || !gameInstance?.monasState) return null;
    const state = gameInstance.monasState;
    const previousIndex = Math.max(0, Math.floor(finite(state.progressionBandIndex, 0)));
    const nextIndex = getBandIndex(state.gatesPassed);
    const band = BANDS[nextIndex];
    const changed = nextIndex !== previousIndex;
    const speed = band.speed * geometrySpeedFactor(gameInstance);

    state.progressionVersion = PROGRESSION_VERSION;
    state.progressionBandIndex = nextIndex;
    state.progressionGateThreshold = band.gateThreshold;
    state.progressionSpeed = speed;
    state.progressionGap = band.gap;
    if (!Number.isFinite(state.progressionChanges)) state.progressionChanges = 0;
    if (changed && options.countChange !== false) state.progressionChanges += 1;

    // This is the canonical *base* speed. monas-runtime.js temporarily multiplies
    // it during Warp Surge and restores it after the update, so progression changes
    // remain stable across reward entry/exit.
    gameInstance.gameSpeed = speed;
    return { changed, index: nextIndex, band };
  }

  function resetMonasRun(gameInstance) {
    if (!isMonas(gameInstance)) return null;
    clearGateResidue(gameInstance);

    const monas = root.SexMagickMonas;
    if (monas && typeof monas.createMonasState === 'function') {
      gameInstance.monasState = decorateState(monas.createMonasState());
    } else if (gameInstance.monasState) {
      gameInstance.monasState = decorateState({ ...gameInstance.monasState, gatesPassed: 0, coherence: 0, surgeActive: false, surgeFramesRemaining: 0 });
    }

    gameInstance.__monasPreviousVy = 0;
    gameInstance.__monasReversals = 0;
    gameInstance.__monasNextGlyphAt = null;
    gameInstance.__monasGlyphActiveUntil = -1;
    if (gameInstance.player) {
      gameInstance.player.__monasFramesSinceRelease = root.SexMagickMonas?.HANG_FRAMES ?? 5;
      gameInstance.player.__monasHeld = false;
    }
    try { root.__SEX_MAGICK_MONAS__?.setHeldForTest?.(false); } catch (_error) {}

    return applyProgression(gameInstance, { countChange: false });
  }

  function dependenciesReady() {
    return (
      typeof Game !== 'undefined' && Boolean(Game?.prototype) &&
      Boolean(Game.prototype.__monasRuntimeInstalled) &&
      Boolean(root.SexMagickMonas)
    );
  }

  function install() {
    if (installed || (typeof Game !== 'undefined' && Game.prototype.__monasProgressionRuntimeInstalled)) {
      return root.__SEX_MAGICK_MONAS_PROGRESSION__ || null;
    }
    if (!dependenciesReady()) return null;
    validateBands();

    installed = true;
    Game.prototype.__monasProgressionRuntimeInstalled = true;

    // Capture MONAS (and, on gateSlice pages, Gate) as the layer underneath us.
    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalCheckLevel = Game.prototype.checkLevel;
    const originalGetCurrentGap = Game.prototype.getCurrentGap;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;

    Game.prototype.startGame = function startMonasProgression(...args) {
      const result = originalStartGame.apply(this, args);
      if (isMonas(this)) resetMonasRun(this);
      return result;
    };

    Game.prototype.restartGame = function restartMonasProgression(...args) {
      const monasRun = isMonas(this);
      const result = originalRestartGame.apply(this, args);
      if (monasRun) resetMonasRun(this);
      return result;
    };

    Game.prototype.checkLevel = function checkMonasProgression(...args) {
      // Base checkLevel is score-driven and can trigger the Void; Gate checkLevel
      // no-ops unless gateSliceState exists. Neither is MONAS progression. The
      // semantic gate-clear path below is the only owner for this rite.
      if (isMonas(this)) return undefined;
      return originalCheckLevel.apply(this, args);
    };

    Game.prototype.getCurrentGap = function getMonasProgressionGap(...args) {
      if (!isMonas(this) || !this.monasState) return originalGetCurrentGap.apply(this, args);
      return gapFor(this.monasState.gatesPassed, this.frames, Boolean(this.monasState.surgeActive));
    };

    Game.prototype.updateGameObjects = function updateMonasProgression(...args) {
      if (!isMonas(this) || !this.monasState) return originalUpdateGameObjects.apply(this, args);
      const gatesBefore = Math.max(0, Math.floor(finite(this.monasState.gatesPassed, 0)));
      const result = originalUpdateGameObjects.apply(this, args);
      const gatesAfter = Math.max(0, Math.floor(finite(this.monasState?.gatesPassed, 0)));
      if (gatesAfter !== gatesBefore) applyProgression(this);
      return result;
    };

    root.__SEX_MAGICK_MONAS_PROGRESSION__ = Object.freeze({
      mode: 'monas-progression',
      version: PROGRESSION_VERSION,
      getFingerprint() {
        return {
          progressionVersion: PROGRESSION_VERSION,
          bands: BANDS.map(band => ({ ...band })),
          surgeGapMultiplier: SURGE_GAP_MULTIPLIER,
          scoreDrivenProgression: false,
          gateCountDrivenProgression: true
        };
      },
      getSnapshot() {
        if (typeof game === 'undefined' || !isMonas(game) || !game.monasState) return null;
        const band = getBand(game.monasState.gatesPassed);
        return {
          gatesPassed: game.monasState.gatesPassed,
          progressionBandIndex: game.monasState.progressionBandIndex,
          progressionChanges: game.monasState.progressionChanges,
          speed: game.gameSpeed,
          nominalGap: band.gap,
          liveGap: gapFor(game.monasState.gatesPassed, game.frames, Boolean(game.monasState.surgeActive)),
          surgeActive: Boolean(game.monasState.surgeActive),
          gateResidue: Boolean(game.gateSliceState || game.gateSliceOffer || game.__gateSliceVoidActive)
        };
      },
      /**
       * Re-assign the current band's speed without counting a progression change.
       *
       * M43: `monas-runtime.js` calls this after a resize changes the captured
       * geometry base, since `applyProgression` is now the sole writer of
       * `gameSpeed` and otherwise would not run again until the next gate.
       */
      resyncProgression() {
        if (typeof game === 'undefined' || !isMonas(game) || !game.monasState) return null;
        return applyProgression(game, { countChange: false });
      },
      forceGatesForTest(value) {
        if (typeof game === 'undefined' || !isMonas(game) || !game.monasState) return null;
        game.monasState.gatesPassed = Math.max(0, Math.floor(finite(value, 0)));
        return applyProgression(game);
      },
      resetForTest() {
        if (typeof game === 'undefined' || !isMonas(game)) return null;
        return resetMonasRun(game);
      }
    });

    return root.__SEX_MAGICK_MONAS_PROGRESSION__;
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

  return Object.freeze({
    PROGRESSION_VERSION,
    SURGE_GAP_MULTIPLIER,
    BANDS,
    finite,
    getBandIndex,
    getBand,
    gapFor,
    validateBands,
    clearGateResidue,
    decorateState,
    applyProgression,
    resetMonasRun,
    install,
    scheduleInstall
  });
});
