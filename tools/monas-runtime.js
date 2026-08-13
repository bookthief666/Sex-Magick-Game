/**
 * The Rite of Monas — the opposite rite.
 *
 * HEX is a diver. Its whole risk model is courting the edge: near-misses pay,
 * grazing a pillar builds Gnosis, and a timid line through the middle of a gap is
 * explicitly worth less. MONAS inverts every part of that.
 *
 * **Hold to glide.** HEX taps. MONAS holds: lift applies while the input is held and
 * the glyph sinks when it is released, through a medium rather than through vacuum.
 * The original mode already used gravity 0.18 with 0.98 damping against HEX's 0.45
 * and no damping, so the floaty feel was there — it just had nothing to do with it.
 *
 * **Coherence, not risk.** Passing near the *centre* of a gap pays, and flying
 * smoothly pays; thrashing the input costs. The M17 reachability solver measures the
 * consequence of the physics directly: under an identical stress sequence MONAS fails
 * a band earlier than HEX, because 0.18 gravity cannot dive to a low gate in time.
 * That is not a defect to compensate for, it is the rite's character, and Coherence
 * is the scoring model that rewards flying the way the physics wants to be flown.
 *
 * **The Warp Surge.** A full Coherence meter spends itself on speed rather than on a
 * wager. The tunnel opens up, the warp starfield streaks — `WarpStar` and its
 * `voidMode` branch have been in `index.html` since 1.0, drawn only in MONAS and,
 * until now, only reachable in a mode that could not start.
 *
 * The Gate slice owns HEX and does not run here: every one of its overrides guards on
 * `gateSliceState`, which only exists for a HEX run, so MONAS falls through to the
 * original loop and this module layers on top of that.
 */
