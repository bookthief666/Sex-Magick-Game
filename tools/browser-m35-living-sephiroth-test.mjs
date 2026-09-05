import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4597);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const FOLD_UA = 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36';

function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const python = which('python3') || which('python');
assert.ok(python, 'python is required for the M35 browser integration server');

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

  await page.goto(`${BASE}/index.html?assetMode=offline`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_PRODUCT_DEFAULTS__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITUAL_ASCENT__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_M35_BOOTSTRAP__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_SEPHIRAH_IDENTITY__), null, { timeout: 20000 });
  await page.waitForFunction(() => (
    typeof game !== 'undefined' &&
    Boolean(game) &&
    Boolean(document.getElementById('menuButtons')) &&
    !document.getElementById('menuButtons').classList.contains('hidden')
  ), null, { timeout: 20000 });

  const boot = await page.evaluate(() => ({
    search: location.search,
    bootstrapMode: window.__SEX_MAGICK_M35_BOOTSTRAP__?.mode,
    bootstrapVersion: window.__SEX_MAGICK_M35_BOOTSTRAP__?.version,
    lifecycle: window.__SEX_MAGICK_M35_BOOTSTRAP__?.lifecycle,
    identityMode: window.__SEX_MAGICK_SEPHIRAH_IDENTITY__?.mode,
    bootstrapSrc: document.getElementById('sex-magick-living-sephiroth-bootstrap')?.getAttribute('src') || '',
    identitySrc: document.getElementById('sex-magick-sephirah-identity-runtime')?.getAttribute('src') || '',
    profileErrors: window.SexMagickSephirahIdentity.validateProfiles(window.SexMagickGateSlice.BANDS),
    bandOrder: window.SexMagickSephirahIdentity.BAND_ORDER,
    gateOrder: window.SexMagickGateSlice.BANDS.map(band => band.name),
    baselineParticle: typeof game !== 'undefined' && game?.backgroundParticles?.[0]
      ? { speed: game.backgroundParticles[0].speed, opacity: game.backgroundParticles[0].opacity, size: game.backgroundParticles[0].size }
      : null
  }));

  const params = new URLSearchParams(boot.search);
  assert.equal(params.get('gateSlice'), '1');
  assert.equal(params.get('renderDpr'), '2');
  assert.equal(boot.bootstrapMode, 'm35-living-sephiroth-bootstrap');
  assert.equal(boot.bootstrapVersion, 2);
  assert.equal(boot.lifecycle, 'event-driven', 'M35 must not poll continuously during play');
  assert.equal(boot.identityMode, 'm35-living-sephiroth');
  assert.equal(boot.bootstrapSrc, 'tools/sephirah-identity-bootstrap.js');
  assert.equal(boot.identitySrc, 'tools/sephirah-identity-runtime.js');
  assert.deepEqual(boot.profileErrors, []);
  assert.deepEqual(boot.bandOrder, boot.gateOrder);
  assert.ok(boot.baselineParticle && boot.baselineParticle.speed > 0);

  // The identity application is synchronous with the real startGame path, which
  // keeps WebAudio creation inside the user's start gesture on mobile browsers.
  await page.evaluate(() => document.getElementById('startHexBtn').click());
  await page.waitForFunction(() => document.documentElement.dataset.sephirah === 'MALKUTH', null, { timeout: 10000 });
  // The current game deliberately separates rite selection from the actual run
  // start. Release that ready state through the same deterministic gameplay input
  // seam before exercising pause/resume below.
  await page.evaluate(() => game.playerJump());

  const malkuth = await page.evaluate(() => ({
    snapshot: window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot(),
    particle: {
      speed: game.backgroundParticles[0].speed,
      opacity: game.backgroundParticles[0].opacity,
      size: game.backgroundParticles[0].size,
      color: game.backgroundParticles[0].color,
      shape: game.backgroundParticles[0].shape
    },
    scanlineOpacity: document.querySelector('.scanlines')?.style.opacity || '',
    scanlineSize: document.querySelector('.scanlines')?.style.backgroundSize || '',
    vignetteOpacity: document.querySelector('.vignette')?.style.opacity || ''
  }));
  assert.equal(malkuth.snapshot.active, true);
  assert.equal(malkuth.snapshot.band, 'MALKUTH');
  assert.equal(malkuth.snapshot.datasetBand, 'MALKUTH');
  assert.equal(Number(malkuth.scanlineOpacity), 0.52);
  assert.equal(malkuth.scanlineSize, '100% 4px');
  assert.equal(Number(malkuth.vignetteOpacity), 0.86);
  assert.ok(Math.abs((malkuth.particle.speed / boot.baselineParticle.speed) - 0.62) < 0.001);
  assert.ok(['#8a6747', '#b08a62', '#66503a'].includes(malkuth.particle.color));

  // STILLNESS must constrain M35's extra atmospheric movement immediately and be
  // reversible without waiting for another band transition.
  const reduced = await page.evaluate(() => {
    const toggle = document.getElementById('reducedMotionToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      access: window.__SEX_MAGICK_COLLISION__.getAccessibility(),
      maxSpeed: Math.max(...game.backgroundParticles.map(p => p.speed)),
      maxOpacity: Math.max(...game.backgroundParticles.map(p => p.opacity)),
      band: document.documentElement.dataset.sephirah || null
    };
  });
  assert.equal(reduced.access.reducedMotion, true);
  assert.ok(reduced.maxSpeed <= 0.080001, 'reduced motion caps M35 ambient travel');
  assert.ok(reduced.maxOpacity <= 0.180001, 'reduced motion caps M35 ambient density');
  assert.equal(reduced.band, 'MALKUTH');

  const restoredMotion = await page.evaluate(() => {
    const toggle = document.getElementById('reducedMotionToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      access: window.__SEX_MAGICK_COLLISION__.getAccessibility(),
      speed: game.backgroundParticles[0].speed,
      band: document.documentElement.dataset.sephirah || null
    };
  });
  assert.equal(restoredMotion.access.reducedMotion, false);
  assert.equal(restoredMotion.band, 'MALKUTH');
  assert.ok(Math.abs((restoredMotion.speed / boot.baselineParticle.speed) - 0.62) < 0.001, 'leaving STILLNESS restores authored band motion from baseline');

  // Derived from the ladder, not pinned to it. D-067 re-spaced the bands and
  // this literal (6) silently stopped reaching YESOD, so the wait timed out
  // rather than reporting a wrong band - the same brittleness that milestone
  // fixed in four other suites.
  await page.evaluate(() => {
    const bands = window.SexMagickGateSlice.BANDS;
    game.gateSliceState.gatesCleared = bands.find(band => band.name === 'YESOD').gateThreshold;
    game.checkLevel();
  });
  await page.waitForFunction(() => document.documentElement.dataset.sephirah === 'YESOD');
  const yesod = await page.evaluate(() => ({
    snapshot: window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot(),
    ascent: window.__SEX_MAGICK_RITUAL_ASCENT__.getSnapshot(),
    scanlineOpacity: document.querySelector('.scanlines')?.style.opacity || '',
    vignetteOpacity: document.querySelector('.vignette')?.style.opacity || ''
  }));
  assert.equal(yesod.snapshot.band, 'YESOD');
  assert.equal(yesod.ascent.band.name, 'YESOD');
  assert.equal(yesod.snapshot.audio.rootHz, 61.74);
  assert.equal(Number(yesod.scanlineOpacity), 0.28);
  assert.equal(Number(yesod.vignetteOpacity), 0.68);

  // Derived from the ladder, not pinned to it. D-067 re-spaced the bands and
  // this literal (32) silently stopped reaching GEBURAH, so the wait timed out
  // rather than reporting a wrong band - the same brittleness that milestone
  // fixed in four other suites.
  await page.evaluate(() => {
    const bands = window.SexMagickGateSlice.BANDS;
    game.gateSliceState.gatesCleared = bands.find(band => band.name === 'GEBURAH').gateThreshold;
    game.checkLevel();
  });
  await page.waitForFunction(() => document.documentElement.dataset.sephirah === 'GEBURAH');
  const geburah = await page.evaluate(() => window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot());
  assert.equal(geburah.band, 'GEBURAH');
  assert.equal(geburah.profile.temperament, 'martial / cut / pressure');
  assert.ok(geburah.profile.visual.particleSpeed > 1);

  // Derived from the ladder, not pinned to it. D-067 re-spaced the bands and
  // this literal (120) silently stopped reaching KETHER, so the wait timed out
  // rather than reporting a wrong band - the same brittleness that milestone
  // fixed in four other suites.
  await page.evaluate(() => {
    const bands = window.SexMagickGateSlice.BANDS;
    game.gateSliceState.gatesCleared = bands.find(band => band.name === 'KETHER').gateThreshold;
    game.checkLevel();
  });
  await page.waitForFunction(() => document.documentElement.dataset.sephirah === 'KETHER');
  const kether = await page.evaluate(() => {
    // Same race the resume step below already documents, and it belongs here too:
    // at KETHER the run is at terminal speed in a narrow corridor with nobody
    // flying it, so the player can die between the band change and this read. A
    // dead run makes `sync` report inactive, and the suite then fails on
    // `snapshot.band === null` - a timing loss wearing the costume of M35 failing
    // to apply its band. Clearing the field and re-centring is what the resume
    // step does for exactly this reason; nothing under test is weakened, because
    // the identity is derived from `gateSliceState`, which is untouched.
    game.obstacles.length = 0;
    game.player.y = game.canvas.height / 2;
    game.player.vy = 0;
    return {
      snapshot: window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot(),
      scanlineOpacity: document.querySelector('.scanlines')?.style.opacity || '',
      vignetteOpacity: document.querySelector('.vignette')?.style.opacity || '',
      particleOpacity: game.backgroundParticles[0].opacity
    };
  });
  assert.equal(kether.snapshot.band, 'KETHER');
  assert.equal(kether.snapshot.audio.rootHz, 110);
  assert.equal(Number(kether.scanlineOpacity), 0.07);
  assert.equal(Number(kether.vignetteOpacity), 0.26);
  assert.ok(kether.particleOpacity < malkuth.particle.opacity, 'KETHER must visibly shed atmospheric noise');

  // Pausing follows the base game's audio lifecycle: M35 retreats while the game
  // is suspended, then reconstructs KETHER from the unchanged Gate state on resume.
  const paused = await page.evaluate(() => {
    // And again before the pause: the frames between the read above and this call
    // are still live, still at KETHER speed, and still unflown.
    game.obstacles.length = 0;
    game.player.y = game.canvas.height / 2;
    game.player.vy = 0;
    game.togglePause();
    return {
      state: game.state,
      snapshot: window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot(),
      band: document.documentElement.dataset.sephirah || null
    };
  });
  assert.equal(paused.state, 'paused');
  assert.equal(paused.snapshot.active, false);
  assert.equal(paused.band, null);

  const resumed = await page.evaluate(() => {
    // Clear the field and re-centre before resuming. At KETHER the run is at
    // terminal speed in a 110px corridor with nobody flying it, so a resumed frame
    // can kill the player between `togglePause()` and the read below - which makes
    // this assertion a coin flip that reports a *timing* loss as M35 failing to
    // reconstruct its band. Observed failing in CI on a commit that touched no
    // gameplay at all, which is how it was identified as a race rather than a
    // regression. Nothing here weakens what is under test: the snapshot and the
    // band attribute are rebuilt from `gateSliceState`, which is untouched.
    game.obstacles.length = 0;
    game.player.y = game.canvas.height / 2;
    game.player.vy = 0;
    game.togglePause();
    return {
      state: game.state,
      snapshot: window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot(),
      band: document.documentElement.dataset.sephirah || null
    };
  });
  assert.equal(resumed.state, 'playing');
  assert.equal(resumed.snapshot.active, true);
  assert.equal(resumed.snapshot.band, 'KETHER');
  assert.equal(resumed.band, 'KETHER');

  // M35 must retreat completely when the player changes rites. MONAS owns its own
  // gold/coherence/warp visual grammar and should not inherit the HEX Tree veil.
  await page.evaluate(() => {
    game.returnToMenu();
    document.getElementById('startMonasBtn').click();
  });
  await page.waitForFunction(() => game?.gameMode === 'MONAS' && !document.documentElement.dataset.sephirah);
  const monas = await page.evaluate(() => ({
    snapshot: window.__SEX_MAGICK_M35_BOOTSTRAP__.getSnapshot(),
    rite: game.gameMode,
    gateState: Boolean(game.gateSliceState),
    monasState: Boolean(game.monasState),
    datasetBand: document.documentElement.dataset.sephirah || null,
    scanlineInline: document.querySelector('.scanlines')?.style.opacity || '',
    vignetteInline: document.querySelector('.vignette')?.style.opacity || ''
  }));
  assert.equal(monas.rite, 'MONAS');
  assert.equal(monas.gateState, false);
  assert.equal(monas.monasState, true);
  assert.equal(monas.snapshot.active, false);
  assert.equal(monas.datasetBand, null);
  assert.equal(monas.scanlineInline, '');
  assert.equal(monas.vignetteInline, '');

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(', ')}`);
  assert.equal(requests.some(url => /lootlocker\.io/i.test(url)), false, 'M35 must not create leaderboard traffic');
  await context.close();

  // Deterministic visual QA remains isolated until the replacement tolerance-based
  // visual net is deliberately established. M35 must not silently mutate it.
  const qaContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const qaPage = await qaContext.newPage();
  const qaRequests = [];
  qaPage.on('request', request => qaRequests.push(request.url()));
  await qaPage.goto(`${BASE}/index.html?visualQa=1`, { waitUntil: 'domcontentloaded' });
  await sleep(900);
  assert.equal(qaRequests.some(url => url.endsWith('/tools/sephirah-identity-bootstrap.js')), false);
  assert.equal(qaRequests.some(url => url.endsWith('/tools/sephirah-identity-runtime.js')), false);
  await qaContext.close();

  console.log(JSON.stringify({ boot, malkuth, reduced, restoredMotion, yesod, geburah, kether, paused, resumed, monas }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}