(function attachSexMagickViewport(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickViewport = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.install();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createViewportApi(root) {
  'use strict';

  const VERSION = 1;
  const PROFILE_NAMES = Object.freeze([
    'compact-phone',
    'tall-phone',
    'fold-closed',
    'fold-open',
    'tablet',
    'desktop'
  ]);

  const PROFILE_CONFIG = Object.freeze({
    'compact-phone': Object.freeze({
      hudWidth: 'calc(100vw - 96px)',
      hudFontSize: '9px',
      hudLetterSpacing: '1px',
      telegraphWidth: 'calc(100vw - 20px)',
      telegraphFontSize: '10px',
      telegraphLetterSpacing: '1.8px',
      scoreScale: 0.88,
      atmosphereScale: 0.82
    }),
    'tall-phone': Object.freeze({
      hudWidth: 'calc(100vw - 92px)',
      hudFontSize: '9px',
      hudLetterSpacing: '1px',
      telegraphWidth: 'calc(100vw - 18px)',
      telegraphFontSize: '10px',
      telegraphLetterSpacing: '1.6px',
      scoreScale: 0.86,
      atmosphereScale: 0.78
    }),
    'fold-closed': Object.freeze({
      hudWidth: 'calc(100vw - 82px)',
      hudFontSize: '8px',
      hudLetterSpacing: '0.8px',
      telegraphWidth: 'calc(100vw - 14px)',
      telegraphFontSize: '9px',
      telegraphLetterSpacing: '1.25px',
      scoreScale: 0.8,
      atmosphereScale: 0.7
    }),
    'fold-open': Object.freeze({
      hudWidth: '360px',
      hudFontSize: '11px',
      hudLetterSpacing: '1.5px',
      telegraphWidth: '580px',
      telegraphFontSize: '13px',
      telegraphLetterSpacing: '2.6px',
      scoreScale: 1.05,
      atmosphereScale: 1
    }),
    tablet: Object.freeze({
      hudWidth: '350px',
      hudFontSize: '10px',
      hudLetterSpacing: '1.4px',
      telegraphWidth: '560px',
      telegraphFontSize: '12px',
      telegraphLetterSpacing: '2.4px',
      scoreScale: 1,
      atmosphereScale: 0.95
    }),
    desktop: Object.freeze({
      hudWidth: '330px',
      hudFontSize: '10px',
      hudLetterSpacing: '1.5px',
      telegraphWidth: '560px',
      telegraphFontSize: '12px',
      telegraphLetterSpacing: '3px',
      scoreScale: 1,
      atmosphereScale: 1
    })
  });

  let installed = false;
  let currentSnapshot = null;
  let resizeTimer = null;
  const listeners = new Set();

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function normalizeProfile(value) {
    const profile = String(value || '').trim().toLowerCase();
    return PROFILE_NAMES.includes(profile) ? profile : null;
  }

  function isFold6UserAgent(userAgent) {
    return /SM-F956[A-Z0-9]*/i.test(String(userAgent || ''));
  }

  function classifyViewport(options = {}) {
    const width = Math.max(1, finiteNumber(options.width, 1));
    const height = Math.max(1, finiteNumber(options.height, 1));
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    const aspect = longSide / shortSide;
    const forced = normalizeProfile(options.forcedProfile);
    const fold6 = isFold6UserAgent(options.userAgent);

    if (forced) return forced;
    if (fold6 && shortSide < 600) return 'fold-closed';
    if (fold6 && shortSide >= 600) return 'fold-open';
    if (shortSide <= 390 && aspect >= 2.12) return 'tall-phone';
    if (shortSide <= 460) return 'compact-phone';
    if (shortSide >= 600 && longSide <= 1400 && aspect <= 1.65) return 'tablet';
    return 'desktop';
  }

  function createSnapshot(options = {}) {
    const width = Math.max(1, finiteNumber(options.width, root.innerWidth || 1));
    const height = Math.max(1, finiteNumber(options.height, root.innerHeight || 1));
    const forcedProfile = normalizeProfile(options.forcedProfile);
    const userAgent = String(options.userAgent ?? root.navigator?.userAgent ?? '');
    const profile = classifyViewport({ width, height, forcedProfile, userAgent });
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);

    return Object.freeze({
      version: VERSION,
      profile,
      forced: Boolean(forcedProfile),
      width,
      height,
      shortSide,
      longSide,
      aspect: Number((longSide / shortSide).toFixed(4)),
      orientation: width >= height ? 'landscape' : 'portrait',
      devicePixelRatio: finiteNumber(options.devicePixelRatio, root.devicePixelRatio || 1),
      fold6Detected: isFold6UserAgent(userAgent),
      config: PROFILE_CONFIG[profile]
    });
  }

  function queryForcedProfile(locationLike = root.location) {
    try {
      return normalizeProfile(new URLSearchParams(locationLike?.search || '').get('viewportProfile'));
    } catch (_error) {
      return null;
    }
  }

  function ensureStyle() {
    if (document.getElementById('sex-magick-viewport-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-viewport-style';
    style.textContent = `
      :root {
        --sm-hud-width: 330px;
        --sm-hud-font-size: 10px;
        --sm-hud-letter-spacing: 1.5px;
        --sm-telegraph-width: 560px;
        --sm-telegraph-font-size: 12px;
        --sm-telegraph-letter-spacing: 3px;
        --sm-score-scale: 1;
        --sm-atmosphere-scale: 1;
      }
      #gate-slice-hud {
        width: min(var(--sm-hud-width), calc(100vw - 12px)) !important;
        font-size: var(--sm-hud-font-size) !important;
        letter-spacing: var(--sm-hud-letter-spacing) !important;
      }
      /* D-063: this predates D-060/D-062 and independently pinned the
         telegraph to a percentage from the *top* on every device profile,
         with !important - which silently overrode the bottom-anchored fix
         those decisions made, on every profile, the whole time. Width, font
         size and letter spacing are legitimate per-profile responsiveness and
         stay; vertical position is gate-slice-runtime.js's alone to own now. */
      #gate-slice-telegraph {
        width: min(var(--sm-telegraph-width), calc(100vw - 12px)) !important;
        font-size: var(--sm-telegraph-font-size) !important;
        letter-spacing: var(--sm-telegraph-letter-spacing) !important;
      }
      #scoreUi, #levelUi { transform: scale(var(--sm-score-scale)); transform-origin: top center; }
      html.sm-profile-fold-closed #gate-slice-hud { top: max(7px, env(safe-area-inset-top)) !important; }
      html.sm-profile-fold-closed #gate-slice-status { max-width: 54%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      html.sm-profile-fold-closed .gate-slice-row { gap: 6px !important; margin-bottom: 3px !important; }
      html.sm-profile-fold-closed .gate-slice-meter { height: 5px !important; }
      html.sm-profile-fold-closed #game-container::after { opacity: calc(.7 * var(--sm-atmosphere-scale)); }
      html.sm-profile-tall-phone .gate-slice-row { gap: 8px !important; }
      html.sm-profile-fold-open #gate-slice-hud { top: max(14px, env(safe-area-inset-top)) !important; }
    `;
    document.head.appendChild(style);
  }

  function applySnapshot(snapshot) {
    ensureStyle();
    const html = document.documentElement;
    for (const profile of PROFILE_NAMES) html.classList.remove(`sm-profile-${profile}`);
    html.classList.add(`sm-profile-${snapshot.profile}`);
    html.dataset.smViewportProfile = snapshot.profile;
    html.dataset.smViewportOrientation = snapshot.orientation;

    const config = snapshot.config;
    html.style.setProperty('--sm-hud-width', config.hudWidth);
    html.style.setProperty('--sm-hud-font-size', config.hudFontSize);
    html.style.setProperty('--sm-hud-letter-spacing', config.hudLetterSpacing);
    html.style.setProperty('--sm-telegraph-width', config.telegraphWidth);
    html.style.setProperty('--sm-telegraph-font-size', config.telegraphFontSize);
    html.style.setProperty('--sm-telegraph-letter-spacing', config.telegraphLetterSpacing);
    html.style.setProperty('--sm-score-scale', String(config.scoreScale));
    html.style.setProperty('--sm-atmosphere-scale', String(config.atmosphereScale));

    currentSnapshot = snapshot;
    for (const listener of listeners) {
      try { listener(snapshot); } catch (_error) {}
    }
    root.dispatchEvent?.(new CustomEvent('sex-magick:viewport-profile', { detail: snapshot }));
    return snapshot;
  }

  function refresh(overrides = {}) {
    return applySnapshot(createSnapshot({
      width: overrides.width ?? root.innerWidth,
      height: overrides.height ?? root.innerHeight,
      devicePixelRatio: overrides.devicePixelRatio ?? root.devicePixelRatio,
      userAgent: overrides.userAgent ?? root.navigator?.userAgent,
      forcedProfile: overrides.forcedProfile ?? queryForcedProfile()
    }));
  }

  function scheduleRefresh() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => refresh(), 120);
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_VIEWPORT__;
    installed = true;
    refresh();
    root.addEventListener('resize', scheduleRefresh, { passive: true });
    root.addEventListener('orientationchange', scheduleRefresh, { passive: true });

    root.__SEX_MAGICK_VIEWPORT__ = Object.freeze({
      mode: 'device-aware-viewport-profiles',
      version: VERSION,
      profiles: PROFILE_NAMES,
      getSnapshot() { return currentSnapshot; },
      refresh,
      classifyViewport,
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    });

    return root.__SEX_MAGICK_VIEWPORT__;
  }

  return Object.freeze({
    VERSION,
    PROFILE_NAMES,
    PROFILE_CONFIG,
    normalizeProfile,
    isFold6UserAgent,
    classifyViewport,
    createSnapshot,
    queryForcedProfile,
    install,
    refresh
  });
});

(function bootstrapM10RenderingAndAssets() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const currentSource = document.currentScript?.src || window.location.href;
  const queue = [
    {
      source: './canvas-render-runtime.js',
      dataset: 'sexMagickCanvasRenderRuntime',
      selector: 'script[data-sex-magick-canvas-render-runtime]',
      globalName: 'SexMagickCanvasRender'
    },
    {
      source: './asset-resilience-runtime.js',
      dataset: 'sexMagickAssetResilienceRuntime',
      selector: 'script[data-sex-magick-asset-resilience-runtime]',
      globalName: 'SexMagickAssetResilience'
    }
  ];

  function loadNext(index) {
    if (index >= queue.length) return;
    const item = queue[index];
    if (globalThis[item.globalName] || document.querySelector(item.selector)) {
      loadNext(index + 1);
      return;
    }
    const script = document.createElement('script');
    script.src = new URL(item.source, currentSource).href;
    script.async = false;
    script.dataset[item.dataset] = 'true';
    script.onload = () => loadNext(index + 1);
    script.onerror = () => {
      console.error('[SEX MAGICK] M10 runtime failed to load', script.src);
      loadNext(index + 1);
    };
    document.head.appendChild(script);
  }

  loadNext(0);
})();