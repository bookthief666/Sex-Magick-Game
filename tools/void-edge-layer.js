'use strict';

/**
 * Electric outlines for the wagered Void (M40.5).
 *
 * The Void suppressed the level background entirely, which is why it read as a
 * black screen rather than as a place. The owner asked for the picture to be
 * there, zoomed, with the figures outlined like electric snakes.
 *
 * The outline is a Sobel edge pass. Two things about it decide whether this is
 * affordable at all, and both are why this is a module rather than ten lines
 * inside the draw loop:
 *
 *   - **It runs once per image, never per frame.** A Sobel pass is O(pixels)
 *     with an 8-tap kernel; at 60fps against a 1600px source it is not a draw
 *     effect, it is a stall. The result is a cached canvas, and each frame costs
 *     one `drawImage` of it.
 *   - **It runs at a fraction of the source resolution.** The layer is drawn
 *     scaled up and glowing, so detail beyond a few hundred pixels is spent on
 *     nothing. `MAX_EDGE_DIM` bounds the work regardless of how large the
 *     gallery image is - the difference between ~2.5M pixels and ~260k.
 *
 * The pixel maths is kept free of canvas and DOM so it can be tested against
 * hand-built arrays in Node: a synthetic edge must produce a response where the
 * edge is and silence where the image is flat. Getting that wrong is invisible
 * in a screenshot - it just looks like a slightly different glow.
 */
