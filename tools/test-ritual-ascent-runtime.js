'use strict';

const assert = require('node:assert/strict');
const gate = require('./gate-slice-runtime.js');
const ritual = require('./ritual-ascent-runtime.js');

assert.equal(ritual.VERSION, 1);
assert.equal(ritual.BAND_THEMES.length, gate.BANDS.length, 'every live HEX band needs a ritual theme');
assert.deepEqual(
  ritual.BAND_THEMES.map(theme => theme.name),
  gate.BANDS.map(band => band.name),
  'ritual names must track the actual Gate band order'
);
assert.deepEqual(
  ritual.BAND_THEMES.map(theme => theme.meaning),
  ['KINGDOM', 'FOUNDATION', 'BEAUTY', 'SEVERITY', 'MERCY', 'UNDERSTANDING', 'WISDOM', 'CROWN']
);

// Spans are read off BANDS rather than hardcoded - D-067 re-spaced the ladder
// and literal gate counts here asserted the spacing, not the progress maths.
const YESOD_AT = gate.BANDS[1].gateThreshold;
const TIPHARETH_AT = gate.BANDS[2].gateThreshold;

{
  const progress = ritual.bandProgress({ gatesCleared: 0, bandIndex: 0 }, gate.BANDS);
  assert.equal(progress.currentName, 'MALKUTH');
  assert.equal(progress.nextName, 'YESOD');
  assert.equal(progress.gatesToNext, YESOD_AT);
  assert.equal(progress.ratio, 0);
  assert.equal(progress.atCrown, false);
}

{
  const oneShort = YESOD_AT - 1;
  const progress = ritual.bandProgress({ gatesCleared: oneShort, bandIndex: 0 }, gate.BANDS);
  assert.equal(progress.gatesToNext, 1);
  assert.equal(progress.ratio, oneShort / YESOD_AT);
}

{
  const progress = ritual.bandProgress({ gatesCleared: YESOD_AT, bandIndex: 1 }, gate.BANDS);
  assert.equal(progress.currentName, 'YESOD');
  assert.equal(progress.nextName, 'TIPHARETH');
  assert.equal(progress.gatesToNext, TIPHARETH_AT - YESOD_AT);
  assert.equal(progress.ratio, 0);
  assert.deepEqual(ritual.themeForBand(1, gate.BANDS), {
    index: 1,
    name: 'YESOD',
    meaning: 'FOUNDATION'
  });
}

{
  const progress = ritual.bandProgress({ gatesCleared: 120, bandIndex: 7 }, gate.BANDS);
  assert.equal(progress.currentName, 'KETHER');
  assert.equal(progress.nextName, null);
  assert.equal(progress.gatesToNext, 0);
  assert.equal(progress.ratio, 1);
  assert.equal(progress.atCrown, true);
}

assert.equal(
  ritual.rewriteGateText('THE GATE OPENS  ·  ENTER TO WAGER  /  PASS TO BANK'),
  'GATE OPEN  ·  ENTER → VOID ×10  /  PASS → BANK ×3'
);
assert.equal(
  ritual.rewriteGateText('WAGER ACCEPTED  × 7.5'),
  'VOID TRIAL  ·  STAKE × 7.5'
);
assert.equal(
  ritual.rewriteGateText('WAGER LOST  × 4'),
  'VOID FAILED  ·  STAKE LOST × 4'
);
assert.equal(
  ritual.rewriteGateText('VOID SURVIVED  +80'),
  'VOID SURVIVED  +80',
  'copy rewrite must not touch unrelated successful feedback'
);

assert.equal(ritual.rewriteMissionText('ACCEPT THE WAGER'), 'ENTER THE GATE');
assert.equal(ritual.rewriteMissionText('REFUSE THE GATE'), 'BANK THE GNOSIS');
assert.equal(
  ritual.rewriteMissionText('RITE FULFILLED · ACCEPT THE WAGER'),
  'RITE FULFILLED · ENTER THE GATE'
);
assert.equal(ritual.rewriteMissionText('SURVIVE THE VOID'), 'SURVIVE THE VOID');

console.log('ritual-ascent v1: all deterministic contracts passed');
