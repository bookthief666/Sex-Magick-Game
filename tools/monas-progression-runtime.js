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

  // MONAS's own proven envelope, separate from HEX's.
  //
  // M44: the two rites are audited against their own ladders now, so each needs
  // its own ceiling to be asserted against. MONAS's was never written down as a
  // constant - it lived in D-051's prose as "the search ceiling" - which is part
  // of why the shipped audit ended up checking MONAS's patterns against HEX's
  // numbers instead.
  const MAX_VALIDATED_SPEED = 7.0;
  const MIN_VALIDATED_GAP = 160;
  const INSTALL_TIMEOUT_MS = 12_000;
  const SURGE_GAP_MULTIPLIER = 1.18;
  const GAP_OSCILLATION_PX = 10;

  // Every speed/gap pair below is an exact hold/release solver coordinate.
  //
  // M43 extends the ladder by one coordinate, to 5.3 / 200 - one of the two D-053
  // held back as "validated tuning headroom, not live bands".
  //
  // D-050's frontier covered the raw catalog through 5.7 / 190, and D-051's
  // boundary job exercised that ceiling. D-075 corrects the later overclaim:
  // neither result covered M44's raised coordinates or the policy-adjusted
  // sequences that the scheduler actually emits. The retained release audit now
  // runs this live ladder and the portal clamp against that shipped catalog.
  //
  // Now there is. The ladder had never actually governed play: `monas-runtime.js`
  // overwrote `gameSpeed` every frame from a flat ramp, so a run climbed 0.007 per
  // gate and levelled off around 3.17. With that clobber removed the top of the
  // ladder is reached for the first time, and the owner's report - that MONAS stops
  // speeding up - is about the ceiling as much as the climb.
  //
  // 5.7 / 190 deliberately stays off this list, and not out of caution. It is the
  // hardest coordinate the audit covers, and M43 gives it to the *portal*: the
  // wager clamps there, so entering one is always faster and tighter than the
  // corridor it interrupts. Promoting it to a live band would have made the
  // top-band portal identical to ordinary play - a section with a stake, a dark
  // field, and no escalation at all, which the M43 browser suite caught the first
  // time it was tried. The hardest thing in the rite should be the thing you wager
  // on, not the thing you arrive at.
  //
  // The Fold 6 feel/readability gate D-053 named is still owed, and is still owed
  // for the bands below this one. It gates the release, not the tuning.
  const BANDS = Object.freeze([
    Object.freeze({ id: 'still', gateThreshold: 0,  speed: 2.9, gap: 260 }),
    Object.freeze({ id: 'current-i', gateThreshold: 6,  speed: 3.5, gap: 248 }),
    Object.freeze({ id: 'current-ii', gateThreshold: 15, speed: 4.2, gap: 235 }),
    Object.freeze({ id: 'axis', gateThreshold: 27, speed: 4.9, gap: 220 }),
    Object.freeze({ id: 'orbit', gateThreshold: 42, speed: 5.5, gap: 205 }),
    Object.freeze({ id: 'crown', gateThreshold: 60, speed: 6.0, gap: 192 }),
    Object.freeze({ id: 'ascent', gateThreshold: 82, speed: 6.4, gap: 180 }),
    // M47: steeper speed curve per playtest feedback. Every coordinate is within
    // the (7.0, 160) envelope proven by the retained boundary audit: each speed
    // is at most 7.0 and each gap is at least 160, so monotonicity from the
    // portal-search-ceiling (7.0/160) guarantees reachability.
    //
    // 7.0/160 is still deliberately absent as a live band: it is the portal's
    // clamp, and promoting it makes a top-band portal identical to ordinary play.
    Object.freeze({ id: 'torrent', gateThreshold: 108, speed: 6.7, gap: 172 }),
    Object.freeze({ id: 'maelstrom', gateThreshold: 138, speed: 6.9, gap: 165 })
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

  // --- the descent ----------------------------------------------------------
  //
  // What happens after the last band, which until M44 was: nothing.
  //
  // `getBandIndex` saturates at the final band, so every quantity derived from it
  // froze there - speed, gap, and the spawn rate that derives from speed. A player
  // who reached the top had reached the end of the game's difficulty and could stay
  // there indefinitely. That is the whole of the owner's report that the run "stops
  // building" and that late runs go on forever.
  //
  // The corridor is the one lever with proven headroom left. Speed is at the
  // re-searched ceiling and the ceiling belongs to the portal; wall spacing turned
  // out to have none at all (M44's repaired frontier rejected even a 6% tightening
  // at the hardest coordinate). So the descent closes the corridor from the final
  // band's gap toward `MIN_VALIDATED_GAP`, which is audited at the top speed, in
  // steps that never reach it faster than a player can adapt.
  //
  // It is bounded, not endless: the game still plateaus, but at 160 rather than 170
  // and after a much longer climb.
  const DESCENT_GATES_PER_STEP = 30;
  const DESCENT_GAP_PER_STEP = 2;
  const DESCENT_SPEED_PER_STEP = 0.02;

  function descentStepsAt(gatesPassed) {
    const last = BANDS[BANDS.length - 1];
    const beyond = Math.max(0, Math.floor(finite(gatesPassed, 0)) - last.gateThreshold);
    return Math.floor(beyond / DESCENT_GATES_PER_STEP);
  }

  function nominalSpeedFor(gatesPassed) {
    const band = getBand(gatesPassed);
    const drift = descentStepsAt(gatesPassed) * DESCENT_SPEED_PER_STEP;
    return Math.min(MAX_VALIDATED_SPEED, band.speed + drift);
  }

  /** The nominal corridor at this gate count, final band and descent included. */
  function nominalGapFor(gatesPassed) {
    const band = getBand(gatesPassed);
    const narrowed = band.gap - (descentStepsAt(gatesPassed) * DESCENT_GAP_PER_STEP);
    return Math.max(MIN_VALIDATED_GAP, narrowed);
  }

  function gapFor(gatesPassed, frames = 0, surgeActive = false) {
    const breathing = Math.sin(finite(frames, 0) * 0.05) * GAP_OSCILLATION_PX;
    const base = nominalGapFor(gatesPassed) + breathing;
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
    const speed = nominalSpeedFor(state.gatesPassed) * geometrySpeedFactor(gameInstance);

    state.progressionVersion = PROGRESSION_VERSION;
    state.progressionBandIndex = nextIndex;
    state.progressionGateThreshold = band.gateThreshold;
    state.progressionSpeed = speed;
    // The descent's corridor, not the band's, so anything reading
    // `progressionGap` - the portal's clamp above all - narrows with it.
    state.progressionGap = nominalGapFor(state.gatesPassed);
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

    /**
     * `__monasSectionGap`: the corridor a live MONAS section owns, if one does.
     *
     * This wrap is the outermost `getCurrentGap` for MONAS - it installs after
     * `monas-runtime.js` and returns without delegating - so a section that wants a
     * different corridor cannot simply wrap the method itself; it would end up
     * underneath this and never be called. Rather than have this module know what
     * sections exist, it reads one number off the instance and the section writes
     * it. `monas-runtime.js`'s portal is the first and only writer today.
     *
     * The breathing wobble and the surge widening still apply on top, because they
     * are properties of the rite rather than of the corridor width.
     */
    Game.prototype.getCurrentGap = function getMonasProgressionGap(...args) {
      if (!isMonas(this) || !this.monasState) return originalGetCurrentGap.apply(this, args);
      const section = finite(this.__monasSectionGap, NaN);
      if (Number.isFinite(section) && section > 0) {
        const breathing = Math.sin(finite(this.frames, 0) * 0.05) * GAP_OSCILLATION_PX;
        const base = section + breathing;
        return this.monasState.surgeActive ? base * SURGE_GAP_MULTIPLIER : base;
      }
      return gapFor(this.monasState.gatesPassed, this.frames, Boolean(this.monasState.surgeActive));
    };

    Game.prototype.updateGameObjects = function updateMonasProgression(...args) {
      if (!isMonas(this) || !this.monasState) return originalUpdateGameObjects.apply(this, args);
      const gatesBefore = Math.max(0, Math.floor(finite(this.monasState.gatesPassed, 0)));

      // M43: re-assert the ladder every frame, before the inner update reads
      // `gameSpeed`.
      //
      // Applying only on gate changes made the speed a value written once and then
      // trusted, which goes stale the moment anything else moves: a posture change
      // recaptures the geometry base, and a run started before the canvas settled
      // into portrait kept the desktop base until its next gate. The previous
      // arrangement hid that because `monas-runtime.js` recomputed the speed from
      // scratch every frame - the very clobber M43.1 removed. Removing it without
      // replacing the per-frame guarantee traded one defect for a subtler one.
      //
      // This is not a second writer. It is the same call, made unconditionally, so
      // `gameSpeed` is a function of the run's state rather than a cached result.
      // `applyProgression` is idempotent and only increments `progressionChanges`
      // when the band index actually moves, so a frame that changes nothing writes
      // the same number it already held.
      applyProgression(this, { countChange: false });

      const result = originalUpdateGameObjects.apply(this, args);

      // And again if this frame cleared a gate, so the band advances on the frame
      // it was earned rather than on the next one - `countChange` is left at its
      // default here because this is the call that represents a real progression.
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
    GAP_OSCILLATION_PX,
    BANDS,
    MAX_VALIDATED_SPEED,
    MIN_VALIDATED_GAP,
    DESCENT_GATES_PER_STEP,
    DESCENT_GAP_PER_STEP,
    DESCENT_SPEED_PER_STEP,
    descentStepsAt,
    nominalSpeedFor,
    nominalGapFor,
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
