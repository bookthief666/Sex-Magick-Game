(function attachSexMagickCollisionRuntime(root, factory) {
  'use strict';

  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SexMagickCollision = api;

  if (
    typeof window !== 'undefined' &&
    typeof Game !== 'undefined' &&
    typeof Pillar !== 'undefined'
  ) {
    api.install();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCollisionRuntime(root) {
  'use strict';

  const CONTROL_SELECTOR = 'button, label, input, select, textarea, a, [role="button"]';
  const DEFAULT_INPUT_BUFFER_FRAMES = 3;
  const MAX_INPUT_BUFFER_FRAMES = 6;
  const REDUCED_MOTION_KEY = 'sex_magick_reduced_motion_v1';
  const LOW_FLASH_KEY = 'sex_magick_low_flash_v1';
  const SENSITIVITY_NOTICE_KEY = 'sex_magick_sensitivity_notice_v1';
  const PLAYER_CORE_COLOR = '#f8fbff';
  const HEX_AURA_COLOR = '#00e5ff';
  const MONAS_AURA_COLOR = '#ffd700';
  const HAZARD_COLOR = '#ff2f6d';
  const HAZARD_GLOW_COLOR = '#ff003c';

  let debugEnabled = false;
  let inputBufferFrames = DEFAULT_INPUT_BUFFER_FRAMES;
  let reducedMotion = false;
  let lowFlash = false;
  let currentPlayer = null;
  let feedbackTimer = null;
  const currentInputStats = createInputStats();
  const lifetimeInputStats = createInputStats();

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clampInteger(value, minimum, maximum, fallback = minimum) {
    const numeric = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
    return Math.min(maximum, Math.max(minimum, numeric));
  }

  function createInputStats() {
    return {
      immediate: 0,
      buffered: 0,
      bufferedFired: 0,
      rejected: 0,
      expired: 0,
      coalesced: 0
    };
  }

  function resetStats(target) {
    for (const key of Object.keys(target)) target[key] = 0;
    return target;
  }

  function incrementInputStat(key) {
    if (Object.prototype.hasOwnProperty.call(currentInputStats, key)) currentInputStats[key] += 1;
    if (Object.prototype.hasOwnProperty.call(lifetimeInputStats, key)) lifetimeInputStats[key] += 1;
  }

  function ensureCurrentPlayer(player) {
    if (currentPlayer === player) return;
    currentPlayer = player || null;
    resetStats(currentInputStats);
  }

  function resolveJumpRequest(cooldown, bufferFrames = DEFAULT_INPUT_BUFFER_FRAMES) {
    const resolvedCooldown = Math.max(0, Math.floor(finiteNumber(Number(cooldown), 0)));
    const resolvedBuffer = clampInteger(bufferFrames, 0, MAX_INPUT_BUFFER_FRAMES, DEFAULT_INPUT_BUFFER_FRAMES);
    if (resolvedCooldown === 0) {
      return { status: 'immediate', pendingFrames: 0, cooldown: resolvedCooldown, bufferFrames: resolvedBuffer };
    }
    if (resolvedBuffer > 0 && resolvedCooldown <= resolvedBuffer) {
      return { status: 'buffered', pendingFrames: resolvedCooldown, cooldown: resolvedCooldown, bufferFrames: resolvedBuffer };
    }
    return { status: 'rejected', pendingFrames: 0, cooldown: resolvedCooldown, bufferFrames: resolvedBuffer };
  }

  function advanceBufferedJumpState(state = {}) {
    const cooldown = Math.max(0, Math.floor(finiteNumber(Number(state.cooldown), 0)));
    const pendingFrames = Math.max(0, Math.floor(finiteNumber(Number(state.pendingFrames), 0)));
    if (pendingFrames === 0) return { status: 'idle', fire: false, pendingFrames: 0 };
    if (cooldown === 0) return { status: 'fire', fire: true, pendingFrames: 0 };
    const remaining = pendingFrames - 1;
    if (remaining <= 0) return { status: 'expired', fire: false, pendingFrames: 0 };
    return { status: 'pending', fire: false, pendingFrames: remaining };
  }

  function normalizeRect(rect) {
    const left = Math.min(finiteNumber(rect.left), finiteNumber(rect.right));
    const right = Math.max(finiteNumber(rect.left), finiteNumber(rect.right));
    const top = Math.min(finiteNumber(rect.top), finiteNumber(rect.bottom));
    const bottom = Math.max(finiteNumber(rect.top), finiteNumber(rect.bottom));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  function rectsOverlap(a, b) {
    const first = normalizeRect(a);
    const second = normalizeRect(b);
    return (
      first.right > second.left &&
      first.left < second.right &&
      first.bottom > second.top &&
      first.top < second.bottom
    );
  }

  function buildPlayerRect(player, hitboxOffset = 0) {
    const radius = Math.max(0, finiteNumber(player?.r));
    const inset = Math.max(0, Math.min(radius, finiteNumber(hitboxOffset)));
    const effectiveRadius = radius - inset;
    const x = finiteNumber(player?.x);
    const y = finiteNumber(player?.y);
    return normalizeRect({
      left: x - effectiveRadius,
      right: x + effectiveRadius,
      top: y - effectiveRadius,
      bottom: y + effectiveRadius
    });
  }

  function buildPillarRects(pillar, viewportHeight) {
    const height = Math.max(0, finiteNumber(viewportHeight));
    const left = finiteNumber(pillar?.x);
    const right = left + Math.max(0, finiteNumber(pillar?.w));
    const gapTop = Math.max(0, Math.min(height, finiteNumber(pillar?.top)));
    const gapBottom = Math.max(gapTop, Math.min(height, gapTop + Math.max(0, finiteNumber(pillar?.gap))));

    return {
      top: normalizeRect({ left, right, top: 0, bottom: gapTop }),
      bottom: normalizeRect({ left, right, top: gapBottom, bottom: height }),
      gap: normalizeRect({ left, right, top: gapTop, bottom: gapBottom })
    };
  }

  function buildJaggedEdgePoints(width, boundaryY, direction, options = {}) {
    if (direction !== -1 && direction !== 1) {
      throw new RangeError('direction must be -1 for a top edge or 1 for a bottom edge');
    }

    const resolvedWidth = Math.max(0, finiteNumber(width));
    const resolvedBoundary = finiteNumber(boundaryY);
    const count = Number.isInteger(options.count) && options.count > 0 ? options.count : 5;
    const inset = Math.max(0, finiteNumber(options.inset, 8));
    const safeStrokeInset = Math.max(0, finiteNumber(options.safeStrokeInset, 2));
    const baseY = resolvedBoundary + direction * safeStrokeInset;
    const points = [];

    for (let index = 0; index <= count; index += 1) {
      points.push({
        x: resolvedWidth / 2 - (index * resolvedWidth / count),
        y: baseY + direction * (index % 2 === 0 ? 0 : inset)
      });
    }

    return points;
  }

  function drawJaggedEdge(ctx, width, boundaryY, direction) {
    for (const point of buildJaggedEdgePoints(width, boundaryY, direction)) {
      ctx.lineTo(point.x, point.y);
    }
  }

  function dispatchPlayerJump(gameInstance, playingState = 'playing') {
    if (
      !gameInstance ||
      gameInstance.state !== playingState ||
      !gameInstance.player ||
      typeof gameInstance.player.jump !== 'function'
    ) {
      return false;
    }

    gameInstance.player.jump();
    return true;
  }

  function safeStorageRead(key) {
    try { return root.localStorage?.getItem?.(key); } catch (_error) { return null; }
  }

  function safeStorageWrite(key, value) {
    try { root.localStorage?.setItem?.(key, String(value)); } catch (_error) {}
  }

  function prefersReducedMotion() {
    try { return Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch (_error) { return false; }
  }

  function showInputFeedback(text, kind) {
    if (typeof document === 'undefined') return;
    const element = document.getElementById('sex-magick-input-feedback');
    if (!element) return;
    element.textContent = text;
    element.dataset.kind = kind;
    element.hidden = false;
    element.classList.remove('visible');
    void element.offsetWidth;
    element.classList.add('visible');
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      element.classList.remove('visible');
      element.hidden = true;
    }, reducedMotion ? 80 : 180);
  }

  function playRejectedCue() {
    try {
      if (typeof SFX !== 'undefined' && typeof SFX.playTone === 'function') {
        SFX.playTone(145, 'square', 0.025, 0.018);
      }
    } catch (_error) {}
  }

  function performAcceptedJump(player, gameInstance) {
    if (!player || !gameInstance) return false;
    player.vy = player.mode === 'MONAS' ? -7.2 : CONFIG.PLAYER_JUMP_FORCE;
    player.jumpCooldown = gameInstance.isMobile ? 8 : 5;
    player.__sexMagickPendingJumpFrames = 0;

    const particleCount = reducedMotion ? 0 : (gameInstance.isMobile ? 4 : 5);
    for (let index = 0; index < particleCount; index += 1) {
      const type = Math.random() > 0.7 ? 'hexagram' : Math.random() > 0.4 ? 'triangle' : 'circle';
      gameInstance.particles.push(new Particle(player.x, player.y, '#fff', 3, type));
    }

    try { if (gameInstance.settings.sfx) SFX.jump(); } catch (_error) {}
    try { Haptics.jump(); } catch (_error) {}
    return true;
  }

  function drawTruthfulPlayer(ctx) {
    const auraColor = this.mode === 'MONAS' ? MONAS_AURA_COLOR : HEX_AURA_COLOR;
    const visibleTrail = reducedMotion ? this.trail.slice(0, 3) : this.trail;

    visibleTrail.forEach(t => {
      if (t.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = reducedMotion ? Math.min(0.18, t.life * 0.2) : t.life * 0.42;
      ctx.translate(t.x, t.y);
      ctx.scale(t.scaleX, t.scaleY);
      ctx.rotate(t.rot + (this.vy * 0.05));
      optimizedShadow.apply(ctx, reducedMotion ? 4 : 14 * t.life, auraColor);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = this.mode === 'MONAS' ? 2 : 1 + t.life;
      if (this.mode === 'MONAS') this.drawMonasShape(ctx, t.r * 1.1 * t.life);
      else this.drawHexShape(ctx, t.r * 0.8 * t.life);
      ctx.restore();
    });

    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scaleX, this.scaleY);
    ctx.rotate(this.rot + (this.vy * 0.05));

    const radius = this.r * 1.2;
    optimizedShadow.apply(ctx, reducedMotion ? 8 : 22, auraColor);
    ctx.strokeStyle = PLAYER_CORE_COLOR;
    ctx.lineWidth = 3.5;
    if (this.mode === 'MONAS') this.drawMonasShape(ctx, radius);
    else this.drawHexShape(ctx, radius);

    if (game.isMobile) {
      ctx.save();
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.22;
      ctx.stroke();
      ctx.restore();
    }

    const pulse = reducedMotion ? 1 : (Math.sin(game.frames * 0.1) * 0.35 + 1);
    ctx.fillStyle = '#fff';
    optimizedShadow.apply(ctx, reducedMotion ? 8 : 26 * pulse, '#fff');
    ctx.beginPath();
    ctx.arc(0, 0, 3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    optimizedShadow.clear(ctx);
  }

  function drawTruthfulPillar(ctx) {
    const bandAccent = game?.gameLevels?.[game.currentLevelIdx]?.accent || '#ffd700';
    const mainColor = HAZARD_COLOR;
    const innerColor = bandAccent;
    const glowColor = HAZARD_GLOW_COLOR;
    const viewportHeight = window.innerHeight;
    const bottomTop = this.top + this.gap;

    if (this.hasWarning && this.x < window.innerWidth * 0.7 && this.warningAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.warningAlpha * (lowFlash || reducedMotion ? 0.12 : 0.3);
      ctx.fillStyle = HAZARD_COLOR;
      ctx.fillRect(this.x - 10, 0, this.w + 20, viewportHeight);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x + this.w / 2, 0);
    optimizedShadow.apply(ctx, reducedMotion ? 8 : 24, glowColor);
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';

    ctx.beginPath();
    ctx.moveTo(-this.w / 2, -10);
    ctx.lineTo(this.w / 2, -10);
    ctx.lineTo(this.w / 2, Math.max(-10, this.top - 2));
    drawJaggedEdge(ctx, this.w, this.top, -1);
    ctx.lineTo(-this.w / 2, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(0, Math.max(0, this.top) / 2);
    ctx.rotate(reducedMotion ? 0 : this.rotation);
    ctx.globalAlpha = reducedMotion ? 0.2 : 0.36;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.5;
    this.drawPattern(ctx, Math.min(this.w, Math.max(0, this.top)) * 0.3);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(-this.w / 2, viewportHeight + 10);
    ctx.lineTo(this.w / 2, viewportHeight + 10);
    ctx.lineTo(this.w / 2, Math.min(viewportHeight + 10, bottomTop + 2));
    drawJaggedEdge(ctx, this.w, bottomTop, 1);
    ctx.lineTo(-this.w / 2, viewportHeight + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(0, bottomTop + Math.max(0, viewportHeight - bottomTop) / 2);
    ctx.rotate(reducedMotion ? 0 : -this.rotation);
    ctx.globalAlpha = reducedMotion ? 0.2 : 0.36;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.5;
    this.drawPattern(ctx, Math.min(this.w, Math.max(0, viewportHeight - bottomTop)) * 0.3);
    ctx.restore();

    ctx.restore();
    optimizedShadow.clear(ctx);
    ctx.globalAlpha = 1;
  }

  function drawRect(ctx, rect, strokeStyle, fillStyle, label) {
    const normalized = normalizeRect(rect);
    ctx.strokeStyle = strokeStyle;
    ctx.fillStyle = fillStyle;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(normalized.left, normalized.top, normalized.width, normalized.height);
    ctx.strokeRect(normalized.left, normalized.top, normalized.width, normalized.height);
    ctx.setLineDash([]);
    if (label) {
      ctx.font = '11px monospace';
      ctx.fillStyle = strokeStyle;
      ctx.fillText(label, normalized.left + 4, Math.max(12, normalized.top + 13));
    }
  }

  function drawCollisionOverlay(instance) {
    if (!instance?.ctx || instance.state !== GameState.PLAYING || !instance.player) return;

    const ctx = instance.ctx;
    const playerRect = buildPlayerRect(instance.player, CONFIG.HITBOX_OFFSET);

    ctx.save();
    ctx.globalAlpha = 0.9;
    drawRect(ctx, playerRect, '#00ffff', 'rgba(0,255,255,0.12)', 'PLAYER HITBOX');

    ctx.beginPath();
    ctx.arc(instance.player.x, instance.player.y, instance.player.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    instance.obstacles.forEach((pillar, index) => {
      const rects = buildPillarRects(pillar, instance.canvas.height);
      drawRect(ctx, rects.top, HAZARD_COLOR, 'rgba(255,47,109,0.10)', `P${index} TOP`);
      drawRect(ctx, rects.bottom, HAZARD_COLOR, 'rgba(255,47,109,0.10)', `P${index} BOTTOM`);
      drawRect(ctx, rects.gap, '#70ff70', 'rgba(112,255,112,0.04)', `P${index} SAFE GAP`);
    });

    ctx.restore();
  }

  function isControlTarget(target) {
    return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest(CONTROL_SELECTOR));
  }

  function ensureRuntimeStyle() {
    if (document.getElementById('sex-magick-input-readability-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-input-readability-style';
    style.textContent = `
      .mobile-jump-area {
        height: 100% !important;
        pointer-events: none !important;
        align-items: flex-end !important;
        padding-bottom: max(24px, env(safe-area-inset-bottom)) !important;
      }
      .mobile-jump-indicator {
        pointer-events: none !important;
        margin-bottom: 18px !important;
      }
      #sex-magick-input-feedback {
        position: fixed;
        left: 50%;
        bottom: max(104px, calc(env(safe-area-inset-bottom) + 78px));
        transform: translate(-50%, 6px);
        z-index: 9998;
        padding: 5px 9px;
        border: 1px solid rgba(255,255,255,.28);
        background: rgba(0,0,0,.72);
        color: rgba(255,255,255,.72);
        font: 9px/1.2 'Orbitron', monospace;
        letter-spacing: 2px;
        pointer-events: none;
        opacity: 0;
        transition: opacity .12s ease, transform .12s ease;
      }
      #sex-magick-input-feedback.visible { opacity: .88; transform: translate(-50%, 0); }
      #sex-magick-input-feedback[data-kind="rejected"] { color: #ff9ab7; border-color: rgba(255,47,109,.55); }
      #sex-magick-input-feedback[data-kind="buffered"] { color: #bafcff; border-color: rgba(0,229,255,.45); }
      .sex-magick-reduced-motion *,
      .sex-magick-reduced-motion *::before,
      .sex-magick-reduced-motion *::after {
        animation-duration: .001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .001ms !important;
        scroll-behavior: auto !important;
      }
      #sex-magick-sensitivity-notice {
        position: fixed;
        left: 50%;
        bottom: max(16px, env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 10001;
        width: min(520px, calc(100vw - 24px));
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid rgba(255,47,109,.55);
        background: rgba(0,0,0,.9);
        color: #ddd;
        font: 10px/1.45 'Orbitron', monospace;
        letter-spacing: 1px;
        text-align: center;
      }
      #sex-magick-sensitivity-notice button {
        margin-left: 8px;
        padding: 4px 8px;
        border: 1px solid rgba(255,255,255,.45);
        background: transparent;
        color: #fff;
      }
      @media (prefers-reduced-motion: reduce) {
        .mobile-jump-indicator { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureInputFeedback() {
    if (document.getElementById('sex-magick-input-feedback')) return;
    const element = document.createElement('div');
    element.id = 'sex-magick-input-feedback';
    element.hidden = true;
    element.setAttribute('aria-live', 'polite');
    document.body.appendChild(element);
  }

  function createSettingRow(id, label, checked, onChange) {
    if (document.getElementById(id)) return document.getElementById(id);
    const container = document.querySelector('#settingsScreen > div');
    if (!container) return null;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;margin:15px 0;border-top:1px solid #444;padding-top:10px;gap:12px;';
    const text = document.createElement('span');
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = checked;
    input.style.accentColor = 'var(--primary)';
    input.addEventListener('change', () => onChange(Boolean(input.checked)));
    row.append(text, input);
    container.appendChild(row);
    return input;
  }

  function applyAccessibilityState() {
    document.documentElement.classList.toggle('sex-magick-reduced-motion', reducedMotion);
    if (typeof game !== 'undefined' && game?.screenFlash && (reducedMotion || lowFlash)) {
      game.screenFlash.intensity = Math.min(game.screenFlash.intensity || 0, reducedMotion ? 0 : 0.16);
    }
  }

  function installAccessibilityControls() {
    const mediaReduced = prefersReducedMotion();
    const savedReduced = safeStorageRead(REDUCED_MOTION_KEY);
    const savedLowFlash = safeStorageRead(LOW_FLASH_KEY);
    reducedMotion = savedReduced == null ? mediaReduced : savedReduced === '1';
    lowFlash = savedLowFlash == null ? mediaReduced : savedLowFlash === '1';
    applyAccessibilityState();

    createSettingRow('reducedMotionToggle', 'STILLNESS (REDUCED FX)', reducedMotion, value => {
      reducedMotion = value;
      if (value) lowFlash = true;
      safeStorageWrite(REDUCED_MOTION_KEY, value ? '1' : '0');
      safeStorageWrite(LOW_FLASH_KEY, lowFlash ? '1' : '0');
      const lowFlashToggle = document.getElementById('lowFlashToggle');
      if (lowFlashToggle) lowFlashToggle.checked = lowFlash;
      applyAccessibilityState();
    });

    createSettingRow('lowFlashToggle', 'VEIL (LOW FLASH)', lowFlash, value => {
      lowFlash = value;
      safeStorageWrite(LOW_FLASH_KEY, value ? '1' : '0');
      applyAccessibilityState();
    });

    if (safeStorageRead(SENSITIVITY_NOTICE_KEY) == null) {
      const notice = document.createElement('div');
      notice.id = 'sex-magick-sensitivity-notice';
      notice.innerHTML = 'VISUAL INTENSITY: flashes, glitch and motion. Adjust STILLNESS / VEIL in Settings.';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'ACKNOWLEDGE';
      button.addEventListener('click', event => {
        event.stopPropagation();
        safeStorageWrite(SENSITIVITY_NOTICE_KEY, '1');
        notice.remove();
      });
      notice.appendChild(button);
      document.body.appendChild(notice);
    }
  }

  function installMobileInstructionStyle() {
    ensureRuntimeStyle();
    const indicator = document.querySelector('.mobile-jump-indicator');
    if (indicator) indicator.textContent = 'TAP ANYWHERE';
  }

  function installTouchPolicy() {
    if (root.__sexMagickFullScreenTouchInstalled) return;

    window.addEventListener('touchstart', event => {
      if (typeof game === 'undefined' || !game || game.state !== GameState.PLAYING || !game.player) return;

      if (isControlTarget(event.target)) {
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      game.playerJump();
    }, { passive: false, capture: true });

    root.__sexMagickFullScreenTouchInstalled = true;
  }

  function installResizePauseContract() {
    if (root.__sexMagickResizePauseInstalled) return;
    let previousWidth = window.innerWidth;
    let previousHeight = window.innerHeight;

    window.addEventListener('resize', () => {
      const widthDelta = Math.abs(window.innerWidth - previousWidth) / Math.max(1, previousWidth);
      const heightDelta = Math.abs(window.innerHeight - previousHeight) / Math.max(1, previousHeight);
      previousWidth = window.innerWidth;
      previousHeight = window.innerHeight;
      if (Math.max(widthDelta, heightDelta) <= 0.1) return;
      if (typeof game === 'undefined' || !game || game.state !== GameState.PLAYING) return;
      game.togglePause();
      const heading = document.querySelector('#pauseScreen .title-text');
      if (heading) heading.textContent = 'POSTURE SHIFT';
      const resume = document.getElementById('resumeBtn');
      if (resume) resume.textContent = 'TAP TO RESUME';
    });

    root.__sexMagickResizePauseInstalled = true;
  }

  function installEffectPolicy() {
    if (Game.prototype.__accessibilityEffectPolicyInstalled) return;
    for (const methodName of ['triggerOrbGlitch', 'triggerLevelUpGlitch', 'triggerDeathGlitch', 'triggerGlitchEffect']) {
      const original = Game.prototype[methodName];
      if (typeof original !== 'function') continue;
      Game.prototype[methodName] = function accessibilityAwareEffect(...args) {
        if (reducedMotion) {
          this.screenFlash = null;
          this.glitchEffect = false;
          return undefined;
        }
        const result = original.apply(this, args);
        if (lowFlash && this.screenFlash) {
          this.screenFlash.intensity = Math.min(this.screenFlash.intensity || 0, 0.16);
          this.screenFlash.duration = Math.min(this.screenFlash.duration || 0, 12);
        }
        return result;
      };
    }
    Game.prototype.__accessibilityEffectPolicyInstalled = true;
  }

  function installDebugToggle() {
    if (root.__sexMagickCollisionDebugToggleInstalled) return;

    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyH') return;
      event.preventDefault();
      debugEnabled = !debugEnabled;
      console.info(`[SEX MAGICK] Collision overlay ${debugEnabled ? 'enabled' : 'disabled'}`);
    });

    root.__sexMagickCollisionDebugToggleInstalled = true;
  }

  function install() {
    if (Game.prototype.__collisionTruthRuntimeInstalled) return;

    const originalDrawGameObjects = Game.prototype.drawGameObjects;
    const originalPlayerUpdate = Player.prototype.update;

    Game.prototype.getPlayerCollisionRect = function getPlayerCollisionRect() {
      return this.player ? buildPlayerRect(this.player, CONFIG.HITBOX_OFFSET) : null;
    };

    Pillar.prototype.getCollisionRects = function getCollisionRects(viewportHeight = window.innerHeight) {
      return buildPillarRects(this, viewportHeight);
    };

    Pillar.prototype.collides = function truthfulPillarCollision(pLeft, pRight, pTop, pBottom) {
      const playerRect = normalizeRect({ left: pLeft, right: pRight, top: pTop, bottom: pBottom });
      const rects = this.getCollisionRects(window.innerHeight);
      return rectsOverlap(playerRect, rects.top) || rectsOverlap(playerRect, rects.bottom);
    };

    Pillar.prototype.draw = drawTruthfulPillar;
    Player.prototype.draw = drawTruthfulPlayer;

    Player.prototype.jump = function inputTruthJump() {
      ensureCurrentPlayer(this);
      const resolution = resolveJumpRequest(this.jumpCooldown, inputBufferFrames);

      if (resolution.status === 'immediate') {
        this.__sexMagickPendingJumpFrames = 0;
        incrementInputStat('immediate');
        return performAcceptedJump(this, game);
      }

      if (resolution.status === 'buffered') {
        if (this.__sexMagickPendingJumpFrames > 0) {
          incrementInputStat('coalesced');
          return false;
        }
        this.__sexMagickPendingJumpFrames = resolution.pendingFrames;
        incrementInputStat('buffered');
        showInputFeedback('QUEUED', 'buffered');
        return false;
      }

      incrementInputStat('rejected');
      showInputFeedback('WAIT', 'rejected');
      playRejectedCue();
      return false;
    };

    Player.prototype.update = function updateWithBufferedInput(...args) {
      ensureCurrentPlayer(this);
      const result = originalPlayerUpdate.apply(this, args);
      if (game.state !== GameState.PLAYING) {
        this.__sexMagickPendingJumpFrames = 0;
        return result;
      }

      const advanced = advanceBufferedJumpState({
        cooldown: this.jumpCooldown,
        pendingFrames: this.__sexMagickPendingJumpFrames
      });
      this.__sexMagickPendingJumpFrames = advanced.pendingFrames;
      if (advanced.fire) {
        incrementInputStat('bufferedFired');
        performAcceptedJump(this, game);
      } else if (advanced.status === 'expired') {
        incrementInputStat('expired');
        showInputFeedback('MISSED', 'rejected');
      }
      return result;
    };

    Game.prototype.playerJump = function singleFeedbackPlayerJump() {
      return dispatchPlayerJump(this, GameState.PLAYING);
    };

    Game.prototype.drawGameObjects = function drawGameObjectsWithCollisionTruth() {
      originalDrawGameObjects.call(this);
      if (debugEnabled) drawCollisionOverlay(this);
    };

    Game.prototype.__collisionTruthRuntimeInstalled = true;
    ensureRuntimeStyle();
    ensureInputFeedback();
    installMobileInstructionStyle();
    installTouchPolicy();
    installResizePauseContract();
    installAccessibilityControls();
    installEffectPolicy();
    installDebugToggle();

    const query = new URLSearchParams(window.location.search);
    debugEnabled = query.get('hitboxes') === '1' || window.location.hash.includes('hitboxes');
    if (query.has('inputBuffer')) {
      inputBufferFrames = clampInteger(query.get('inputBuffer'), 0, MAX_INPUT_BUFFER_FRAMES, DEFAULT_INPUT_BUFFER_FRAMES);
    }

    root.__SEX_MAGICK_COLLISION__ = Object.freeze({
      mode: 'collision-truth-runtime',
      version: 2,
      inputTruthVersion: 1,
      inputBufferDefault: DEFAULT_INPUT_BUFFER_FRAMES,
      inputBufferMaximum: MAX_INPUT_BUFFER_FRAMES,
      colors: Object.freeze({
        playerCore: PLAYER_CORE_COLOR,
        hexAura: HEX_AURA_COLOR,
        monasAura: MONAS_AURA_COLOR,
        hazard: HAZARD_COLOR
      }),
      setInputBufferFrames(value) {
        inputBufferFrames = clampInteger(value, 0, MAX_INPUT_BUFFER_FRAMES, DEFAULT_INPUT_BUFFER_FRAMES);
        return inputBufferFrames;
      },
      getInputBufferFrames() { return inputBufferFrames; },
      getInputStats() {
        return JSON.parse(JSON.stringify({ current: currentInputStats, lifetime: lifetimeInputStats }));
      },
      resetInputStats() {
        resetStats(currentInputStats);
        resetStats(lifetimeInputStats);
        return this.getInputStats();
      },
      setReducedMotion(value) {
        reducedMotion = Boolean(value);
        safeStorageWrite(REDUCED_MOTION_KEY, reducedMotion ? '1' : '0');
        applyAccessibilityState();
        return reducedMotion;
      },
      setLowFlash(value) {
        lowFlash = Boolean(value);
        safeStorageWrite(LOW_FLASH_KEY, lowFlash ? '1' : '0');
        applyAccessibilityState();
        return lowFlash;
      },
      getAccessibility() { return { reducedMotion, lowFlash }; },
      setDebug(value) {
        debugEnabled = Boolean(value);
        return debugEnabled;
      },
      toggleDebug() {
        debugEnabled = !debugEnabled;
        return debugEnabled;
      },
      isDebugEnabled() {
        return debugEnabled;
      },
      getSnapshot() {
        if (typeof game === 'undefined' || !game) return null;
        return {
          state: game.state,
          touchPolicy: 'full-screen-gameplay-excluding-controls',
          jumpFeedbackPolicy: 'player-owned-single-pulse-with-short-buffer',
          inputBufferFrames,
          inputStats: this.getInputStats(),
          accessibility: { reducedMotion, lowFlash },
          debugEnabled,
          player: game.getPlayerCollisionRect(),
          pillars: game.obstacles.map(pillar => pillar.getCollisionRects(game.canvas.height))
        };
      }
    });

    console.info('[SEX MAGICK] Collision and input truth runtime installed', {
      touchPolicy: 'full-screen-gameplay-excluding-controls',
      jumpFeedbackPolicy: 'player-owned-single-pulse-with-short-buffer',
      inputBufferFrames,
      stableGameplayContrast: true,
      debugToggle: 'H'
    });
  }

  return Object.freeze({
    install,
    normalizeRect,
    rectsOverlap,
    buildPlayerRect,
    buildPillarRects,
    buildJaggedEdgePoints,
    dispatchPlayerJump,
    resolveJumpRequest,
    advanceBufferedJumpState,
    DEFAULT_INPUT_BUFFER_FRAMES,
    MAX_INPUT_BUFFER_FRAMES
  });
});
