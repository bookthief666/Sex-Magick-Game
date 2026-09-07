(function attachSexMagickAssetResilience(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickAssetResilience = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAssetResilienceApi(root) {
  'use strict';

  const VERSION = 1;
  const MODES = Object.freeze(['auto', 'offline']);
  const DEFAULT_ATTEMPT_TIMEOUT_MS = 2500;
  const DEFAULT_OVERALL_TIMEOUT_MS = 6500;
  const MAX_NETWORK_ATTEMPTS = 2;
  const FALLBACK_WIDTH = 480;
  const FALLBACK_HEIGHT = 270;
  const fallbackCache = new Map();
  let installed = false;
  let installTimer = null;
  let originalFinishLoading = null;

  function finiteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
  }

  function normalizeMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return MODES.includes(mode) ? mode : 'auto';
  }

  function parseAssetOptions(locationLike = root.location) {
    let params;
    try { params = new URLSearchParams(locationLike?.search || ''); }
    catch (_error) { params = new URLSearchParams(''); }
    return Object.freeze({
      mode: normalizeMode(params.get('assetMode')),
      attemptTimeoutMs: Math.round(clamp(
        finiteNumber(params.get('assetAttemptMs'), DEFAULT_ATTEMPT_TIMEOUT_MS), 250, 4000
      )),
      overallTimeoutMs: Math.round(clamp(
        finiteNumber(params.get('assetOverallMs'), DEFAULT_OVERALL_TIMEOUT_MS), 1000, 10_000
      ))
    });
  }

  function appendRetryQuery(url, attempt) {
    const raw = String(url || '');
    try {
      const parsed = new URL(raw, 'https://sex-magick.invalid/');
      parsed.searchParams.set('smRetry', String(attempt));
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return parsed.href;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_error) {
      return `${raw}${raw.includes('?') ? '&' : '?'}smRetry=${encodeURIComponent(attempt)}`;
    }
  }

  function createAssetManifest(levels = [], config = {}) {
    const baseUrl = String(config.baseUrl || '');
    const suffix = String(config.suffix || '');
    const debugStamp = config.debug ? `?t=${finiteNumber(config.now, Date.now())}` : '';
    return levels.map((level, index) => Object.freeze({
      index,
      id: String(level?.id || `asset-${index}`),
      name: String(level?.name || level?.id || `Asset ${index + 1}`),
      accent: String(level?.accent || '#00e5ff'),
      url: `${baseUrl}${String(level?.id || '')}${suffix}${debugStamp}`
    }));
  }

  function summarizeRecords(records = []) {
    const summary = {
      total: records.length,
      pending: 0,
      loaded: 0,
      fallback: 0,
      networkAttempts: 0,
      timedOut: 0,
      failedIds: [],
      fallbackIds: []
    };
    for (const record of records) {
      const status = String(record?.status || 'pending');
      if (status === 'loaded') summary.loaded += 1;
      else if (status === 'fallback') {
        summary.fallback += 1;
        summary.fallbackIds.push(record.id);
      } else summary.pending += 1;
      summary.networkAttempts += Math.max(0, Math.floor(finiteNumber(record?.networkAttempts, 0)));
      if (record?.reason === 'overall-timeout' || record?.reason === 'attempt-timeout') summary.timedOut += 1;
      if (record?.lastError) summary.failedIds.push(record.id);
    }
    return Object.freeze(summary);
  }

  function cloneRecord(record) {
    return {
      id: record.id,
      name: record.name,
      url: record.url,
      status: record.status,
      source: record.source,
      networkAttempts: record.networkAttempts,
      lastError: record.lastError,
      reason: record.reason,
      originClean: record.originClean,
      fallbackKey: record.fallbackKey,
      settledAtMs: record.settledAtMs
    };
  }

  function normalizeAccent(accent) {
    const value = String(accent || '#00e5ff').trim().toLowerCase();
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#00e5ff';
  }

  function createFallbackCanvas(asset, reason = 'unavailable') {
    const accent = normalizeAccent(asset?.accent);
    if (fallbackCache.has(accent)) return fallbackCache.get(accent);

    const canvas = document.createElement('canvas');
    canvas.width = FALLBACK_WIDTH;
    canvas.height = FALLBACK_HEIGHT;
    canvas.complete = true;
    canvas.__sexMagickFallback = true;
    canvas.__sexMagickFallbackKey = accent;
    canvas.__sexMagickFallbackReason = reason;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(240, 135, 10, 240, 135, 300);
    gradient.addColorStop(0, `${accent}66`);
    gradient.addColorStop(0.45, '#11131c');
    gradient.addColorStop(1, '#020204');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(240, 128);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 2;
    for (let ring = 1; ring <= 4; ring += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, ring * 23, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(Math.PI / 6);
    for (let index = 0; index < 6; index += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(94, 0);
      ctx.stroke();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fbff';
    ctx.font = '700 18px sans-serif';
    ctx.fillText('SIGIL CHANNEL OFFLINE', 240, 232);
    ctx.fillStyle = accent;
    ctx.font = '10px monospace';
    ctx.fillText('PROCEDURAL FIELD · GAMEPLAY AVAILABLE', 240, 250);
    fallbackCache.set(accent, canvas);
    return canvas;
  }

  function loadImageAttempt(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        callback(value);
      };
      const timer = setTimeout(() => finish(reject, new Error(`attempt-timeout:${timeoutMs}`)), timeoutMs);
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        if ((image.naturalWidth || image.width) <= 0 || (image.naturalHeight || image.height) <= 0) {
          finish(reject, new Error('empty-image'));
          return;
        }
        // `decoding = 'async'` above is only a hint for the <img> render path.
        // A bitmap that has loaded but never been decoded is decoded
        // *synchronously on the main thread* the first time ctx.drawImage()
        // touches it - so with a real gallery, every level whose art appears
        // for the first time costs a frame hitch mid-run. M36's physical Fold 6
        // probe measured exactly that: frame intervals pinned at 16.7ms across
        // p50/p95/p99 with isolated long tasks up to 92ms and 100ms of dropped
        // simulation, clustered like level transitions (see D-060).
        //
        // Decoding here moves that cost onto the loading screen, where a
        // progress bar already sets the expectation. The attempt timer above is
        // still running, so a decode that hangs is bounded exactly like a fetch
        // that hangs, and a decode that *fails* still yields a usable image -
        // the browser will simply decode it later the old way - so this
        // resolves rather than rejecting on decode error.
        if (typeof image.decode !== 'function') {
          finish(resolve, image);
          return;
        }
        image.decode().then(
          () => finish(resolve, image),
          () => finish(resolve, image)
        );
      };
      image.onerror = () => finish(reject, new Error('network-or-decode-error'));
      image.src = url;
    });
  }

  function updateProgress(instance) {
    const state = instance.__smAssetRuntime;
    if (!state) return;
    const summary = summarizeRecords(state.records);
    const settled = summary.loaded + summary.fallback;
    const percent = state.total > 0 ? Math.floor((settled / state.total) * 100) : 100;
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('loadingText');
    if (fill) fill.style.width = `${percent}%`;
    if (text) {
      const fallbackLabel = summary.fallback > 0 ? ` · ${summary.fallback} FALLBACK` : '';
      text.innerText = `CHARGING SIGIL... ${settled}/${state.total}${fallbackLabel}`;
    }
  }

  function buildInstanceSnapshot(instance) {
    const state = instance?.__smAssetRuntime;
    if (!state) return null;
    const records = state.records.map(cloneRecord);
    return Object.freeze({
      mode: 'bounded-asset-loading-with-procedural-fallbacks',
      version: VERSION,
      assetMode: state.options.mode,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      durationMs: state.durationMs,
      total: state.total,
      finishCalls: state.finishCalls,
      networkAttempts: state.networkAttempts,
      fallbackSurfaceCount: fallbackCache.size,
      fallbackSurfacePixels: fallbackCache.size * FALLBACK_WIDTH * FALLBACK_HEIGHT,
      summary: summarizeRecords(records),
      records
    });
  }

  function finishInstanceOnce(instance) {
    const state = instance.__smAssetRuntime;
    if (!state || state.finished) return state?.snapshot || null;
    state.finished = true;
    state.finishedAt = new Date().toISOString();
    state.durationMs = Math.max(0, Math.round(performance.now() - state.startedMonotonicMs));
    clearTimeout(state.overallTimer);
    instance.finishLoading();
    state.snapshot = buildInstanceSnapshot(instance);
    root.dispatchEvent?.(new CustomEvent('sex-magick:assets-ready', { detail: state.snapshot }));
    return state.snapshot;
  }

  function settleFallback(instance, record, level, reason, error = null) {
    if (record.settled) return;
    const fallback = createFallbackCanvas(record, reason);
    record.settled = true;
    record.status = 'fallback';
    record.source = 'procedural-shared-atlas';
    record.reason = reason;
    record.lastError = error ? String(error?.message || error) : record.lastError;
    record.originClean = true;
    record.fallbackKey = fallback.__sexMagickFallbackKey;
    record.settledAtMs = Math.max(0, Math.round(performance.now() - instance.__smAssetRuntime.startedMonotonicMs));
    level.img = fallback;
    level.loaded = true;
    level.assetFallback = true;
    level.assetStatus = cloneRecord(record);
    updateProgress(instance);
  }

  function settleLoaded(instance, record, level, image, source = 'network') {
    if (record.settled) return;
    record.settled = true;
    record.status = 'loaded';
    record.source = source;
    record.reason = null;
    record.lastError = null;
    record.originClean = true;
    record.fallbackKey = null;
    record.settledAtMs = Math.max(0, Math.round(performance.now() - instance.__smAssetRuntime.startedMonotonicMs));
    level.img = image;
    level.loaded = true;
    level.assetFallback = false;
    level.assetStatus = cloneRecord(record);
    updateProgress(instance);
  }

  async function loadRecord(instance, record, level, options) {
    if (record.settled) return;
    if (level.loaded && level.img && level.img.complete) {
      settleLoaded(instance, record, level, level.img, level.assetFallback ? 'existing-fallback' : 'existing');
      return;
    }
    if (options.mode === 'offline') {
      settleFallback(instance, record, level, 'offline-mode');
      return;
    }

    for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt += 1) {
      if (record.settled) return;
      const url = attempt === 1 ? record.url : appendRetryQuery(record.url, attempt);
      record.networkAttempts += 1;
      instance.__smAssetRuntime.networkAttempts += 1;
      try {
        const image = await loadImageAttempt(url, options.attemptTimeoutMs);
        settleLoaded(instance, record, level, image, attempt === 1 ? 'network' : 'network-retry');
        return;
      } catch (error) {
        record.lastError = String(error?.message || error);
        record.reason = record.lastError.startsWith('attempt-timeout') ? 'attempt-timeout' : 'network-failure';
      }
    }
    settleFallback(instance, record, level, record.reason || 'network-failure', record.lastError);
  }

  function currentGameInstance() {
    try { if (typeof game !== 'undefined' && game) return game; }
    catch (_error) {}
    return root.game || null;
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_ASSETS__ || null;
    const GameClass = (() => {
      try { return typeof Game !== 'undefined' ? Game : root.Game; }
      catch (_error) { return root.Game; }
    })();
    if (!GameClass?.prototype) return null;

    const levels = (() => {
      try { return typeof MASTER_POOL !== 'undefined' ? MASTER_POOL : root.MASTER_POOL; }
      catch (_error) { return root.MASTER_POOL; }
    })();
    const config = (() => {
      try { return typeof CONFIG !== 'undefined' ? CONFIG : root.CONFIG; }
      catch (_error) { return root.CONFIG; }
    })();
    if (!Array.isArray(levels) || !config) return null;
    if (GameClass.prototype.__assetResilienceRuntimeInstalled && root.__SEX_MAGICK_ASSETS__) {
      installed = true;
      return root.__SEX_MAGICK_ASSETS__;
    }

    installed = true;
    originalFinishLoading = GameClass.prototype.finishLoading;
    GameClass.prototype.finishLoading = function finishLoadingOnce(...args) {
      const state = this.__smAssetRuntime;
      if (state) state.finishCalls += 1;
      const menu = document.getElementById('menuButtons');
      const alreadyVisible = Boolean(menu && !menu.classList.contains('hidden'));
      if (this.__smFinishLoadingCompleted || alreadyVisible) {
        this.__smFinishLoadingCompleted = true;
        return undefined;
      }
      this.__smFinishLoadingCompleted = true;
      return originalFinishLoading.apply(this, args);
    };

    GameClass.prototype.preloadAllImages = function preloadAllImagesResilient() {
      if (this.__smAssetRuntime?.started && !this.__smAssetRuntime.finished) return this.__smAssetRuntime.promise;
      const options = parseAssetOptions(root.location);
      const manifest = createAssetManifest(levels, {
        baseUrl: config.BASE_URL,
        suffix: config.IMG_SUFFIX,
        debug: Boolean(config.DEBUG),
        now: Date.now()
      });
      const state = {
        started: true,
        finished: false,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        startedMonotonicMs: performance.now(),
        durationMs: null,
        total: manifest.length,
        finishCalls: 0,
        networkAttempts: 0,
        options,
        records: manifest.map(asset => ({
          ...asset,
          status: 'pending',
          source: null,
          networkAttempts: 0,
          lastError: null,
          reason: null,
          originClean: null,
          fallbackKey: null,
          settledAtMs: null,
          settled: false
        })),
        overallTimer: null,
        promise: null,
        snapshot: null
      };
      this.__smAssetRuntime = state;
      updateProgress(this);

      state.overallTimer = setTimeout(() => {
        for (let index = 0; index < state.records.length; index += 1) {
          if (!state.records[index].settled) {
            settleFallback(this, state.records[index], levels[index], 'overall-timeout', state.records[index].lastError);
          }
        }
        finishInstanceOnce(this);
      }, options.overallTimeoutMs);

      state.promise = Promise.allSettled(
        state.records.map((record, index) => loadRecord(this, record, levels[index], options))
      ).then(() => finishInstanceOnce(this));
      return state.promise;
    };

    GameClass.prototype.__assetResilienceRuntimeInstalled = true;
    root.__SEX_MAGICK_ASSETS__ = Object.freeze({
      mode: 'bounded-asset-loading-with-procedural-fallbacks',
      version: VERSION,
      getSnapshot(instance = currentGameInstance()) { return buildInstanceSnapshot(instance); },
      retry(instance = currentGameInstance()) {
        if (!instance) return null;
        instance.__smAssetRuntime = null;
        return instance.preloadAllImages();
      },
      normalizeMode,
      parseAssetOptions,
      createAssetManifest,
      summarizeRecords,
      getFallbackSurfaceCount() { return fallbackCache.size; }
    });

    const instance = currentGameInstance();
    if (instance && !instance.__smAssetRuntime) instance.preloadAllImages();
    return root.__SEX_MAGICK_ASSETS__;
  }

  function scheduleInstall(timeoutMs = 5000) {
    const startedAt = Date.now();
    clearTimeout(installTimer);
    const attempt = () => {
      if (install()) return;
      if (Date.now() - startedAt >= timeoutMs) {
        console.error('[SEX MAGICK] Asset resilience runtime could not find game assets');
        return;
      }
      installTimer = setTimeout(attempt, 10);
    };
    attempt();
  }

  return Object.freeze({
    VERSION,
    MODES,
    DEFAULT_ATTEMPT_TIMEOUT_MS,
    DEFAULT_OVERALL_TIMEOUT_MS,
    MAX_NETWORK_ATTEMPTS,
    FALLBACK_WIDTH,
    FALLBACK_HEIGHT,
    normalizeMode,
    parseAssetOptions,
    appendRetryQuery,
    createAssetManifest,
    summarizeRecords,
    install,
    scheduleInstall
  });
});