(function attachSexMagickMonas(root) {
  'use strict';

  const MONAS_VERSION = 1;
  const INSTALL_TIMEOUT_MS = 12_000;

  // --- glide -------------------------------------------------------------------
  // Tuned against the original MONAS profile rather than replacing it: gravity and
  // damping stay as they were, and lift is what the hold adds.
  const GRAVITY = 0.18;
  const DAMPING = 0.98;
  const LIFT = -0.62;
  const MAX_RISE = -6.4;
  const MAX_FALL = 8.2;

  // --- coherence ---------------------------------------------------------------
  const COHERENCE_CAPACITY = 10;
  // A pass dead centre is worth a full point; the reward falls away toward the edge
  // and is worth nothing in the outer fifth of the gap.
  const CENTRE_TOLERANCE = 0.8;
  // Thrash is measured as reversals of vertical direction per gate. Two is ordinary
  // control; beyond that the line is not smooth and the bonus decays.
  const SMOOTH_REVERSALS = 2;
  const SMOOTHNESS_SHARE = 0.35;

  // --- warp surge --------------------------------------------------------------
  const SURGE_FRAMES = 6 * 60;
  const SURGE_SPEED_MULTIPLIER = 1.45;
  const SURGE_SCORE_MULTIPLIER = 2;

  let installed = false;
  let installTimer = null;
  let held = false;

  function finite(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function isMonas(gameInstance) {
    return gameInstance?.gameMode === 'MONAS';
  }

  /**
   * One frame of glide.
   *
   * Pure, so the feel can be reasoned about and tested without a browser: gravity
   * pulls, lift opposes it while held, damping bleeds momentum so neither a climb nor
   * a dive runs away, and the result is clamped to a rise and fall ceiling.
   */
  function advanceGlide(state, options = {}) {
    const lifting = Boolean(options.held);
    const gravity = finite(options.gravity, GRAVITY);
    const damping = finite(options.damping, DAMPING);
    const lift = finite(options.lift, LIFT);
    const maxRise = finite(options.maxRise, MAX_RISE);
    const maxFall = finite(options.maxFall, MAX_FALL);

    let vy = finite(state?.vy, 0);
    vy += gravity;
    if (lifting) vy += lift;
    vy *= damping;
    vy = clamp(vy, maxRise, maxFall);

    return { y: finite(state?.y, 0) + vy, vy, held: lifting };
  }

  /**
   * What a gate pass was worth.
   *
   * `offset` is the distance from the gap's centre line, so 0 is a perfect pass.
   * `reversals` is how many times vertical direction changed while approaching, which
   * is what separates a held line from a sawtooth that happens to end up centred.
   */
  function scoreCoherence(pass = {}) {
    const gap = Math.max(1, finite(pass.gap, 200));
    const offset = Math.abs(finite(pass.offset, 0));
    const half = gap / 2;

    // 1 at the centre line, 0 once the pass is within the outer fifth of the gap.
    const centred = clamp(1 - (offset / (half * CENTRE_TOLERANCE)), 0, 1);

    const reversals = Math.max(0, finite(pass.reversals, 0));
    const smooth = clamp(1 - Math.max(0, reversals - SMOOTH_REVERSALS) / 4, 0, 1);

    const gained = (centred * (1 - SMOOTHNESS_SHARE)) + (centred * smooth * SMOOTHNESS_SHARE);
    return {
      centred: Math.round(centred * 1000) / 1000,
      smooth: Math.round(smooth * 1000) / 1000,
      gained: Math.round(gained * 1000) / 1000
    };
  }

  function createMonasState() {
    return {
      version: MONAS_VERSION,
      rite: 'MONAS',
      coherence: 0,
      coherenceCapacity: COHERENCE_CAPACITY,
      gatesPassed: 0,
      perfectPasses: 0,
      bestCentred: 0,
      surges: 0,
      surgeFramesRemaining: 0,
      surgeActive: false
    };
  }

  /**
   * Add a gate pass to the run, and open a Warp Surge when the meter fills.
   */
  function applyCoherence(state, pass) {
    const next = { ...state };
    const result = scoreCoherence(pass);
    next.gatesPassed += 1;
    next.bestCentred = Math.max(finite(next.bestCentred, 0), result.centred);
    if (result.centred >= 0.999) next.perfectPasses += 1;

    let surgeStarted = false;
    if (!next.surgeActive) {
      next.coherence = clamp(next.coherence + result.gained, 0, next.coherenceCapacity);
      if (next.coherence >= next.coherenceCapacity) {
        next.coherence = 0;
        next.surgeActive = true;
        next.surgeFramesRemaining = SURGE_FRAMES;
        next.surges += 1;
        surgeStarted = true;
      }
    }

    return { state: next, result, surgeStarted };
  }

  function tickSurge(state) {
    if (!state.surgeActive) return { state, surgeEnded: false };
    const remaining = Math.max(0, finite(state.surgeFramesRemaining, 0) - 1);
    if (remaining > 0) return { state: { ...state, surgeFramesRemaining: remaining }, surgeEnded: false };
    return { state: { ...state, surgeActive: false, surgeFramesRemaining: 0 }, surgeEnded: true };
  }

  // --- DOM / runtime installation ------------------------------------------------

  function ensureHud() {
    if (document.getElementById('monas-hud')) return document.getElementById('monas-hud');
    const style = document.createElement('style');
    style.id = 'monas-hud-style';
    style.textContent = `
      #monas-hud {
        position: fixed; left: 50%; top: 12px; transform: translateX(-50%);
        z-index: 28; width: min(320px, calc(100vw - 40px));
        font: 11px/1.5 'Orbitron', monospace; letter-spacing: 2px;
        color: #ffd700; text-align: center; pointer-events: none;
        text-shadow: 0 0 10px rgba(255, 215, 0, .6);
      }
      #monas-hud[hidden] { display: none !important; }
      #monas-meter {
        height: 4px; margin-top: 5px; background: rgba(255, 215, 0, .18);
        border: 1px solid rgba(255, 215, 0, .45);
      }
      #monas-meter-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #ffd700, #fff6c9);
      }
      html.sex-magick-reduced-motion #monas-meter-fill { transition: none; }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'monas-hud';
    hud.hidden = true;
    hud.innerHTML = '<div id="monas-status">COHERENCE</div><div id="monas-meter"><div id="monas-meter-fill"></div></div>';
    document.body.appendChild(hud);
    return hud;
  }

  function renderHud(gameInstance) {
    const hud = ensureHud();
    const state = gameInstance?.monasState;
    const active = Boolean(state) && isMonas(gameInstance) && gameInstance.state !== GameState.START;
    hud.hidden = !active;
    if (!active) return;

    const status = document.getElementById('monas-status');
    const fill = document.getElementById('monas-meter-fill');
    if (state.surgeActive) {
      const seconds = Math.ceil(state.surgeFramesRemaining / 60);
      if (status) status.textContent = `WARP SURGE · ${seconds}s`;
      if (fill) fill.style.width = `${clamp(state.surgeFramesRemaining / SURGE_FRAMES, 0, 1) * 100}%`;
      return;
    }
    if (status) status.textContent = `COHERENCE ${state.coherence.toFixed(1).replace('.0', '')} / ${state.coherenceCapacity}`;
    if (fill) fill.style.width = `${clamp(state.coherence / state.coherenceCapacity, 0, 1) * 100}%`;
  }

  function trackHold() {
    const press = () => { held = true; };
    const release = () => { held = false; };
    root.addEventListener('pointerdown', press, { passive: true });
    root.addEventListener('pointerup', release, { passive: true });
    root.addEventListener('pointercancel', release, { passive: true });
    root.addEventListener('blur', release);
    root.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.key === 'w') press();
    });
    root.addEventListener('keyup', event => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.key === 'w') release();
    });
  }

  function dependenciesReady() {
    return (
      typeof game !== 'undefined' && Boolean(game) &&
      typeof Game !== 'undefined' && Boolean(Game?.prototype) &&
      typeof GameState !== 'undefined' &&
      typeof Player !== 'undefined' && Boolean(Player?.prototype)
    );
  }

  function install() {
    if (installed || Game.prototype.__monasRuntimeInstalled) return root.__SEX_MAGICK_MONAS__ || null;
    if (!dependenciesReady()) return null;
    installed = true;
    Game.prototype.__monasRuntimeInstalled = true;

    ensureHud();
    trackHold();

    const originalStartGame = Game.prototype.startGame;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalGetCurrentGap = Game.prototype.getCurrentGap;
    const originalPlayerUpdate = Player.prototype.update;

    Game.prototype.startGame = function startMonasRun(...args) {
      const result = originalStartGame.apply(this, args);
      if (isMonas(this)) {
        this.monasState = createMonasState();
        this.voidMode = false;
        renderHud(this);
      } else {
        this.monasState = null;
      }
      return result;
    };

    /**
     * Glide replaces the flap, and only in MONAS. The original update still runs for
     * everything else it does - trail, rotation, squash, clamping - with the vertical
     * integration handed to `advanceGlide` first and the original's own gravity step
     * neutralised by restoring the velocity it would have applied.
     */
    Player.prototype.update = function monasPlayerUpdate(...args) {
      if (this.mode !== 'MONAS') return originalPlayerUpdate.apply(this, args);

      const glided = advanceGlide({ y: this.y, vy: this.vy }, { held });
      // Hand the original the velocity that glide decided on, then undo the gravity
      // and damping it applies itself so the step is not integrated twice.
      this.vy = (glided.vy - GRAVITY) / DAMPING;
      const result = originalPlayerUpdate.apply(this, args);
      this.__monasHeld = held;
      return result;
    };

    Game.prototype.getCurrentGap = function monasGap(...args) {
      const original = originalGetCurrentGap.apply(this, args);
      if (!isMonas(this) || !this.monasState?.surgeActive) return original;
      // The surge opens the corridor rather than tightening it: this is the reward,
      // not the wager. HEX's Void is the one that closes in.
      return original * 1.18;
    };

    Game.prototype.updateGameObjects = function monasUpdate(...args) {
      if (!isMonas(this) || !this.monasState) return originalUpdateGameObjects.apply(this, args);

      const before = this.obstacles.map(pillar => ({ pillar, marked: pillar.marked }));
      const playerY = this.player?.y ?? 0;

      // Vertical direction reversals are the smoothness signal, sampled per frame.
      const previousVy = finite(this.__monasPreviousVy, 0);
      const currentVy = finite(this.player?.vy, 0);
      if (previousVy !== 0 && Math.sign(currentVy) !== Math.sign(previousVy) && currentVy !== 0) {
        this.__monasReversals = finite(this.__monasReversals, 0) + 1;
      }
      this.__monasPreviousVy = currentVy;

      // The surge borrows the original's warp-star branch for its streak visual, and
      // that branch is read by drawScene(), which the game loop calls *after* this
      // method returns. So the flag has to survive past the end of this function or
      // the surge has a HUD and no visual at all.
      //
      // Leaving it set has its own hazard: the loop runs
      // `if (this.voidMode) { this.voidTimer--; if (this.voidTimer <= 0) this.endVoidMode(); }`
      // and `endVoidMode()` assigns `this.gameSpeed = this.preVoidSpeed`, which a
      // MONAS run never sets - so gameSpeed would become NaN. Holding the timer above
      // zero for the length of the surge keeps that path from ever running, and the
      // surge clears the flag itself when it ends.
      this.voidMode = Boolean(this.monasState.surgeActive);
      if (this.monasState.surgeActive) this.voidTimer = SURGE_FRAMES + 60;
      const surgeSpeed = this.monasState.surgeActive ? SURGE_SPEED_MULTIPLIER : 1;
      const baseSpeed = this.gameSpeed;
      if (surgeSpeed !== 1) this.gameSpeed = baseSpeed * surgeSpeed;

      const result = originalUpdateGameObjects.apply(this, args);

      if (surgeSpeed !== 1) this.gameSpeed = baseSpeed;

      for (const record of before) {
        if (!record.marked && record.pillar.marked) {
          const gap = finite(record.pillar.gap, 200);
          const centre = finite(record.pillar.top, 0) + (gap / 2);
          const applied = applyCoherence(this.monasState, {
            gap,
            offset: playerY - centre,
            reversals: finite(this.__monasReversals, 0)
          });
          this.monasState = applied.state;
          this.__monasReversals = 0;

          if (this.monasState.surgeActive && SURGE_SCORE_MULTIPLIER > 1) {
            this.score += SURGE_SCORE_MULTIPLIER - 1;
            const scoreUi = document.getElementById('scoreUi');
            if (scoreUi) scoreUi.textContent = String(this.score);
          }

          if (applied.result.centred >= 0.999) {
            for (let i = 0; i < 8; i += 1) {
              this.particles.push(new Particle(this.player.x, this.player.y, '#ffd700', 8, 'triangle'));
            }
          }
          if (applied.surgeStarted) {
            this.shake = 10;
            this.hitStop = 3;
            this.triggerLevelUpGlitch();
            for (let i = 0; i < 24; i += 1) {
              this.particles.push(new Particle(this.canvas.width / 2, this.canvas.height / 2, '#ffd700', 12, 'triangle'));
            }
            try { Haptics.levelUp(); } catch (_error) {}
          }
        }
      }

      if (this.monasState.surgeActive) {
        const ticked = tickSurge(this.monasState);
        this.monasState = ticked.state;
        if (ticked.surgeEnded) {
          this.voidMode = false;
          this.voidTimer = 0;
          try { document.getElementById('game-container')?.classList.remove('void-active'); } catch (_error) {}
        }
      }

      renderHud(this);
      return result;
    };

    root.__SEX_MAGICK_MONAS__ = Object.freeze({
      mode: 'rite-of-monas',
      version: MONAS_VERSION,
      getFingerprint() {
        return {
          monasVersion: MONAS_VERSION,
          gravity: GRAVITY,
          damping: DAMPING,
          lift: LIFT,
          maxRise: MAX_RISE,
          maxFall: MAX_FALL,
          coherenceCapacity: COHERENCE_CAPACITY,
          surgeFrames: SURGE_FRAMES,
          surgeSpeedMultiplier: SURGE_SPEED_MULTIPLIER
        };
      },
      getSnapshot() {
        if (typeof game === 'undefined' || !game?.monasState) return null;
        return { ...game.monasState, held };
      },
      setHeldForTest(value) { held = Boolean(value); return held; },
      renderHud() { renderHud(typeof game !== 'undefined' ? game : null); }
    });

    return root.__SEX_MAGICK_MONAS__;
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
    MONAS_VERSION,
    GRAVITY, DAMPING, LIFT, MAX_RISE, MAX_FALL,
    COHERENCE_CAPACITY, CENTRE_TOLERANCE, SMOOTH_REVERSALS, SMOOTHNESS_SHARE,
    SURGE_FRAMES, SURGE_SPEED_MULTIPLIER, SURGE_SCORE_MULTIPLIER,
    clamp,
    advanceGlide,
    scoreCoherence,
    createMonasState,
    applyCoherence,
    tickSurge,
    install,
    scheduleInstall
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SexMagickMonas = api;

  if (typeof document !== 'undefined') scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);
