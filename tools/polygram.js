'use strict';

/**
 * Star polygons, {n/k}, for the Void's collectibles.
 *
 * The game shipped one hardcoded five-point loop:
 *
 *     for (let k = 0; k < 5; k++) angle = (k * 4 * Math.PI / 5) - Math.PI / 2;
 *
 * That is the {5/2} star polygon - five points, joined every second vertex -
 * written as a special case. M40.6 generalises it so the Void's stars can climb
 * with the run: pentagram, hexagram, heptagram, octogram, enneagram, decagram,
 * dodecagram.
 *
 * The one subtlety is why a hexagram looks different from the rest. For {n/k},
 * stepping by `k` around `n` vertices returns to the start after `n / gcd(n,k)`
 * steps, so the figure decomposes into exactly `gcd(n, k)` separate closed
 * cycles. {5/2} has gcd 1 and draws in a single unbroken stroke; {6/2} has gcd 2
 * and *is* two overlapping triangles - the Star of David is not one path and no
 * amount of single-loop code will draw it. Emitting one cycle per residue class
 * handles every order uniformly, with hexagrams needing no special case at all.
 *
 * This module is deliberately canvas-free: it returns point arrays, so the star
 * geometry is unit-testable without a rendering context.
 */
(function attachSexMagickPolygram(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickPolygram = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPolygramApi(root) {
  'use strict';

  const VERSION = 1;

  // Points up, matching the -PI/2 the shipped pentagram used.
  const START_ANGLE = -Math.PI / 2;

  const MIN_POINTS = 5;
  const MAX_POINTS = 12;

  /**
   * The order the Void's stars take at each band, and the skip that makes each
   * read as a star rather than a polygon.
   *
   * `skip` is chosen as the largest step below n/2 that keeps the figure
   * recognisable: 2 for the small orders, 3 where 2 would look like a blunt
   * polygon (octogram {8/3} rather than {8/2}, decagram {10/3}), and 5 for the
   * dodecagram {12/5}, the classic Seal-of-Solomon-adjacent form.
   *
   * Eleven points is deliberately skipped - a hendecagram is not visually
   * distinct enough from a decagram at collectible size to be worth a band.
   */
  const BAND_ORDERS = Object.freeze([
    Object.freeze({ points: 5, skip: 2, name: 'PENTAGRAM' }),
    Object.freeze({ points: 6, skip: 2, name: 'HEXAGRAM' }),
    Object.freeze({ points: 7, skip: 3, name: 'HEPTAGRAM' }),
    Object.freeze({ points: 8, skip: 3, name: 'OCTOGRAM' }),
    Object.freeze({ points: 9, skip: 4, name: 'ENNEAGRAM' }),
    Object.freeze({ points: 10, skip: 3, name: 'DECAGRAM' }),
    Object.freeze({ points: 12, skip: 5, name: 'DODECAGRAM' }),
    Object.freeze({ points: 12, skip: 5, name: 'DODECAGRAM' })
  ]);

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function greatestCommonDivisor(a, b) {
    let x = Math.abs(Math.trunc(a));
    let y = Math.abs(Math.trunc(b));
    while (y !== 0) {
      const next = x % y;
      x = y;
      y = next;
    }
    return x;
  }

  function clampPoints(value) {
    const points = Math.round(finite(value, MIN_POINTS));
    return Math.min(MAX_POINTS, Math.max(MIN_POINTS, points));
  }

  /**
   * A skip must be at least 2 (1 draws the convex polygon, not a star) and
   * strictly below n/2 - at exactly n/2 the "star" collapses into a set of
   * diameters. Skips are also reduced modulo n, since {n/k} and {n/n-k} are the
   * same figure traced the other way.
   */
  function normalizeSkip(points, skip) {
    const n = clampPoints(points);
    let k = Math.abs(Math.round(finite(skip, 2))) % n;
    if (k > n / 2) k = n - k;
    if (k < 2) k = 2;
    if (k >= n / 2) k = Math.max(2, Math.ceil(n / 2) - 1);
    return k;
  }

  /** The star for a given band, saturating at the crown rather than throwing. */
  function orderForBand(bandIndex) {
    const index = Math.max(0, Math.min(BAND_ORDERS.length - 1, Math.floor(finite(bandIndex, 0))));
    return BAND_ORDERS[index];
  }

  /**
   * Build {n/k} as an array of closed cycles, each a list of {x, y} points on a
   * circle of `radius` centred on the origin.
   *
   * Returns `gcd(n, k)` cycles - one for {5/2}, two for a hexagram - so a caller
   * strokes each as its own path and every order is drawn by the same loop.
   */
  function buildPolygram(points, skip, radius = 1, rotation = 0) {
    const n = clampPoints(points);
    const k = normalizeSkip(n, skip);
    const r = finite(radius, 1);
    const phase = START_ANGLE + finite(rotation, 0);
    const step = (Math.PI * 2) / n;

    const cycles = [];
    const cycleCount = greatestCommonDivisor(n, k);
    const cycleLength = n / cycleCount;

    for (let start = 0; start < cycleCount; start += 1) {
      const cycle = [];
      for (let index = 0; index < cycleLength; index += 1) {
        const vertex = (start + (index * k)) % n;
        const angle = phase + (vertex * step);
        cycle.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }
      cycles.push(cycle);
    }
    return cycles;
  }

  /**
   * Stroke a polygram onto a 2D context, centred on the current origin. Each
   * cycle is its own path, which is what makes a hexagram render as two
   * triangles rather than a scribble.
   */
  function strokePolygram(ctx, options = {}) {
    if (!ctx) return 0;
    const cycles = buildPolygram(
      options.points,
      options.skip,
      finite(options.radius, 20),
      finite(options.rotation, 0)
    );
    for (const cycle of cycles) {
      ctx.beginPath();
      cycle.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    return cycles.length;
  }

  return Object.freeze({
    VERSION,
    START_ANGLE,
    MIN_POINTS,
    MAX_POINTS,
    BAND_ORDERS,
    greatestCommonDivisor,
    clampPoints,
    normalizeSkip,
    orderForBand,
    buildPolygram,
    strokePolygram
  });
});
