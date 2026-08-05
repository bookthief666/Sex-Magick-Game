'use strict';

const assert = require('node:assert/strict');
const render = require('./canvas-render-runtime.js');

const foldClosed = render.computeRenderMetrics({
  width: 368,
  height: 869,
  devicePixelRatio: 2.625,
  requestedDpr: 'native',
  maxDpr: 3,
  maxBackingPixels: 8_000_000
});
assert.equal(foldClosed.logicalWidth, 368);
assert.equal(foldClosed.logicalHeight, 869);
assert.equal(foldClosed.effectiveDpr, 2.625);
assert.equal(foldClosed.backingWidth, 966);
assert.equal(foldClosed.backingHeight, 2281);
assert.ok(foldClosed.backingPixels < 8_000_000);
assert.equal(foldClosed.cappedByPixels, false);

const foldOpen = render.computeRenderMetrics({
  width: 884,
  height: 1104,
  devicePixelRatio: 2.625,
  requestedDpr: 'native',
  maxDpr: 3,
  maxBackingPixels: 8_000_000
});
assert.equal(foldOpen.logicalWidth, 884);
assert.equal(foldOpen.logicalHeight, 1104);
assert.equal(foldOpen.effectiveDpr, 2.625);
assert.equal(foldOpen.backingWidth, 2321);
assert.equal(foldOpen.backingHeight, 2898);
assert.ok(foldOpen.backingPixels < 8_000_000);

const budgetedDesktop = render.computeRenderMetrics({
  width: 1920,
  height: 1080,
  devicePixelRatio: 3,
  requestedDpr: 3,
  maxDpr: 3,
  maxBackingPixels: 8_000_000
});
assert.equal(budgetedDesktop.effectiveDpr, 1.875);
assert.ok(budgetedDesktop.backingPixels <= 8_000_000);
assert.equal(budgetedDesktop.cappedByPixels, true);

const cssPixelMode = render.computeRenderMetrics({
  width: 390,
  height: 844,
  devicePixelRatio: 3,
  requestedDpr: 'css',
  maxDpr: 3,
  maxBackingPixels: 8_000_000
});
assert.equal(cssPixelMode.effectiveDpr, 1);
assert.equal(cssPixelMode.backingWidth, 390);
assert.equal(cssPixelMode.backingHeight, 844);

const parsed = render.parseRenderOptions(
  { search: '?renderDpr=2&renderDprCap=2.5&renderPixelBudget=6000000' },
  { devicePixelRatio: 3 }
);
assert.equal(parsed.requestedDpr, '2');
assert.equal(parsed.maxDpr, 2.5);
assert.equal(parsed.maxBackingPixels, 6_000_000);
assert.equal(parsed.devicePixelRatio, 3);

const defaults = render.parseRenderOptions({ search: '' }, { devicePixelRatio: 2.625 });
assert.equal(defaults.requestedDpr, 'native');
assert.equal(defaults.maxDpr, 3);
assert.equal(defaults.maxBackingPixels, 8_000_000);
assert.equal(defaults.devicePixelRatio, 2.625);

assert.equal(render.quantizeDpr(2.74), 2.625);
assert.equal(render.normalizeRequestedDpr('native', 2.625), 2.625);
assert.equal(render.normalizeRequestedDpr('css', 2.625), 1);

console.log('canvas-render-runtime: all deterministic contracts passed');