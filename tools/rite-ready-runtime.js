(function attachSexMagickRiteReady(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickRiteReady = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.scheduleInstall();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRiteReadyApi(root) {
  'use strict';

  const VERSION = 1;
  const INSTALL_TIMEOUT_MS = 12_000;
  const READY_INSTRUCTION = '[ TAP / SPACE TO BEGIN ]';

  let installed = false;
  let installTimer = null;

  function isPlaying(gameInstance) {
    const playing = typeof GameState !== 'undefined' ? GameState.PLAYING : 'playing';
    return gameInstance?.state === playing;
  }

  function isReady(gameInstance) {
    return Boolean(gameInstance?.awaitingRiteInput) && isPlaying(gameInstance);
  }

  /**
   * Mark a newly selected rite as armed but not yet in motion.
   *
   * This happens before the delegated startGame call. The base startGame invokes
   * gameLoop synchronously, so setting the flag afterward would still allow one
   * gravity/simulation step — exactly the one-frame drop this threshold exists to
   * remove.
   */
  function prepareRiteReadyState(gameInstance) {
    if (!gameInstance) return null;
    gameInstance.awaitingRiteInput = true;
    gameInstance.__sexMagickRiteReadyVisualFrames = 0;
    return gameInstance;
  }

  /**
   * Begin actual play on the first gameplay input after rite selection.
   *
   * Recorder clocks are rebased here so time spent admiring the suspended glyph is
   * not counted as gameplay. The Worker token may be older than the run clock,
   * which is safe: its contract only requires the claimed run not to predate the
   * server-issued token. The token still cannot be minted after the score exists.
   */
  function activateRiteReadyState(gameInstance, startedAt = new Date().toISOString()) {
    if (!gameInstance?.awaitingRiteInput) return { activated: false };

    gameInstance.awaitingRiteInput = false;
    gameInstance.__sexMagickRiteReadyVisualFrames = 0;
    gameInstance.frames = 0;
    gameInstance.tunnelOffset = 0;

    const height = Number(gameInstance.canvas?.height);
    if (gameInstance.player) {
      if (Number.isFinite(height) && height > 0) gameInstance.player.y = height / 2;
      gameInstance.player.vy = 0;
      gameInstance.player.jumpCooldown = 0;
      gameInstance.player.__sexMagickPendingJumpFrames = 0;
    }

    const rite = gameInstance.gameMode === 'MONAS' ? 'MONAS' : 'HEX';
    if (rite === 'HEX' && gameInstance.gateSliceState && !gameInstance.gateSliceState.endedAt) {
      gameInstance.gateSliceState.startedAt = startedAt;
    }
    if (rite === 'MONAS' && gameInstance.monasState && !gameInstance.monasState.endedAt) {
      gameInstance.monasState.startedAt = startedAt;
    }

    try { gameInstance.resetFixedStepTiming?.(); } catch (_error) {}

    return { activated: true, rite, startedAt };
  }

  function visualQaActive() {
    try {
      return new URLSearchParams(root.location?.search || '').get('visualQa') === '1';
    } catch (_error) {
      return false;
    }
  }

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById('sex-magick-rite-ready-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-rite-ready-style';
    style.textContent = `
      #instructions.sex-magick-rite-ready {
        opacity: 1 !important;
        animation: none !important;
        color: rgba(255,255,255,.82) !important;
        text-shadow: 0 0 10px rgba(255,255,255,.42);
      }
      #instructions.sex-magick-rite-ready::after {
        content: '';
        display: inline-block;
        width: .7em;
        height: .7em;
        margin-left: 10px;
        border: 1px solid currentColor;
        border-radius: 50%;
        vertical-align: middle;
        animation: sex-magick-ready-pulse 1.2s ease-in-out infinite;
      }
      @keyframes sex-magick-ready-pulse {
        0%, 100% { opacity: .25; transform: scale(.78); }
        50% { opacity: 1; transform: scale(1.12); }
      }
      html.sex-magick-reduced-motion #instructions.sex-magick-rite-ready::after {
        animation: none !important;
        opacity: .7;
      }
    `;
    document.head.appendChild(style);
  }

  function instructionForRite(gameInstance) {
    return gameInstance?.gameMode === 'MONAS'
      ? '[ HOLD / RELEASE TO GLIDE ]'
      : '[ TAP / SPACE TO ASCEND ]';
  }

  function showReadyPresentation(gameInstance) {
    if (typeof document === 'undefined' || visualQaActive()) return;
    ensureStyle();
    const instruction = document.getElementById('instructions');
    if (instruction) {
      instruction.textContent = READY_INSTRUCTION;
      instruction.classList.add('sex-magick-rite-ready');
      instruction.classList.remove('hidden');
    }
    const indicator = document.querySelector('.mobile-jump-indicator');
    if (indicator) indicator.textContent = 'TAP ANYWHERE TO BEGIN';
    const pause = document.getElementById('pauseBtn');
    if (pause) pause.classList.add('hidden');
  }

  function showActivePresentation(gameInstance) {
    if (typeof document === 'undefined' || visualQaActive()) return;
    const instruction = document.getElementById('instructions');
    if (instruction) {
      instruction.classList.remove('sex-magick-rite-ready');
      instruction.textContent = instructionForRite(gameInstance);
      // Re-applying the base animation after the no-animation ready state starts
      // its five-second teaching window from the actual first input, not from the
      // rite-selection click.
      instruction.style.animation = 'none';
      void instruction.offsetWidth;
      instruction.style.animation = '';
    }
    const indicator = document.querySelector('.mobile-jump-indicator');
    if (indicator) {
      indicator.textContent = gameInstance?.gameMode === 'MONAS' ? 'HOLD / RELEASE' : 'TAP ANYWHERE';
    }
    const pause = document.getElementById('pauseBtn');
    if (pause) pause.classList.remove('hidden');

    if (gameInstance?.isMobile) {
      const controls = document.getElementById('mobileControls');
      if (controls) {
        controls.classList.remove('hidden');
        setTimeout(() => {
          if (!gameInstance.awaitingRiteInput) controls.classList.add('hidden');
        }, 5000);
      }
    }
  }

  function clearReadyPresentation() {
    if (typeof document === 'undefined') return;
    const instruction = document.getElementById('instructions');
    if (instruction) instruction.classList.remove('sex-magick-rite-ready');
  }

  function drawReadyAura(ctx, player) {
    if (!ctx || !player || typeof game === 'undefined' || game.player !== player || !isReady(game)) return;
    const reduced = Boolean(document?.documentElement?.classList?.contains('sex-magick-reduced-motion'));
    const frame = Number(game.__sexMagickRiteReadyVisualFrames || game.frames || 0);
    const hue = (frame * 2.4) % 360;
    const pulse = reduced ? 1 : (1 + Math.sin(frame * 0.08) * 0.14);
    const radius = Math.max(18, Number(player.r || 14) * 2.15 * pulse);

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${reduced ? 0.42 : 0.62})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (!reduced) {
      ctx.strokeStyle = `hsla(${(hue + 120) % 360}, 100%, 72%, 0.24)`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function dependenciesReady() {
    return (
      typeof Game !== 'undefined' && Boolean(Game?.prototype) &&
      typeof Player !== 'undefined' && Boolean(Player?.prototype) &&
      Boolean(Game.prototype.__fixedStepRuntimeInstalled) &&
      Boolean(Game.prototype.__collisionTruthRuntimeInstalled)
    );
  }

  function install() {
    if (installed || Game.prototype.__riteReadyRuntimeInstalled) return root.__SEX_MAGICK_RITE_READY__ || null;
    if (!dependenciesReady()) return null;

    installed = true;
    ensureStyle();

    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalReturnToMenu = Game.prototype.returnToMenu;
    const originalTogglePause = Game.prototype.togglePause;
    const originalPlayerJump = Game.prototype.playerJump;
    const originalGameLoop = Game.prototype.gameLoop;
    const originalPlayerDraw = Player.prototype.draw;

    Game.prototype.startGame = function startRiteAtThreshold(...args) {
      prepareRiteReadyState(this);
      const result = originalStartGame.apply(this, args);
      if (!isPlaying(this) || !this.player) {
        this.awaitingRiteInput = false;
        clearReadyPresentation();
        return result;
      }

      const height = Number(this.canvas?.height);
      if (Number.isFinite(height) && height > 0) this.player.y = height / 2;
      this.player.vy = 0;
      this.player.jumpCooldown = 0;
      this.player.__sexMagickPendingJumpFrames = 0;
      showReadyPresentation(this);
      return result;
    };

    Game.prototype.playerJump = function beginThenDispatchInput(...args) {
      if (isReady(this)) {
        const activation = activateRiteReadyState(this);
        showActivePresentation(this);
        try {
          root.dispatchEvent?.(new CustomEvent('sex-magick:rite-activated', {
            detail: { rite: activation.rite, startedAt: activation.startedAt }
          }));
        } catch (_error) {}
      }
      return originalPlayerJump.apply(this, args);
    };

    Game.prototype.gameLoop = function suspendedRiteReadyLoop(currentTime) {
      if (!isReady(this)) return originalGameLoop.apply(this, arguments);

      const now = Number.isFinite(currentTime)
        ? currentTime
        : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
      this.__sexMagickRiteReadyVisualFrames = Number(this.__sexMagickRiteReadyVisualFrames || 0) + 1;
      this.frames = this.__sexMagickRiteReadyVisualFrames;
      this.tunnelOffset = Number(this.tunnelOffset || 0) + 0.35;

      const height = Number(this.canvas?.height);
      if (this.player) {
        if (Number.isFinite(height) && height > 0) this.player.y = height / 2;
        this.player.vy = 0;
      }

      // Render-only threshold: no updateGameObjects, no pillars, no gravity, no
      // scoring and no run progression until the deliberate second input.
      this.drawScene(now);
      if (isReady(this)) {
        if (typeof this.scheduleFixedStepFrame === 'function') this.scheduleFixedStepFrame();
        else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(time => this.gameLoop(time));
      }
      return undefined;
    };

    Player.prototype.draw = function drawWithRiteReadyAura(...args) {
      const result = originalPlayerDraw.apply(this, args);
      drawReadyAura(args[0], this);
      return result;
    };

    Game.prototype.togglePause = function noPauseBeforeRiteBegins(...args) {
      if (isReady(this)) return false;
      return originalTogglePause.apply(this, args);
    };

    Game.prototype.returnToMenu = function clearRiteReadyOnMenu(...args) {
      this.awaitingRiteInput = false;
      clearReadyPresentation();
      return originalReturnToMenu.apply(this, args);
    };

    Game.prototype.restartGame = function restartWithFreshGlobalToken(...args) {
      this.awaitingRiteInput = false;
      clearReadyPresentation();
      const result = originalRestartGame.apply(this, args);
      const rite = this.gameMode === 'MONAS' ? 'MONAS' : 'HEX';
      // The original global-board client starts a token from startGame only. A
      // retry is a new run too; mint its token after all outer recorder wrappers
      // have completed their restart bookkeeping.
      setTimeout(() => {
        try { root.__SEX_MAGICK_GLOBAL_BOARD__?.beginRun?.(rite); } catch (_error) {}
      }, 0);
      return result;
    };

    Game.prototype.__riteReadyRuntimeInstalled = true;

    root.__SEX_MAGICK_RITE_READY__ = Object.freeze({
      mode: 'deliberate-second-input-threshold',
      version: VERSION,
      isReady() { return typeof game !== 'undefined' ? isReady(game) : false; },
      getSnapshot() {
        if (typeof game === 'undefined' || !game) return null;
        return {
          awaitingInput: Boolean(game.awaitingRiteInput),
          rite: game.gameMode === 'MONAS' ? 'MONAS' : 'HEX',
          playerY: game.player?.y ?? null,
          playerVy: game.player?.vy ?? null,
          simulationFrames: game.awaitingRiteInput ? 0 : game.frames,
          readyVisualFrames: game.__sexMagickRiteReadyVisualFrames || 0
        };
      }
    });

    return root.__SEX_MAGICK_RITE_READY__;
  }

  function scheduleInstall(timeoutMs = INSTALL_TIMEOUT_MS) {
    if (installed || installTimer) return;
    const started = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - started >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 25);
  }

  return Object.freeze({
    VERSION,
    prepareRiteReadyState,
    activateRiteReadyState,
    isReady,
    install,
    scheduleInstall
  });
});
