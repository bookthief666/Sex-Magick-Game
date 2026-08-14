'use strict';

/**
 * M33 — product integration defaults for the real 2.0 experience.
 *
 * M16-M29 built the Gate/Gnosis/Void, missions, power-ups, Rite Board, gallery,
 * bonus corridor and aesthetic stack behind `?gateSlice=1`. That made sense while
 * the Gate was experimental, but by M32 it meant the normal URL still exposed a
 * partial product. M33 makes the full HEX stack the default product path while
 * retaining `?gateSlice=0` as an explicit legacy/diagnostic opt-out.
 *
 * This file is parser-loaded before the other runtimes so the existing Gate
 * bootstrap sees the effective query state in its original, proven wrapper order.
 * It also applies the M12 evidence-backed Fold rendering policy: large high-DPR
 * postures use 2x backing while the narrow cover posture retains native DPR.
 *
 * M34 keeps that parser truth unchanged and adds one player-facing enhancement
 * after DOM readiness: the lightweight ritual-ascent layer. It is intentionally
 * absent from visual QA, telemetry QA, raw Gate QA, and explicit Gate-off
 * diagnostic sessions.
 */
(function attachSexMagickProductIntegration(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickProductIntegration = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.applyParserDefaults();
    api.installAdaptiveRenderPolicy();
    api.scheduleDomIntegration();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProductIntegrationApi(root) {
  'use strict';

  const VERSION = 1;
  const LARGE_VIEWPORT_PIXELS = 700_000;
  const HIGH_DPR_THRESHOLD = 2.25;
  const FOLD_OPEN_DPR = 2;
  const RITUAL_ASCENT_SCRIPT_ID = 'sex-magick-ritual-ascent-script';

  let adaptiveRenderManaged = false;
  let adaptiveRenderInstalled = false;
  let adaptiveRefreshTimer = null;

  function truthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
  }

  function isLargeHighDprViewport(width, height, devicePixelRatio) {
    const resolvedWidth = Math.max(1, Number(width) || 1);
    const resolvedHeight = Math.max(1, Number(height) || 1);
    const resolvedDpr = Math.max(1, Number(devicePixelRatio) || 1);
    return resolvedWidth * resolvedHeight >= LARGE_VIEWPORT_PIXELS && resolvedDpr > HIGH_DPR_THRESHOLD;
  }

  function autoRenderDprFor(width, height, devicePixelRatio) {
    return isLargeHighDprViewport(width, height, devicePixelRatio) ? String(FOLD_OPEN_DPR) : null;
  }

  function resolveDefaults(input = {}) {
    const search = String(input.search ?? '');
    let params;
    try { params = new URLSearchParams(search); }
    catch (_error) { params = new URLSearchParams(''); }

    const width = Math.max(1, Number(input.width) || 1);
    const height = Math.max(1, Number(input.height) || 1);
    const dpr = Math.max(1, Number(input.devicePixelRatio) || 1);
    const visualQa = params.get('visualQa') === '1';
    // telemetryQa is a low-level lifecycle fixture: it deliberately drives the
    // base Void/scoring/retry primitives by hand. M33 must not silently wrap that
    // diagnostic in the full HEX product merely because the normal URL changed.
    const baseDiagnostic = params.has('telemetryQa');
    const explicitGate = params.has('gateSlice');
    const explicitRenderDpr = params.has('renderDpr');
    const legacyOptOut = truthy(params.get('legacyHex')) || params.get('productMode') === 'legacy';
    const largeHighDprViewport = isLargeHighDprViewport(width, height, dpr);
    const recommendedRenderDpr = autoRenderDprFor(width, height, dpr);

    const changes = {};

    // Preserve deterministic/low-level QA construction and any caller that
    // explicitly chooses Gate state. Ordinary product sessions enter the complete
    // HEX stack.
    if (!visualQa && !baseDiagnostic && !explicitGate && !legacyOptOut) {
      params.set('gateSlice', '1');
      changes.gateSlice = '1';
    }

    // M12's physical-evidence analyzer provisionally selected open-2x while the
    // closed posture could sustain native. Only inject an automatic render choice
    // when the caller did not choose one. The runtime tracks that ownership so a
    // physical Fold resize can swap 2x <-> native without overriding explicit DPR.
    if (!visualQa && !explicitRenderDpr && recommendedRenderDpr) {
      params.set('renderDpr', recommendedRenderDpr);
      changes.renderDpr = recommendedRenderDpr;
    }

    return Object.freeze({
      version: VERSION,
      query: params.toString(),
      changes: Object.freeze({ ...changes }),
      visualQa,
      baseDiagnostic,
      explicitGate,
      explicitRenderDpr,
      legacyOptOut,
      largeHighDprViewport,
      recommendedRenderDpr,
      width,
      height,
      devicePixelRatio: dpr
    });
  }

  function replaceSearch(params) {
    if (!root.location || !root.history?.replaceState) return false;
    const query = params.toString();
    const next = `${root.location.pathname}${query ? `?${query}` : ''}${root.location.hash || ''}`;
    try {
      root.history.replaceState(root.history.state, '', next);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function applyParserDefaults() {
    if (!root.location || !root.history?.replaceState) return null;

    const resolved = resolveDefaults({
      search: root.location.search,
      width: root.innerWidth,
      height: root.innerHeight,
      devicePixelRatio: root.devicePixelRatio
    });

    // Only M33-injected DPR is adaptive. Any explicit renderDpr supplied by the
    // caller remains permanently authoritative for this page lifecycle.
    adaptiveRenderManaged = !resolved.visualQa && !resolved.explicitRenderDpr;

    if (Object.keys(resolved.changes).length > 0) {
      let params;
      try { params = new URLSearchParams(resolved.query); }
      catch (_error) { params = new URLSearchParams(''); }
      replaceSearch(params);
    }

    root.__SEX_MAGICK_PRODUCT_DEFAULTS__ = Object.freeze({
      mode: 'm33-product-defaults',
      version: VERSION,
      ...resolved,
      adaptiveRenderManaged,
      effectiveSearch: root.location.search
    });

    return root.__SEX_MAGICK_PRODUCT_DEFAULTS__;
  }

  function getAdaptiveRenderSnapshot() {
    let currentRenderDpr = null;
    try { currentRenderDpr = new URLSearchParams(root.location?.search || '').get('renderDpr'); }
    catch (_error) {}
    return Object.freeze({
      mode: 'm33-adaptive-render-policy',
      version: VERSION,
      managed: adaptiveRenderManaged,
      installed: adaptiveRenderInstalled,
      width: Number(root.innerWidth) || 0,
      height: Number(root.innerHeight) || 0,
      devicePixelRatio: Number(root.devicePixelRatio) || 1,
      recommendedRenderDpr: autoRenderDprFor(root.innerWidth, root.innerHeight, root.devicePixelRatio),
      currentRenderDpr
    });
  }

  function applyAdaptiveRenderDefault(options = {}) {
    if (!adaptiveRenderManaged || !root.location || !root.history?.replaceState) {
      return Object.freeze({ changed: false, ...getAdaptiveRenderSnapshot() });
    }

    let params;
    try { params = new URLSearchParams(root.location.search || ''); }
    catch (_error) { params = new URLSearchParams(''); }

    const current = params.get('renderDpr');
    // If some runtime intentionally changed the DPR away from the only value M33
    // ever auto-writes, relinquish ownership rather than fighting that override.
    if (current && current !== String(FOLD_OPEN_DPR)) {
      adaptiveRenderManaged = false;
      return Object.freeze({ changed: false, relinquished: true, ...getAdaptiveRenderSnapshot() });
    }

    const desired = autoRenderDprFor(root.innerWidth, root.innerHeight, root.devicePixelRatio);
    let changed = false;
    if (desired) {
      if (current !== desired) {
        params.set('renderDpr', desired);
        changed = replaceSearch(params);
      }
    } else if (current === String(FOLD_OPEN_DPR)) {
      params.delete('renderDpr');
      changed = replaceSearch(params);
    }

    if (changed && options.refresh !== false) {
      clearTimeout(adaptiveRefreshTimer);
      adaptiveRefreshTimer = setTimeout(() => {
        try { root.__SEX_MAGICK_RENDER__?.refresh?.(); } catch (_error) {}
      }, 0);
    }

    return Object.freeze({ changed, ...getAdaptiveRenderSnapshot() });
  }

  function installAdaptiveRenderPolicy() {
    if (adaptiveRenderInstalled || typeof root.addEventListener !== 'function') {
      return getAdaptiveRenderSnapshot();
    }
    adaptiveRenderInstalled = true;

    // Registered before the game/viewport resize listeners. Update the effective
    // query synchronously so their own resizeCanvas call reads the correct posture
    // policy; the zero-delay refresh is only a fail-safe if no downstream resize
    // handler fires.
    root.addEventListener('resize', () => applyAdaptiveRenderDefault());
    root.__SEX_MAGICK_PRODUCT_RENDER_POLICY__ = Object.freeze({
      mode: 'm33-adaptive-render-policy',
      version: VERSION,
      getSnapshot: getAdaptiveRenderSnapshot,
      refresh: applyAdaptiveRenderDefault
    });
    return getAdaptiveRenderSnapshot();
  }

  function visualQaActive() {
    try { return new URLSearchParams(root.location?.search || '').get('visualQa') === '1'; }
    catch (_error) { return false; }
  }

  function lowLevelDiagnosticActive() {
    try {
      const params = new URLSearchParams(root.location?.search || '');
      return params.has('telemetryQa') || params.has('gateSliceQa');
    } catch (_error) {
      return false;
    }
  }

  function fullHexProductActive() {
    try { return new URLSearchParams(root.location?.search || '').get('gateSlice') === '1'; }
    catch (_error) { return false; }
  }

  function ensureRitualAscentRuntimeLoaded() {
    if (
      typeof document === 'undefined' ||
      visualQaActive() ||
      lowLevelDiagnosticActive() ||
      !fullHexProductActive()
    ) return null;

    const existing = document.getElementById(RITUAL_ASCENT_SCRIPT_ID);
    if (existing) return existing;

    const script = document.createElement('script');
    script.id = RITUAL_ASCENT_SCRIPT_ID;
    script.src = 'tools/ritual-ascent-runtime.js';
    script.async = false;
    document.head.appendChild(script);
    return script;
  }

  function installMenuIntegration() {
    if (typeof document === 'undefined' || visualQaActive()) return null;
    if (document.getElementById('sex-magick-product-manifest')) return root.__SEX_MAGICK_PRODUCT_UI__ || null;

    const modeSelect = document.querySelector('.mode-select-container');
    if (!modeSelect) return null;

    const manifest = document.createElement('div');
    manifest.id = 'sex-magick-product-manifest';
    manifest.setAttribute('aria-label', 'Rite mechanics');
    manifest.innerHTML = `
      <div><strong>HEX</strong> · GATE / GNOSIS / MISSIONS / POWER</div>
      <div><strong>MONAS</strong> · HOLD / COHERENCE / WARP</div>
    `;
    manifest.style.cssText = [
      'font-family:Orbitron,monospace',
      'font-size:0.56rem',
      'line-height:1.65',
      'letter-spacing:1.4px',
      'color:rgba(255,255,255,.58)',
      'text-align:center',
      'margin:-4px auto 5px',
      'max-width:min(92vw,420px)',
      'pointer-events:none'
    ].join(';');
    modeSelect.insertAdjacentElement('afterend', manifest);

    const testButton = Array.from(document.querySelectorAll('button')).find(button =>
      typeof button.getAttribute('onclick') === 'string' && button.getAttribute('onclick').includes('testLeaderboardConnection')
    );
    if (testButton) testButton.hidden = true;

    const hex = document.getElementById('startHexBtn');
    const monas = document.getElementById('startMonasBtn');
    if (hex) hex.title = 'Full Rite: Gate, Gnosis, persistent missions, earned power-ups and the Void';
    if (monas) monas.title = 'Hold/release flight, Coherence scoring and Warp Surge';

    root.__SEX_MAGICK_PRODUCT_UI__ = Object.freeze({
      mode: 'm33-product-ui',
      version: VERSION,
      fullHexDefault: new URLSearchParams(root.location?.search || '').get('gateSlice') === '1',
      renderDpr: new URLSearchParams(root.location?.search || '').get('renderDpr') || 'native',
      manifestVisible: true,
      legacyNetworkTestHidden: Boolean(testButton)
    });
    return root.__SEX_MAGICK_PRODUCT_UI__;
  }

  function installDomProductLayer() {
    const ui = installMenuIntegration();
    ensureRitualAscentRuntimeLoaded();
    return ui;
  }

  function scheduleDomIntegration() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installDomProductLayer, { once: true });
    } else {
      installDomProductLayer();
    }
  }

  return Object.freeze({
    VERSION,
    LARGE_VIEWPORT_PIXELS,
    HIGH_DPR_THRESHOLD,
    FOLD_OPEN_DPR,
    RITUAL_ASCENT_SCRIPT_ID,
    truthy,
    isLargeHighDprViewport,
    autoRenderDprFor,
    resolveDefaults,
    applyParserDefaults,
    getAdaptiveRenderSnapshot,
    applyAdaptiveRenderDefault,
    installAdaptiveRenderPolicy,
    fullHexProductActive,
    ensureRitualAscentRuntimeLoaded,
    installMenuIntegration,
    installDomProductLayer,
    scheduleDomIntegration
  });
});
