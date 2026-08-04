'use strict';

const assert = require('node:assert/strict');
const {
  normalizeRect,
  rectsOverlap,
  buildPlayerRect,
  buildPillarRects
} = require('./collision-runtime.js');

function testNormalization() {
  assert.deepEqual(
    normalizeRect({ left: 20, right: 10, top: 40, bottom: 15 }),
    { left: 10, right: 20, top: 15, bottom: 40, width: 10, height: 25 }
  );
}

function testStrictOverlapPolicy() {
  const a = { left: 0, right: 10, top: 0, bottom: 10 };
  assert.equal(rectsOverlap(a, { left: 9, right: 20, top: 0, bottom: 10 }), true);
  assert.equal(rectsOverlap(a, { left: 10, right: 20, top: 0, bottom: 10 }), false, 'touching edges are not penetration');
  assert.equal(rectsOverlap(a, { left: 2, right: 8, top: 10, bottom: 20 }), false);
}

function testPlayerInset() {
  const player = buildPlayerRect({ x: 100, y: 200, r: 20 }, 4);
  assert.deepEqual(player, {
    left: 84,
    right: 116,
    top: 184,
    bottom: 216,
    width: 32,
    height: 32
  });

  const fullyInset = buildPlayerRect({ x: 5, y: 7, r: 10 }, 999);
  assert.deepEqual(fullyInset, {
    left: 5,
    right: 5,
    top: 7,
    bottom: 7,
    width: 0,
    height: 0
  });
}

function testPillarRects() {
  const rects = buildPillarRects({ x: 300, w: 80, top: 220, gap: 180 }, 800);
  assert.deepEqual(rects, {
    top: { left: 300, right: 380, top: 0, bottom: 220, width: 80, height: 220 },
    bottom: { left: 300, right: 380, top: 400, bottom: 800, width: 80, height: 400 },
    gap: { left: 300, right: 380, top: 220, bottom: 400, width: 80, height: 180 }
  });

  assert.equal(rectsOverlap({ left: 320, right: 340, top: 221, bottom: 399 }, rects.top), false);
  assert.equal(rectsOverlap({ left: 320, right: 340, top: 221, bottom: 399 }, rects.bottom), false);
  assert.equal(rectsOverlap({ left: 320, right: 340, top: 219, bottom: 230 }, rects.top), true);
  assert.equal(rectsOverlap({ left: 320, right: 340, top: 390, bottom: 401 }, rects.bottom), true);
}

function testViewportClamping() {
  const rects = buildPillarRects({ x: -20, w: 60, top: -10, gap: 2000 }, 600);
  assert.equal(rects.top.height, 0);
  assert.equal(rects.gap.top, 0);
  assert.equal(rects.gap.bottom, 600);
  assert.equal(rects.bottom.height, 0);
}

testNormalization();
testStrictOverlapPolicy();
testPlayerInset();
testPillarRects();
testViewportClamping();

console.log('collision-runtime: all geometry contracts passed');
