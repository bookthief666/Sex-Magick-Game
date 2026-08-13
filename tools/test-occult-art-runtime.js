'use strict';

const assert = require('node:assert/strict');
const art = require('./occult-art-runtime.js');
const field = require('./occult-field-runtime.js');
const gate = require('./gate-slice-runtime.js');

// --- the constraint the whole milestone rests on -------------------------
// The aesthetic goes around the functional signals, never through them. If a
// palette entry ever lands on a reserved colour, the player can no longer tell
// decoration from danger, and the Gate entry rate stops being comparable to the
// 46.4 and 54.5 baselines.
assert.deepEqual(art.paletteCollisions(), []);

// A palette must exist for every band the Gate slice actually ships, or ascending
// the Tree would silently fall back to MALKUTH partway up.
for (const band of gate.BANDS) {
  assert.ok(art.BAND_PALETTES[band.name], `no palette for band ${band.name}`);
}
assert.equal(art.BAND_ORDER.length, gate.BANDS.length);
assert.deepEqual(art.BAND_ORDER, gate.BANDS.map(band => band.name));

// Every reserved colour is a real six-digit hex, and they are all distinct.
{
  const values = Object.values(art.RESERVED_COLORS);
  for (const value of values) assert.ok(art.normalizeHex(value), `${value} is not a usable hex`);
  assert.equal(new Set(values.map(v => v.toLowerCase())).size, values.length, 'reserved colours must be distinct');
}

// Bands must actually look different, or the colour journey is decorative only.
{
  const inks = new Set(Object.values(art.BAND_PALETTES).map(p => p.ink));
  const deeps = new Set(Object.values(art.BAND_PALETTES).map(p => p.deep));
  assert.ok(inks.size >= 7, `expected distinct grounds per band, saw ${inks.size}`);
  assert.ok(deeps.size === art.BAND_ORDER.length, 'every band needs its own deep tone');
}

// An unknown band degrades to the default rather than throwing.
assert.equal(art.paletteFor('NOT_A_BAND'), art.BAND_PALETTES[art.DEFAULT_BAND]);
assert.equal(art.paletteFor(undefined), art.BAND_PALETTES[art.DEFAULT_BAND]);
assert.equal(art.paletteFor('kether'), art.BAND_PALETTES.KETHER, 'band lookup must be case-insensitive');

// A malformed palette table must be caught, not shipped.
assert.ok(art.paletteCollisions({ X: { ink: '#ff2f6d' } }).some(e => e.includes('reserved')));
assert.ok(art.paletteCollisions({ X: { ink: 'not-a-colour' } }).some(e => e.includes('six-digit')));

// --- seeded generation ---------------------------------------------------
// A given run must produce a reproducible field, and different runs must not
// look like the same field twice.
{
  const a = art.buildSeal({ seed: art.hashSeed('alpha'), radius: 50 });
  const b = art.buildSeal({ seed: art.hashSeed('alpha'), radius: 50 });
  const c = art.buildSeal({ seed: art.hashSeed('beta'), radius: 50 });
  assert.deepEqual(a, b, 'the same seed must rebuild the same seal');
  assert.notDeepEqual(a, c, 'different seeds must diverge');
}

// Seal geometry stays inside its stated radius, so a stratum cannot bleed past
// the area it was cached for.
{
  for (const seedText of ['one', 'two', 'three', 'four', 'five']) {
    const radius = 60;
    const seal = art.buildSeal({ seed: art.hashSeed(seedText), radius });
    assert.equal(seal.radius, radius);
    assert.ok(seal.rings.length >= 2, 'a seal needs concentric structure');
    for (const ring of seal.rings) assert.ok(ring > 0 && ring <= radius + 1e-9, `ring ${ring} escaped the radius`);
    for (const [, from, to] of seal.ticks) {
      assert.ok(to > from, 'a tick must have length');
      assert.ok(to <= radius * 1.2, 'tick marks must stay near the rim');
    }
    for (const [x, y] of seal.star) {
      assert.ok(Math.hypot(x, y) <= radius + 1e-9, 'star points must stay inside the radius');
    }
    // 5- or 7-pointed, closed back to the start.
    assert.ok(seal.star.length === 6 || seal.star.length === 8, `unexpected star point count ${seal.star.length}`);
  }
}

