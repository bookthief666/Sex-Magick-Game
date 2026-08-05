(function attachSexMagickCanvasRender(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickCanvasRender = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.scheduleInstall();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCanvasRenderApi(root) {
  'use strict';

  const VERSION = 1;
  const DEFAULT_MAX_DPR = 3;
  const DEFAULT_MAX_BACKING_PIXELS = 8_000_000;
  const MIN_DPR = 1;
  const DPR_QUANTUM = 0.125;
  const canvasStates = new WeakMap();
  let installed = false;
  let installTimer = null;
  let originalResizeCanvas = null;
  let originalDrawScene = null;

  function finiteNumber(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
  }

  function quantizeDpr(value) {
    const resolved = Math.floor((finiteNumber(value, MIN_DPR) + 1e-9) / DPR_QUANTUM) * DPR_QUANTUM;
    return Math.max(MIN_DPR, Number(resolved.toFixed(3)));
  }

  function normalizeRequestedDpr(value, nativeDpr = 1) {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text || text === 'native' || text === 'auto') return Math.max(MIN_DPR, finiteNumber(nativeDpr, 1));
    if (text === '1x' || text === 'css') return 1;
    return clamp(finiteNumber(text, nativeDpr), MIN_DPR, 4);
  }

  function computeRenderMetrics(options = {}) {
    const logicalWidth = Math.max(1, Math.round(finiteNumber(options.width, 1)));
    const logicalHeight = Math.max(1, Math.round(finiteNumber(options.height, 1)));
    const nativeDpr = Math.max(MIN_DPR, finiteNumber(options.devicePixelRatio, 1));
    const requestedDpr = normalizeRequestedDpr(options.requestedDpr, nativeDpr);
    const maxDpr = clamp(finiteNumber(options.maxDpr, DEFAULT_MAX_DPR), MIN_DPR, 4);
    const maxBackingPixels = Math.max(
      logicalWidth * logicalHeight,
      Math.round(finiteNumber(options.maxBackingPixels, DEFAULT_MAX_BACKING_PIXELS))
    );
    const pixelLimitedDpr = Math.sqrt(maxBackingPixels / (logicalWidth * logicalHeight));
    const effectiveDpr = quantizeDpr(Math.min(requestedDpr, maxDpr, pixelLimitedDpr));
    const backingWidth = Math.max(1, Math.round(logicalWidth * effectiveDpr));
    const backingHeight = Math.max(1, Math.round(logicalHeight * effectiveDpr));
    const scaleX = backingWidth / logicalWidth;
    const scaleY = backingHeight / logicalHeight;

    return Object.freeze({
      version: VERSION,
      logicalWidth,
      logicalHeight,
      nativeDpr: Number(nativeDpr.toFixed(3)),
      requestedDpr: Number(requestedDpr.toFixed(3)),
      maxDpr: Number(maxDpr.toFixed(3)),
      effectiveDpr,
      scaleX: Number(scaleX.toFixed(6)),
      scaleY: Number(scaleY.toFixed(6)),
      backingWidth,
      backingHeight,
      backingPixels: backingWidth * backingHeight,
      maxBackingPixels,
      cappedByDpr: requestedDpr > maxDpr + 1e-9,
      cappedByPixels: requestedDpr > pixelLimitedDpr + 1e-9
    });
  }

  function parseRenderOptions(locationLike = root.location, windowLike = root) {
    let params;
    try {
      params = new URLSearchParams(locationLike?.search || '');
    } catch (_error) {
      params = new URLSearchParams('');
    }

    return Object.freeze({
      requestedDpr: params.get('renderDpr') || 'native',
      maxDpr: clamp(finiteNumber(params.get('renderDprCap'), DEFAULT_MAX_DPR), MIN_DPR, 4),
      maxBackingPixels: Math.round(clamp(
        finiteNumber(params.get('renderPixelBudget'), DEFAULT_MAX_BACKING_PIXELS),
        1_000_000,
        16_000_000
      )),
      devicePixelRatio: Math.max(MIN_DPR, finiteNumber(windowLike?.devicePixelRatio, 1))
    });
  }

  function getCanvasDescriptors() {
    if (typeof HTMLCanvasElement === 'undefined') return null;
    const width = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    const height = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
    if (!width?.get || !width?.set || !height?.get || !height?.set) return null;
    return { width, height };
  }

  function configureContext(state) {
    const { ctx, metrics } = state;
    ctx.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  }

  function applyBackingStore(state) {
    const options = parseRenderOptions(root.location, root);
    const metrics = computeRenderMetrics({
      width: state.logicalWidth,
      height: state.logicalHeight,
      devicePixelRatio: options.devicePixelRatio,
      requestedDpr: options.requestedDpr,
      maxDpr: options.maxDpr,
      maxBackingPixels: options.maxBackingPixels
    });

    state.descriptors.width.set.call(state.canvas, metrics.backingWidth);
    state.descriptors.height.set.call(state.canvas, metrics.backingHeight);
    state.metrics = metrics;
    state.resizeCount += 1;
    configureContext(state);

    state.canvas.dataset.smLogicalWidth = String(metrics.logicalWidth);
    state.canvas.dataset.smLogicalHeight = String(metrics.logicalHeight);
    state.canvas.dataset.smBackingWidth = String(metrics.backingWidth);
    state.canvas.dataset.smBackingHeight = String(metrics.backingHeight);
    state.canvas.dataset.smEffectiveDpr = String(metrics.effectiveDpr);
    state.canvas.style.width = `${metrics.logicalWidth}px`;
    state.canvas.style.height = `${metrics.logicalHeight}px`;

    root.dispatchEvent?.(new CustomEvent('sex-magick:render-metrics', {
      detail: getStateSnapshot(state)
    }));
    return metrics;
  }

  function restoreNativeCanvas(state) {
    try { delete state.canvas.width; } catch (_error) {}
    try { delete state.canvas.height; } catch (_error) {}
    try { state.descriptors.width.set.call(state.canvas, state.logicalWidth); } catch (_error) {}
    try { state.descriptors.height.set.call(state.canvas, state.logicalHeight); } catch (_error) {}
    try { state.ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (_error) {}
    canvasStates.delete(state.canvas);
  }

  function activateCanvas(canvas, ctx, options = {}) {
    if (!canvas || !ctx) throw new Error('Canvas and 2D context are required');
    const existing = canvasStates.get(canvas);
    if (existing) return existing;

    const descriptors = getCanvasDescriptors();
    if (!descriptors) throw new Error('Native canvas width/height descriptors are unavailable');

    const state = {
      canvas,
      ctx,
      descriptors,
      logicalWidth: Math.max(1, Math.round(finiteNumber(options.width, descriptors.width.get.call(canvas) || root.innerWidth || 1))),
      logicalHeight: Math.max(1, Math.round(finiteNumber(options.height, descriptors.height.get.call(canvas) || root.innerHeight || 1))),
      metrics: null,
      resizeCount: 0,
      drawCount: 0,
      activatedAt: new Date().toISOString()
    };

    canvasStates.set(canvas, state);
    try {
      Object.defineProperty(canvas, 'width', {
        configurable: true,
        enumerable: true,
        get() { return state.logicalWidth; },
        set(value) {
          state.logicalWidth = Math.max(1, Math.round(finiteNumber(value, state.logicalWidth)));
          applyBackingStore(state);
        }
      });
      Object.defineProperty(canvas, 'height', {
        configurable: true,
        enumerable: true,
        get() { return state.logicalHeight; },
        set(value) {
          state.logicalHeight = Math.max(1, Math.round(finiteNumber(value, state.logicalHeight)));
          applyBackingStore(state);
        }
      });
      applyBackingStore(state);
      return state;
    } catch (error) {
      restoreNativeCanvas(state);
      throw error;
    }
  }

  function setLogicalSize(canvas, width, height) {
    const state = canvasStates.get(canvas);
    if (!state) throw new Error('Canvas is not managed by the render runtime');
    state.logicalWidth = Math.max(1, Math.round(finiteNumber(width, state.logicalWidth)));
    state.logicalHeight = Math.max(1, Math.round(finiteNumber(height, state.logicalHeight)));
    return applyBackingStore(state);
  }

  function ensureContextTransform(canvas) {
    const state = canvasStates.get(canvas);
    if (!state) return null;
    const transform = state.ctx.getTransform?.();
    if (
      !transform ||
      Math.abs(transform.a - state.metrics.scaleX) > 1e-6 ||
      Math.abs(transform.d - state.metrics.scaleY) > 1e-6 ||
      transform.b !== 0 || transform.c !== 0 || transform.e !== 0 || transform.f !== 0
    ) {
      configureContext(state);
    }
    state.drawCount += 1;
    return state.metrics;
  }

  function getStateSnapshot(state) {
    if (!state) return null;
    return Object.freeze({
      mode: 'logical-css-pixels-with-bounded-dpr-backing',
      version: VERSION,
      ...state.metrics,
      resizeCount: state.resizeCount,
      drawCount: state.drawCount,
      activatedAt: state.activatedAt
    });
  }

  function getCanvasSnapshot(canvas) {
    return getStateSnapshot(canvasStates.get(canvas));
  }

  function currentGameInstance() {
    try {
      if (typeof game !== 'undefined' && game) return game;
    } catch (_error) {}
    return root.game || null;
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_RENDER__ || null;
    const GameClass = (() => {
      try { return typeof Game !== 'undefined' ? Game : root.Game; } catch (_error) { return root.Game; }
    })();
    if (!GameClass?.prototype) return null;

    installed = true;
    originalResizeCanvas = GameClass.prototype.resizeCanvas;
    originalDrawScene = GameClass.prototype.drawScene;

    GameClass.prototype.resizeCanvas = function resizeCanvasWithDpr(...args) {
      try {
        activateCanvas(this.canvas, this.ctx, {
          width: root.innerWidth,
          height: root.innerHeight
        });
        const metrics = setLogicalSize(this.canvas, root.innerWidth, root.innerHeight);
        this.calculateScaleFactor();
        this.adjustForScreenSize();
        this.__smRenderMetrics = metrics;
        return metrics;
      } catch (error) {
        this.__smRenderFallbackError = String(error?.message || error);
        return originalResizeCanvas.apply(this, args);
      }
    };

    GameClass.prototype.drawScene = function drawSceneWithDpr(...args) {
      ensureContextTransform(this.canvas);
      return originalDrawScene.apply(this, args);
    };

    GameClass.prototype.__canvasRenderRuntimeInstalled = true;

    root.__SEX_MAGICK_RENDER__ = Object.freeze({
      mode: 'logical-css-pixels-with-bounded-dpr-backing',
      version: VERSION,
      getSnapshot(instance = currentGameInstance()) {
        return instance?.canvas ? getCanvasSnapshot(instance.canvas) : null;
      },
      refresh(instance = currentGameInstance()) {
        if (!instance?.resizeCanvas) return null;
        return instance.resizeCanvas();
      },
      computeRenderMetrics,
      parseRenderOptions
    });

    const instance = currentGameInstance();
    if (instance?.canvas && instance?.ctx) instance.resizeCanvas();
    root.addEventListener?.('sex-magick:viewport-profile', () => {
      const active = currentGameInstance();
      if (active?.resizeCanvas) active.resizeCanvas();
    });

    return root.__SEX_MAGICK_RENDER__;
  }

  function scheduleInstall(timeoutMs = 5000) {
    const startedAt = Date.now();
    clearTimeout(installTimer);
    const attempt = () => {
      if (install()) return;
      if (Date.now() - startedAt >= timeoutMs) {
        console.error('[SEX MAGICK] Canvas render runtime could not find Game.prototype');
        return;
      }
      installTimer = setTimeout(attempt, 10);
    };
    attempt();
  }

  return Object.freeze({
    VERSION,
    DEFAULT_MAX_DPR,
    DEFAULT_MAX_BACKING_PIXELS,
    DPR_QUANTUM,
    normalizeRequestedDpr,
    quantizeDpr,
    computeRenderMetrics,
    parseRenderOptions,
    activateCanvas,
    setLogicalSize,
    getCanvasSnapshot,
    install,
    scheduleInstall
  });
});