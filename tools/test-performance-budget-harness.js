'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'performance-budget-playtest.html'), 'utf8');

assert.match(html, /PERFORMANCE BUDGET PLAYTEST/);
assert.match(html, /perfProbe=1/);
assert.match(html, /perfPanel=1/);
assert.match(html, /renderDpr=native/);
assert.match(html, /renderDpr=2/);
assert.match(html, /renderDpr=css/);
assert.match(html, /viewportProfile=fold-closed/);
assert.match(html, /viewportProfile=fold-open/);
assert.match(html, /assetMode=offline/);
assert.match(html, /local-opt-in-performance-budget-probe/);
assert.match(html, /multiple/);
assert.doesNotMatch(html, /fetch\s*\(/);
assert.doesNotMatch(html, /XMLHttpRequest/);
assert.doesNotMatch(html, /localStorage\s*\./);
assert.doesNotMatch(html, /lootlocker/i);

const presets = Array.from(html.matchAll(/data-preset="([^"]+)"/g), match => match[1]);
assert.deepEqual(presets.sort(), [
  'closed-2x', 'closed-css', 'closed-native',
  'open-2x', 'open-css', 'open-native'
]);

console.log('performance-budget-playtest: all static contracts passed');
