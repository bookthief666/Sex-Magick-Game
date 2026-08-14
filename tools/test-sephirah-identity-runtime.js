'use strict';

const assert = require('node:assert/strict');
const gate = require('./gate-slice-runtime.js');
const identity = require('./sephirah-identity-runtime.js');

const expectedOrder = gate.BANDS.map(band => band.name);
assert.deepEqual(identity.BAND_ORDER, expectedOrder, 'M35 identities must track the exact live Gate band order');
assert.deepEqual(identity.validateProfiles(gate.BANDS), [], 'all Living Sephiroth profiles must satisfy bounded contracts');
assert.equal(identity.BAND_ORDER.length, 8);

const visualSignatures = new Set();
const audioSignatures = new Set();
for (const name of identity.BAND_ORDER) {
  const profile = identity.profileFor(name);
  const visual = profile.visual;
  const audio = identity.audioPlanFor(name);

  assert.equal(profile.name, name);
  assert.ok(profile.meaning.length > 2);
  assert.ok(profile.temperament.includes('/'), `${name} needs an authored temperament, not only a colour`);
  assert.equal(audio.band, name);
  assert.equal(audio.frequencies.length, 3);
  assert.ok(audio.frequencies.every(value => value >= 30 && value <= 660), `${name} ambient frequencies stay bounded`);
  assert.ok(audio.transitionFrequencies.every(value => value >= 120 && value <= 1760), `${name} transition motif stays bounded`);
  assert.ok(audio.gain > 0 && audio.gain <= 0.02, `${name} undertone remains subordinate to existing music`);
  assert.ok(audio.cutoffHz >= 200 && audio.cutoffHz <= 4000);
  assert.ok(audio.pulseHz >= 0.08 && audio.pulseHz <= 1.5);

  visualSignatures.add([
    visual.particleSpeed,
    visual.particleOpacity,
    visual.particleSize,
    visual.scanlineOpacity,
    visual.scanlinePx,
    visual.vignetteOpacity,
    visual.particleColors.join(',')
  ].join('|'));
  audioSignatures.add([
    audio.rootHz,
    audio.cutoffHz,
    audio.pulseHz,
    audio.frequencies.join(',')
  ].join('|'));
}

assert.equal(visualSignatures.size, 8, 'every Sephirah must have a distinct visual fingerprint');
assert.equal(audioSignatures.size, 8, 'every Sephirah must have a distinct audio fingerprint');

const malkuth = identity.profileFor('MALKUTH').visual;
const geburah = identity.profileFor('GEBURAH').visual;
const chokmah = identity.profileFor('CHOKMAH').visual;
const kether = identity.profileFor('KETHER').visual;
const tiphareth = identity.profileFor('TIPHARETH').visual;

assert.ok(geburah.particleSpeed > malkuth.particleSpeed, 'GEBURAH must visibly accelerate atmospheric motion');
assert.ok(chokmah.particleSpeed > geburah.particleSpeed, 'CHOKMAH must be the most kinetically charged upper band');
assert.ok(kether.particleOpacity < malkuth.particleOpacity * 0.3, 'KETHER must shed lower-Tree visual noise');
assert.ok(kether.scanlineOpacity < tiphareth.scanlineOpacity, 'KETHER must strip the CRT veil rather than intensify it');
assert.ok(tiphareth.vignetteOpacity < malkuth.vignetteOpacity, 'TIPHARETH must open the visual field relative to MALKUTH');

const unknown = identity.profileFor('NOT-A-SEPHIRAH');
assert.equal(unknown.name, 'MALKUTH', 'unknown identity fails safely to MALKUTH');

console.log('m35 living-sephiroth: all deterministic contracts passed');