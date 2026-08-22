import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4596);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const FOLD_UA = 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36';

function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const python = which('python3') || which('python');
assert.ok(python, 'python is required for the M34 browser integration server');

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
    userAgent: FOLD_UA
  });
  const page = await context.newPage();
  const pageErrors = [];
  const requests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => requests.push(request.url()));

  // Normal product URL: M33 owns Gate + Fold DPR defaults. assetMode=offline only
  // removes external artwork variability; it does not disable product runtimes.
  await page.goto(`${BASE}/index.html?assetMode=offline`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_PRODUCT_DEFAULTS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_GATE_SLICE__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MISSIONS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITUAL_ASCENT__), null, { timeout: 20000 });
  // `game` is a top-level lexical binding in index.html, not a window property.
  // Match the established suites and wait on that actual singleton plus the real
  // menu reveal before starting a rite.
  await page.waitForFunction(() => (
    typeof game !== 'undefined' &&
    Boolean(game) &&
    Boolean(document.getElementById('menuButtons')) &&
    !document.getElementById('menuButtons').classList.contains('hidden')
  ), null, { timeout: 20000 });

  const boot = await page.evaluate(() => ({
    search: location.search,
    mode: window.__SEX_MAGICK_RITUAL_ASCENT__?.mode,
    ascentScript: document.getElementById('sex-magick-ritual-ascent-script')?.getAttribute('src') || '',
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    snapshot: window.__SEX_MAGICK_RITUAL_ASCENT__?.getSnapshot?.() || null
  }));
  const params = new URLSearchParams(boot.search);
  assert.equal(params.get('gateSlice'), '1', 'normal product URL must retain the complete HEX stack');
  assert.equal(params.get('renderDpr'), '2', 'Fold-open must retain M33 2x policy');
  assert.equal(boot.mode, 'm34-ritual-ascent-game-feel');
  assert.equal(boot.ascentScript, 'tools/ritual-ascent-runtime.js');
  assert.equal(boot.horizontalOverflow, false);
  assert.equal(boot.snapshot.active, false, 'ritual ascent is not visible on the menu');

  // This suite validates state integration, not pointer hit-testing. The menu has
  // continuous visual motion, so use the direct DOM click pattern used by M33.
  await page.evaluate(() => document.getElementById('startHexBtn').click());
  await page.waitForFunction(() => (
    typeof game !== 'undefined' && game?.gameMode === 'HEX' && Boolean(game?.gateSliceState)
  ));
  await page.waitForFunction(() => window.__SEX_MAGICK_RITUAL_ASCENT__?.getSnapshot?.()?.active === true);

  const initial = await page.evaluate(() => {
    window.__SEX_MAGICK_RITUAL_ASCENT__.refresh();
    const snapshot = window.__SEX_MAGICK_RITUAL_ASCENT__.getSnapshot();
    return {
      snapshot,
      meaning: document.getElementById('sex-magick-ascent-meaning')?.textContent || '',
      next: document.getElementById('sex-magick-ascent-next')?.textContent || '',
      bannerName: document.getElementById('sex-magick-ascent-name')?.textContent || '',
      bannerSubtitle: document.getElementById('sex-magick-ascent-subtitle')?.textContent || '',
      rowHidden: document.getElementById('sex-magick-ascent-row')?.hidden,
      bannerHidden: document.getElementById('sex-magick-ascent-banner')?.hidden,
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  });
  // Derived, not hardcoded. D-067 re-spaced the HEX ladder and YESOD's threshold
  // moved from 6 to 9; this assertion still said 6, which is the sixth test in
  // three milestones found encoding the old spacing as a literal (see D-070 and
  // D-071 for the previous two). A band threshold is data, and a test that copies
  // it fails the next time the curve is tuned - reporting a spacing change as a
  // broken ascent banner, which points away from the actual cause.
  const yesodThreshold = await page.evaluate(() => {
    const bands = window.SexMagickGateSlice?.BANDS || [];
    const yesod = bands.find(band => String(band.name).toUpperCase() === 'YESOD');
    return yesod ? yesod.gateThreshold : null;
  });
  assert.ok(Number.isFinite(yesodThreshold) && yesodThreshold > 0,
    'YESOD must have a real threshold to derive from');

  assert.equal(initial.snapshot.band.name, 'MALKUTH');
  assert.equal(initial.snapshot.band.meaning, 'KINGDOM');
  assert.equal(initial.snapshot.progress.nextName, 'YESOD');
  assert.equal(initial.snapshot.progress.gatesToNext, yesodThreshold);
  assert.equal(initial.meaning, 'KINGDOM');
  assert.equal(initial.next, `YESOD · ${yesodThreshold} GATES`);
  assert.equal(initial.bannerName, 'MALKUTH');
  assert.equal(initial.bannerSubtitle, 'KINGDOM');
  assert.equal(initial.rowHidden, false);
  assert.equal(initial.overflow, false);

  const gateOffer = await page.evaluate(() => {
    window.__SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
    window.__SEX_MAGICK_GATE_SLICE__.spawnGateNow();
    window.__SEX_MAGICK_RITUAL_ASCENT__.refresh();
    return document.getElementById('gate-slice-telegraph')?.textContent || '';
  });
  assert.match(gateOffer, /GATE OPEN/);
  assert.match(gateOffer, /ENTER → VOID ×10/);
  assert.match(gateOffer, /PASS → BANK ×3/);
  assert.doesNotMatch(gateOffer, /WAGER/i, 'Gate offer must describe the real skill/risk choice rather than legacy wager copy');

  const missionCopy = await page.evaluate(() => {
    const node = document.querySelector('.sm-mission-name');
    if (!node) throw new Error('mission HUD did not render');
    node.textContent = 'ACCEPT THE WAGER';
    window.__SEX_MAGICK_RITUAL_ASCENT__.rewriteVisibleCopy();
    return node.textContent;
  });
  assert.equal(missionCopy, 'ENTER THE GATE');

  const yesod = await page.evaluate(() => {
    // Drive the real Gate progression entry point instead of directly setting the
    // displayed band. The M34 layer is an observer; it must follow product truth.
    // The gate count comes from the ladder rather than from a literal, for the
    // reason given above the YESOD threshold lookup.
    const bands = window.SexMagickGateSlice?.BANDS || [];
    const yesodBand = bands.find(band => String(band.name).toUpperCase() === 'YESOD');
    game.gateSliceState.gatesCleared = yesodBand.gateThreshold;
    game.checkLevel();
    window.__SEX_MAGICK_RITUAL_ASCENT__.refresh();
    const snapshot = window.__SEX_MAGICK_RITUAL_ASCENT__.getSnapshot();
    return {
      snapshot,
      meaning: document.getElementById('sex-magick-ascent-meaning')?.textContent || '',
      next: document.getElementById('sex-magick-ascent-next')?.textContent || '',
      bannerName: document.getElementById('sex-magick-ascent-name')?.textContent || '',
      bannerSubtitle: document.getElementById('sex-magick-ascent-subtitle')?.textContent || '',
      bannerHidden: document.getElementById('sex-magick-ascent-banner')?.hidden
    };
  });
  assert.equal(yesod.snapshot.band.name, 'YESOD');
  assert.equal(yesod.snapshot.band.meaning, 'FOUNDATION');
  const tipharethGap = await page.evaluate(() => {
    const bands = window.SexMagickGateSlice?.BANDS || [];
    const yesodBand = bands.find(band => String(band.name).toUpperCase() === 'YESOD');
    const tiphareth = bands.find(band => String(band.name).toUpperCase() === 'TIPHARETH');
    return tiphareth.gateThreshold - yesodBand.gateThreshold;
  });
  assert.ok(Number.isFinite(tipharethGap) && tipharethGap > 0, 'the ladder must actually step upward');
  assert.equal(yesod.snapshot.progress.nextName, 'TIPHARETH');
  assert.equal(yesod.snapshot.progress.gatesToNext, tipharethGap);
  assert.equal(yesod.meaning, 'FOUNDATION');
  assert.equal(yesod.next, `TIPHARETH · ${tipharethGap} GATES`);
  assert.equal(yesod.bannerName, 'YESOD');
  assert.equal(yesod.bannerSubtitle, 'FOUNDATION');
  assert.equal(yesod.bannerHidden, false, 'real band transition must raise the ceremonial ascent banner');

  const monas = await page.evaluate(() => {
    game.returnToMenu();
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_RITUAL_ASCENT__.refresh();
    return {
      rite: game.gameMode,
      monasState: Boolean(game.monasState),
      gateState: Boolean(game.gateSliceState),
      snapshot: window.__SEX_MAGICK_RITUAL_ASCENT__.getSnapshot(),
      rowHidden: document.getElementById('sex-magick-ascent-row')?.hidden,
      bannerHidden: document.getElementById('sex-magick-ascent-banner')?.hidden
    };
  });
  assert.equal(monas.rite, 'MONAS');
  assert.equal(monas.monasState, true);
  assert.equal(monas.gateState, false);
  assert.equal(monas.snapshot.active, false);
  assert.equal(monas.rowHidden, true);
  assert.equal(monas.bannerHidden, true);

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(', ')}`);
  assert.equal(
    requests.some(url => /lootlocker\.io/i.test(url)),
    false,
    'M34 product bootstrap must not create leaderboard network traffic'
  );

  await context.close();

  // Visual QA remains an isolated deterministic topology: M34 should not even
  // request its runtime there, rather than loading it and hoping it stays inert.
  const qaContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const qaPage = await qaContext.newPage();
  const qaRequests = [];
  qaPage.on('request', request => qaRequests.push(request.url()));
  await qaPage.goto(`${BASE}/index.html?visualQa=1`, { waitUntil: 'domcontentloaded' });
  await sleep(800);
  assert.equal(
    qaRequests.some(url => url.endsWith('/tools/ritual-ascent-runtime.js')),
    false,
    'visual QA must not load M34 player-facing presentation'
  );
  await qaContext.close();

  console.log(JSON.stringify({ boot, initial, gateOffer, missionCopy, yesod, monas }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
