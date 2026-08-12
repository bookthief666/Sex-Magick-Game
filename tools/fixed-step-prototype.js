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

    const reducedMotion = typeof document !== 'undefined'
      && document.documentElement.classList.contains('sex-magick-reduced-motion');
    if (!reducedMotion && this.frames % 30 === 0 && Math.random() > 0.8) {
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
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./collision-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickCollisionRuntime = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Collision truth runtime failed to load', script.src);
  document.head.appendChild(script);
})();

(function bootstrapInputFeedbackPolicy() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickInputFeedbackPolicy ||
    document.querySelector('script[data-sex-magick-input-feedback-policy]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./input-feedback-policy.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickInputFeedbackPolicy = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Input feedback policy failed to load', script.src);
  document.head.appendChild(script);
})();

(function bootstrapRunTelemetryRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickRunTelemetry ||
    document.querySelector('script[data-sex-magick-run-telemetry]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./run-telemetry.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickRunTelemetry = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Local run telemetry failed to load', script.src);
  document.head.appendChild(script);
})();

// Waits for the Gate slice before installing, so its gameOver wrapper is the
// outermost one and still sees __gateSliceVoidActive when the shield decides
// whether to absorb.
(function bootstrapPowerupRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickPowerups ||
    document.querySelector('script[data-sex-magick-powerups]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./powerup-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickPowerups = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Power-up runtime failed to load', script.src);
  document.head.appendChild(script);
})();

// Observes the Gate slice rather than driving anything, so load order relative
// to it does not matter; it installs once the Game prototype exists.
(function bootstrapMissionsRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickMissions ||
    document.querySelector('script[data-sex-magick-missions]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./missions-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickMissions = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Missions runtime failed to load', script.src);
  document.head.appendChild(script);
})();

// Loads ahead of the grammar because spawnPatternPillar routes pillar geometry
// through the variety runtime's safety clamps when it is present.
(function bootstrapObstacleVarietyRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickObstacleVariety ||
    document.querySelector('script[data-sex-magick-obstacle-variety]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./obstacle-variety-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickObstacleVariety = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Obstacle variety runtime failed to load', script.src);
  document.head.appendChild(script);
})();

(function bootstrapObstacleGrammarRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickObstacleGrammar ||
    document.querySelector('script[data-sex-magick-obstacle-grammar]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./obstacle-grammar.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickObstacleGrammar = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Deterministic obstacle grammar failed to load', script.src);
  document.head.appendChild(script);
})();

(function bootstrapReachabilityPolicyRuntime() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const currentSource = document.currentScript?.src || window.location.href;
  const startedAt = Date.now();
  let status = 'waiting-for-grammar';
  let reason = null;

  function updateBootstrapStatus(nextStatus, nextReason = null) {
    status = nextStatus;
    reason = nextReason;
  }

  function sealMonas(message) {
    const button = document.getElementById('startMonasBtn');
    if (button) {
      button.disabled = true;
      button.dataset.reachabilityPolicyUnavailable = 'true';
      button.title = message;
      if (!button.textContent.includes('SEALED')) button.textContent = 'RITE OF MONAS — SEALED';
    }
  }

  function showPolicyFailure(instance, message) {
    sealMonas(message);
    if (!instance || instance.gameMode !== 'MONAS' || instance.state !== GameState.PLAYING) return;
    instance.togglePause();
    const heading = document.querySelector('#pauseScreen .title-text');
    if (heading) heading.textContent = 'RITE SEALED';
    const resume = document.getElementById('resumeBtn');
    if (resume) {
      resume.textContent = 'RETURN TO VOID';
      resume.onclick = event => {
        event.stopPropagation();
        instance.returnToMenu();
      };
    }
    const pauseScreen = document.getElementById('pauseScreen');
    if (pauseScreen) pauseScreen.title = message;
  }

  function installFailClosedGuard(failureReason) {
    if (Game.prototype.__reachabilityPolicyFailClosedInstalled) return;
    const message = `Reachability policy unavailable: ${failureReason}`;
    const guardedUpdate = Game.prototype.updateGameObjects;
    const guardedStart = Game.prototype.startGame;
    const guardedRestart = Game.prototype.restartGame;

    Game.prototype.updateGameObjects = function updateGameObjectsWithPolicyGuard(...args) {
      if (this.gameMode === 'MONAS' && !globalThis.__SEX_MAGICK_REACHABILITY_POLICY__) {
        showPolicyFailure(this, message);
        return undefined;
      }
      return guardedUpdate.apply(this, args);
    };

    Game.prototype.startGame = function startGameWithPolicyGuard(...args) {
      if (this.gameMode === 'MONAS' && !globalThis.__SEX_MAGICK_REACHABILITY_POLICY__) {
        showPolicyFailure(this, message);
        return undefined;
      }
      return guardedStart.apply(this, args);
    };

    Game.prototype.restartGame = function restartGameWithPolicyGuard(...args) {
      if (this.gameMode === 'MONAS' && !globalThis.__SEX_MAGICK_REACHABILITY_POLICY__) {
        showPolicyFailure(this, message);
        return undefined;
      }
      return guardedRestart.apply(this, args);
    };

    Game.prototype.__reachabilityPolicyFailClosedInstalled = true;
    sealMonas(message);
    updateBootstrapStatus('failed-closed', failureReason);
    console.error('[SEX MAGICK] Reachability policy failed closed; Monas sealed', failureReason);
  }

  function verifyPolicyInstallation(timeoutMs = 5000) {
    const verificationStartedAt = Date.now();
    const attempt = () => {
      if (globalThis.__SEX_MAGICK_REACHABILITY_POLICY__) {
        updateBootstrapStatus('ready');
        return;
      }
      if (Date.now() - verificationStartedAt >= timeoutMs) {
        installFailClosedGuard('policy script loaded but runtime installation did not complete');
        return;
      }
      setTimeout(attempt, 10);
    };
    attempt();
  }

  function loadPolicyWhenGrammarIsReady() {
    if (globalThis.__SEX_MAGICK_REACHABILITY_POLICY__) {
      updateBootstrapStatus('ready');
      return;
    }

    if (document.querySelector('script[data-sex-magick-reachability-policy]')) {
      verifyPolicyInstallation();
      return;
    }

    if (!globalThis.SexMagickObstacleGrammar) {
      if (Date.now() - startedAt >= 5000) {
        installFailClosedGuard('timed out waiting for obstacle grammar');
        return;
      }
      setTimeout(loadPolicyWhenGrammarIsReady, 10);
      return;
    }

    updateBootstrapStatus('loading-policy');
    const script = document.createElement('script');
    script.src = new URL('./reachability-policy.js', currentSource).href;
    script.async = false;
    script.dataset.sexMagickReachabilityPolicy = 'true';
    script.onload = () => verifyPolicyInstallation();
    script.onerror = () => installFailClosedGuard(`policy script failed to load: ${script.src}`);
    document.head.appendChild(script);
  }

  globalThis.__SEX_MAGICK_POLICY_BOOTSTRAP__ = Object.freeze({
    mode: 'reachability-policy-bootstrap',
    version: 1,
    getSnapshot() {
      return {
        status,
        reason,
        policyInstalled: Boolean(globalThis.__SEX_MAGICK_REACHABILITY_POLICY__),
        failClosedInstalled: Boolean(Game.prototype.__reachabilityPolicyFailClosedInstalled),
        monasSealed: Boolean(document.getElementById('startMonasBtn')?.disabled)
      };
    }
  });

  loadPolicyWhenGrammarIsReady();
})();

