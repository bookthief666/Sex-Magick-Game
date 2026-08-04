'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, 'gate-slice-playtest-v2.html');
const html = fs.readFileSync(filePath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];

assert.equal(scripts.length, 1, 'M9 playtest harness must contain one inline controller');
assert.doesNotThrow(() => new Function(scripts[0][1]), 'M9 harness controller must parse');
assert.match(html, /gate-slice-playtest-v2/, 'V2 protocol identifier must be present');
assert.match(html, /viewportProfile=\$\{encodeURIComponent\(viewportProfile\)\}/, 'selected viewport profile must reach the game');
assert.match(html, /__SEX_MAGICK_GATE_EVIDENCE__/, 'harness must use complete-session evidence API');
assert.match(html, /startSession/, 'harness must explicitly start a session');
assert.match(html, /stopSession/, 'harness must explicitly stop a session');
assert.match(html, /schemaVersion: 2/, 'reports must use schema version 2');
assert.match(html, /Fold closed/, 'Fold-closed profile must be selectable');
assert.match(html, /Fold open/, 'Fold-open profile must be selectable');
assert.match(html, /What is the game asking you to do\?/, 'comprehension question must remain');
assert.match(html, /What did the meter mean/, 'meter question must remain');
assert.match(html, /What did the large ring or Gate mean/, 'Gate question must remain');
assert.doesNotMatch(html, /\bfetch\s*\(/, 'harness must not transmit reports');
assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon|WebSocket/, 'harness must not contain reporting APIs');

console.log('gate-slice-playtest-v2: all static contracts passed');
