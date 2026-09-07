'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'performance-budget-playtest.html'), 'utf8');
const runtime = fs.readFileSync(path.join(__dirname, 'performance-evidence-analysis.js'), 'utf8');

for (const preset of ['closed-native', 'closed-2x', 'closed-css', 'open-native', 'open-2x', 'open-css']) {
  assert.match(html, new RegExp(`data-preset="${preset}"`));
}
assert.match(html, /m12-same-origin-harness-capture/);
assert.match(html, /Capture active run/);
assert.match(html, /insufficient-evidence/);
assert.match(html, /no-sustainable-candidate/);
assert.match(html, /performance-evidence-analysis\.js/);
assert.match(html, /__SEX_MAGICK_M12_HARNESS__/);
assert.match(html, /repeat number/i);
assert.match(html, /at least three eligible repeats/i);
assert.match(html, /Five repeats improves confidence/i);

for (const [label, source] of [['harness', html], ['analysis', runtime]]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, `${label} must not transmit with fetch`);
  assert.doesNotMatch(source, /XMLHttpRequest/, `${label} must not use XHR`);
  assert.doesNotMatch(source, /sendBeacon/, `${label} must not use beacon`);
  assert.doesNotMatch(source, /new\s+WebSocket/, `${label} must not use WebSocket`);
  assert.doesNotMatch(source, /localStorage\s*\./, `${label} must not persist locally`);
  assert.doesNotMatch(source, /sessionStorage\s*\./, `${label} must not persist in session storage`);
  assert.doesNotMatch(source, /lootlocker/i, `${label} must not reference LootLocker`);
}

const inlineScripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(source => source.trim());
for (const source of inlineScripts) new Function(source);

console.log('m12-performance-evidence-harness: all static checks passed');
