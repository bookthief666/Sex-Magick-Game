(function attachFixedStepClock(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SexMagickFixedStep = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFixedStepClockApi() {
  'use strict';

  class FixedStepClock {
    constructor(options = {}) {
      this.stepMs = options.stepMs ?? (1000 / 60);
      this.maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
      this.suspensionResetMs = options.suspensionResetMs ?? 250;

      if (!(this.stepMs > 0)) throw new RangeError('stepMs must be greater than zero');
      if (!Number.isInteger(this.maxStepsPerFrame) || this.maxStepsPerFrame < 1) {
        throw new RangeError('maxStepsPerFrame must be a positive integer');
      }
      if (!(this.suspensionResetMs >= this.stepMs)) {
        throw new RangeError('suspensionResetMs must be at least one fixed step');
      }

      this.reset();
    }

    reset(now = null) {
      this.lastTimeMs = Number.isFinite(now) ? now : null;
      this.accumulatorMs = 0;
      this.totalSteps = 0;
      this.droppedMs = 0;
      this.suspensionResets = 0;
    }

    advance(nowMs, onStep) {
      if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be a finite number');
      if (typeof onStep !== 'function') throw new TypeError('onStep must be a function');

      if (this.lastTimeMs === null) {
        this.lastTimeMs = nowMs;
        return this.snapshot(0, 0, false);
      }

      const rawDeltaMs = Math.max(0, nowMs - this.lastTimeMs);
      this.lastTimeMs = nowMs;

      if (rawDeltaMs > this.suspensionResetMs) {
        this.accumulatorMs = 0;
        this.suspensionResets += 1;
        return this.snapshot(0, rawDeltaMs, true);
      }

      this.accumulatorMs += rawDeltaMs;
      let steps = 0;
      const epsilon = 1e-7;

      while (
        this.accumulatorMs + epsilon >= this.stepMs &&
        steps < this.maxStepsPerFrame
      ) {
        onStep(this.stepMs);
        this.accumulatorMs -= this.stepMs;
        if (this.accumulatorMs < 0 && this.accumulatorMs > -epsilon) {
          this.accumulatorMs = 0;
        }
        steps += 1;
        this.totalSteps += 1;
      }

      if (this.accumulatorMs + epsilon >= this.stepMs) {
        const wholeStepsToDrop = Math.floor((this.accumulatorMs + epsilon) / this.stepMs);
        const droppedNowMs = wholeStepsToDrop * this.stepMs;
        this.accumulatorMs -= droppedNowMs;
        if (Math.abs(this.accumulatorMs) < epsilon) this.accumulatorMs = 0;
        this.droppedMs += droppedNowMs;
      }

      return this.snapshot(steps, rawDeltaMs, false);
    }

    snapshot(steps = 0, rawDeltaMs = 0, suspensionReset = false) {
      return {
        steps,
        rawDeltaMs,
        suspensionReset,
        alpha: this.accumulatorMs / this.stepMs,
        accumulatorMs: this.accumulatorMs,
        totalSteps: this.totalSteps,
        droppedMs: this.droppedMs,
        suspensionResets: this.suspensionResets,
        stepMs: this.stepMs,
        maxStepsPerFrame: this.maxStepsPerFrame,
        suspensionResetMs: this.suspensionResetMs
      };
    }
  }

  return Object.freeze({ FixedStepClock });
});

(function parserOrderedM10Bootstrap() {
  'use strict';

  if (typeof document === 'undefined' || document.readyState !== 'loading') return;
  const source = document.currentScript?.src;
  if (!source) return;

  const scripts = [
    {
      path: './canvas-render-runtime.js',
      selector: 'script[data-sex-magick-canvas-render-runtime]',
      attribute: 'data-sex-magick-canvas-render-runtime',
      globalName: 'SexMagickCanvasRender'
    },
    {
      path: './asset-resilience-runtime.js',
      selector: 'script[data-sex-magick-asset-resilience-runtime]',
      attribute: 'data-sex-magick-asset-resilience-runtime',
      globalName: 'SexMagickAssetResilience'
    },
    {
      path: './performance-budget-runtime.js',
      selector: 'script[data-sex-magick-performance-budget-runtime]',
      attribute: 'data-sex-magick-performance-budget-runtime',
      globalName: 'SexMagickPerformanceBudget',
      conditionalQuery: 'perfProbe'
    }
  ];

  let params;
  try { params = new URLSearchParams(globalThis.location?.search || ''); }
  catch (_error) { params = new URLSearchParams(''); }

  for (const script of scripts) {
    if (script.conditionalQuery && !['1', 'true', 'yes', 'on'].includes(
      String(params.get(script.conditionalQuery) || '').trim().toLowerCase()
    )) continue;
    if (globalThis[script.globalName] || document.querySelector(script.selector)) continue;
    const url = new URL(script.path, source).href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    document.write(`<script src="${url}" ${script.attribute}="true"><\/script>`);
  }
})();
