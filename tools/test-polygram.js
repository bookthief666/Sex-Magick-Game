'use strict';

/**
 * The star geometry the Void's collectibles are drawn from.
 *
 * The interesting property is the decomposition: {n/k} closes after
 * n / gcd(n,k) steps, so it is gcd(n,k) separate cycles, and a hexagram is two
 * triangles rather than one stroke. These tests pin that, because a single-loop
 * implementation would draw five of the seven orders correctly and silently
 * mangle the even ones.
 */

const assert = require('node:assert/strict');
const polygram = require('./polygram.js');

// --- gcd ------------------------------------------------------------------
assert.equal(polygram.greatestCommonDivisor(5, 2), 1);
assert.equal(polygram.greatestCommonDivisor(6, 2), 2);
assert.equal(polygram.greatestCommonDivisor(12, 5), 1);
assert.equal(polygram.greatestCommonDivisor(12, 4), 4);
assert.equal(polygram.greatestCommonDivisor(9, 0), 9, 'gcd(n, 0) is n');
assert.equal(polygram.greatestCommonDivisor(-6, 4), 2, 'sign is irrelevant');

// --- skip normalisation ---------------------------------------------------
// A star needs a skip of at least 2; 1 draws the convex polygon.
assert.equal(polygram.normalizeSkip(5, 1), 2);
assert.equal(polygram.normalizeSkip(5, 0), 2);
// {n/k} and {n/(n-k)} are the same figure traced the other way round.
assert.equal(polygram.normalizeSkip(7, 5), 2, '{7/5} is {7/2} reversed');
assert.equal(polygram.normalizeSkip(12, 7), 5, '{12/7} is {12/5} reversed');
// At exactly n/2 the figure collapses into diameters, so it must be pulled in.
assert.ok(polygram.normalizeSkip(8, 4) < 4, '{8/4} is four diameters, not a star');
assert.ok(polygram.normalizeSkip(6, 3) < 3, '{6/3} is three diameters, not a star');
assert.equal(polygram.normalizeSkip(6, 2), 2);

// --- the decomposition ----------------------------------------------------
{
  // {5/2}: one unbroken stroke through all five points.
  const pentagram = polygram.buildPolygram(5, 2, 10);
  assert.equal(pentagram.length, 1, 'a pentagram is a single cycle');
  assert.equal(pentagram[0].length, 5);

  // {6/2}: two triangles. This is the case a single-loop implementation gets
  // wrong, and the reason the renderer is written around gcd at all.
  const hexagram = polygram.buildPolygram(6, 2, 10);
  assert.equal(hexagram.length, 2, 'a hexagram is two triangles, not one path');
  assert.equal(hexagram[0].length, 3);
  assert.equal(hexagram[1].length, 3);

  // Every vertex is used exactly once across the cycles, for every order.
  for (const { points, skip } of polygram.BAND_ORDERS) {
    const cycles = polygram.buildPolygram(points, skip, 10);
    const total = cycles.reduce((sum, cycle) => sum + cycle.length, 0);
    assert.equal(total, points, `{${points}/${skip}} must visit every vertex once`);

    const seen = new Set(cycles.flat().map(p => `${p.x.toFixed(9)},${p.y.toFixed(9)}`));
    assert.equal(seen.size, points, `{${points}/${skip}} revisited a vertex`);

    const expectedCycles = polygram.greatestCommonDivisor(points, polygram.normalizeSkip(points, skip));
    assert.equal(cycles.length, expectedCycles, `{${points}/${skip}} cycle count`);
  }
}

// --- geometry -------------------------------------------------------------
{
  const radius = 17;
  const cycles = polygram.buildPolygram(9, 4, radius);
  for (const point of cycles.flat()) {
    const distance = Math.hypot(point.x, point.y);
    assert.ok(Math.abs(distance - radius) < 1e-9, 'every vertex sits on the circle');
  }

  // Points up, matching the shipped pentagram's -PI/2 phase.
  const first = polygram.buildPolygram(5, 2, 10)[0][0];
  assert.ok(Math.abs(first.x) < 1e-9, 'the first vertex is on the vertical axis');
  assert.ok(first.y < 0, 'and above the centre');

  // Rotation turns the whole figure without changing its shape.
  const turned = polygram.buildPolygram(5, 2, 10, Math.PI / 2)[0][0];
  assert.ok(Math.abs(turned.y) < 1e-9 && turned.x > 0, 'a quarter turn puts it on the horizontal');
}

// --- band progression -----------------------------------------------------
{
  assert.equal(polygram.orderForBand(0).points, 5, 'MALKUTH is a pentagram');
  assert.equal(polygram.orderForBand(0).name, 'PENTAGRAM');
  assert.equal(polygram.orderForBand(1).points, 6);
  assert.equal(polygram.orderForBand(6).points, 12, 'the crown is a dodecagram');

  // Monotonic: a later band never yields a simpler star.
  for (let band = 1; band < polygram.BAND_ORDERS.length; band += 1) {
    assert.ok(
      polygram.orderForBand(band).points >= polygram.orderForBand(band - 1).points,
      `band ${band} regressed to a simpler star`
    );
  }

  // Saturates rather than throwing at either end.
  assert.equal(polygram.orderForBand(-5).points, 5);
  assert.equal(polygram.orderForBand(999).points, 12);
  assert.equal(polygram.orderForBand(NaN).points, 5);

  // Every declared order must actually be drawable as a star.
  for (const order of polygram.BAND_ORDERS) {
    assert.equal(polygram.normalizeSkip(order.points, order.skip), order.skip,
      `${order.name} declares a skip that normalises to something else`);
    assert.ok(order.points >= polygram.MIN_POINTS && order.points <= polygram.MAX_POINTS);
  }
}

// --- stroking -------------------------------------------------------------
{
  // A recording stub, so the draw path is exercised without a canvas.
  const calls = [];
  const ctx = {
    beginPath: () => calls.push('begin'),
    moveTo: () => calls.push('move'),
    lineTo: () => calls.push('line'),
    closePath: () => calls.push('close'),
    stroke: () => calls.push('stroke')
  };

  const cycleCount = polygram.strokePolygram(ctx, { points: 6, skip: 2, radius: 12 });
  assert.equal(cycleCount, 2, 'a hexagram strokes two paths');
  assert.equal(calls.filter(c => c === 'begin').length, 2);
  assert.equal(calls.filter(c => c === 'stroke').length, 2);
  assert.equal(calls.filter(c => c === 'move').length, 2, 'one moveTo per cycle');
  assert.equal(calls.filter(c => c === 'line').length, 4, 'two lineTo per triangle');

  assert.equal(polygram.strokePolygram(null, { points: 5 }), 0, 'no context is not a crash');
}

console.log('polygram: {n/k} decomposes correctly, hexagrams included');
