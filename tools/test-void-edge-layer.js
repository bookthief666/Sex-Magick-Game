'use strict';

/**
 * The Void's edge pass.
 *
 * These test the pixel maths against hand-built arrays, because a wrong Sobel
 * does not look wrong - it looks like a slightly different glow, and would ship.
 * The properties worth pinning are the ones that decide whether the effect reads
 * as an outline at all: a response where an edge is, silence where the image is
 * flat, and nothing along the frame border.
 */

const assert = require('node:assert/strict');
const edge = require('./void-edge-layer.js');

/** Build an RGBA buffer from a width x height grid of grey levels. */
function greyToRgba(grid) {
  const height = grid.length;
  const width = grid[0].length;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = ((y * width) + x) * 4;
      rgba[p] = grid[y][x];
      rgba[p + 1] = grid[y][x];
      rgba[p + 2] = grid[y][x];
      rgba[p + 3] = 255;
    }
  }
  return { rgba, width, height };
}

function grid(width, height, fill) {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) => fill(x, y)));
}

// --- luminance ------------------------------------------------------------
{
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const luma = edge.toLuminance(rgba, 2, 1);
  assert.ok(Math.abs(luma[0] - 255) < 1e-6, 'white is full luma');
  assert.equal(luma[1], 0, 'black is zero luma');

  // Weighted, not averaged: green must dominate red must dominate blue.
  const colours = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  const [red, green, blue] = edge.toLuminance(colours, 3, 1);
  assert.ok(green > red && red > blue, `Rec.601 weighting, saw r=${red} g=${green} b=${blue}`);
}

// --- a flat image has no edges -------------------------------------------
{
  const flat = greyToRgba(grid(8, 8, () => 128));
  const magnitudes = edge.sobelMagnitude(edge.toLuminance(flat.rgba, 8, 8), 8, 8);
  assert.ok(
    magnitudes.every(value => value === 0),
    'a uniform image must produce no edges at all'
  );

  // And therefore no pixels to draw - not a full-alpha sheet.
  const rgba = edge.edgesToRgba(magnitudes);
  assert.ok(
    rgba.filter((_value, index) => index % 4 === 3).every(alpha => alpha === 0),
    'no edges means nothing drawn'
  );
}

// --- a vertical edge lights up, in the right column -----------------------
{
  const width = 9;
  const height = 9;
  // Left half black, right half white: one vertical boundary at x = 4.
  const image = greyToRgba(grid(width, height, x => (x < 4 ? 0 : 255)));
  const magnitudes = edge.sobelMagnitude(edge.toLuminance(image.rgba, width, height), width, height);

  const at = (x, y) => magnitudes[(y * width) + x];
  assert.ok(at(4, 4) > 0.5, `the boundary column must respond strongly, saw ${at(4, 4)}`);
  assert.ok(at(3, 4) > 0.5, 'and its immediate neighbour, since Sobel is a 3-wide kernel');
  assert.equal(at(1, 4), 0, 'deep inside the flat black region there is no edge');
  assert.equal(at(7, 4), 0, 'nor inside the flat white region');

  // Normalised: the strongest response is exactly 1, so the threshold below is
  // a fraction of the image's own contrast rather than of an absolute scale.
  assert.ok(Math.abs(Math.max(...magnitudes) - 1) < 1e-9, 'magnitudes are normalised to 1');
  assert.ok(magnitudes.every(value => value >= 0 && value <= 1));
}

// --- a horizontal edge is detected just as well ---------------------------
{
  const width = 9;
  const height = 9;
  const image = greyToRgba(grid(width, height, (_x, y) => (y < 4 ? 0 : 255)));
  const magnitudes = edge.sobelMagnitude(edge.toLuminance(image.rgba, width, height), width, height);
  const at = (x, y) => magnitudes[(y * width) + x];
  assert.ok(at(4, 4) > 0.5, 'a horizontal boundary must respond too - gy, not only gx');
  assert.equal(at(4, 1), 0);
}

