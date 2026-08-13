(function attachSexMagickOccultField(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickOccultField = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOccultFieldApi(root) {
  'use strict';

  const FIELD_VERSION = 1;

  // Three strata at increasing parallax. Depth is what turns a flat backdrop into
  // a place, and the ratios are deliberately far apart so the separation reads at
  // a glance rather than only in motion.
  const STRATA = Object.freeze([
    Object.freeze({ id: 'deep', parallax: 0.12, alpha: 0.30, seals: 3, scale: 1.55, lineWidth: 1 }),
    Object.freeze({ id: 'mid', parallax: 0.30, alpha: 0.24, seals: 4, scale: 1.0, lineWidth: 1 }),
    Object.freeze({ id: 'near', parallax: 0.62, alpha: 0.16, seals: 6, scale: 0.6, lineWidth: 1 })
  ]);

  const VOID_COLOR = '#05060a';
  const GLYPH_RAIN_COUNT = 26;

  let installed = false;
  let installTimer = null;
  let fieldSeed = 0x6d2b79f5;
  let glyphRain = [];

  function art() {
    return root.SexMagickOccultArt || null;
  }

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function currentBandName(gameInstance) {
    const state = gameInstance?.gateSliceState;
    if (!state) return art()?.DEFAULT_BAND || 'MALKUTH';
    const slice = root.__SEX_MAGICK_GATE_SLICE__;
    const bands = slice?.getFingerprint?.().bandNames;
    if (Array.isArray(bands) && bands[state.bandIndex]) return bands[state.bandIndex];
    return art()?.DEFAULT_BAND || 'MALKUTH';
  }

  /**
   * One stratum, rasterised once per (band, stratum, size).
   *
   * The layer is double-width and *horizontally periodic*: the left tile is drawn
   * with its marks wrapped across both edges, then copied to the right half. That
   * periodicity is what lets `drawStrata` scroll with a single blit — the window
   * [drift, drift + width] shows a whole cycle at every drift in [0, width), so
   * it wraps without a seam and without compositing the layer over itself.
   */
  function stratumLayer(bandName, stratum, width, height) {
    const artApi = art();
    if (!artApi) return null;
    const palette = artApi.paletteFor(bandName);
    const key = artApi.cacheKey(['stratum', bandName, stratum.id, width, height, fieldSeed]);

    return artApi.getCachedLayer(key, width * 2, height, (ctx, layerWidth, layerHeight) => {
      const random = artApi.seededRandom(artApi.hashSeed(`${fieldSeed}|${bandName}|${stratum.id}`));
      const color = stratum.id === 'near' ? palette.near : stratum.id === 'mid' ? palette.mid : palette.deep;
      const tile = Math.max(1, Math.round(layerWidth / 2));

      // Positions are drawn from the sequence once, so every wrapped copy of a
      // mark is the same mark rather than a fresh sample.
      const marks = [];
      for (let index = 0; index < stratum.seals; index += 1) {
        const radius = (Math.min(tile, layerHeight) * 0.22 * stratum.scale) * (0.7 + random() * 0.6);
        marks.push({
          x: random() * tile,
          y: random() * layerHeight,
          rotation: random() * Math.PI * 2,
          radius,
          seal: artApi.buildSeal({ random, radius }),
          // A short inscription beside each seal, which is what sells "this field
          // was written" rather than "shapes were scattered".
          run: random() < 0.7
            ? artApi.buildGlyphRun({ random, count: 3 + Math.floor(random() * 5), size: radius * 0.16 })
            : null
        });
      }

      // Drawing the set at -tile, 0 and +tile means a mark straddling an edge
      // continues on the opposite one. Build-time cost only.
      for (const offset of [-tile, 0, tile]) {
        for (const mark of marks) {
          ctx.save();
          ctx.translate(mark.x + offset, mark.y);
          ctx.rotate(mark.rotation);
          artApi.drawSeal(ctx, mark.seal, { color, alpha: 1, lineWidth: stratum.lineWidth });
          ctx.restore();

          if (!mark.run) continue;
          ctx.save();
          ctx.translate(mark.x + offset - mark.radius * 0.5, mark.y + mark.radius * 1.12);
          artApi.drawGlyphRun(ctx, mark.run, { color: palette.glyph, alpha: 0.75, lineWidth: 1 });
          ctx.restore();
        }
      }

      ctx.drawImage(ctx.canvas, 0, 0, tile, layerHeight, tile, 0, tile, layerHeight);
    });
  }

  /**
   * The field's compositing buffer, in CSS pixels rather than device pixels.
   *
   * The game canvas is scaled by the device pixel ratio, so anything drawn into
   * it directly is rasterised at 2.6x on a Fold 6 - and the field is four
   * full-screen operations (ground plus three parallax strata). Measured at the
   * Fold's open geometry that came to 27M pixels a frame and doubled frame time.
   *
   * Compositing here first and blitting once costs one full-screen operation at
   * device resolution instead of four. The background gives up its DPR
   * supersampling, which is the right thing to trade: it is soft line-work behind
   * the gameplay, and pillars, avatar and HUD are untouched at full resolution.
   */
  const FIELD_BUFFER_MAX_PIXELS = 1_600_000;
  let fieldBufferState = null;

  function fieldBuffer(width, height) {
    const artApi = art();
    const targetWidth = Math.max(1, Math.round(finite(width, 1)));
    const targetHeight = Math.max(1, Math.round(finite(height, 1)));
    if (!artApi) return null;

    // Only very large viewports scale below CSS resolution.
    const scale = Math.min(1, Math.sqrt(FIELD_BUFFER_MAX_PIXELS / (targetWidth * targetHeight)));
    const bufferWidth = Math.max(1, Math.round(targetWidth * scale));
    const bufferHeight = Math.max(1, Math.round(targetHeight * scale));
    if (fieldBufferState && fieldBufferState.width === bufferWidth && fieldBufferState.height === bufferHeight) {
      return fieldBufferState;
    }

    const canvas = artApi.createCanvas(bufferWidth, bufferHeight);
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return null;
    fieldBufferState = { canvas, ctx, width: canvas.width, height: canvas.height };
    return fieldBufferState;
  }

  /**
   * The ground is a full-screen radial gradient that only depends on the band and
   * the viewport, so painting it live every frame was buying nothing. Cached, it
   * costs one opaque blit - and a large radial gradient fill is markedly more
   * expensive than a blit when the canvas is software-rasterised.
   */
  function drawGround(ctx, bandName, width, height, voidActive) {
    const artApi = art();
    if (artApi) {
      const key = artApi.cacheKey(['ground', bandName, Math.round(width), Math.round(height), voidActive ? 'void' : 'lit']);
      const layer = artApi.getCachedLayer(key, Math.round(width), Math.round(height), (layerCtx, w, h) => {
        paintGround(layerCtx, bandName, w, h, voidActive);
      });
      if (layer) {
        ctx.drawImage(layer, 0, 0, width, height);
        return;
      }
    }
    paintGround(ctx, bandName, width, height, voidActive);
  }

  function paintGround(ctx, bandName, width, height, voidActive) {
    const artApi = art();
    const palette = artApi ? artApi.paletteFor(bandName) : { ink: '#08080b', deep: '#141a33' };
    const gradient = ctx.createRadialGradient(width / 2, height * 0.45, 10, width / 2, height * 0.45, Math.max(width, height) * 0.75);
    if (voidActive) {
      // The Void drains the band's colour out of the world entirely.
      gradient.addColorStop(0, '#10131c');
      gradient.addColorStop(0.5, VOID_COLOR);
      gradient.addColorStop(1, '#000000');
    } else {
      gradient.addColorStop(0, palette.deep);
      gradient.addColorStop(0.55, palette.ink);
      gradient.addColorStop(1, '#000000');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStrata(ctx, gameInstance, bandName, width, height, voidActive) {
    const artApi = art();
    if (!artApi) return;
    const reduced = artApi.reducedMotionActive();
    const frames = finite(gameInstance?.frames, 0);
    const speed = Math.max(0.1, finite(gameInstance?.gameSpeed, 1));

    for (const stratum of STRATA) {
      const layer = stratumLayer(bandName, stratum, Math.round(width), Math.round(height));
      if (!layer) continue;
      const drift = reduced ? 0 : (frames * speed * stratum.parallax) % width;
      ctx.save();
      // In the Void the strata survive only as silhouettes - the writing is still
      // there, but you can no longer read it.
      ctx.globalAlpha = voidActive ? stratum.alpha * 0.35 : stratum.alpha;
      // One blit: the layer is periodic with period `width`, so the window at
      // -drift always shows a whole cycle. Compositing a second copy on top would
      // double the alpha over the rightmost `drift` pixels and cost a second
      // full-screen fill per stratum per frame.
      ctx.drawImage(layer, -drift, 0);
      ctx.restore();
    }
  }

  // --- the Void ------------------------------------------------------------

  function seedGlyphRain(width, height) {
    const artApi = art();
    const random = artApi ? artApi.seededRandom(artApi.hashSeed(`${fieldSeed}|rain`)) : Math.random;
    glyphRain = [];
    for (let index = 0; index < GLYPH_RAIN_COUNT; index += 1) {
      glyphRain.push({
        x: random() * width,
        y: random() * height,
        speed: 1.5 + random() * 4.5,
        size: 6 + random() * 10,
        alpha: 0.25 + random() * 0.5,
        run: artApi ? artApi.buildGlyphRun({ random, count: 1, size: 6 + random() * 8 }) : null
      });
    }
  }

  /**
   * The Void's presentation. It is the wager and the most dangerous place in the
   * game, and until now it was a cyan tint. Descending script, a vignette closing
   * as the timer runs down, and a pulse on the beat of the countdown.
   */
  function drawVoid(ctx, gameInstance, width, height) {
    const artApi = art();
    if (!artApi) return;
    const reduced = artApi.reducedMotionActive();
    if (glyphRain.length === 0) seedGlyphRain(width, height);

    for (const drop of glyphRain) {
      if (!reduced) {
        drop.y += drop.speed;
        if (drop.y > height + 20) {
          drop.y = -20;
          drop.x = Math.random() * width;
        }
      }
      if (!drop.run) continue;
      ctx.save();
      ctx.translate(drop.x, drop.y);
      artApi.drawGlyphRun(ctx, drop.run, { color: '#8fa4c8', alpha: drop.alpha, lineWidth: 1 });
      ctx.restore();
    }

    // How far through the wager we are. The walls of the world close in as it runs.
    const total = Math.max(1, finite(gameInstance?.voidTimer, 0) + 1);
    const progress = 1 - Math.min(1, total / (8 * 60));
    const pulse = reduced ? 0 : Math.sin(finite(gameInstance?.frames, 0) * 0.14) * 0.04;
    const inner = Math.max(width, height) * (0.62 - progress * 0.22 + pulse);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, inner * 0.35, width / 2, height / 2, inner);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Replaces drawHyperspaceTunnel's eight rotating pentagrams.
   *
   * The generated field is the game's actual look now, not a fallback. A failed
   * Drive fetch costs enrichment rather than producing the "SIGIL CHANNEL
   * OFFLINE" error screen the owner hit in the first pilot.
   */
  function drawField(gameInstance) {
    const ctx = gameInstance?.ctx;
    if (!ctx || !art()) return false;
    const width = gameInstance.canvas.width;
    const height = gameInstance.canvas.height;
    const voidActive = Boolean(gameInstance.voidMode || gameInstance.__gateSliceVoidActive);
    const bandName = currentBandName(gameInstance);

    const buffer = fieldBuffer(width, height);
    if (!buffer) {
      // No offscreen canvas available: draw straight to the target rather than
      // lose the field entirely.
      drawGround(ctx, bandName, width, height, voidActive);
      drawStrata(ctx, gameInstance, bandName, width, height, voidActive);
      if (voidActive) drawVoid(ctx, gameInstance, width, height);
      return true;
    }

    // The ground is opaque and painted first, so the buffer needs no clear.
    drawGround(buffer.ctx, bandName, buffer.width, buffer.height, voidActive);
    drawStrata(buffer.ctx, gameInstance, bandName, buffer.width, buffer.height, voidActive);
    if (voidActive) drawVoid(buffer.ctx, gameInstance, buffer.width, buffer.height);
    ctx.drawImage(buffer.canvas, 0, 0, width, height);
    return true;
  }

  function beginRun(gameInstance) {
    const artApi = art();
    fieldSeed = artApi
      ? artApi.hashSeed(`${gameInstance?.gateSliceState?.runId || Date.now()}|field`)
      : Date.now();
    glyphRain = [];
    // Strata are keyed by seed, so a new run must not reuse the previous field.
    if (artApi) artApi.clearCache();
  }

  /**
   * Inscription strip for a wall face, cached per band and blitted.
   *
   * Pillars redraw every frame and several are on screen at once, so this must
   * never be path-drawn live. Purely decorative: the collision rectangle is
   * untouched and `Pillar.prototype.collides` is not in scope here.
   */
  function wallStrip(bandName, width, height) {
    const artApi = art();
    if (!artApi) return null;
    const palette = artApi.paletteFor(bandName);
    const key = artApi.cacheKey(['wall', bandName, width, height, fieldSeed]);

    return artApi.getCachedLayer(key, width, height, (ctx, stripWidth, stripHeight) => {
      const random = artApi.seededRandom(artApi.hashSeed(`${fieldSeed}|${bandName}|wall`));
      ctx.strokeStyle = palette.glyph;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;

      // A spine of inscription running the length of the wall.
      const step = Math.max(18, Math.round(stripHeight / 14));
      for (let y = step; y < stripHeight; y += step) {
        const run = artApi.buildGlyphRun({ random, count: 2, size: Math.min(9, stripWidth * 0.3) });
        ctx.save();
        ctx.translate(stripWidth * 0.5 - run.size, y);
        artApi.drawGlyphRun(ctx, run, { color: palette.glyph, alpha: 0.5, lineWidth: 1 });
        ctx.restore();
      }

      // Rails, so the wall reads as carved rather than printed on.
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(2.5, 0);
      ctx.lineTo(2.5, stripHeight);
      ctx.moveTo(stripWidth - 2.5, 0);
      ctx.lineTo(stripWidth - 2.5, stripHeight);
      ctx.stroke();
    });
  }

  function decoratePillar(ctx, pillar, gameInstance) {
    const artApi = art();
    if (!artApi || !ctx || !pillar) return;
    const height = finite(gameInstance?.canvas?.height, 0);
    if (height <= 0) return;
    const bandName = currentBandName(gameInstance);
    const width = Math.max(1, Math.round(finite(pillar.w, 45)));
    const strip = wallStrip(bandName, width, Math.round(height));
    if (!strip) return;

    const gapTop = finite(pillar.top, 0);
    const gapBottom = gapTop + finite(pillar.gap, 0);
    const x = finite(pillar.x, 0);

    ctx.save();
    ctx.globalAlpha = gameInstance.voidMode || gameInstance.__gateSliceVoidActive ? 0.35 : 0.85;
    // Only the solid spans carry inscription. Drawing across the gap would put
    // marks where the player has to fly.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, width, Math.max(0, gapTop));
    ctx.clip();
    ctx.drawImage(strip, x, 0);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, gapBottom, width, Math.max(0, height - gapBottom));
    ctx.clip();
    ctx.drawImage(strip, x, gapBottom);
    ctx.restore();
    ctx.restore();
  }

  /**
   * Seals around a live Gate offer, tightening as it closes.
   *
   * Drawn strictly outside the offer's own rings: the 44px entry aperture and its
   * bright boundary keep their exact radius and hue, because that geometry is the
   * M16 fairness fix and the thing the entry-rate metric measures.
   */
  function drawGateSummoning(ctx, offer, gameInstance) {
    const artApi = art();
    if (!artApi || !ctx || !offer || offer.resolved) return;
    const reduced = artApi.reducedMotionActive();
    const outer = finite(offer.outerRadius, 60);
    const player = gameInstance?.player;

    // 0 far away, 1 on top of the player.
    const span = Math.max(1, finite(gameInstance?.canvas?.width, 400));
    const closeness = Math.max(0, Math.min(1,
      1 - (Math.abs(finite(offer.x, 0) - finite(player?.x, 0)) / span)
    ));

    const key = artApi.cacheKey(['gate-seal', Math.round(outer), fieldSeed]);
    const size = Math.round(outer * 4);
    const seal = artApi.getCachedLayer(key, size, size, (sealCtx, w, h) => {
      const random = artApi.seededRandom(artApi.hashSeed(`${fieldSeed}|gate`));
      sealCtx.translate(w / 2, h / 2);
      artApi.drawSeal(sealCtx, artApi.buildSeal({ random, radius: outer * 1.85 }), {
        color: '#00e5ff', alpha: 0.55, lineWidth: 1
      });
    });
    if (!seal) return;

    const spin = reduced ? 0 : finite(gameInstance?.frames, 0) * 0.006;
    ctx.save();
    ctx.translate(finite(offer.x, 0), finite(offer.y, 0));
    ctx.globalAlpha = 0.25 + closeness * 0.5;

    // Counter-rotating pair, so the Gate reads as machinery being worked rather
    // than a decal spinning.
    for (const direction of [1, -1]) {
      ctx.save();
      ctx.rotate(spin * direction);
      const scale = 1 + (direction > 0 ? closeness * 0.12 : -closeness * 0.06);
      ctx.scale(scale, scale);
      ctx.drawImage(seal, -seal.width / 2, -seal.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Charged edges on the risk zones.
   *
   * The boundaries and their colour are unchanged - they are a functional signal
   * and the entry-rate metric depends on them reading the same. What changes is
   * that the edge now bleeds light inward, so courting it feels like courting
   * something rather than crossing a dashed line.
   */
  function chargeRiskEdges(ctx, pillar, gameInstance) {
    const state = gameInstance?.gateSliceState;
    if (!ctx || !pillar || !state) return;
    const slice = root.__SEX_MAGICK_GATE_SLICE__;
    const bandNames = slice?.getFingerprint?.().bandNames;
    // MALKUTH has risk inactive; charging its edges would promise a reward that
    // is not on offer there.
    if (!Array.isArray(bandNames) || finite(state.bandIndex, 0) < 1) return;

    const gapTop = finite(pillar.top, 0);
    const gap = finite(pillar.gap, 0);
    if (gap <= 0) return;
    const x = finite(pillar.x, 0);
    const width = finite(pillar.w, 45);
    const bleed = Math.min(gap * 0.28, 34);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const top = ctx.createLinearGradient(0, gapTop, 0, gapTop + bleed);
    top.addColorStop(0, 'rgba(0, 229, 255, 0.30)');
    top.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = top;
    ctx.fillRect(x, gapTop, width, bleed);

    const bottom = ctx.createLinearGradient(0, gapTop + gap, 0, gapTop + gap - bleed);
    bottom.addColorStop(0, 'rgba(0, 229, 255, 0.30)');
    bottom.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = bottom;
    ctx.fillRect(x, gapTop + gap - bleed, width, bleed);

    ctx.restore();
  }

  /**
   * A generated title card, replacing the Drive-hosted photograph on #startScreen.
   *
   * This is the very first frame anyone sees, and until now it depended on a
   * network fetch from Google Drive. Rendering it locally means the game looks
   * finished before it has loaded anything at all.
   */
  function buildTitleBackdrop(width, height) {
    const artApi = art();
    if (!artApi) return null;
    const canvas = artApi.createCanvas(width, height);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const palette = artApi.paletteFor('BINAH');
    const gradient = ctx.createRadialGradient(width / 2, height * 0.42, 12, width / 2, height * 0.42, Math.max(width, height) * 0.8);
    gradient.addColorStop(0, palette.mid);
    gradient.addColorStop(0.5, palette.ink);
    gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const random = artApi.seededRandom(artApi.hashSeed('title-card'));
    ctx.save();
    ctx.translate(width / 2, height * 0.42);
    for (const [scale, alpha] of [[1.0, 0.5], [0.62, 0.34], [0.34, 0.22]]) {
      artApi.drawSeal(ctx, artApi.buildSeal({ random, radius: Math.min(width, height) * 0.36 * scale }), {
        color: palette.glyph, alpha, lineWidth: 1
      });
    }
    ctx.restore();

    for (let index = 0; index < 10; index += 1) {
      const run = artApi.buildGlyphRun({ random, count: 4 + Math.floor(random() * 6), size: 9 });
      ctx.save();
      ctx.translate(random() * width, random() * height);
      artApi.drawGlyphRun(ctx, run, { color: palette.near, alpha: 0.2 + random() * 0.2, lineWidth: 1 });
      ctx.restore();
    }
    return canvas;
  }

  function applyTitleBackdrop() {
    const screen = document.getElementById('startScreen');
    if (!screen || screen.dataset.sexMagickBackdrop === 'true') return false;
    const canvas = buildTitleBackdrop(720, 1280);
    if (!canvas || typeof canvas.toDataURL !== 'function') return false;
    try {
      screen.style.backgroundImage = `url('${canvas.toDataURL('image/png')}')`;
      screen.style.backgroundSize = 'cover';
      screen.style.backgroundPosition = 'center';
      screen.dataset.sexMagickBackdrop = 'true';
      return true;
    } catch (_error) {
      return false;
    }
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_OCCULT_FIELD__;
    if (typeof Game === 'undefined' || typeof Pillar === 'undefined' || typeof document === 'undefined') return null;
    if (!root.SexMagickOccultArt) return null;

    const originalTunnel = Game.prototype.drawHyperspaceTunnel;
    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;

    Game.prototype.drawHyperspaceTunnel = function drawOccultField(color) {
      if (drawField(this)) {
        // The owner's Drive artwork still composites over the generated field
        // when it loads, so their images remain part of the game.
        drawLevelArtwork(this);
        return undefined;
      }
      return originalTunnel.call(this, color);
    };

    // Wrapped from outside so gate-slice-runtime.js needs no knowledge of the
    // art layer, and its Gate geometry stays exactly as M16 left it.
    const originalDrawGameObjects = Game.prototype.drawGameObjects;
    Game.prototype.drawGameObjects = function drawGameObjectsWithSummoning(...args) {
      if (this.gateSliceOffer) {
        try { drawGateSummoning(this.ctx, this.gateSliceOffer, this); } catch (_error) {}
      }
      return originalDrawGameObjects.apply(this, args);
    };

    const originalPillarDraw = Pillar.prototype.draw;
    Pillar.prototype.draw = function drawPillarWithInscription(ctx, conf) {
      const result = originalPillarDraw.call(this, ctx, conf);
      try {
        if (typeof game !== 'undefined' && game) {
          decoratePillar(ctx, this, game);
          chargeRiskEdges(ctx, this, game);
        }
      } catch (_error) {}
      return result;
    };

    Game.prototype.startGame = function startGameWithField(...args) {
      const result = originalStartGame.apply(this, args);
      beginRun(this);
      return result;
    };

    Game.prototype.restartGame = function restartGameWithField(...args) {
      const result = originalRestartGame.apply(this, args);
      beginRun(this);
      return result;
    };

    try { applyTitleBackdrop(); } catch (_error) {}

    installed = true;
    root.__SEX_MAGICK_OCCULT_FIELD__ = Object.freeze({
      version: FIELD_VERSION,
      strata: STRATA.length,
      getBandName: () => currentBandName(typeof game !== 'undefined' ? game : null),
      getCacheSize: () => (art() ? art().cacheSize() : 0),
      restore() {
        Game.prototype.drawHyperspaceTunnel = originalTunnel;
        installed = false;
      }
    });
    return root.__SEX_MAGICK_OCCULT_FIELD__;
  }

  // Preserved from the original tunnel: the level image, blurred, at the same
  // alpha it always had. Enrichment over the field rather than the field itself.
  function drawLevelArtwork(gameInstance) {
    if (gameInstance.voidMode || gameInstance.__gateSliceVoidActive) return;
    const level = gameInstance.gameLevels?.[gameInstance.currentLevelIdx];
    const image = level?.img;
    if (!level?.loaded || !image || !image.complete) return;
    // The M10 procedural placeholder is an error card, not artwork. Now that the
    // field is real art, drawing it over the top would be strictly worse.
    if (image.__sexMagickFallback) return;

    const ctx = gameInstance.ctx;
    const canvas = gameInstance.canvas;
    try {
      const canvasRatio = canvas.width / canvas.height;
      const imageRatio = image.width / image.height;
      let drawWidth, drawHeight, drawX, drawY;
      if (canvasRatio > imageRatio) {
        drawHeight = canvas.height;
        drawWidth = image.width * (drawHeight / image.height);
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
      } else {
        drawWidth = canvas.width;
        drawHeight = image.height * (drawWidth / image.width);
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      }
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(1px)';
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      ctx.filter = 'none';
      ctx.restore();
    } catch (_error) {}
  }

  function scheduleInstall(timeoutMs = 8000) {
    if (installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  return Object.freeze({
    FIELD_VERSION,
    STRATA,
    VOID_COLOR,
    GLYPH_RAIN_COUNT,
    currentBandName,
    drawField,
    drawGateSummoning,
    decoratePillar,
    chargeRiskEdges,
    buildTitleBackdrop,
    applyTitleBackdrop,
    beginRun,
    install,
    scheduleInstall
  });
});
