(function attachSexMagickOccultArt(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickOccultArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOccultArtApi(root) {
  'use strict';

  const ART_VERSION = 1;

  /**
   * Colours the game uses to mean something.
   *
   * These are load-bearing, not decorative. Hazard tells the player what kills
   * them, the two Rite auras tell them which physics they are under, and the ward
   * tells them they are protected. M7 reserved them; the in-run Rite
   * transformation still on the roadmap depends on the aura pair staying
   * distinguishable.
   *
   * The aesthetic goes around these, never through them. `paletteCollisions()`
   * enforces that, and a unit test runs it over the whole palette table.
   */
  const RESERVED_COLORS = Object.freeze({
    hazard: '#ff2f6d',
    hazardGlow: '#ff003c',
    hexAura: '#00e5ff',
    monasAura: '#ffd700',
    ward: '#c9b4ff',
    playerCore: '#f8fbff'
  });

  const RESERVED_LIST = Object.freeze(Object.values(RESERVED_COLORS).map(value => value.toLowerCase()));

  /**
   * One palette per band, so ascending the Tree is felt as a colour journey
   * rather than read off a label. MALKUTH is earthen and dim - the kingdom, the
   * material world - and KETHER is bleached white-gold, the crown.
   *
   * `deep` is the far background, `mid` the middle strata, `near` the closest
   * layer, `ink` the ground the whole field sits on, and `glyph` the line-work.
   * None of them may collide with a reserved signal colour.
   */
  const BAND_PALETTES = Object.freeze({
    MALKUTH: Object.freeze({ ink: '#0a0908', deep: '#2b1f16', mid: '#4a3524', near: '#6d5238', glyph: '#a98a63' }),
    YESOD: Object.freeze({ ink: '#07080f', deep: '#141a33', mid: '#232c56', near: '#38447e', glyph: '#8f9fd6' }),
    TIPHARETH: Object.freeze({ ink: '#0d0a04', deep: '#3a2a0b', mid: '#63470f', near: '#8f6a18', glyph: '#e0b45c' }),
    GEBURAH: Object.freeze({ ink: '#0f0505', deep: '#3d0f14', mid: '#651a20', near: '#93262f', glyph: '#d9707a' }),
    CHESED: Object.freeze({ ink: '#050b0d', deep: '#0f3038', mid: '#17505d', near: '#217585', glyph: '#63c2d4' }),
    BINAH: Object.freeze({ ink: '#08060d', deep: '#1e1233', mid: '#331e56', near: '#4d2f80', glyph: '#a385d6' }),
    CHOKMAH: Object.freeze({ ink: '#06090b', deep: '#16282e', mid: '#25454e', near: '#376a76', glyph: '#7fb6c4' }),
    KETHER: Object.freeze({ ink: '#0d0c0a', deep: '#3b3527', mid: '#665c42', near: '#988a66', glyph: '#e8dcbd' })
  });

  const BAND_ORDER = Object.freeze(Object.keys(BAND_PALETTES));
  const DEFAULT_BAND = 'MALKUTH';

  // `Number(x) || fallback` silently swallows a deliberate zero, so an explicit
  // `count: 0` or `radius: 0` would jump to the default instead of clamping to the
  // minimum. Only a genuinely non-numeric value should fall back.
  function numberOr(value, fallback) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function normalizeHex(value) {
    const text = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(text) ? text : null;
  }

  function paletteFor(bandName) {
    const key = String(bandName || '').trim().toUpperCase();
    return BAND_PALETTES[key] || BAND_PALETTES[DEFAULT_BAND];
  }

  /**
   * Every palette entry that sits on a reserved signal colour. Must be empty.
   */
  function paletteCollisions(palettes = BAND_PALETTES) {
    const collisions = [];
    for (const [band, palette] of Object.entries(palettes)) {
      for (const [role, value] of Object.entries(palette)) {
        const hex = normalizeHex(value);
        if (!hex) {
          collisions.push(`${band}.${role} is not a six-digit hex colour`);
          continue;
        }
        if (RESERVED_LIST.includes(hex)) collisions.push(`${band}.${role} reuses reserved ${hex}`);
      }
    }
    return collisions;
  }

  // --- seeded generation ---------------------------------------------------

  function seededRandom(seed) {
    const grammar = root.SexMagickObstacleGrammar;
    if (typeof grammar?.createSeededRandom === 'function') return grammar.createSeededRandom(seed);
    // Standalone fallback, same mulberry-style mix the grammar uses, so the
    // module is testable without the grammar loaded.
    let state = (Math.floor(Number(seed) || 0) >>> 0) || 0x6d2b79f5;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(text) {
    const grammar = root.SexMagickObstacleGrammar;
    if (typeof grammar?.hashStringToSeed === 'function') return grammar.hashStringToSeed(text);
    let hash = 0x811c9dc5;
    const value = String(text ?? '');
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) || 0x6d2b79f5;
  }

  /**
   * A seal: concentric rings, radial spokes, an inscribed polygon and a ring of
   * tick marks. Returned as plain path data so it can be drawn to any context,
   * measured in a test, or cached without a DOM.
   *
   * This is the vocabulary the game already gestured at with its lone pentagram,
   * built out far enough to carry a whole background.
   */
  function buildSeal(options = {}) {
    const random = typeof options.random === 'function' ? options.random : seededRandom(options.seed);
    const radius = Math.max(4, numberOr(options.radius, 60));

    const ringCount = 2 + Math.floor(random() * 3);
    const rings = [];
    for (let index = 0; index < ringCount; index += 1) {
      rings.push(radius * (0.35 + (0.65 * (index + 1)) / ringCount));
    }

    const spokeCount = [6, 7, 8, 9, 12][Math.floor(random() * 5)];
    const spokeStart = radius * (0.2 + random() * 0.3);
    const spokePhase = random() * Math.PI * 2;

    // 5 or 7 points, skipped to give the classic unicursal star rather than a
    // plain polygon.
    const points = random() < 0.5 ? 5 : 7;
    const skip = points === 5 ? 2 : 3;
    const starRadius = radius * (0.55 + random() * 0.25);
    const starPhase = random() * Math.PI * 2;
    const star = [];
    for (let index = 0; index <= points; index += 1) {
      const angle = starPhase + ((index * skip * 2 * Math.PI) / points);
      star.push([Math.cos(angle) * starRadius, Math.sin(angle) * starRadius]);
    }

    const tickCount = 12 + Math.floor(random() * 24);
    const tickRadius = rings[rings.length - 1];
    const ticks = [];
    for (let index = 0; index < tickCount; index += 1) {
      const angle = (index / tickCount) * Math.PI * 2;
      const length = radius * (0.04 + random() * 0.06);
      ticks.push([angle, tickRadius, tickRadius + length]);
    }

    return { radius, rings, spokeCount, spokeStart, spokePhase, star, ticks };
  }

  function drawSeal(ctx, seal, options = {}) {
    if (!ctx || !seal) return;
    const alpha = Number.isFinite(options.alpha) ? options.alpha : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = options.color || '#ffffff';
    ctx.lineWidth = Number.isFinite(options.lineWidth) ? options.lineWidth : 1;

    for (const ring of seal.rings) {
      ctx.beginPath();
      ctx.arc(0, 0, ring, 0, Math.PI * 2);
      ctx.stroke();
    }

    const outer = seal.rings[seal.rings.length - 1];
    for (let index = 0; index < seal.spokeCount; index += 1) {
      const angle = seal.spokePhase + ((index / seal.spokeCount) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * seal.spokeStart, Math.sin(angle) * seal.spokeStart);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.beginPath();
    seal.star.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    for (const [angle, from, to] of seal.ticks) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * from, Math.sin(angle) * from);
      ctx.lineTo(Math.cos(angle) * to, Math.sin(angle) * to);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * A short run of invented sigil-script - not any real alphabet, just consistent
   * angular strokes that read as inscription at a glance and stay cheap to draw.
   */
  function buildGlyphRun(options = {}) {
    const random = typeof options.random === 'function' ? options.random : seededRandom(options.seed);
    const count = Math.max(1, Math.floor(numberOr(options.count, 6)));
    const size = Math.max(2, numberOr(options.size, 10));
    const glyphs = [];
    for (let index = 0; index < count; index += 1) {
      const strokes = [];
      const strokeCount = 2 + Math.floor(random() * 3);
      for (let stroke = 0; stroke < strokeCount; stroke += 1) {
        strokes.push([
          (random() - 0.5) * size,
          (random() - 0.5) * size,
          (random() - 0.5) * size,
          (random() - 0.5) * size
        ]);
      }
      if (random() < 0.4) strokes.push([0, -size * 0.6, 0, size * 0.6]);
      glyphs.push({ x: index * size * 1.5, strokes });
    }
    return { size, glyphs };
  }

  function drawGlyphRun(ctx, run, options = {}) {
    if (!ctx || !run) return;
    ctx.save();
    ctx.globalAlpha = Number.isFinite(options.alpha) ? options.alpha : 1;
    ctx.strokeStyle = options.color || '#ffffff';
    ctx.lineWidth = Number.isFinite(options.lineWidth) ? options.lineWidth : 1;
    for (const glyph of run.glyphs) {
      for (const [x1, y1, x2, y2] of glyph.strokes) {
        ctx.beginPath();
        ctx.moveTo(glyph.x + x1, y1);
        ctx.lineTo(glyph.x + x2, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- offscreen caching ---------------------------------------------------
  //
  // The whole performance argument for this milestone. However intricate a
  // stratum is, it is rasterised once and then blitted, so per-frame cost is a
  // few drawImage calls rather than hundreds of paths. Without this the M11
  // budget would not survive the field.

  const layerCache = new Map();

  function cacheKey(parts) {
    return parts.map(part => String(part)).join('|');
  }

  function createCanvas(width, height) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      return canvas;
    }
    if (typeof OffscreenCanvas === 'function') {
      return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    }
    return null;
  }

  /**
   * Returns a cached raster for `key`, rendering it via `render` on first ask.
   * The same key must return the identical object, or the cache is not doing its
   * job and the frame cost is unbounded.
   */
  function getCachedLayer(key, width, height, render) {
    if (layerCache.has(key)) return layerCache.get(key);
    const canvas = createCanvas(width, height);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof render === 'function') {
      try { render(ctx, canvas.width, canvas.height); } catch (_error) {}
    }
    layerCache.set(key, canvas);
    return canvas;
  }

  function clearCache() {
    layerCache.clear();
  }

  function cacheSize() {
    return layerCache.size;
  }

  function reducedMotionActive() {
    try {
      return Boolean(root.__SEX_MAGICK_COLLISION__?.getAccessibility?.().reducedMotion);
    } catch (_error) {
      return false;
    }
  }

  return Object.freeze({
    ART_VERSION,
    RESERVED_COLORS,
    RESERVED_LIST,
    BAND_PALETTES,
    BAND_ORDER,
    DEFAULT_BAND,
    numberOr,
    normalizeHex,
    paletteFor,
    paletteCollisions,
    seededRandom,
    hashSeed,
    buildSeal,
    drawSeal,
    buildGlyphRun,
    drawGlyphRun,
    cacheKey,
    createCanvas,
    getCachedLayer,
    clearCache,
    cacheSize,
    reducedMotionActive
  });
});
