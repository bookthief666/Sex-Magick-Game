'use strict';

const assert = require('node:assert/strict');
const viewport = require('./viewport-runtime.js');

assert.equal(viewport.classifyViewport({
  width: 368,
  height: 869,
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U)'
}), 'fold-closed');

assert.equal(viewport.classifyViewport({
  width: 884,
  height: 1104,
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U)'
}), 'fold-open');

assert.equal(viewport.classifyViewport({
  width: 390,
  height: 844,
  userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9)'
}), 'tall-phone');

assert.equal(viewport.classifyViewport({
  width: 430,
  height: 780,
  userAgent: 'Mozilla/5.0'
}), 'compact-phone');

assert.equal(viewport.classifyViewport({
  width: 800,
  height: 1100,
  userAgent: 'Mozilla/5.0'
}), 'tablet');

assert.equal(viewport.classifyViewport({
  width: 1440,
  height: 900,
  userAgent: 'Mozilla/5.0'
}), 'desktop');

assert.equal(viewport.classifyViewport({
  width: 1440,
  height: 900,
  forcedProfile: 'fold-closed',
  userAgent: 'Mozilla/5.0'
}), 'fold-closed');

const snapshot = viewport.createSnapshot({
  width: 368,
  height: 869,
  devicePixelRatio: 2.625,
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U)'
});
assert.equal(snapshot.profile, 'fold-closed');
assert.equal(snapshot.orientation, 'portrait');
assert.equal(snapshot.devicePixelRatio, 2.625);
assert.equal(snapshot.fold6Detected, true);
assert.ok(snapshot.config.hudWidth);
assert.ok(Object.isFrozen(snapshot));

console.log('viewport-runtime: all profile contracts passed');
