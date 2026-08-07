(function attachSexMagickInputFeedbackPolicy(root, factory) {
  'use strict';

  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SexMagickInputFeedbackPolicy = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.install();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createInputFeedbackPolicy(root) {
  'use strict';

  const STYLE_ID = 'sex-magick-input-feedback-policy-style';
  const DEBUG_CLASS = 'sex-magick-input-feedback-debug';
  const FEEDBACK_ID = 'sex-magick-input-feedback';
  const MISSED_CUE_COOLDOWN_MS = 100;

  let installed = false;
  let forcedTextEnabled = null;
  let textEnabled = false;
  let observer = null;
  let lastMissedCueAt = 0;

  function queryRequestsText(locationLike = root.location) {
    if (!locationLike) return false;
    let query = null;
    try {
      query = new URLSearchParams(locationLike.search || '');
    } catch (_error) {
      query = new URLSearchParams();
    }
    const hash = String(locationLike.hash || '').toLowerCase();
    return (
      query.get('inputFeedback') === '1' ||
      query.get('hitboxes') === '1' ||
      hash.includes('input-feedback') ||
      hash.includes('hitboxes') ||
      hash.includes('debug')
    );
  }

  function resolveTextEnabled(options = {}) {
    if (typeof options.forcedEnabled === 'boolean') return options.forcedEnabled;
    return Boolean(options.queryEnabled || options.debugEnabled);
  }

  function collisionDebugEnabled() {
    try {
      return Boolean(root.__SEX_MAGICK_COLLISION__?.isDebugEnabled?.());
    } catch (_error) {
      return false;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html:not(.${DEBUG_CLASS}) #${FEEDBACK_ID} {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function feedbackElement() {
    return document.getElementById(FEEDBACK_ID);
  }

  function applyTextState() {
    textEnabled = resolveTextEnabled({
      forcedEnabled: forcedTextEnabled,
      queryEnabled: queryRequestsText(),
      debugEnabled: collisionDebugEnabled()
    });

    document.documentElement.classList.toggle(DEBUG_CLASS, textEnabled);
    document.documentElement.dataset.inputFeedbackPolicy = 'debug-only';
    document.documentElement.dataset.inputFeedbackText = textEnabled ? 'enabled' : 'hidden';

    const element = feedbackElement();
    if (element) {
      element.setAttribute('aria-hidden', textEnabled ? 'false' : 'true');
      if (!textEnabled) element.classList.remove('visible');
    }

    return textEnabled;
  }

  function playMissedCue() {
    try {
      if (typeof SFX !== 'undefined' && typeof SFX.playTone === 'function') {
        SFX.playTone(145, 'square', 0.025, 0.018);
      }
    } catch (_error) {}
  }

  function observeFeedbackElement(element) {
    if (!element || observer) return;
    observer = new MutationObserver(() => {
      const now = Date.now();
      if (
        element.textContent === 'MISSED' &&
        !element.hidden &&
        now - lastMissedCueAt >= MISSED_CUE_COOLDOWN_MS
      ) {
        lastMissedCueAt = now;
        playMissedCue();
      }
      element.setAttribute('aria-hidden', textEnabled ? 'false' : 'true');
    });
    observer.observe(element, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeFilter: ['hidden', 'class', 'data-kind']
    });
  }

  function waitForRuntime() {
    const attempt = () => {
      const element = feedbackElement();
      if (root.__SEX_MAGICK_COLLISION__ && element) {
        observeFeedbackElement(element);
        applyTextState();
        return;
      }
      setTimeout(attempt, 10);
    };
    attempt();
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_INPUT_FEEDBACK__;
    installed = true;
    ensureStyle();

    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyH') return;
      setTimeout(applyTextState, 0);
    });

    waitForRuntime();

    root.__SEX_MAGICK_INPUT_FEEDBACK__ = Object.freeze({
      mode: 'debug-only-input-feedback',
      version: 1,
      setTextEnabled(value) {
        forcedTextEnabled = Boolean(value);
        return applyTextState();
      },
      clearTextOverride() {
        forcedTextEnabled = null;
        return applyTextState();
      },
      isTextEnabled() {
        return textEnabled;
      },
      getSnapshot() {
        return {
          textPolicy: 'debug-only',
          textEnabled,
          forcedTextEnabled,
          queryEnabled: queryRequestsText(),
          collisionDebugEnabled: collisionDebugEnabled(),
          rejectedCue: 'always-on-when-sfx-runtime-is-available',
          missedCue: 'always-on-when-sfx-runtime-is-available'
        };
      }
    });

    return root.__SEX_MAGICK_INPUT_FEEDBACK__;
  }

  return Object.freeze({
    install,
    queryRequestsText,
    resolveTextEnabled
  });
});