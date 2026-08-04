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
  let debugEnabled = false;

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
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

    // Player.jump owns SFX and haptics. The former Game.playerJump implementation
    // emitted a second haptic pulse after Player.jump had already emitted one.
    gameInstance.player.jump();
    return true;
  }

  function drawTruthfulPillar(ctx) {
    const hue = (game.frames * 0.5 + this.x * 0.1) % 360;
    const mainColor = `hsl(${hue}, 100%, 60%)`;
    const innerColor = `hsl(${(hue + 60) % 360}, 100%, 70%)`;
    const glowColor = `hsl(${hue}, 100%, 50%)`;
    const viewportHeight = window.innerHeight;
    const bottomTop = this.top + this.gap;

    if (this.hasWarning && this.x < window.innerWidth * 0.7 && this.warningAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.warningAlpha * 0.3;
      ctx.fillStyle = '#ff003c';
      ctx.fillRect(this.x - 10, 0, this.w + 20, viewportHeight);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x + this.w / 2, 0);
    optimizedShadow.apply(ctx, 30, glowColor);
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';

    // Every gap-facing top-edge point stays inside the top collision rectangle.
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
    ctx.rotate(this.rotation);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.5;
    this.drawPattern(ctx, Math.min(this.w, Math.max(0, this.top)) * 0.3);
    ctx.restore();

    // Every gap-facing bottom-edge point stays inside the bottom collision rectangle.
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
    ctx.rotate(-this.rotation);
    ctx.globalAlpha = 0.4;
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
      drawRect(ctx, rects.top, '#ff2f6d', 'rgba(255,47,109,0.10)', `P${index} TOP`);
      drawRect(ctx, rects.bottom, '#ff2f6d', 'rgba(255,47,109,0.10)', `P${index} BOTTOM`);
      drawRect(ctx, rects.gap, '#70ff70', 'rgba(112,255,112,0.04)', `P${index} SAFE GAP`);
    });

    ctx.restore();
  }

  function isControlTarget(target) {
    return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest(CONTROL_SELECTOR));
  }

  function installMobileInstructionStyle() {
    if (!document.getElementById('sex-magick-mobile-input-policy')) {
      const style = document.createElement('style');
      style.id = 'sex-magick-mobile-input-policy';
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
      `;
      document.head.appendChild(style);
    }

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

    Game.prototype.playerJump = function singleFeedbackPlayerJump() {
      return dispatchPlayerJump(this, GameState.PLAYING);
    };

    Game.prototype.drawGameObjects = function drawGameObjectsWithCollisionTruth() {
      originalDrawGameObjects.call(this);
      if (debugEnabled) drawCollisionOverlay(this);
    };

    Game.prototype.__collisionTruthRuntimeInstalled = true;
    installMobileInstructionStyle();
    installTouchPolicy();
    installDebugToggle();

    const query = new URLSearchParams(window.location.search);
    debugEnabled = query.get('hitboxes') === '1' || window.location.hash.includes('hitboxes');

    root.__SEX_MAGICK_COLLISION__ = Object.freeze({
      mode: 'collision-truth-runtime',
      version: 2,
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
          jumpFeedbackPolicy: 'player-owned-single-pulse',
          debugEnabled,
          player: game.getPlayerCollisionRect(),
          pillars: game.obstacles.map(pillar => pillar.getCollisionRects(game.canvas.height))
        };
      }
    });

    console.info('[SEX MAGICK] Collision truth runtime installed', {
      touchPolicy: 'full-screen-gameplay-excluding-controls',
      jumpFeedbackPolicy: 'player-owned-single-pulse',
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
    dispatchPlayerJump
  });
});
