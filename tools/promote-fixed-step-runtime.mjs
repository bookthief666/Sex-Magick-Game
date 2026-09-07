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

function addIntegratedRuntimeABSupport(source) {
  if (source.includes('const EXTERNAL_BLOCKED_URLS = Object.freeze')) return source;

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

  return replaceExactlyOnce(
    source,
    oldBlockedUrls,
    "  await client.send('Network.setBlockedURLs', { urls: EXTERNAL_BLOCKED_URLS });\n",
    'browser initial blocked URLs'
  );
}

function hardenBrowserCleanup(source) {
  if (source.includes('async function removeChromeProfile')) return source;

  const helper = [
    'async function removeChromeProfile(targetPath) {',
    '  const retryableCodes = new Set([\'ENOTEMPTY\', \'EBUSY\', \'EPERM\']);',
    '  for (let attempt = 1; attempt <= 6; attempt += 1) {',
    '    try {',
    '      await rm(targetPath, { recursive: true, force: true });',
    '      return;',
    '    } catch (error) {',
    '      if (!retryableCodes.has(error.code)) throw error;',
    '      if (attempt === 6) {',
    '        console.warn(`Chrome profile cleanup skipped after ${attempt} attempts: ${error.message}`);',
    '        return;',
    '      }',
    '      await sleep(attempt * 100);',
    '    }',
    '  }',
    '}',
    ''
  ].join('\n');

  source = replaceExactlyOnce(
    source,
    'function findCommand(candidates) {',
    `${helper}function findCommand(candidates) {`,
    'browser cleanup helper insertion'
  );

  return replaceExactlyOnce(
    source,
    '    await rm(userDataDir, { recursive: true, force: true });',
    '    await removeChromeProfile(userDataDir);',
    'browser profile cleanup call'
  );
}

function stabilizeTimingFixture(source) {
  if (source.includes('CONFIG.ORB_SPAWN_CHANCE = 0;')) return source;

  const oldFixture = [
    '    game.settings.music = false;',
    '    game.settings.sfx = false;',
    '    game.settings.vibration = false;',
    "    game.gameMode = 'HEX';",
    '    game.startGame();'
  ].join('\n');

  const newFixture = [
    '    // Remove random Orb collection and its hit-stop from the timing fixture.',
    '    // Orb behavior is tested separately; this run isolates loop, gates, and obstacles.',
    '    CONFIG.ORB_SPAWN_CHANCE = 0;',
    '    game.settings.music = false;',
    '    game.settings.sfx = false;',
    '    game.settings.vibration = false;',
    "    game.gameMode = 'HEX';",
    '    game.startGame();'
  ].join('\n');

  return replaceExactlyOnce(source, oldFixture, newFixture, 'deterministic timing fixture');
}

async function promoteBrowserTest() {
  const original = await readFile(BROWSER_TEST_PATH, 'utf8');
  let source = addIntegratedRuntimeABSupport(original);
  source = hardenBrowserCleanup(source);
  source = stabilizeTimingFixture(source);
  if (source === original) return false;
  await writeFile(BROWSER_TEST_PATH, source);
  return true;
}

const indexChanged = await promoteIndex();
const browserTestChanged = await promoteBrowserTest();

console.log(JSON.stringify({ indexChanged, browserTestChanged }));
