'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, 'gate-slice-playtest.html');
const html = fs.readFileSync(filePath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];

assert.equal(scripts.length, 1, 'Gate playtest harness must contain one inline controller');
assert.doesNotThrow(() => new Function(scripts[0][1]), 'Gate playtest controller must parse');
assert.match(html, /gateSlice=1/, 'harness must load the opt-in Gate slice');
assert.match(html, /inputBuffer=\$\{bufferFrames\}/, 'harness must carry the selected buffer value');
assert.match(html, /value="3"/, 'three-step input condition must remain available');
assert.match(html, /value="6"/, 'six-step input condition must remain available');
assert.match(html, /getHistory/, 'harness must capture completed Gate-slice runs');
assert.match(html, /getSnapshot/, 'harness must capture the active Gate-slice run');
assert.match(html, /gateEntryRate/, 'harness must compute the primary Gate decision metric');
assert.match(html, /voidSurvivalRate/, 'harness must compute Void outcome evidence');
assert.match(html, /What is the game asking you to do\?/, 'harness must ask the comprehension question');
assert.match(html, /What did the meter mean/, 'harness must test Gnosis comprehension without naming it');
assert.match(html, /What did the large ring or Gate mean/, 'harness must test Gate comprehension');
assert.match(html, /Would you voluntarily play another run\?/, 'harness must capture voluntary replay intent');
assert.match(html, /__SEX_MAGICK_GATE_PREFLIGHT__/, 'harness must record the local-only preflight state');
assert.doesNotMatch(html, /\bfetch\s*\(/, 'harness must not transmit reports');
assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon|WebSocket/, 'harness must not contain network-reporting APIs');

console.log('gate-slice-playtest-harness: all static contracts passed');