// Glyph runs are deterministic and bounded.
{
  const a = art.buildGlyphRun({ seed: art.hashSeed('script'), count: 5, size: 10 });
  const b = art.buildGlyphRun({ seed: art.hashSeed('script'), count: 5, size: 10 });
  assert.deepEqual(a, b);
  assert.equal(a.glyphs.length, 5);
  for (const glyph of a.glyphs) {
    assert.ok(glyph.strokes.length >= 2, 'a glyph needs at least two strokes to read as writing');
    for (const [x1, y1, x2, y2] of glyph.strokes) {
      for (const value of [x1, y1, x2, y2]) {
        assert.ok(Number.isFinite(value) && Math.abs(value) <= 10, `stroke coordinate ${value} escaped the glyph box`);
      }
    }
  }
}

// Degenerate inputs must still produce something drawable.
for (const radius of [0, -10, NaN, undefined]) {
  const seal = art.buildSeal({ seed: 1, radius });
  assert.ok(seal.radius > 0, `radius ${radius} produced an undrawable seal`);
}
assert.equal(art.buildGlyphRun({ seed: 1, count: 0 }).glyphs.length, 1, 'a run must never be empty');

// --- the cache is the performance argument -------------------------------
// Strata are intricate; per-frame cost stays flat only because they are
// rasterised once. If the cache ever misses on a repeat, the frame budget goes
// with it.
{
  art.clearCache();
  assert.equal(art.cacheSize(), 0);
  let renders = 0;
  const render = () => { renders += 1; };
  // No DOM in Node, so getCachedLayer returns null - the contract under test is
  // that it does not throw and does not render repeatedly.
  art.getCachedLayer('probe', 10, 10, render);
  art.getCachedLayer('probe', 10, 10, render);
  assert.ok(renders <= 1, 'a repeated key must not re-render');
  art.clearCache();
  assert.equal(art.cacheSize(), 0);
}

// Cache keys must separate the things that actually change a layer.
{
  const a = art.cacheKey(['stratum', 'MALKUTH', 'deep', 390, 844, 1]);
  const b = art.cacheKey(['stratum', 'MALKUTH', 'deep', 390, 844, 2]);
  const c = art.cacheKey(['stratum', 'KETHER', 'deep', 390, 844, 1]);
  assert.notEqual(a, b, 'a new run seed must invalidate the layer');
  assert.notEqual(a, c, 'a new band must invalidate the layer');
  assert.equal(a, art.cacheKey(['stratum', 'MALKUTH', 'deep', 390, 844, 1]));
}

// --- the field ------------------------------------------------------------
assert.equal(field.STRATA.length, 3, 'three depths is what makes the field read as a place');
{
  const parallax = field.STRATA.map(s => s.parallax);
  for (let index = 1; index < parallax.length; index += 1) {
    assert.ok(parallax[index] > parallax[index - 1], 'strata must be ordered far to near');
  }
  for (const stratum of field.STRATA) {
    assert.ok(stratum.alpha > 0 && stratum.alpha < 0.5, 'strata must stay behind the gameplay, not compete with it');
    assert.ok(stratum.seals >= 1);
  }
}

// With no game state the field still names a band rather than throwing.
assert.equal(field.currentBandName(null), art.DEFAULT_BAND);
assert.equal(field.currentBandName({}), art.DEFAULT_BAND);

console.log(`occult-art v${art.ART_VERSION} / field v${field.FIELD_VERSION}: all deterministic contracts passed`);
