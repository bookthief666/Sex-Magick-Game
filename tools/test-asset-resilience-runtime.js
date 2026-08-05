'use strict';

const assert = require('node:assert/strict');
const assets = require('./asset-resilience-runtime.js');

assert.equal(assets.normalizeMode('offline'), 'offline');
assert.equal(assets.normalizeMode('AUTO'), 'auto');
assert.equal(assets.normalizeMode('unknown'), 'auto');

const parsed = assets.parseAssetOptions({
  search: '?assetMode=offline&assetAttemptMs=750&assetOverallMs=4200'
});
assert.equal(parsed.mode, 'offline');
assert.equal(parsed.attemptTimeoutMs, 750);
assert.equal(parsed.overallTimeoutMs, 4200);

assert.equal(
  assets.appendRetryQuery('https://example.com/image=s0', 2),
  'https://example.com/image=s0?smRetry=2'
);
assert.equal(
  assets.appendRetryQuery('https://example.com/image=s0?x=1', 2),
  'https://example.com/image=s0?x=1&smRetry=2'
);

const manifest = assets.createAssetManifest([
  { id: 'alpha', name: 'MALKUTH', accent: '#00e5ff' },
  { id: 'beta', name: 'YESOD', accent: '#ff2f6d' }
], {
  baseUrl: 'https://assets.example/',
  suffix: '=s0',
  debug: false
});

assert.deepEqual(manifest.map(item => item.url), [
  'https://assets.example/alpha=s0',
  'https://assets.example/beta=s0'
]);
assert.equal(manifest[0].name, 'MALKUTH');
assert.equal(manifest[1].accent, '#ff2f6d');

const records = Array.from({ length: 25 }, (_, index) => ({
  id: `asset-${index}`,
  status: index < 20 ? 'loaded' : 'fallback',
  networkAttempts: index < 20 ? 1 : 2,
  lastError: index < 20 ? null : 'network-or-decode-error',
  reason: index < 20 ? null : 'network-failure'
}));
const summary = assets.summarizeRecords(records);
assert.equal(summary.total, 25);
assert.equal(summary.loaded, 20);
assert.equal(summary.fallback, 5);
assert.equal(summary.pending, 0);
assert.equal(summary.networkAttempts, 30);
assert.equal(summary.fallbackIds.length, 5);
assert.equal(summary.failedIds.length, 5);

const pendingSummary = assets.summarizeRecords([
  { id: 'one', status: 'pending', networkAttempts: 0 },
  { id: 'two', status: 'fallback', networkAttempts: 0, reason: 'overall-timeout' }
]);
assert.equal(pendingSummary.pending, 1);
assert.equal(pendingSummary.fallback, 1);
assert.equal(pendingSummary.timedOut, 1);

console.log('asset-resilience-runtime: all deterministic contracts passed');