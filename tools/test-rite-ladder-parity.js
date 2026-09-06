'use strict';

const assert = require('node:assert/strict');
const validation = require('./rite-validation.js');
const hex = require('./gate-slice-runtime.js');
const monas = require('./monas-progression-runtime.js');

const hexThresholds = hex.BANDS.map(band => band.gateThreshold);
const hexNames = hex.BANDS.map(band => band.name);
const monasThresholds = monas.BANDS.map(band => band.gateThreshold);
const monasNames = monas.BANDS.map(band => band.id.toUpperCase());

assert.deepEqual(
  validation.FALLBACK_THRESHOLDS,
  hexThresholds,
  'HEX validator thresholds must exactly mirror the live Gate slice ladder'
);
assert.deepEqual(
  validation.FALLBACK_BANDS,
  hexNames,
  'HEX validator band names must exactly mirror the live Gate slice ladder'
);
assert.deepEqual(
  validation.MONAS_THRESHOLDS,
  monasThresholds,
  'MONAS validator thresholds must exactly mirror the live MONAS progression ladder'
);
assert.deepEqual(
  validation.MONAS_BANDS,
  monasNames,
  'MONAS validator band names must exactly mirror the live MONAS progression ladder'
);

console.log('rite-ladder-parity: all assertions passed');
