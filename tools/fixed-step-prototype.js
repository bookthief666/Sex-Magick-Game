(function installSexMagickFixedStepRuntime() {
  'use strict';

  const api = globalThis.SexMagickFixedStep;
  if (!api?.FixedStepClock) {
    throw new Error('SexMagickFixedStep.FixedStepClock must load before the fixed-step runtime');
  }
  if (typeof Game === 'undefined' || typeof GameState === 'undefined') {
    throw new Error('SEX MAGICK game classes are unavailable; load the fixed-step runtime after the game script');
  }
  if (Game.prototype.__fixedStepRuntimeInstalled) return;

  const STEP_MS = 1000 / 60;
  const MAX_STEPS_PER_FRAME = 5;
  const SUSPENSION_RESET_MS = 250;

  function ensureClock(instance) {
    if (!instance.fixedStepClock) {
      instance.fixedStepClock = new api.FixedStepClock({
        stepMs: STEP_MS,
        maxStepsPerFrame: MAX_STEPS_PER_FRAME,
        suspensionResetMs: SUSPENSION_RESET_MS
      });
    }
    return instance.fixedStepClock;
  }

  Game.prototype.resetFixedStepTiming = function resetFixedStepTiming() {
    ensureClock(this).reset();
    this.renderLastFrameTime = 0;
    this.lastFrameTime = 0;
    this.fixedStepLastResult = null;
  };

  Game.prototype.runFixedSimulationStep = function runFixedSimulationStep() {
    if (this.hitStop > 0) {
      this.hitStop -= 1;
      return;
    }

    this.frames += 1;

    if (this.frames % 30 === 0 && Math.random() > 0.8) {
      GlitchFX.trigger(10, 'random');
    }

    if (this.voidMode) {
      this.voidTimer -= 1;
      if (this.voidTimer <= 0) this.endVoidMode();
    }

    this.tunnelOffset += this.tunnelSpeed * (1 + this.gameSpeed * 0.1) || 10;
    this.updateGameObjects();
  };

  Game.prototype.scheduleFixedStepFrame = function scheduleFixedStepFrame() {
    if (this.fixedStepRafId != null) return;

    this.fixedStepRafId = requestAnimationFrame(time => {
      this.fixedStepRafId = null;
      this.gameLoop(time);
    });
  };

  Game.prototype.gameLoop = function fixedStepGameLoop(currentTime) {
    if (this.state !== GameState.PLAYING) {
      ensureClock(this).reset();
      this.renderLastFrameTime = 0;
      return;
    }

    const manualCall = !Number.isFinite(currentTime);
    const clock = ensureClock(this);

    if (manualCall) {
      const now = performance.now();
      clock.reset(now - STEP_MS);
      this.renderLastFrameTime = 0;

      // An already scheduled frame will continue the loop. Returning here prevents
      // pause/resume or rapid restart from creating a second RAF chain.
      if (this.fixedStepRafId != null) return;
      currentTime = now;
    }

    if (this.renderLastFrameTime) {
      const renderDelta = currentTime - this.renderLastFrameTime;
      if (renderDelta > 0) {
        this.fps = Math.round(1000 / renderDelta);
        if (CONFIG.DEBUG) document.getElementById('fpsCounter').textContent = this.fps;
      }
    }
    this.renderLastFrameTime = currentTime;
    this.lastFrameTime = currentTime;

    this.fixedStepLastResult = clock.advance(currentTime, () => {
      if (this.state === GameState.PLAYING) this.runFixedSimulationStep();
    });

    this.drawScene(currentTime);

    if (this.state === GameState.PLAYING) {
      this.scheduleFixedStepFrame();
    }
  };

  Game.prototype.__fixedStepRuntimeInstalled = true;

  globalThis.__SEX_MAGICK_TIMING__ = Object.freeze({
    mode: 'fixed-step-runtime',
    version: 1,
    stepMs: STEP_MS,
    maxStepsPerFrame: MAX_STEPS_PER_FRAME,
    suspensionResetMs: SUSPENSION_RESET_MS,
    getSnapshot() {
      if (typeof game === 'undefined' || !game) return null;
      const clock = ensureClock(game);
      return {
        state: game.state,
        rite: game.gameMode,
        renderFps: game.fps,
        simulationFrames: game.frames,
        score: game.score,
        pendingRaf: game.fixedStepRafId != null,
        lastAdvance: game.fixedStepLastResult,
        clock: clock.snapshot()
      };
    }
  });

  if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG) {
    console.info('[SEX MAGICK] Fixed-step runtime installed', {
      stepMs: STEP_MS,
      maxStepsPerFrame: MAX_STEPS_PER_FRAME,
      suspensionResetMs: SUSPENSION_RESET_MS
    });
  }
})();

(function bootstrapCollisionTruthRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickCollision ||
    document.querySelector('script[data-sex-magick-collision-runtime]')
  ) {
    return;
  }

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./collision-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickCollisionRuntime = 'true';
  script.onerror = () => {
    console.error('[SEX MAGICK] Collision truth runtime failed to load', script.src);
  };
  document.head.appendChild(script);
})();

(function bootstrapRunTelemetryRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickRunTelemetry ||
    document.querySelector('script[data-sex-magick-run-telemetry]')
  ) {
    return;
  }

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./run-telemetry.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickRunTelemetry = 'true';
  script.onerror = () => {
    console.error('[SEX MAGICK] Local run telemetry failed to load', script.src);
  };
  document.head.appendChild(script);
})();

(function bootstrapObstacleGrammarRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickObstacleGrammar ||
    document.querySelector('script[data-sex-magick-obstacle-grammar]')
  ) {
    return;
  }

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./obstacle-grammar.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickObstacleGrammar = 'true';
  script.onerror = () => {
    console.error('[SEX MAGICK] Deterministic obstacle grammar failed to load', script.src);
  };
  document.head.appendChild(script);
})();

(function bootstrapReachabilityPolicyRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickReachabilityPolicy ||
    document.querySelector('script[data-sex-magick-reachability-policy]')
  ) {
    return;
  }

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./reachability-policy.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickReachabilityPolicy = 'true';
  script.onerror = () => {
    console.error('[SEX MAGICK] Reachability policy failed to load', script.src);
  };
  document.head.appendChild(script);
})();