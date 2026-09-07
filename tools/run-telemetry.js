(function attachSexMagickRunTelemetry(root, factory) {
  'use strict';

  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SexMagickRunTelemetry = api;

  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Game !== 'undefined' &&
    typeof GameState !== 'undefined'
  ) {
    api.install();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRunTelemetryApi(root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'sex_magick_runs_v1';
  const DEFAULT_MAX_RUNS = 20;
  const DEFAULT_MAX_EVENTS = 200;
  const STEP_MS = 1000 / 60;
  const CONTROL_SELECTOR = 'button, label, input, select, textarea, a, [role="button"]';

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
      snapshot() {
        return Object.fromEntries(values.entries());
      }
    };
  }

  function safeReadRuns(storage, key = STORAGE_KEY, maxRuns = DEFAULT_MAX_RUNS) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(run => run && typeof run === 'object' && run.schemaVersion === SCHEMA_VERSION)
        .slice(0, Math.max(0, maxRuns));
    } catch (_error) {
      return [];
    }
  }

  function safeWriteRuns(storage, runs, key = STORAGE_KEY) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(key, JSON.stringify(runs));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function createRunId(options = {}) {
    const epochMs = Math.max(0, Math.floor(finiteNumber(options.epochMs, Date.now())));
    const timestamp = epochMs.toString(36);
    const cryptoObject = options.cryptoObject || root.crypto;

    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
      return `run_${timestamp}_${cryptoObject.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    }

    const random = typeof options.random === 'function' ? options.random : Math.random;
    let suffix = '';
    for (let index = 0; index < 4; index += 1) {
      suffix += Math.floor(random() * 0xffffffff).toString(36).padStart(7, '0');
    }
    return `run_${timestamp}_${suffix.slice(0, 16)}`;
  }

  function normalizeRite(value) {
    if (value === 'HEX' || value === 'MONAS') return value;
    return 'UNKNOWN';
  }

  function inferScoreSource(delta) {
    if (delta === 1) return 'gate';
    if (delta === 5) return 'orb';
    if (delta === 10) return 'void-pentagram';
    return 'mixed-or-unknown';
  }

  function isFastRetryKey(event) {
    if (!event || event.repeat) return false;
    return event.code === 'KeyR' || event.code === 'Space' || event.code === 'Enter';
  }

  function sanitizeTiming(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const clock = snapshot.clock && typeof snapshot.clock === 'object' ? snapshot.clock : {};
    return {
      mode: typeof snapshot.mode === 'string' ? snapshot.mode : 'fixed-step-runtime',
      stepMs: finiteNumber(snapshot.stepMs, STEP_MS),
      maxStepsPerFrame: finiteNumber(snapshot.maxStepsPerFrame, 0),
      suspensionResetMs: finiteNumber(snapshot.suspensionResetMs, 0),
      simulationFrames: Math.max(0, Math.floor(finiteNumber(snapshot.simulationFrames, 0))),
      score: Math.floor(finiteNumber(snapshot.score, 0)),
      pendingRaf: Boolean(snapshot.pendingRaf),
      clock: {
        totalSteps: Math.max(0, Math.floor(finiteNumber(clock.totalSteps, 0))),
        droppedMs: Math.max(0, finiteNumber(clock.droppedMs, 0)),
        suspensionResets: Math.max(0, Math.floor(finiteNumber(clock.suspensionResets, 0))),
        accumulatorMs: Math.max(0, finiteNumber(clock.accumulatorMs, 0))
      }
    };
  }

  class RunTelemetryStore {
    constructor(options = {}) {
      this.storage = options.storage || createMemoryStorage();
      this.storageKey = options.storageKey || STORAGE_KEY;
      this.maxRuns = Math.max(1, Math.floor(finiteNumber(options.maxRuns, DEFAULT_MAX_RUNS)));
      this.maxEvents = Math.max(10, Math.floor(finiteNumber(options.maxEvents, DEFAULT_MAX_EVENTS)));
      this.nowEpochMs = typeof options.nowEpochMs === 'function' ? options.nowEpochMs : Date.now;
      this.nowMonotonicMs = typeof options.nowMonotonicMs === 'function'
        ? options.nowMonotonicMs
        : () => (root.performance?.now?.() ?? Date.now());
      this.idFactory = typeof options.idFactory === 'function'
        ? options.idFactory
        : epochMs => createRunId({ epochMs });
      this.recentRuns = safeReadRuns(this.storage, this.storageKey, this.maxRuns);
      this.currentRun = null;
      this.currentMeta = null;
      this.listeners = new Set();
    }

    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit() {
      const snapshot = this.snapshot();
      for (const listener of this.listeners) {
        try {
          listener(snapshot);
        } catch (error) {
          console.warn('[SEX MAGICK] Run telemetry listener failed', error);
        }
      }
    }

    eventPosition(game) {
      const frame = Math.max(0, Math.floor(finiteNumber(game?.frames, 0)));
      const score = Math.floor(finiteNumber(game?.score, 0));
      const now = this.nowMonotonicMs();
      const started = this.currentMeta?.startedMonotonicMs ?? now;
      return {
        frame,
        score,
        simulationMs: Math.round(frame * STEP_MS),
        wallOffsetMs: Math.max(0, Math.round(now - started))
      };
    }

    begin(options = {}) {
      if (this.currentRun) {
        this.end({ reason: 'replaced', game: options.game, timing: options.timing });
      }

      const startedEpochMs = Math.max(0, Math.floor(finiteNumber(this.nowEpochMs(), Date.now())));
      const startedMonotonicMs = finiteNumber(this.nowMonotonicMs(), 0);
      const rite = normalizeRite(options.rite);
      const startReason = typeof options.startReason === 'string' ? options.startReason : 'menu';

      this.currentMeta = {
        startedMonotonicMs,
        pausedAtMs: null,
        pausedTotalMs: 0
      };

      this.currentRun = {
        schemaVersion: SCHEMA_VERSION,
        runId: this.idFactory(startedEpochMs),
        rite,
        startReason,
        startedAt: new Date(startedEpochMs).toISOString(),
        startedEpochMs,
        endedAt: null,
        endReason: null,
        finalScore: 0,
        highScoreAtEnd: 0,
        wallDurationMs: 0,
        activeDurationMs: 0,
        simulationFrames: 0,
        simulationDurationMs: 0,
        levelIndex: 0,
        voidEntries: 0,
        scoreEvents: [],
        lifecycleEvents: [{
          type: 'start',
          frame: 0,
          score: 0,
          simulationMs: 0,
          wallOffsetMs: 0,
          details: { startReason, rite }
        }],
        timing: null
      };

      this.emit();
      return clone(this.currentRun);
    }

    recordLifecycle(type, game, details = {}) {
      if (!this.currentRun) return false;
      const event = {
        type: String(type),
        ...this.eventPosition(game),
        details: clone(details)
      };
      this.currentRun.lifecycleEvents.push(event);
      if (this.currentRun.lifecycleEvents.length > this.maxEvents) {
        this.currentRun.lifecycleEvents.splice(0, this.currentRun.lifecycleEvents.length - this.maxEvents);
      }
      this.emit();
      return true;
    }

    recordScore(delta, game, source = inferScoreSource(delta)) {
      if (!this.currentRun || !Number.isFinite(delta) || delta === 0) return false;
      const event = {
        ...this.eventPosition(game),
        delta,
        source: String(source || inferScoreSource(delta))
      };
      this.currentRun.scoreEvents.push(event);
      if (this.currentRun.scoreEvents.length > this.maxEvents) {
        this.currentRun.scoreEvents.splice(0, this.currentRun.scoreEvents.length - this.maxEvents);
      }
      this.emit();
      return true;
    }

    pause(game) {
      if (!this.currentRun || !this.currentMeta || this.currentMeta.pausedAtMs != null) return false;
      this.currentMeta.pausedAtMs = this.nowMonotonicMs();
      return this.recordLifecycle('pause', game);
    }

    resume(game) {
      if (!this.currentRun || !this.currentMeta || this.currentMeta.pausedAtMs == null) return false;
      const now = this.nowMonotonicMs();
      this.currentMeta.pausedTotalMs += Math.max(0, now - this.currentMeta.pausedAtMs);
      this.currentMeta.pausedAtMs = null;
      return this.recordLifecycle('resume', game);
    }

    end(options = {}) {
      if (!this.currentRun || !this.currentMeta) return null;

      const endedEpochMs = Math.max(0, Math.floor(finiteNumber(this.nowEpochMs(), Date.now())));
      const endedMonotonicMs = finiteNumber(this.nowMonotonicMs(), this.currentMeta.startedMonotonicMs);
      let pausedTotalMs = this.currentMeta.pausedTotalMs;
      if (this.currentMeta.pausedAtMs != null) {
        pausedTotalMs += Math.max(0, endedMonotonicMs - this.currentMeta.pausedAtMs);
      }

      const wallDurationMs = Math.max(0, Math.round(endedMonotonicMs - this.currentMeta.startedMonotonicMs));
      const activeDurationMs = Math.max(0, Math.round(wallDurationMs - pausedTotalMs));
      const game = options.game || {};
      const frameCount = Math.max(0, Math.floor(finiteNumber(game.frames, 0)));

      this.recordLifecycle('end', game, { reason: options.reason || 'unknown' });
      this.currentRun.endedAt = new Date(endedEpochMs).toISOString();
      this.currentRun.endReason = String(options.reason || 'unknown');
      this.currentRun.finalScore = Math.floor(finiteNumber(game.score, 0));
      this.currentRun.highScoreAtEnd = Math.floor(finiteNumber(game.highScore, 0));
      this.currentRun.wallDurationMs = wallDurationMs;
      this.currentRun.activeDurationMs = activeDurationMs;
      this.currentRun.simulationFrames = frameCount;
      this.currentRun.simulationDurationMs = Math.round(frameCount * STEP_MS);
      this.currentRun.levelIndex = Math.max(0, Math.floor(finiteNumber(game.currentLevelIdx, 0)));
      this.currentRun.timing = sanitizeTiming(options.timing);

      const completed = clone(this.currentRun);
      this.recentRuns.unshift(completed);
      this.recentRuns = this.recentRuns.slice(0, this.maxRuns);
      safeWriteRuns(this.storage, this.recentRuns, this.storageKey);
      this.currentRun = null;
      this.currentMeta = null;
      this.emit();
      return completed;
    }

    clearHistory() {
      this.recentRuns = [];
      try {
        this.storage?.removeItem?.(this.storageKey);
      } catch (_error) {}
      this.emit();
    }

    snapshot() {
      return {
        schemaVersion: SCHEMA_VERSION,
        storageKey: this.storageKey,
        retentionLimit: this.maxRuns,
        privacy: 'local-gameplay-only-no-account-or-device-identifiers',
        current: clone(this.currentRun),
        recent: clone(this.recentRuns)
      };
    }
  }

  function isControlTarget(target) {
    return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest(CONTROL_SELECTOR));
  }

  function safeBrowserStorage() {
    try {
      const storage = root.localStorage;
      const probe = '__sex_magick_telemetry_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (_error) {
      return createMemoryStorage();
    }
  }

  function install() {
    if (Game.prototype.__runTelemetryRuntimeInstalled) return root.__SEX_MAGICK_RUNS__;

    const store = new RunTelemetryStore({ storage: safeBrowserStorage() });
    let pendingEnd = null;
    let pendingEndToken = 0;
    let debugEnabled = false;

    function timingSnapshot() {
      try {
        const timingApi = root.__SEX_MAGICK_TIMING__;
        const snapshot = timingApi?.getSnapshot?.();
        if (!snapshot) return null;
        return {
          ...snapshot,
          mode: timingApi.mode,
          stepMs: timingApi.stepMs,
          maxStepsPerFrame: timingApi.maxStepsPerFrame,
          suspensionResetMs: timingApi.suspensionResetMs
        };
      } catch (_error) {
        return null;
      }
    }

    function flushPendingEnd() {
      if (!pendingEnd) return null;
      const pending = pendingEnd;
      pendingEnd = null;
      pendingEndToken += 1;
      return store.end({
        reason: pending.reason,
        game: pending.game,
        timing: timingSnapshot()
      });
    }

    function scheduleEnd(reason, gameInstance) {
      if (!store.currentRun || pendingEnd) return;
      const token = ++pendingEndToken;
      pendingEnd = { reason, game: gameInstance };
      queueMicrotask(() => {
        if (!pendingEnd || token !== pendingEndToken) return;
        flushPendingEnd();
      });
    }

    function beginRun(gameInstance, startReason) {
      flushPendingEnd();
      return store.begin({
        rite: gameInstance.gameMode,
        startReason,
        game: gameInstance,
        timing: timingSnapshot()
      });
    }

    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalGameOver = Game.prototype.gameOver;
    const originalReturnToMenu = Game.prototype.returnToMenu;
    const originalTogglePause = Game.prototype.togglePause;
    const originalStartVoidMode = Game.prototype.startVoidMode;
    const originalEndVoidMode = Game.prototype.endVoidMode;
    const originalCheckLevel = Game.prototype.checkLevel;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;

    Game.prototype.startGame = function startGameWithRunTelemetry(...args) {
      beginRun(this, 'menu');
      try {
        return originalStartGame.apply(this, args);
      } catch (error) {
        store.end({ reason: 'start-error', game: this, timing: timingSnapshot() });
        throw error;
      }
    };

    Game.prototype.restartGame = function restartGameWithRunTelemetry(...args) {
      beginRun(this, 'retry');
      try {
        return originalRestartGame.apply(this, args);
      } catch (error) {
        store.end({ reason: 'restart-error', game: this, timing: timingSnapshot() });
        throw error;
      }
    };

    Game.prototype.gameOver = function gameOverWithRunTelemetry(...args) {
      const previousState = this.state;
      const result = originalGameOver.apply(this, args);
      if (previousState !== GameState.GAME_OVER && this.state === GameState.GAME_OVER) {
        store.recordLifecycle('death', this);
        scheduleEnd('death', this);
      }
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithRunTelemetry(...args) {
      const result = originalReturnToMenu.apply(this, args);
      flushPendingEnd();
      if (store.currentRun) {
        store.end({ reason: 'menu', game: this, timing: timingSnapshot() });
      }
      return result;
    };

    Game.prototype.togglePause = function togglePauseWithRunTelemetry(...args) {
      const previousState = this.state;
      const result = originalTogglePause.apply(this, args);
      if (previousState === GameState.PLAYING && this.state === GameState.PAUSED) store.pause(this);
      if (previousState === GameState.PAUSED && this.state === GameState.PLAYING) store.resume(this);
      return result;
    };

    Game.prototype.startVoidMode = function startVoidModeWithRunTelemetry(...args) {
      const wasVoid = this.voidMode;
      const result = originalStartVoidMode.apply(this, args);
      if (!wasVoid && this.voidMode && store.currentRun) {
        store.currentRun.voidEntries += 1;
        store.recordLifecycle('void-enter', this);
      }
      return result;
    };

    Game.prototype.endVoidMode = function endVoidModeWithRunTelemetry(...args) {
      const wasVoid = this.voidMode;
      const result = originalEndVoidMode.apply(this, args);
      if (wasVoid && !this.voidMode) store.recordLifecycle('void-exit', this);
      return result;
    };

    Game.prototype.checkLevel = function checkLevelWithRunTelemetry(...args) {
      const previousLevel = this.currentLevelIdx;
      const result = originalCheckLevel.apply(this, args);
      if (this.currentLevelIdx !== previousLevel) {
        store.recordLifecycle('level', this, { from: previousLevel, to: this.currentLevelIdx });
      }
      return result;
    };

    Game.prototype.updateGameObjects = function updateGameObjectsWithRunTelemetry(...args) {
      const previousScore = finiteNumber(this.score, 0);
      try {
        return originalUpdateGameObjects.apply(this, args);
      } finally {
        const delta = finiteNumber(this.score, 0) - previousScore;
        if (delta !== 0) store.recordScore(delta, this, inferScoreSource(delta));
      }
    };

    function ensureRetryHint() {
      if (document.getElementById('sex-magick-fast-retry-hint')) return;
      const screen = document.getElementById('gameOverScreen');
      if (!screen) return;
      const hint = document.createElement('div');
      hint.id = 'sex-magick-fast-retry-hint';
      hint.textContent = '[ TAP / SPACE / R TO RETRY ]';
      hint.style.cssText = [
        'margin-top:12px',
        'font:600 11px/1.4 monospace',
        'letter-spacing:0.14em',
        'color:rgba(255,255,255,0.72)',
        'text-align:center',
        'pointer-events:none'
      ].join(';');
      screen.appendChild(hint);
    }

    function fastRetry(event) {
      if (typeof game === 'undefined' || !game || game.state !== GameState.GAME_OVER) return false;
      if (isControlTarget(event.target)) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      game.restartGame();
      return true;
    }

    window.addEventListener('keydown', event => {
      if (typeof game === 'undefined' || !game || game.state !== GameState.GAME_OVER) return;
      if (!isFastRetryKey(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      game.restartGame();
    }, { capture: true });

    window.addEventListener('touchstart', fastRetry, { passive: false, capture: true });
    window.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      fastRetry(event);
    }, { capture: true });

    function ensureDebugPanel() {
      let panel = document.getElementById('sex-magick-run-telemetry');
      if (panel) return panel;
      panel = document.createElement('pre');
      panel.id = 'sex-magick-run-telemetry';
      panel.hidden = true;
      panel.style.cssText = [
        'position:fixed',
        'left:10px',
        'bottom:10px',
        'z-index:9999',
        'max-width:min(420px,calc(100vw - 20px))',
        'max-height:45vh',
        'overflow:auto',
        'margin:0',
        'padding:10px',
        'border:1px solid rgba(0,255,255,.5)',
        'background:rgba(0,0,0,.86)',
        'color:#dff',
        'font:11px/1.45 monospace',
        'white-space:pre-wrap',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(panel);
      return panel;
    }

    function renderDebug(snapshot = store.snapshot()) {
      const panel = ensureDebugPanel();
      panel.hidden = !debugEnabled;
      if (!debugEnabled) return;
      const current = snapshot.current;
      const last = snapshot.recent[0];
      panel.textContent = [
        ':: RUN TELEMETRY ::',
        `CURRENT: ${current ? current.runId : 'NONE'}`,
        current ? `RITE: ${current.rite}  SCORE EVENTS: ${current.scoreEvents.length}` : '',
        current ? `LIFECYCLE EVENTS: ${current.lifecycleEvents.length}` : '',
        `RECENT RUNS: ${snapshot.recent.length}/${snapshot.retentionLimit}`,
        last ? `LAST: ${last.runId}` : '',
        last ? `END: ${last.endReason}  SCORE: ${last.finalScore}` : '',
        last ? `ACTIVE: ${last.activeDurationMs}ms  SIM: ${last.simulationDurationMs}ms` : '',
        'TOGGLE: T'
      ].filter(Boolean).join('\n');
    }

    store.subscribe(renderDebug);
    ensureRetryHint();

    const query = new URLSearchParams(window.location.search);
    debugEnabled = query.get('telemetry') === '1' || window.location.hash.includes('telemetry');

    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyT') return;
      event.preventDefault();
      debugEnabled = !debugEnabled;
      renderDebug();
    });

    Game.prototype.__runTelemetryRuntimeInstalled = true;

    root.__SEX_MAGICK_RUNS__ = Object.freeze({
      mode: 'local-run-telemetry',
      version: SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      retentionLimit: DEFAULT_MAX_RUNS,
      fastRetryKeys: Object.freeze(['R', 'Space', 'Enter']),
      privacy: 'local-gameplay-only-no-account-or-device-identifiers',
      getSnapshot() {
        return store.snapshot();
      },
      clearHistory() {
        store.clearHistory();
        return store.snapshot();
      },
      finalizeCurrent(reason = 'debug-finalize') {
        flushPendingEnd();
        if (!store.currentRun || typeof game === 'undefined' || !game) return null;
        return store.end({ reason, game, timing: timingSnapshot() });
      },
      setDebug(value) {
        debugEnabled = Boolean(value);
        renderDebug();
        return debugEnabled;
      },
      toggleDebug() {
        debugEnabled = !debugEnabled;
        renderDebug();
        return debugEnabled;
      },
      isDebugEnabled() {
        return debugEnabled;
      }
    });

    renderDebug();
    console.info('[SEX MAGICK] Local run telemetry installed', {
      storageKey: STORAGE_KEY,
      retentionLimit: DEFAULT_MAX_RUNS,
      fastRetry: 'R / Space / Enter / game-over surface',
      privacy: 'local gameplay only'
    });

    return root.__SEX_MAGICK_RUNS__;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    STORAGE_KEY,
    DEFAULT_MAX_RUNS,
    DEFAULT_MAX_EVENTS,
    STEP_MS,
    createMemoryStorage,
    safeReadRuns,
    safeWriteRuns,
    createRunId,
    normalizeRite,
    inferScoreSource,
    isFastRetryKey,
    sanitizeTiming,
    RunTelemetryStore,
    install
  });
});
