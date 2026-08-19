'use strict';

const assert = require('node:assert/strict');
const product = require('./product-integration-runtime.js');

function params(result) {
  return new URLSearchParams(result.query);
}

{
  const result = product.resolveDefaults({ search: '', width: 884, height: 1104, devicePixelRatio: 2.625 });
  assert.equal(params(result).get('gateSlice'), '1', 'ordinary product URL must default to full HEX/Gate stack');
  assert.equal(params(result).get('renderDpr'), '2', 'Fold-open high-DPR geometry must default to 2x backing');
  assert.equal(result.largeHighDprViewport, true);
}

{
  const result = product.resolveDefaults({ search: '', width: 368, height: 869, devicePixelRatio: 2.625 });
  assert.equal(params(result).get('gateSlice'), '1');
  assert.equal(params(result).has('renderDpr'), false, 'Fold-cover geometry keeps native DPR unless explicitly overridden');
}

{
  const result = product.resolveDefaults({ search: '?gateSlice=0&renderDpr=native', width: 884, height: 1104, devicePixelRatio: 2.625 });
  assert.equal(params(result).get('gateSlice'), '0', 'explicit Gate opt-out must be respected');
  assert.equal(params(result).get('renderDpr'), 'native', 'explicit render policy must be respected');
  assert.deepEqual(result.changes, {});
}

{
  const result = product.resolveDefaults({ search: '?visualQa=1', width: 884, height: 1104, devicePixelRatio: 2.625 });
  assert.equal(params(result).has('gateSlice'), false, 'visual QA must retain its explicit named-state topology');
  assert.equal(params(result).has('renderDpr'), false, 'visual QA must retain its own render controls');
  assert.deepEqual(result.changes, {});
}

{
  const result = product.resolveDefaults({ search: '?telemetryQa=12345', width: 390, height: 844, devicePixelRatio: 1 });
  assert.equal(params(result).has('gateSlice'), false, 'low-level telemetry QA must retain base lifecycle semantics');
  assert.equal(result.baseDiagnostic, true);
  assert.deepEqual(result.changes, {});
}

{
  const result = product.resolveDefaults({ search: '?legacyHex=1', width: 884, height: 1104, devicePixelRatio: 2.625 });
  assert.equal(params(result).has('gateSlice'), false, 'legacyHex opt-out must keep Gate disabled');
  assert.equal(params(result).get('renderDpr'), '2', 'legacy gameplay can still receive the Fold-safe render default');
}

{
  const result = product.resolveDefaults({ search: '?gateSlice=1&renderDpr=css', width: 884, height: 1104, devicePixelRatio: 2.625 });
  assert.equal(params(result).get('gateSlice'), '1');
  assert.equal(params(result).get('renderDpr'), 'css');
  assert.deepEqual(result.changes, {});
}

console.log('product-integration v1: all deterministic contracts passed');