(function bootstrapVisualQaLocalOnlyPreflight() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const query = new URLSearchParams(window.location.search);
  if (query.get('visualQa') !== '1') return;

  let leaderboardSuppressed = false;
  try {
    if (typeof Leaderboard !== 'undefined' && Leaderboard) {
      const localOnly = async function visualQaLocalOnlyLeaderboard() {
        const list = document.getElementById('leaderboardList');
        if (list) list.textContent = 'VISUAL QA · LOCAL ONLY';
        const status = document.getElementById('uploadStatus');
        if (status) status.textContent = 'VISUAL QA · LOCAL ONLY';
        return { localOnly: true, visualQa: true };
      };
      Leaderboard.init = localOnly;
      Leaderboard.fetchTop = localOnly;
      Leaderboard.submit = localOnly;
      Leaderboard.__visualQaLocalOnly = true;
      leaderboardSuppressed = true;
    }
  } catch (error) {
    console.error('[SEX MAGICK] Visual QA could not suppress leaderboard initialization', error);
  }

  globalThis.__SEX_MAGICK_VISUAL_QA_PREFLIGHT__ = Object.freeze({
    mode: 'visual-qa-local-only-preflight',
    version: 1,
    getSnapshot() {
      return {
        enabled: true,
        leaderboardSuppressed,
        guestSessionAllowed: false,
        scoreSubmissionAllowed: false
      };
    }
  });
})();

(function bootstrapGateSliceRuntime() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const query = new URLSearchParams(window.location.search);
  if (query.get('gateSlice') !== '1') return;

  let leaderboardSuppressed = false;
  try {
    if (typeof Leaderboard !== 'undefined' && Leaderboard) {
      const localOnly = async function gateSliceLocalOnlyLeaderboard() {
        const list = document.getElementById('leaderboardList');
        if (list) list.textContent = 'GATE SLICE — LOCAL ONLY';
        const status = document.getElementById('uploadStatus');
        if (status) status.textContent = 'GATE SLICE — LOCAL ONLY';
        return { localOnly: true };
      };
      Leaderboard.init = localOnly;
      Leaderboard.fetchTop = localOnly;
      Leaderboard.submit = localOnly;
      Leaderboard.__gateSliceLocalOnly = true;
      leaderboardSuppressed = true;
    }
  } catch (error) {
    console.error('[SEX MAGICK] Gate slice could not suppress leaderboard initialization', error);
  }

  globalThis.__SEX_MAGICK_GATE_PREFLIGHT__ = Object.freeze({
    mode: 'gate-slice-local-only-preflight',
    version: 1,
    getSnapshot() {
      return {
        enabled: true,
        leaderboardSuppressed,
        guestSessionAllowed: false,
        scoreSubmissionAllowed: false
      };
    }
  });

  if (
    globalThis.SexMagickGateSlice ||
    document.querySelector('script[data-sex-magick-gate-slice-runtime]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./gate-slice-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickGateSliceRuntime = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Gate slice runtime failed to load', script.src);
  document.head.appendChild(script);
})();

(function bootstrapViewportRuntime() {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    globalThis.SexMagickViewport ||
    document.querySelector('script[data-sex-magick-viewport-runtime]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./viewport-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickViewportRuntime = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Viewport profile runtime failed to load', script.src);
  document.head.appendChild(script);
})();

(function bootstrapGateEvidenceRuntime() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('gateSlice') !== '1') return;
  if (
    globalThis.SexMagickGateEvidence ||
    document.querySelector('script[data-sex-magick-gate-evidence-runtime]')
  ) return;

  const currentSource = document.currentScript?.src || window.location.href;
  const script = document.createElement('script');
  script.src = new URL('./gate-evidence-runtime.js', currentSource).href;
  script.async = false;
  script.dataset.sexMagickGateEvidenceRuntime = 'true';
  script.onerror = () => console.error('[SEX MAGICK] Gate evidence runtime failed to load', script.src);
  document.head.appendChild(script);
})();
