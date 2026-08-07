(function attachSexMagickTouchTargets(root) {
  'use strict';

  const VERSION = 1;
  const STYLE_ID = 'sex-magick-touch-target-style';
  const MINIMUM_CSS_PIXELS = 44;

  function install() {
    if (typeof document === 'undefined') return null;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        button,
        [role="button"],
        input[type="button"],
        input[type="submit"],
        input[type="reset"] {
          min-width: ${MINIMUM_CSS_PIXELS}px;
          min-height: ${MINIMUM_CSS_PIXELS}px;
          box-sizing: border-box;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    const api = Object.freeze({
      mode: 'minimum-interactive-targets',
      version: VERSION,
      minimumCssPixels: MINIMUM_CSS_PIXELS,
      styleId: STYLE_ID
    });

    root.__SEX_MAGICK_TOUCH_TARGETS__ = api;
    root.dispatchEvent?.(new CustomEvent('sex-magick:touch-targets-ready', { detail: api }));
    return api;
  }

  if (typeof document !== 'undefined') install();
})(typeof globalThis !== 'undefined' ? globalThis : this);