// --- the frame border is never an edge ------------------------------------
{
  // A clamped or mirrored border makes an edge detector outline the picture
  // itself, which reads as a bug rather than as a silhouette.
  const width = 7;
  const height = 7;
  const image = greyToRgba(grid(width, height, (x, y) => ((x + y) % 2 === 0 ? 0 : 255)));
  const magnitudes = edge.sobelMagnitude(edge.toLuminance(image.rgba, width, height), width, height);
  for (let x = 0; x < width; x += 1) {
    assert.equal(magnitudes[x], 0, `top border pixel ${x} must be silent`);
    assert.equal(magnitudes[((height - 1) * width) + x], 0, `bottom border pixel ${x} must be silent`);
  }
  for (let y = 0; y < height; y += 1) {
    assert.equal(magnitudes[y * width], 0, `left border pixel ${y} must be silent`);
    assert.equal(magnitudes[(y * width) + width - 1], 0, `right border pixel ${y} must be silent`);
  }
}

// --- degenerate sizes do not throw ---------------------------------------
{
  for (const [w, h] of [[1, 1], [2, 2], [0, 0], [1, 40], [40, 1]]) {
    const magnitudes = edge.sobelMagnitude(new Float32Array(Math.max(0, w * h)), w, h);
    assert.equal(magnitudes.length, Math.max(0, w * h), `${w}x${h} must not throw`);
    assert.ok(magnitudes.every(value => value === 0));
  }
}

// --- thresholding ---------------------------------------------------------
{
  const magnitudes = new Float32Array([0, 0.1, 0.3, 0.7, 1]);
  const rgba = edge.edgesToRgba(magnitudes, { threshold: 0.22 });
  const alpha = index => rgba[(index * 4) + 3];

  assert.equal(alpha(0), 0, 'zero is not an edge');
  assert.equal(alpha(1), 0, 'below the threshold is texture, not an edge');
  assert.ok(alpha(2) > 0, 'above the threshold draws');
  assert.ok(alpha(4) >= alpha(3) && alpha(3) > alpha(2), 'alpha rises with edge strength');
  assert.equal(alpha(4), 255, 'the strongest edge is fully opaque');

  // Cyan-white: green and blue pinned, red rising, so a weak edge is cold and a
  // strong one flares. A red channel that also hit 255 everywhere would make
  // every outline plain white.
  assert.equal(rgba[(4 * 4) + 1], 255);
  assert.equal(rgba[(4 * 4) + 2], 255);
  assert.ok(rgba[(2 * 4)] < rgba[(4 * 4)], 'red rises with strength');

  // A threshold of 0 must not divide by zero or produce NaN alpha.
  const wideOpen = edge.edgesToRgba(magnitudes, { threshold: 0 });
  assert.ok(
    wideOpen.every(value => Number.isFinite(value)),
    'threshold 0 must stay finite'
  );
}

// --- the work is bounded regardless of source size ------------------------
{
  // This is the whole reason the effect is affordable: a 2000px gallery image
  // must not run a 4-megapixel Sobel pass on Void entry.
  const big = edge.edgeDimensions(2000, 1500);
  assert.ok(Math.max(big.width, big.height) <= edge.MAX_EDGE_DIM, 'the long side is capped');
  assert.ok(
    Math.abs((big.width / big.height) - (2000 / 1500)) < 0.02,
    'aspect ratio survives the downscale'
  );
  assert.ok(big.width * big.height < 2000 * 1500 * 0.1, 'and the pass is an order of magnitude cheaper');

  // A small image is left alone rather than upscaled.
  const small = edge.edgeDimensions(120, 80);
  assert.deepEqual({ width: small.width, height: small.height }, { width: 120, height: 80 });
  assert.equal(small.scale, 1);

  // Portrait caps on height, not width.
  const tall = edge.edgeDimensions(600, 2400);
  assert.equal(tall.height, edge.MAX_EDGE_DIM);
  assert.ok(tall.width < tall.height);

  // Garbage must still yield a usable, non-zero size.
  for (const [w, h] of [[0, 0], [NaN, 10], [-5, -5]]) {
    const dims = edge.edgeDimensions(w, h);
    assert.ok(dims.width >= 1 && dims.height >= 1, `${w}x${h} must clamp to something drawable`);
  }
}

// --- the browser path degrades instead of throwing ------------------------
{
  // No document in Node, so this exercises the guard the draw loop relies on.
  assert.equal(edge.getEdgeLayer(null), null);
  assert.equal(edge.getEdgeLayer({ complete: false }), null);
  assert.equal(edge.getEdgeLayer({ complete: true, naturalWidth: 0 }), null);
  assert.equal(edge.getEdgeLayer({ complete: true, naturalWidth: 10, src: '' }), null,
    'a blank src is not cacheable and must not be keyed');
}

console.log('void-edge-layer: edges where the edges are, and bounded work getting there');
