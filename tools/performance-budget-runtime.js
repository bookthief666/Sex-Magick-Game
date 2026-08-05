(function attachSexMagickPerformanceBudget(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickPerformanceBudget = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPerformanceBudgetApi(root) {
  'use strict';

  const VERSION = 1;
  const DEFAULT_TARGET_FRAME_MS = 1000 / 60;
  const DEFAULT_LONG_FRAME_MS = 25;
  const DEFAULT_CRITICAL_FRAME_MS = 50;
  const DEFAULT_WARMUP_FRAMES = 120;
  const DEFAULT_SAMPLE_LIMIT = 3600;
  const DEFAULT_MAX_SEGMENTS = 12;
  const DEFAULT_UPDATE_INTERVAL_MS = 250;
  const MAX_SUSPENSION_GAP_MS = 250;

  let installed = false;
  let installTimer = null;
  let originalGameLoop = null;
  let originalDrawScene = null;
  let runtime = null;

  function finiteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
  }

  function parseBoolean(value, fallback = false) {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  function percentile(values, fraction) {
    const clean = Array.from(values || [], value => finiteNumber(value, NaN))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!clean.length) return null;
    const p = clamp(fraction, 0, 1);
    const index = (clean.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return clean[lower];
    const weight = index - lower;
    return clean[lower] * (1 - weight) + clean[upper] * weight;
  }

  function roundMetric(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function summarizeSamples(values) {
    const clean = Array.from(values || [], value => finiteNumber(value, NaN)).filter(Number.isFinite);
    if (!clean.length) {
      return Object.freeze({ count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null });
    }
    const sum = clean.reduce((total, value) => total + value, 0);
    return Object.freeze({
      count: clean.length,
      min: roundMetric(Math.min(...clean)),
      p50: roundMetric(percentile(clean, 0.5)),
      p95: roundMetric(percentile(clean, 0.95)),
      p99: roundMetric(percentile(clean, 0.99)),
      max: roundMetric(Math.max(...clean)),
      mean: roundMetric(sum / clean.length)
    });
  }

  function createRingBuffer(limit = DEFAULT_SAMPLE_LIMIT) {
    const capacity = Math.max(1, Math.floor(finiteNumber(limit, DEFAULT_SAMPLE_LIMIT)));
    const values = new Array(capacity);
    let size = 0;
    let cursor = 0;
    return Object.freeze({
      push(value) {
        values[cursor] = value;
        cursor = (cursor + 1) % capacity;
        size = Math.min(capacity, size + 1);
      },
      clear() {
        size = 0;
        cursor = 0;
      },
      values() {
        if (size < capacity) return values.slice(0, size);
        return values.slice(cursor).concat(values.slice(0, cursor));
      },
      get size() { return size; },
      get capacity() { return capacity; }
    });
  }

  function parsePerformanceOptions(locationLike = root.location) {
    let params;
    try { params = new URLSearchParams(locationLike?.search || ''); }
    catch (_error) { params = new URLSearchParams(''); }

    const targetFrameMs = clamp(
      finiteNumber(params.get('perfTargetFrameMs'), DEFAULT_TARGET_FRAME_MS),
      4,
      100
    );
    const longFrameMs = clamp(
      finiteNumber(params.get('perfLongFrameMs'), DEFAULT_LONG_FRAME_MS),
      targetFrameMs,
      250
    );
    const criticalFrameMs = clamp(
      finiteNumber(params.get('perfCriticalFrameMs'), DEFAULT_CRITICAL_FRAME_MS),
      longFrameMs,
      500
    );

    return Object.freeze({
      enabled: parseBoolean(params.get('perfProbe'), false),
      panel: parseBoolean(params.get('perfPanel'), false),
      targetFrameMs,
      longFrameMs,
      criticalFrameMs,
      warmupFrames: Math.round(clamp(
        finiteNumber(params.get('perfWarmupFrames'), DEFAULT_WARMUP_FRAMES), 0, 1200
      )),
      sampleLimit: Math.round(clamp(
        finiteNumber(params.get('perfSampleFrames'), DEFAULT_SAMPLE_LIMIT), 120, 12_000
      )),
      maxSegments: Math.round(clamp(
        finiteNumber(params.get('perfMaxSegments'), DEFAULT_MAX_SEGMENTS), 1, 24
      )),
      updateIntervalMs: Math.round(clamp(
        finiteNumber(params.get('perfUpdateMs'), DEFAULT_UPDATE_INTERVAL_MS), 100, 2000
      ))
    });
  }

  function normalizeContext(context = {}) {
    return Object.freeze({
      profile: String(context.profile || 'unknown'),
      logicalWidth: Math.max(0, Math.round(finiteNumber(context.logicalWidth, 0))),
      logicalHeight: Math.max(0, Math.round(finiteNumber(context.logicalHeight, 0))),
      effectiveDpr: roundMetric(Math.max(0, finiteNumber(context.effectiveDpr, 0)), 3),
      backingWidth: Math.max(0, Math.round(finiteNumber(context.backingWidth, 0))),
      backingHeight: Math.max(0, Math.round(finiteNumber(context.backingHeight, 0))),
      backingPixels: Math.max(0, Math.round(finiteNumber(context.backingPixels, 0))),
      renderMode: String(context.renderMode || 'unknown'),
      assetMode: String(context.assetMode || 'unknown')
    });
  }

  function contextKey(context) {
    const normalized = normalizeContext(context);
    return [
      normalized.profile,
      `${normalized.logicalWidth}x${normalized.logicalHeight}`,
      `dpr:${normalized.effectiveDpr}`,
      `backing:${normalized.backingWidth}x${normalized.backingHeight}`,
      `assets:${normalized.assetMode}`
    ].join('|');
  }

  function classifyBudget(summary, options) {
    const frameCount = summary.frameIntervals.count;
    if (frameCount < Math.min(120, options.sampleLimit)) return 'insufficient-samples';
    const longRate = frameCount ? summary.longFrames / frameCount : 0;
    const criticalRate = frameCount ? summary.criticalFrames / frameCount : 0;
    const p95 = summary.frameIntervals.p95 ?? Infinity;
    const drawP95 = summary.drawDurations.p95 ?? 0;

    if (
      summary.droppedSimulationMs > 0 ||
      criticalRate > 0.02 ||
      p95 > options.criticalFrameMs ||
      summary.longTasks.totalDurationMs > 500
    ) return 'over-observed-budget';

    if (
      longRate > 0.05 ||
      p95 > options.longFrameMs ||
      drawP95 > options.targetFrameMs * 0.75 ||
      summary.longTasks.count > 0
    ) return 'watch';

    return 'within-observed-budget';
  }

  function createCollector(options = {}) {
    const normalizedOptions = Object.freeze({
      ...parsePerformanceOptions({ search: '' }),
      ...options,
      targetFrameMs: clamp(finiteNumber(options.targetFrameMs, DEFAULT_TARGET_FRAME_MS), 4, 100),
      longFrameMs: clamp(finiteNumber(options.longFrameMs, DEFAULT_LONG_FRAME_MS), 4, 250),
      criticalFrameMs: clamp(finiteNumber(options.criticalFrameMs, DEFAULT_CRITICAL_FRAME_MS), 4, 500),
      warmupFrames: Math.max(0, Math.floor(finiteNumber(options.warmupFrames, DEFAULT_WARMUP_FRAMES))),
      sampleLimit: Math.max(1, Math.floor(finiteNumber(options.sampleLimit, DEFAULT_SAMPLE_LIMIT))),
      maxSegments: Math.max(1, Math.floor(finiteNumber(options.maxSegments, DEFAULT_MAX_SEGMENTS)))
    });

    const segments = [];
    let current = null;
    let nextSegmentId = 1;
    let active = false;
    let startup = {
      navigation: null,
      assets: null,
      probeInstalledAtMs: null
    };

    function newSegment(context, nowMs = 0) {
      const normalized = normalizeContext(context);
      return {
        id: nextSegmentId++,
        key: contextKey(normalized),
        context: normalized,
        startedAtMs: roundMetric(nowMs),
        endedAtMs: null,
        warmupRemaining: normalizedOptions.warmupFrames,
        previousFrameTimestamp: null,
        observedRafCallbacks: 0,
        sampledFrames: 0,
        suspensionGaps: 0,
        longFrames: 0,
        criticalFrames: 0,
        frameIntervals: createRingBuffer(normalizedOptions.sampleLimit),
        callbackDurations: createRingBuffer(normalizedOptions.sampleLimit),
        drawDurations: createRingBuffer(normalizedOptions.sampleLimit),
        longTasks: createRingBuffer(Math.min(normalizedOptions.sampleLimit, 512)),
        longTaskTotalDurationMs: 0,
        droppedSimulationMs: 0,
        suspensionResets: 0,
        lastClockDroppedMs: null,
        lastClockSuspensionResets: null,
        gameFramesStart: null,
        gameFramesEnd: null,
        scoreStart: null,
        scoreEnd: null
      };
    }

    function finalizeCurrent(nowMs = 0) {
      if (!current) return;
      current.endedAtMs = roundMetric(nowMs);
      current = null;
    }

    function ensureSegment(context, nowMs = 0) {
      const key = contextKey(context);
      if (current?.key === key) return current;
      finalizeCurrent(nowMs);
      current = newSegment(context, nowMs);
      segments.push(current);
      while (segments.length > normalizedOptions.maxSegments) segments.shift();
      return current;
    }

    function recordFrameTimestamp(timestampMs, context, game = {}) {
      if (!active || !Number.isFinite(timestampMs)) return null;
      const segment = ensureSegment(context, timestampMs);
      segment.observedRafCallbacks += 1;
      if (segment.gameFramesStart === null && Number.isFinite(game.frames)) segment.gameFramesStart = game.frames;
      if (segment.scoreStart === null && Number.isFinite(game.score)) segment.scoreStart = game.score;
      if (Number.isFinite(game.frames)) segment.gameFramesEnd = game.frames;
      if (Number.isFinite(game.score)) segment.scoreEnd = game.score;

      if (segment.previousFrameTimestamp === null) {
        segment.previousFrameTimestamp = timestampMs;
        return null;
      }

      const delta = Math.max(0, timestampMs - segment.previousFrameTimestamp);
      segment.previousFrameTimestamp = timestampMs;
      if (delta > MAX_SUSPENSION_GAP_MS) {
        segment.suspensionGaps += 1;
        return null;
      }
      if (segment.warmupRemaining > 0) {
        segment.warmupRemaining -= 1;
        return null;
      }

      segment.frameIntervals.push(delta);
      segment.sampledFrames += 1;
      if (delta >= normalizedOptions.longFrameMs) segment.longFrames += 1;
      if (delta >= normalizedOptions.criticalFrameMs) segment.criticalFrames += 1;
      return delta;
    }

    function recordCallbackDuration(durationMs) {
      if (!active || !current || !Number.isFinite(durationMs) || current.warmupRemaining > 0) return;
      current.callbackDurations.push(Math.max(0, durationMs));
    }

    function recordDrawDuration(durationMs) {
      if (!active || !current || !Number.isFinite(durationMs) || current.warmupRemaining > 0) return;
      current.drawDurations.push(Math.max(0, durationMs));
    }

    function recordLongTask(durationMs, startTimeMs = null) {
      if (!active || !current || !Number.isFinite(durationMs) || durationMs < 0) return;
      const task = Object.freeze({
        durationMs: roundMetric(durationMs),
        startTimeMs: Number.isFinite(startTimeMs) ? roundMetric(startTimeMs) : null
      });
      current.longTasks.push(task);
      current.longTaskTotalDurationMs += durationMs;
    }

    function recordClock(clock = {}) {
      if (!active || !current) return;
      const dropped = Math.max(0, finiteNumber(clock.droppedMs, 0));
      const resets = Math.max(0, Math.floor(finiteNumber(clock.suspensionResets, 0)));
      if (current.lastClockDroppedMs !== null && dropped >= current.lastClockDroppedMs) {
        current.droppedSimulationMs += dropped - current.lastClockDroppedMs;
      }
      if (current.lastClockSuspensionResets !== null && resets >= current.lastClockSuspensionResets) {
        current.suspensionResets += resets - current.lastClockSuspensionResets;
      }
      current.lastClockDroppedMs = dropped;
      current.lastClockSuspensionResets = resets;
    }

    function segmentSnapshot(segment) {
      const frameIntervals = summarizeSamples(segment.frameIntervals.values());
      const callbackDurations = summarizeSamples(segment.callbackDurations.values());
      const drawDurations = summarizeSamples(segment.drawDurations.values());
      const longTaskValues = segment.longTasks.values();
      const summary = {
        id: segment.id,
        key: segment.key,
        context: segment.context,
        startedAtMs: segment.startedAtMs,
        endedAtMs: segment.endedAtMs,
        warmupRemaining: segment.warmupRemaining,
        observedRafCallbacks: segment.observedRafCallbacks,
        sampledFrames: segment.sampledFrames,
        suspensionGaps: segment.suspensionGaps,
        longFrames: segment.longFrames,
        criticalFrames: segment.criticalFrames,
        longFrameRate: frameIntervals.count ? roundMetric(segment.longFrames / frameIntervals.count, 5) : null,
        criticalFrameRate: frameIntervals.count ? roundMetric(segment.criticalFrames / frameIntervals.count, 5) : null,
        droppedSimulationMs: roundMetric(segment.droppedSimulationMs),
        suspensionResets: segment.suspensionResets,
        gameFramesStart: segment.gameFramesStart,
        gameFramesEnd: segment.gameFramesEnd,
        scoreStart: segment.scoreStart,
        scoreEnd: segment.scoreEnd,
        frameIntervals,
        callbackDurations,
        drawDurations,
        longTasks: {
          count: longTaskValues.length,
          totalDurationMs: roundMetric(segment.longTaskTotalDurationMs),
          maxDurationMs: longTaskValues.length
            ? roundMetric(Math.max(...longTaskValues.map(task => task.durationMs)))
            : null,
          recent: longTaskValues.slice(-20)
        }
      };
      summary.classification = classifyBudget(summary, normalizedOptions);
      return Object.freeze(summary);
    }

    function aggregateSnapshot(segmentSnapshots) {
      const aggregate = {
        segmentCount: segmentSnapshots.length,
        sampledFrames: 0,
        longFrames: 0,
        criticalFrames: 0,
        suspensionGaps: 0,
        droppedSimulationMs: 0,
        suspensionResets: 0,
        longTaskCount: 0,
        longTaskDurationMs: 0
      };
      for (const segment of segmentSnapshots) {
        aggregate.sampledFrames += segment.sampledFrames;
        aggregate.longFrames += segment.longFrames;
        aggregate.criticalFrames += segment.criticalFrames;
        aggregate.suspensionGaps += segment.suspensionGaps;
        aggregate.droppedSimulationMs += segment.droppedSimulationMs || 0;
        aggregate.suspensionResets += segment.suspensionResets;
        aggregate.longTaskCount += segment.longTasks.count;
        aggregate.longTaskDurationMs += segment.longTasks.totalDurationMs || 0;
      }
      aggregate.longFrameRate = aggregate.sampledFrames
        ? roundMetric(aggregate.longFrames / aggregate.sampledFrames, 5)
        : null;
      aggregate.criticalFrameRate = aggregate.sampledFrames
        ? roundMetric(aggregate.criticalFrames / aggregate.sampledFrames, 5)
        : null;
      aggregate.droppedSimulationMs = roundMetric(aggregate.droppedSimulationMs);
      aggregate.longTaskDurationMs = roundMetric(aggregate.longTaskDurationMs);
      return Object.freeze(aggregate);
    }

    return Object.freeze({
      start(nowMs = 0) {
        active = true;
        if (startup.probeInstalledAtMs === null) startup.probeInstalledAtMs = roundMetric(nowMs);
      },
      stop(nowMs = 0) {
        active = false;
        finalizeCurrent(nowMs);
      },
      reset() {
        segments.length = 0;
        current = null;
        nextSegmentId = 1;
        startup = { navigation: null, assets: null, probeInstalledAtMs: null };
      },
      setNavigationSnapshot(snapshot) { startup.navigation = snapshot ? Object.freeze({ ...snapshot }) : null; },
      setAssetSnapshot(snapshot) { startup.assets = snapshot ? Object.freeze({ ...snapshot }) : null; },
      recordFrameTimestamp,
      recordCallbackDuration,
      recordDrawDuration,
      recordLongTask,
      recordClock,
      ensureSegment,
      get active() { return active; },
      getSnapshot(nowMs = 0) {
        const segmentSnapshots = segments.map(segmentSnapshot);
        return Object.freeze({
          mode: 'local-opt-in-performance-budget-probe',
          version: VERSION,
          active,
          generatedAtMs: roundMetric(nowMs),
          options: normalizedOptions,
          startup: Object.freeze({ ...startup }),
          aggregate: aggregateSnapshot(segmentSnapshots),
          currentSegmentId: current?.id || null,
          segments: segmentSnapshots
        });
      }
    });
  }

  function navigationSnapshot(performanceLike = root.performance) {
    const navigation = performanceLike?.getEntriesByType?.('navigation')?.[0];
    if (navigation) {
      return Object.freeze({
        source: 'navigation-entry',
        type: navigation.type || null,
        responseEndMs: roundMetric(navigation.responseEnd),
        domContentLoadedMs: roundMetric(navigation.domContentLoadedEventEnd),
        loadEventMs: roundMetric(navigation.loadEventEnd),
        transferSize: Math.max(0, Math.round(finiteNumber(navigation.transferSize, 0))),
        decodedBodySize: Math.max(0, Math.round(finiteNumber(navigation.decodedBodySize, 0)))
      });
    }
    const timing = performanceLike?.timing;
    if (!timing?.navigationStart) return null;
    const offset = value => value > 0 ? Math.max(0, value - timing.navigationStart) : null;
    return Object.freeze({
      source: 'legacy-performance-timing',
      type: null,
      responseEndMs: roundMetric(offset(timing.responseEnd)),
      domContentLoadedMs: roundMetric(offset(timing.domContentLoadedEventEnd)),
      loadEventMs: roundMetric(offset(timing.loadEventEnd)),
      transferSize: null,
      decodedBodySize: null
    });
  }

  function compactAssetSnapshot(snapshot) {
    if (!snapshot) return null;
    const summary = snapshot.summary || {};
    return Object.freeze({
      assetMode: String(snapshot.assetMode || 'unknown'),
      durationMs: Number.isFinite(snapshot.durationMs) ? roundMetric(snapshot.durationMs) : null,
      total: Math.max(0, Math.round(finiteNumber(snapshot.total ?? summary.total, 0))),
      loaded: Math.max(0, Math.round(finiteNumber(summary.loaded, 0))),
      fallback: Math.max(0, Math.round(finiteNumber(summary.fallback, 0))),
      timedOut: Math.max(0, Math.round(finiteNumber(summary.timedOut, 0))),
      networkAttempts: Math.max(0, Math.round(finiteNumber(snapshot.networkAttempts ?? summary.networkAttempts, 0))),
      fallbackSurfaceCount: Math.max(0, Math.round(finiteNumber(snapshot.fallbackSurfaceCount, 0)))
    });
  }

  function environmentSnapshot(longTaskObserver) {
    const memory = root.performance?.memory;
    return Object.freeze({
      longTaskObserverSupported: Boolean(longTaskObserver),
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
      devicePixelRatio: roundMetric(Math.max(1, finiteNumber(root.devicePixelRatio, 1)), 3),
      jsHeap: memory ? Object.freeze({
        usedBytes: Math.max(0, Math.round(finiteNumber(memory.usedJSHeapSize, 0))),
        totalBytes: Math.max(0, Math.round(finiteNumber(memory.totalJSHeapSize, 0))),
        limitBytes: Math.max(0, Math.round(finiteNumber(memory.jsHeapSizeLimit, 0)))
      }) : null
    });
  }

  function currentGameInstance() {
    try { if (typeof game !== 'undefined' && game) return game; }
    catch (_error) {}
    return root.game || null;
  }

  function collectContext(instance = currentGameInstance()) {
    const viewport = root.__SEX_MAGICK_VIEWPORT__?.getSnapshot?.() || null;
    const render = root.__SEX_MAGICK_RENDER__?.getSnapshot?.(instance) || null;
    const assets = root.__SEX_MAGICK_ASSETS__?.getSnapshot?.(instance) || null;
    return normalizeContext({
      profile: viewport?.profile || 'unknown',
      logicalWidth: render?.logicalWidth ?? instance?.canvas?.width ?? root.innerWidth,
      logicalHeight: render?.logicalHeight ?? instance?.canvas?.height ?? root.innerHeight,
      effectiveDpr: render?.effectiveDpr ?? root.devicePixelRatio ?? 1,
      backingWidth: render?.backingWidth ?? instance?.canvas?.width ?? 0,
      backingHeight: render?.backingHeight ?? instance?.canvas?.height ?? 0,
      backingPixels: render?.backingPixels ?? 0,
      renderMode: render?.mode || 'unknown',
      assetMode: assets?.assetMode || 'unknown'
    });
  }

  function createPanel() {
    if (document.getElementById('smPerformancePanel')) return document.getElementById('smPerformancePanel');
    const panel = document.createElement('section');
    panel.id = 'smPerformancePanel';
    panel.dataset.gameControl = 'true';
    panel.setAttribute('aria-label', 'Local performance probe');
    Object.assign(panel.style, {
      position: 'fixed',
      zIndex: '99999',
      right: '8px',
      bottom: '8px',
      width: 'min(300px, calc(100vw - 16px))',
      maxHeight: '46vh',
      overflow: 'auto',
      background: 'rgba(2, 4, 10, 0.9)',
      border: '1px solid rgba(0, 229, 255, 0.7)',
      color: '#f8fbff',
      font: '10px/1.35 monospace',
      padding: '8px',
      boxSizing: 'border-box',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'auto'
    });
    panel.innerHTML = `
      <div style="display:flex;gap:6px;align-items:center;justify-content:space-between">
        <strong style="color:#00e5ff">PERF PROBE · LOCAL</strong>
        <span>
          <button type="button" data-sm-perf-export style="font:inherit;padding:3px 6px">EXPORT</button>
          <button type="button" data-sm-perf-toggle style="font:inherit;padding:3px 6px">HIDE</button>
        </span>
      </div>
      <pre data-sm-perf-body style="white-space:pre-wrap;margin:6px 0 0">WAITING FOR FRAMES</pre>
    `;
    panel.querySelector('[data-sm-perf-export]')?.addEventListener('click', event => {
      event.stopPropagation();
      runtime?.downloadReport?.();
    });
    panel.querySelector('[data-sm-perf-toggle]')?.addEventListener('click', event => {
      event.stopPropagation();
      panel.hidden = true;
    });
    document.body.appendChild(panel);
    return panel;
  }

  function formatPanel(snapshot) {
    const segment = snapshot.segments.at(-1);
    if (!segment) return 'WAITING FOR FRAMES';
    const context = segment.context;
    return [
      `${context.profile} · ${context.logicalWidth}x${context.logicalHeight} · DPR ${context.effectiveDpr}`,
      `BACKING ${context.backingWidth}x${context.backingHeight} (${context.backingPixels.toLocaleString()} px)`,
      `STATUS ${segment.classification}`,
      `SAMPLES ${segment.frameIntervals.count} / RAF ${segment.observedRafCallbacks}`,
      `FRAME p50 ${segment.frameIntervals.p50 ?? '-'} · p95 ${segment.frameIntervals.p95 ?? '-'} · p99 ${segment.frameIntervals.p99 ?? '-'} ms`,
      `DRAW p95 ${segment.drawDurations.p95 ?? '-'} · CALLBACK p95 ${segment.callbackDurations.p95 ?? '-'} ms`,
      `LONG ${segment.longFrames} · CRITICAL ${segment.criticalFrames}`,
      `DROPPED SIM ${segment.droppedSimulationMs} ms · RESETS ${segment.suspensionResets}`,
      `LONG TASKS ${segment.longTasks.count} / ${segment.longTasks.totalDurationMs} ms`,
      `SEGMENTS ${snapshot.aggregate.segmentCount} · ALL SAMPLES ${snapshot.aggregate.sampledFrames}`
    ].join('\n');
  }

  function installLongTaskObserver(collector) {
    if (typeof PerformanceObserver === 'undefined') return null;
    const supported = PerformanceObserver.supportedEntryTypes || [];
    if (!supported.includes('longtask')) return null;
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) collector.recordLongTask(entry.duration, entry.startTime);
      });
      observer.observe({ type: 'longtask', buffered: true });
      return observer;
    } catch (_error) {
      return null;
    }
  }

  function downloadJson(snapshot, filename = 'sex-magick-performance-report.json') {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  function install() {
    if (installed) return runtime;
    const options = parsePerformanceOptions(root.location);
    if (!options.enabled) return null;

    const GameClass = (() => {
      try { return typeof Game !== 'undefined' ? Game : root.Game; }
      catch (_error) { return root.Game; }
    })();
    if (!root.__SEX_MAGICK_TIMING__) return null;
    if (!GameClass?.prototype?.gameLoop || !GameClass.prototype.drawScene) return null;
    if (GameClass.prototype.__performanceBudgetRuntimeInstalled && root.__SEX_MAGICK_PERFORMANCE__) {
      installed = true;
      runtime = root.__SEX_MAGICK_PERFORMANCE__;
      return runtime;
    }

    installed = true;
    const collector = createCollector(options);
    collector.setNavigationSnapshot(navigationSnapshot(root.performance));
    collector.start(root.performance?.now?.() || 0);
    const longTaskObserver = installLongTaskObserver(collector);
    let panel = null;
    let lastPanelUpdateMs = 0;

    originalGameLoop = GameClass.prototype.gameLoop;
    originalDrawScene = GameClass.prototype.drawScene;

    GameClass.prototype.drawScene = function drawSceneWithPerformanceProbe(...args) {
      const start = root.performance?.now?.() || Date.now();
      try {
        return originalDrawScene.apply(this, args);
      } finally {
        const end = root.performance?.now?.() || Date.now();
        collector.recordDrawDuration(Math.max(0, end - start));
      }
    };

    GameClass.prototype.gameLoop = function gameLoopWithPerformanceProbe(currentTime, ...args) {
      const callbackStart = root.performance?.now?.() || Date.now();
      if (Number.isFinite(currentTime)) {
        collector.recordFrameTimestamp(currentTime, collectContext(this), {
          frames: this.frames,
          score: this.score
        });
      }
      try {
        return originalGameLoop.call(this, currentTime, ...args);
      } finally {
        const callbackEnd = root.performance?.now?.() || Date.now();
        collector.recordCallbackDuration(Math.max(0, callbackEnd - callbackStart));
        const clock = this.fixedStepClock?.snapshot?.() || this.fixedStepLastResult || null;
        if (clock) collector.recordClock(clock);
        if (options.panel && callbackEnd - lastPanelUpdateMs >= options.updateIntervalMs) {
          panel ||= createPanel();
          const body = panel?.querySelector('[data-sm-perf-body]');
          if (body) body.textContent = formatPanel(collector.getSnapshot(callbackEnd));
          lastPanelUpdateMs = callbackEnd;
        }
      }
    };

    GameClass.prototype.__performanceBudgetRuntimeInstalled = true;

    const onAssetsReady = event => collector.setAssetSnapshot(compactAssetSnapshot(event.detail || null));
    root.addEventListener?.('sex-magick:assets-ready', onAssetsReady);
    const existingAssets = root.__SEX_MAGICK_ASSETS__?.getSnapshot?.(currentGameInstance());
    if (existingAssets) collector.setAssetSnapshot(compactAssetSnapshot(existingAssets));

    const refreshNavigation = () => collector.setNavigationSnapshot(navigationSnapshot(root.performance));
    if (document.readyState === 'complete') refreshNavigation();
    else root.addEventListener?.('load', refreshNavigation, { once: true });

    runtime = Object.freeze({
      mode: 'local-opt-in-performance-budget-probe',
      version: VERSION,
      options,
      getSnapshot() {
        const snapshot = collector.getSnapshot(root.performance?.now?.() || Date.now());
        return Object.freeze({ ...snapshot, environment: environmentSnapshot(longTaskObserver) });
      },
      start() { collector.start(root.performance?.now?.() || Date.now()); return this.getSnapshot(); },
      stop() { collector.stop(root.performance?.now?.() || Date.now()); return this.getSnapshot(); },
      reset() {
        collector.reset();
        collector.setNavigationSnapshot(navigationSnapshot(root.performance));
        collector.start(root.performance?.now?.() || Date.now());
        const assets = root.__SEX_MAGICK_ASSETS__?.getSnapshot?.(currentGameInstance());
        if (assets) collector.setAssetSnapshot(compactAssetSnapshot(assets));
        return this.getSnapshot();
      },
      showPanel() {
        panel ||= createPanel();
        panel.hidden = false;
        const body = panel.querySelector('[data-sm-perf-body]');
        if (body) body.textContent = formatPanel(this.getSnapshot());
        return true;
      },
      hidePanel() { if (panel) panel.hidden = true; return true; },
      downloadReport(filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return downloadJson(this.getSnapshot(), filename || `sex-magick-performance-${timestamp}.json`);
      },
      destroy() {
        collector.stop(root.performance?.now?.() || Date.now());
        longTaskObserver?.disconnect?.();
        root.removeEventListener?.('sex-magick:assets-ready', onAssetsReady);
        root.removeEventListener?.('load', refreshNavigation);
        if (panel) panel.remove();
      }
    });

    root.__SEX_MAGICK_PERFORMANCE__ = runtime;
    if (options.panel) runtime.showPanel();
    root.addEventListener?.('keydown', event => {
      if (event.key?.toLowerCase() !== 'p' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!panel || panel.hidden) runtime.showPanel();
      else runtime.hidePanel();
    });
    root.dispatchEvent?.(new CustomEvent('sex-magick:performance-ready', { detail: runtime.getSnapshot() }));
    return runtime;
  }

  function scheduleInstall(timeoutMs = 5000) {
    const options = parsePerformanceOptions(root.location);
    if (!options.enabled) return;
    const startedAt = Date.now();
    clearTimeout(installTimer);
    const attempt = () => {
      if (install()) return;
      if (Date.now() - startedAt >= timeoutMs) {
        console.error('[SEX MAGICK] Performance budget probe could not find the fixed-step Game runtime');
        return;
      }
      installTimer = setTimeout(attempt, 10);
    };
    attempt();
  }

  return Object.freeze({
    VERSION,
    DEFAULT_TARGET_FRAME_MS,
    DEFAULT_LONG_FRAME_MS,
    DEFAULT_CRITICAL_FRAME_MS,
    DEFAULT_WARMUP_FRAMES,
    DEFAULT_SAMPLE_LIMIT,
    DEFAULT_MAX_SEGMENTS,
    percentile,
    summarizeSamples,
    createRingBuffer,
    parsePerformanceOptions,
    normalizeContext,
    contextKey,
    classifyBudget,
    createCollector,
    navigationSnapshot,
    compactAssetSnapshot,
    environmentSnapshot,
    collectContext,
    install,
    scheduleInstall
  });
});
