// M30/M33 integration truth: enhanced MONAS must exist on the ordinary game URL,
// and M33 intentionally promotes the completed Gate/HEX stack to that same normal
// product path. MONAS must still start as its own rite with no Gate residue.
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
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  // Intentionally omit gateSlice/renderDpr: M33 supplies product defaults before
  // the existing parser-ordered Gate/canvas bootstraps inspect location.search.
  await page.goto(`http://127.0.0.1:${PORT}/index.html?assetMode=offline`, {
    waitUntil: 'domcontentloaded'
  });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_REACHABILITY_POLICY__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_GATE_SLICE__), null, { timeout: 20000 });
  // And the progression runtime, which the residue assertion below reads through.
  // It installs on a 50ms poll that waits for the MONAS runtime first, so on a
  // loaded machine the click can land before the global exists - `getSnapshot()`
  // is then undefined and the assertion reports a *timing* loss as Gate residue.
  // Seen failing only when the whole CI suite runs back to back, never alone,
  // which is the signature worth waiting on rather than retrying.
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS_PROGRESSION__), null, { timeout: 20000 });

  const boot = await page.evaluate(() => ({
    search: location.search,
    monasApi: Boolean(window.__SEX_MAGICK_MONAS__),
    monasModule: Boolean(window.SexMagickMonas),
    gateSliceModule: Boolean(window.SexMagickGateSlice),
    gatePreflight: Boolean(window.__SEX_MAGICK_GATE_PREFLIGHT__),
    monasButtonDisabled: Boolean(document.getElementById('startMonasBtn')?.disabled),
    monasButtonText: document.getElementById('startMonasBtn')?.textContent?.trim() || '',
    effectiveDpr: Number(document.getElementById('gameCanvas')?.dataset?.smEffectiveDpr || 0)
  }));

  const params = new URLSearchParams(boot.search);
  assert.equal(boot.monasApi, true, 'standard URL must install the enhanced MONAS runtime');
  assert.equal(boot.monasModule, true, 'standard URL must load the MONAS module');
  assert.equal(boot.gateSliceModule, true, 'M33 standard URL must enable the completed HEX Gate stack');
  assert.equal(boot.gatePreflight, true, 'M33 standard URL must use Gate local-only preflight');
  assert.equal(params.get('gateSlice'), '1', 'product defaults must make Gate explicit before bootstrap');
  assert.equal(params.get('renderDpr'), '2', 'Fold-open product default must use 2x backing');
  assert.equal(boot.effectiveDpr, 2, 'Fold-open canvas must apply the 2x default');
  assert.equal(boot.monasButtonDisabled, false, 'MONAS must remain playable on the standard URL');
  assert.doesNotMatch(boot.monasButtonText, /SEALED/, 'MONAS must not read SEALED');

  const started = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    return {
      gameMode: game.gameMode,
      state: String(game.state),
      hasMonasState: Boolean(game.monasState),
      hasGateSliceState: Boolean(game.gateSliceState),
      playerMode: game.player?.mode ?? null,
      gateResidue: window.__SEX_MAGICK_MONAS_PROGRESSION__?.getSnapshot?.()?.gateResidue ?? null
    };
  });

  assert.equal(started.gameMode, 'MONAS');
  assert.notEqual(started.state, 'START');
  assert.equal(started.hasMonasState, true, 'normal MONAS start must create Monas state');
  assert.equal(started.hasGateSliceState, false, 'MONAS start must clear HEX Gate state even on the full product path');
  assert.equal(started.playerMode, 'MONAS');
  assert.equal(started.gateResidue, false, 'M32 progression must leave no Gate residue in MONAS');

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