(function attachSexMagickVoidEdgeLayer(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickVoidEdgeLayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVoidEdgeLayerApi(root) {
  'use strict';

  const VERSION = 1;

  // The longest side the edge pass runs at. 384 keeps a full pass in the low
  // single-digit milliseconds while still resolving a figure's silhouette.
  const MAX_EDGE_DIM = 384;

  // Below this fraction of the strongest response, a pixel is texture rather
  // than an edge. Without it, film grain and JPEG noise light up as brightly as
  // the outline and the whole frame turns into a haze.
  const EDGE_THRESHOLD = 0.22;

  // How many built layers to keep. The gallery is 75 images; caching them all
  // would be ~45MB of backing store for a section that shows one at a time.
  const MAX_CACHED_LAYERS = 3;

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /**
   * Rec. 601 luma from RGBA bytes. Sobel wants a single channel, and running it
   * three times for colour would triple the cost for an effect that is drawn as
   * one glowing tint anyway.
   */
  function toLuminance(rgba, width, height) {
    const count = width * height;
    const luma = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const p = i * 4;
      luma[i] = (rgba[p] * 0.299) + (rgba[p + 1] * 0.587) + (rgba[p + 2] * 0.114);
    }
    return luma;
  }

  /**
   * Sobel gradient magnitude, normalised to 0..1.
   *
   * The border ring is left at zero rather than clamped or mirrored: an edge
   * detector run over a clamped border reports a strong response along the
   * whole frame edge, which would draw a bright rectangle around the picture
   * every time - and that reads as a bug, not as an outline.
   */
  function sobelMagnitude(luma, width, height) {
    const out = new Float32Array(width * height);
    if (width < 3 || height < 3) return out;

    let peak = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = (y * width) + x;
        const tl = luma[i - width - 1];
        const tc = luma[i - width];
        const tr = luma[i - width + 1];
        const ml = luma[i - 1];
        const mr = luma[i + 1];
        const bl = luma[i + width - 1];
        const bc = luma[i + width];
        const br = luma[i + width + 1];

        const gx = (tr + (2 * mr) + br) - (tl + (2 * ml) + bl);
        const gy = (bl + (2 * bc) + br) - (tl + (2 * tc) + tr);
        const magnitude = Math.hypot(gx, gy);
        out[i] = magnitude;
        if (magnitude > peak) peak = magnitude;
      }
    }

    if (peak > 0) {
      for (let i = 0; i < out.length; i += 1) out[i] /= peak;
    }
    return out;
  }

  /**
   * Turn normalised magnitudes into premultiplied-ready RGBA: a bright cyan-white
   * line whose alpha is the edge strength, transparent everywhere else.
   *
   * Coloured at build time rather than per frame so the draw path needs no
   * canvas filter to tint it - only a hue rotation to animate it, which is one
   * GPU operation rather than a per-pixel pass.
   */
  function edgesToRgba(magnitudes, options = {}) {
    const threshold = clamp(finite(options.threshold, EDGE_THRESHOLD), 0, 1);
    const gain = Math.max(0, finite(options.gain, 1.6));
    const rgba = new Uint8ClampedArray(magnitudes.length * 4);
    const span = 1 - threshold;

    for (let i = 0; i < magnitudes.length; i += 1) {
      const magnitude = magnitudes[i];
      if (magnitude <= threshold) continue;
      const strength = clamp(span > 0 ? ((magnitude - threshold) / span) * gain : gain, 0, 1);
      const p = i * 4;
      // Cyan-white: full green and blue, red rising with strength, so a weak
      // edge reads as cold cyan and a strong one flares toward white.
      rgba[p] = 90 + (strength * 165);
      rgba[p + 1] = 255;
      rgba[p + 2] = 255;
      rgba[p + 3] = Math.round(strength * 255);
    }
    return rgba;
  }

  /** The size the edge pass runs at, preserving aspect and bounded by maxDim. */
  function edgeDimensions(width, height, maxDim = MAX_EDGE_DIM) {
    const w = Math.max(1, Math.round(finite(width, 1)));
    const h = Math.max(1, Math.round(finite(height, 1)));
    const limit = Math.max(16, Math.round(finite(maxDim, MAX_EDGE_DIM)));
    const longest = Math.max(w, h);
    if (longest <= limit) return { width: w, height: h, scale: 1 };
    const scale = limit / longest;
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
      scale
    };
  }

  // --- browser side --------------------------------------------------------
  // Everything above is pure and unit-tested; everything below needs a canvas
  // and is exercised by the browser suite instead.

  const cache = new Map();

  // How many Sobel passes have actually run this session. The whole effect is
  // affordable only because this stays at roughly one per background image, so
  // it is worth being able to read rather than assume: the browser suite
  // asserts on it, and `?perfPanel=1` has a number to blame if the Void ever
  // costs frames again.
  let builds = 0;

  function createCanvas(width, height) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Build (or return a cached) edge layer for an image.
   *
   * Keyed by `src`, so re-entering the Void on the same background is free and
   * the gallery rotating is what pays. Returns null rather than throwing on any
   * failure - a tainted canvas, a not-yet-decoded image, no document - because
   * the caller's fallback is simply not drawing outlines.
   */
  function getEdgeLayer(image, options = {}) {
    if (!image || !image.complete || !image.naturalWidth) return null;
    const key = String(image.src || '');
    if (!key) return null;

    if (cache.has(key)) {
      const hit = cache.get(key);
      // Refresh recency: Map preserves insertion order, so re-inserting moves
      // this entry to the end and the eviction below takes the true oldest.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }

    let layer = null;
    builds += 1;
    try {
      const dims = edgeDimensions(image.naturalWidth, image.naturalHeight, options.maxDim);
      const source = createCanvas(dims.width, dims.height);
      if (!source) return null;
      const sourceCtx = source.getContext('2d', { willReadFrequently: true });
      if (!sourceCtx) return null;
      sourceCtx.drawImage(image, 0, 0, dims.width, dims.height);

      const pixels = sourceCtx.getImageData(0, 0, dims.width, dims.height);
      const luma = toLuminance(pixels.data, dims.width, dims.height);
      const magnitudes = sobelMagnitude(luma, dims.width, dims.height);
      const edges = edgesToRgba(magnitudes, options);

      const target = createCanvas(dims.width, dims.height);
      const targetCtx = target?.getContext('2d');
      if (!targetCtx) return null;
      targetCtx.putImageData(new ImageData(edges, dims.width, dims.height), 0, 0);
      layer = target;
    } catch (_error) {
      // A tainted canvas is the expected failure here: getImageData throws on a
      // cross-origin image. Caching the null stops it being retried every frame.
      layer = null;
    }

    cache.set(key, layer);
    while (cache.size > MAX_CACHED_LAYERS) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    return layer;
  }

  function clearCache() {
    cache.clear();
  }

  function cacheSize() {
    return cache.size;
  }

  /** Sobel passes run since load. Should track the number of distinct
   *  backgrounds seen, never the number of frames drawn. */
  function buildCount() {
    return builds;
  }

  return Object.freeze({
    VERSION,
    MAX_EDGE_DIM,
    EDGE_THRESHOLD,
    MAX_CACHED_LAYERS,
    toLuminance,
    sobelMagnitude,
    edgesToRgba,
    edgeDimensions,
    getEdgeLayer,
    clearCache,
    cacheSize,
    buildCount
  });
});
