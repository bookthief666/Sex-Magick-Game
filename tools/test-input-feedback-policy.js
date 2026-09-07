'use strict';

const assert = require('node:assert/strict');
const policy = require('./input-feedback-policy.js');

assert.equal(
  policy.queryRequestsText({ search: '', hash: '' }),
  false,
  'feedback text must be hidden by default'
);
assert.equal(
  policy.queryRequestsText({ search: '?inputFeedback=1', hash: '' }),
  true,
  'explicit input-feedback query must enable text'
);
assert.equal(
  policy.queryRequestsText({ search: '?hitboxes=1', hash: '' }),
  true,
  'hitbox diagnostics must enable feedback text'
);
assert.equal(
  policy.queryRequestsText({ search: '', hash: '#debug' }),
  true,
  'debug hash must enable feedback text'
);
assert.equal(
  policy.resolveTextEnabled({ queryEnabled: false, debugEnabled: false }),
  false
);
assert.equal(
  policy.resolveTextEnabled({ queryEnabled: true, debugEnabled: false }),
  true
);
assert.equal(
  policy.resolveTextEnabled({ queryEnabled: false, debugEnabled: true }),
  true
);
assert.equal(
  policy.resolveTextEnabled({ forcedEnabled: false, queryEnabled: true, debugEnabled: true }),
  false,
  'explicit test override must win'
);
assert.equal(
  policy.resolveTextEnabled({ forcedEnabled: true, queryEnabled: false, debugEnabled: false }),
  true,
  'explicit test override must win'
);

console.log('input-feedback-policy: all deterministic contracts passed');
