'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, 'r1-playtest.html');
const html = fs.readFileSync(filePath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];

assert.equal(scripts.length, 1, 'R1 harness must contain one inline controller script');
assert.doesNotThrow(() => new Function(scripts[0][1]), 'R1 inline controller must parse');
assert.match(html, /10 \* 60 \* 1000/, 'session must be ten minutes');
assert.match(html, /value="3"/, 'three-step condition must exist');
assert.match(html, /value="6"/, 'six-step condition must exist');
assert.match(html, /Did the game ever ignore you\?/, 'first required question must be exact');
assert.match(html, /What is the game asking you to do\?/, 'second required question must be exact');
assert.match(html, /getInputStats/, 'harness must capture input counters');
assert.match(html, /inputStats\.lifetime/, 'protocol must direct analysis to lifetime counters');
assert.match(html, /__SEX_MAGICK_TIMING__/, 'harness must use the exported timing API');
assert.match(html, /setTextEnabled\?\.\(false\)/, 'player-facing input text must be disabled during the test');
assert.doesNotMatch(html, /\bfetch\s*\(/, 'harness must not transmit reports');
assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon|WebSocket/, 'harness must not contain network-reporting APIs');

console.log('r1-playtest-harness: all static contracts passed');
