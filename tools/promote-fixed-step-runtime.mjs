import { readFile, writeFile } from 'node:fs/promises';

const INDEX_PATH = 'index.html';
const BROWSER_TEST_PATH = 'tools/browser-fixed-step-test.mjs';
const RUNTIME_MARKER = '<!-- SEX MAGICK 2.0 FIXED-STEP RUNTIME -->';

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first === -1) throw new Error(`Promotion pattern not found: ${label}`);
  if (source.indexOf(search, first + search.length) !== -1) {
    throw new Error(`Promotion pattern is ambiguous: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

async function promoteIndex() {
  let source = await readFile(INDEX_PATH, 'utf8');
  if (source.includes(RUNTIME_MARKER)) return false;

  const runtimeScripts = [
    '',
    `    ${RUNTIME_MARKER}`,
    '    <script src="tools/fixed-step-clock.js"></script>',
    '    <script src="tools/fixed-step-prototype.js"></script>',
    ''
  ].join('\n');

  source = replaceExactlyOnce(source, '\n</body>', `${runtimeScripts}</body>`, 'index closing body');
  await writeFile(INDEX_PATH, source);
  return true;
}

async function promoteBrowserTest() {
  let source = await readFile(BROWSER_TEST_PATH, 'utf8');
  if (source.includes('const EXTERNAL_BLOCKED_URLS = Object.freeze')) return false;

  const constantsReplacement = [
    'const childProcesses = [];',
    'const EXTERNAL_BLOCKED_URLS = Object.freeze([',
    "  'https://cdn.tailwindcss.com/*',",
    "  'https://fonts.googleapis.com/*',",
    "  'https://fonts.gstatic.com/*',",
    "  'https://lh3.googleusercontent.com/*',",
    "  'https://cdn.jsdelivr.net/*',",
    "  'https://7l3mo9bh.api.lootlocker.io/*'",
    ']);',
    'const FIXED_STEP_RUNTIME_URLS = Object.freeze([',
    '  `${BASE_URL}/tools/fixed-step-clock.js`,',
    '  `${BASE_URL}/tools/fixed-step-prototype.js`',
    ']);',
    ''
  ].join('\n');

  source = replaceExactlyOnce(
    source,
    'const childProcesses = [];\n',
    constantsReplacement,
    'browser test URL constants'
  );

  const oldPrepareRun = [
    'async function prepareRun(client, mode, viewport = { width: 1280, height: 720 }) {',
    '  await navigate(client, `${BASE_URL}/index.html?browserQa=${Date.now()}#debug`, viewport);',
    "  if (mode === 'fixed') {",
    '    await injectScript(client, `${BASE_URL}/tools/fixed-step-clock.js`);',
    '    await injectScript(client, `${BASE_URL}/tools/fixed-step-prototype.js`);',
    '    await waitForExpression(client, `!!globalThis.__SEX_MAGICK_TIMING__`);',
    '  }',
    '  return evaluate(client, TEST_SETUP);',
    '}',
    ''
  ].join('\n');

  const newPrepareRun = [
    'async function prepareRun(client, mode, viewport = { width: 1280, height: 720 }) {',
    "  await client.send('Network.setBlockedURLs', {",
    "    urls: mode === 'baseline'",
    '      ? [...EXTERNAL_BLOCKED_URLS, ...FIXED_STEP_RUNTIME_URLS]',
    '      : EXTERNAL_BLOCKED_URLS',
    '  });',
    '',
    '  await navigate(client, `${BASE_URL}/index.html?browserQa=${Date.now()}#debug`, viewport);',
    '',
    '  if (mode === \'fixed\' && !(await evaluate(client, `!!globalThis.__SEX_MAGICK_TIMING__`))) {',
    '    await injectScript(client, `${BASE_URL}/tools/fixed-step-clock.js`);',
    '    await injectScript(client, `${BASE_URL}/tools/fixed-step-prototype.js`);',
    '  }',
    '',
    "  if (mode === 'fixed') {",
    '    await waitForExpression(client, `!!globalThis.__SEX_MAGICK_TIMING__`);',
    '  }',
    '',
    '  return evaluate(client, TEST_SETUP);',
    '}',
    ''
  ].join('\n');

  source = replaceExactlyOnce(source, oldPrepareRun, newPrepareRun, 'browser prepareRun');

  const oldBlockedUrls = [
    "  await client.send('Network.setBlockedURLs', {",
    '    urls: [',
    "      'https://cdn.tailwindcss.com/*',",
    "      'https://fonts.googleapis.com/*',",
    "      'https://fonts.gstatic.com/*',",
    "      'https://lh3.googleusercontent.com/*',",
    "      'https://cdn.jsdelivr.net/*',",
    "      'https://7l3mo9bh.api.lootlocker.io/*'",
    '    ]',
    '  });',
    ''
  ].join('\n');

  const newBlockedUrls = "  await client.send('Network.setBlockedURLs', { urls: EXTERNAL_BLOCKED_URLS });\n";
  source = replaceExactlyOnce(source, oldBlockedUrls, newBlockedUrls, 'browser initial blocked URLs');

  await writeFile(BROWSER_TEST_PATH, source);
  return true;
}

const indexChanged = await promoteIndex();
const browserTestChanged = await promoteBrowserTest();

console.log(JSON.stringify({ indexChanged, browserTestChanged }));
