import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4594);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const python = which('python3');
assert.ok(python, 'python3 is required for the M33 browser integration server');

const server = spawn(python, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

let browser;
try {
  await sleep(1200);
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 884, height: 1104 },
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  const pageErrors = [];
  const requestedUrls = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => requestedUrls.push(request.url()));

  // Deliberately omit gateSlice and renderDpr. M33 owns both product defaults.
  await page.goto(`http://127.0.0.1:${PORT}/index.html?assetMode=offline`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_PRODUCT_DEFAULTS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_GATE_SLICE__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MISSIONS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_POWERUPS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_BOARD__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS_PROGRESSION__), null, { timeout: 20000 });

  const boot = await page.evaluate(() => ({
    search: location.search,
    defaults: window.__SEX_MAGICK_PRODUCT_DEFAULTS__,
    productUi: window.__SEX_MAGICK_PRODUCT_UI__ || null,
    gate: Boolean(window.__SEX_MAGICK_GATE_SLICE__),
    gatePreflight: Boolean(window.__SEX_MAGICK_GATE_PREFLIGHT__),
    missions: Boolean(window.__SEX_MAGICK_MISSIONS__),
    powerups: Boolean(window.__SEX_MAGICK_POWERUPS__),
    riteBoard: Boolean(window.__SEX_MAGICK_RITE_BOARD__),
    monas: Boolean(window.__SEX_MAGICK_MONAS__),
    monasProgression: Boolean(window.__SEX_MAGICK_MONAS_PROGRESSION__),
    boardTitle: document.querySelector('.leaderboard-title')?.textContent?.trim() || '',
    boardText: document.getElementById('leaderboardList')?.textContent?.trim() || '',
    manifest: document.getElementById('sex-magick-product-manifest')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    effectiveDpr: Number(document.getElementById('gameCanvas')?.dataset?.smEffectiveDpr || 0),
    legacyTestHidden: (() => {
      const button = Array.from(document.querySelectorAll('button')).find(node => node.getAttribute('onclick')?.includes('testLeaderboardConnection'));
      return Boolean(button?.hidden);
    })()
  }));

  const params = new URLSearchParams(boot.search);
  assert.equal(params.get('gateSlice'), '1', 'normal product URL must activate the complete HEX stack');
  assert.equal(params.get('renderDpr'), '2', 'Fold-open high-DPR session must default to 2x rendering');
  assert.equal(boot.effectiveDpr, 2, 'canvas backing must actually use the M33 Fold-open 2x policy');
  assert.equal(boot.gate, true);
  assert.equal(boot.gatePreflight, true);
  assert.equal(boot.missions, true);
  assert.equal(boot.powerups, true);
  assert.equal(boot.riteBoard, true);
  assert.equal(boot.monas, true);
  assert.equal(boot.monasProgression, true);
  assert.match(boot.boardTitle, /RITE BOARD/);
  assert.match(boot.manifest, /HEX.*GATE.*GNOSIS.*MISSIONS.*POWER/i);
  assert.match(boot.manifest, /MONAS.*HOLD.*COHERENCE.*WARP/i);
  assert.equal(boot.legacyTestHidden, true, 'obsolete network leaderboard test control must not be product-facing');
  assert.equal(requestedUrls.some(url => /lootlocker\.io/i.test(url)), false, 'normal M33 product bootstrap must remain local-only before play');

  const hex = await page.evaluate(() => {
    document.getElementById('startHexBtn').click();
    return {
      rite: game.gameMode,
      state: String(game.state),
      gateState: Boolean(game.gateSliceState),
      missions: window.__SEX_MAGICK_MISSIONS__?.getActive?.().length || 0,
      powerups: window.__SEX_MAGICK_POWERUPS__?.getPowerups?.().length || 0,
      missionHudHidden: Boolean(document.getElementById('sex-magick-missions')?.hidden)
    };
  });
  assert.equal(hex.rite, 'HEX');
  assert.notEqual(hex.state, 'START');
  assert.equal(hex.gateState, true, 'ordinary HEX start must now create Gate/Gnosis state');
  assert.equal(hex.missions, 3, 'three persistent missions must be active on the ordinary product path');
  assert.ok(hex.powerups >= 2, 'power-up ladder must be installed on the ordinary product path');
  assert.equal(hex.missionHudHidden, false, 'mission HUD must surface during normal HEX play');

  await page.evaluate(() => game.returnToMenu());
  const monas = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    return {
      rite: game.gameMode,
      state: String(game.state),
      monasState: Boolean(game.monasState),
      gateState: Boolean(game.gateSliceState),
      progression: window.__SEX_MAGICK_MONAS_PROGRESSION__?.getSnapshot?.() || null
    };
  });
  assert.equal(monas.rite, 'MONAS');
  assert.notEqual(monas.state, 'START');
  assert.equal(monas.monasState, true);
  assert.equal(monas.gateState, false, 'MONAS remains its own rite even though full HEX is now the product default');
  assert.equal(Boolean(monas.progression), true);
  assert.equal(monas.progression.gateResidue, false);

  assert.deepEqual(pageErrors, [], `M33 product-integration page errors: ${pageErrors.join(', ')}`);
  console.log(JSON.stringify({ boot, hex, monas }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
