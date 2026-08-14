// M30 integration truth: enhanced MONAS must exist on the ordinary game URL.
//
// The M27-M29 MONAS browser suite always opened `?gateSlice=1`, which meant it
// could not detect that monas-runtime.js was itself loaded only from the
// gate-slice bootstrap. This test deliberately omits that flag. It proves the
// second Rite is a real part of the normal build while the HEX Gate slice remains
// separately opt-in.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4592);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const python = which('python3');
assert.ok(python, 'python3 is required for the browser integration server');

const server = spawn(python, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

let browser;
try {
  await sleep(1500);
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 884, height: 1104 },
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  // Intentionally NO gateSlice=1.
  await page.goto(`http://127.0.0.1:${PORT}/index.html?assetMode=offline`, {
    waitUntil: 'domcontentloaded'
  });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_REACHABILITY_POLICY__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS__), null, { timeout: 20000 });

  const boot = await page.evaluate(() => ({
    monasApi: Boolean(window.__SEX_MAGICK_MONAS__),
    monasModule: Boolean(window.SexMagickMonas),
    gateSliceModule: Boolean(window.SexMagickGateSlice),
    gatePreflight: Boolean(window.__SEX_MAGICK_GATE_PREFLIGHT__),
    monasButtonDisabled: Boolean(document.getElementById('startMonasBtn')?.disabled),
    monasButtonText: document.getElementById('startMonasBtn')?.textContent?.trim() || ''
  }));

  assert.equal(boot.monasApi, true, 'standard URL must install the enhanced MONAS runtime');
  assert.equal(boot.monasModule, true, 'standard URL must load the MONAS module');
  assert.equal(boot.gateSliceModule, false, 'standard URL must not silently enable the HEX Gate slice');
  assert.equal(boot.gatePreflight, false, 'standard URL must not enter Gate local-only preflight');
  assert.equal(boot.monasButtonDisabled, false, 'MONAS must be playable on the standard URL');
  assert.doesNotMatch(boot.monasButtonText, /SEALED/, 'MONAS must not read SEALED');

  const started = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    return {
      gameMode: game.gameMode,
      state: String(game.state),
      hasMonasState: Boolean(game.monasState),
      hasGateSliceState: Boolean(game.gateSliceState),
      playerMode: game.player?.mode ?? null
    };
  });

  assert.equal(started.gameMode, 'MONAS');
  assert.notEqual(started.state, 'START');
  assert.equal(started.hasMonasState, true, 'normal MONAS start must create Monas state');
  assert.equal(started.hasGateSliceState, false, 'normal MONAS start must not create HEX Gate state');
  assert.equal(started.playerMode, 'MONAS');

  const movement = await page.evaluate(() => {
    const monas = window.__SEX_MAGICK_MONAS__;
    game.player.y = 500;
    game.player.vy = 0;

    game.player.jump();
    const vyAfterTap = game.player.vy;

    monas.setHeldForTest(true);
    const heldStartY = game.player.y;
    for (let frame = 0; frame < 30; frame += 1) game.player.update();
    const heldEndY = game.player.y;

    game.player.y = 500;
    game.player.vy = 0;
    monas.setHeldForTest(false);
    const releasedStartY = game.player.y;
    for (let frame = 0; frame < 30; frame += 1) game.player.update();
    const releasedEndY = game.player.y;

    return { vyAfterTap, heldStartY, heldEndY, releasedStartY, releasedEndY };
  });

  assert.equal(movement.vyAfterTap, 0, 'tap-to-flap kick must remain disabled in MONAS');
  assert.ok(movement.heldEndY < movement.heldStartY, 'holding must raise MONAS on the standard URL');
  assert.ok(movement.releasedEndY > movement.releasedStartY, 'releasing must lower MONAS on the standard URL');
  assert.deepEqual(pageErrors, [], `standard-entry page errors: ${pageErrors.join(', ')}`);

  console.log(JSON.stringify({ boot, started, movement }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
