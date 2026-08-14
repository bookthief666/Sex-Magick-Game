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
 * It also applies the M12 evidence-backed Fold-open render default: high-DPR large
 * viewports use 2x backing unless the caller explicitly asks for another DPR.
 */
(function attachSexMagickProductIntegration(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickProductIntegration = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.applyParserDefaults();
    api.scheduleDomIntegration();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProductIntegrationApi(root) {
  'use strict';

  const VERSION = 1;
  const LARGE_VIEWPORT_PIXELS = 700_000;
  const HIGH_DPR_THRESHOLD = 2.25;
  const FOLD_OPEN_DPR = 2;

  function truthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
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
    const largeHighDprViewport = width * height >= LARGE_VIEWPORT_PIXELS && dpr > HIGH_DPR_THRESHOLD;

    const changes = {};

    // Preserve deterministic/low-level QA construction and any caller that
    // explicitly chooses Gate state. Ordinary product sessions enter the complete
    // HEX stack.
    if (!visualQa && !baseDiagnostic && !explicitGate && !legacyOptOut) {
      params.set('gateSlice', '1');
      changes.gateSlice = '1';
    }

    // M12's physical-evidence analyzer provisionally selected open-2x while the
    // closed posture could sustain native. Use geometry rather than UA model text:
    // modern Chromium's reduced UA often hides SM-F956 even on the real Fold 6.
    if (!visualQa && !explicitRenderDpr && largeHighDprViewport) {
      params.set('renderDpr', String(FOLD_OPEN_DPR));
      changes.renderDpr = String(FOLD_OPEN_DPR);
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
      width,
      height,
      devicePixelRatio: dpr
    });
  }

  function applyParserDefaults() {
    if (!root.location || !root.history?.replaceState) return null;

    const resolved = resolveDefaults({
      search: root.location.search,
      width: root.innerWidth,
      height: root.innerHeight,
      devicePixelRatio: root.devicePixelRatio
    });

    if (Object.keys(resolved.changes).length > 0) {
      const next = `${root.location.pathname}${resolved.query ? `?${resolved.query}` : ''}${root.location.hash || ''}`;
      try { root.history.replaceState(root.history.state, '', next); } catch (_error) {}
    }

    root.__SEX_MAGICK_PRODUCT_DEFAULTS__ = Object.freeze({
      mode: 'm33-product-defaults',
      version: VERSION,
      ...resolved,
      effectiveSearch: root.location.search
    });

    return root.__SEX_MAGICK_PRODUCT_DEFAULTS__;
  }

  function visualQaActive() {
    try { return new URLSearchParams(root.location?.search || '').get('visualQa') === '1'; }
    catch (_error) { return false; }
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

  function scheduleDomIntegration() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installMenuIntegration, { once: true });
    } else {
      installMenuIntegration();
    }
  }

  return Object.freeze({
    VERSION,
    LARGE_VIEWPORT_PIXELS,
    HIGH_DPR_THRESHOLD,
    FOLD_OPEN_DPR,
    truthy,
    resolveDefaults,
    applyParserDefaults,
    installMenuIntegration,
    scheduleDomIntegration
  });
});
