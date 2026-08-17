// The Rite of Monas, in the real game loop.
//
// Every assertion drives the shipped path: the menu button, startGame(), the real
// Player.update() and updateGameObjects(), and the pillars the game spawns for
// itself. The unit suite covers the maths; this covers whether the maths is reached.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4591);
const children = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

children.push(spawn(which('python3'), ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' }));
await sleep(1500);

const browser = await chromium.launch();
const failures = [];
const report = {};

async function openGame(query = 'assetMode=offline&gateSlice=1') {
  const context = await browser.newContext({
    viewport: { width: 884, height: 1104 },
    // `isMobile` in index.html is user-agent based, and it is what turns off
    // shadowBlur via optimizedShadow. Without this override every draw-cost
    // measurement below takes the desktop glow path the owner's Fold 6 never
    // does - the exact mistake browser-m21-aesthetic-test.mjs made and fixed.
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS__), null, { timeout: 20000 });
  return { context, page, pageErrors };
}

// --- the rite is no longer sealed -------------------------------------------------

{
  const { context, page, pageErrors } = await openGame();
  const menu = await page.evaluate(() => {
    const button = document.getElementById('startMonasBtn');
    return { disabled: button.disabled, text: button.textContent.trim() };
  });

  // Start it the way a player does, through the button.
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

  report.menu = menu;
  report.started = started;
  try {
    assert.equal(menu.disabled, false, 'the MONAS button must be enabled');
    assert.doesNotMatch(menu.text, /SEALED/, 'and must no longer read SEALED');
    assert.equal(started.gameMode, 'MONAS', 'the button starts a MONAS run');
    assert.notEqual(started.state, 'START', 'and the run actually begins');
    assert.equal(started.hasMonasState, true, 'a MONAS run carries Monas state');
    assert.equal(started.hasGateSliceState, false, 'and no Gate slice state - the rites do not overlap');
    assert.equal(started.playerMode, 'MONAS', 'the avatar is the Monad');
    assert.deepEqual(pageErrors, [], `no page errors: ${pageErrors.join(', ')}`);
  } catch (error) {
    failures.push(`unsealing: ${error.message}`);
  }
  await context.close();
}

// --- hold to glide, in the real Player.update() -----------------------------------

{
  const { context, page } = await openGame();
  const flight = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    const monas = window.__SEX_MAGICK_MONAS__;

    function fly(held, frames) {
      monas.setHeldForTest(held);
      const startY = game.player.y;
      for (let frame = 0; frame < frames; frame += 1) game.player.update();
      return { startY, endY: game.player.y, vy: game.player.vy };
    }

    game.player.y = 500; game.player.vy = 0;
    const heldFlight = fly(true, 45);
    game.player.y = 500; game.player.vy = 0;
    const released = fly(false, 45);
    monas.setHeldForTest(false);
    return { heldFlight, released };
  });

  report.glide = flight;
  try {
    assert.ok(
      flight.heldFlight.endY < flight.heldFlight.startY,
      `holding must climb: ${flight.heldFlight.startY} -> ${flight.heldFlight.endY}`
    );
    assert.ok(
      flight.released.endY > flight.released.startY,
      `releasing must sink: ${flight.released.startY} -> ${flight.released.endY}`
    );
    assert.ok(flight.heldFlight.vy < 0, 'a held glyph carries upward velocity');
    assert.ok(flight.released.vy > 0, 'a released glyph carries downward velocity');
  } catch (error) {
    failures.push(`glide: ${error.message}`);
  }
  await context.close();
}

// --- no bounce: the tap-to-flap kick is a no-op in MONAS, only the hold moves it ---
//
// Before this, index.html's playerJump() (bound to click/touchstart/keydown Space,
// state-agnostic) and collision-runtime.js's dispatchPlayerJump both called
// Player.prototype.jump() unconditionally, landing a discrete vy=-7.2 kick plus its
// own SFX/haptic/particle burst on every tap - on top of the hold-driven glide added
// in M27. That discrete kick is the "bounce" this fixes: MONAS is a hold rite now,
// and jump() must do nothing for it, through every real call path.

{
  const { context, page } = await openGame();
  const noBounce = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    game.player.y = 500;
    game.player.vy = 0;
    const beforeDirectJump = game.player.vy;
    game.player.jump();
    const afterDirectJump = game.player.vy;

    game.player.vy = 0;
    game.state = GameState.PLAYING;
    game.playerJump();
    const afterPlayerJump = game.player.vy;

    game.player.vy = 0;
    const dispatched = window.SexMagickCollision
      ? window.SexMagickCollision.dispatchPlayerJump(game, 'playing')
      : null;
    const afterDispatch = game.player.vy;

    return { beforeDirectJump, afterDirectJump, afterPlayerJump, afterDispatch, dispatched };
  });

  report.noBounce = noBounce;
  try {
    assert.equal(noBounce.afterDirectJump, noBounce.beforeDirectJump, 'Player.jump() must not change vy in MONAS');
    assert.equal(noBounce.afterPlayerJump, 0, 'game.playerJump() (click/touch/keydown) must not kick vy in MONAS');
    assert.equal(noBounce.afterDispatch, 0, 'collision-runtime\'s dispatchPlayerJump must not kick vy in MONAS either');
  } catch (error) {
    failures.push(`no bounce: ${error.message}`);
  }
  await context.close();
}

// --- the avatar rises only while held, falls only while released, with a lag -------

{
  const { context, page } = await openGame();
  const pressRelease = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    const monas = window.__SEX_MAGICK_MONAS__;

    game.player.y = 500;
    game.player.vy = 0;
    monas.setHeldForTest(true);
    for (let frame = 0; frame < 20; frame += 1) game.player.update();
    const risenY = game.player.y;
    const vyWhileHeld = game.player.vy;

    monas.setHeldForTest(false);
    const vyOnRelease = [];
    for (let frame = 0; frame < 10; frame += 1) {
      game.player.update();
      vyOnRelease.push(game.player.vy);
    }
    monas.setHeldForTest(false);

    return { risenY, vyWhileHeld, vyOnRelease };
  });

  report.pressRelease = pressRelease;
  try {
    assert.ok(pressRelease.risenY < 500, 'holding must lift the avatar over real frames');
    assert.ok(pressRelease.vyWhileHeld < 0, 'vy must be upward while held');
    // The lag: fall velocity right after release must not jump straight to its
    // fully-ramped value - it must climb toward it over the next several frames.
    let increasing = true;
    for (let i = 1; i < pressRelease.vyOnRelease.length; i += 1) {
      if (pressRelease.vyOnRelease[i] < pressRelease.vyOnRelease[i - 1] - 1e-6) increasing = false;
    }
    assert.ok(increasing, `fall speed must ramp in rather than jump, got ${JSON.stringify(pressRelease.vyOnRelease)}`);
    assert.ok(
      pressRelease.vyOnRelease[0] < pressRelease.vyOnRelease[pressRelease.vyOnRelease.length - 1],
      'the first frame after release must fall slower than a few frames later'
    );
  } catch (error) {
    failures.push(`press/release: ${error.message}`);
  }
  await context.close();
}

// --- the continuous spin is gone; rot is frozen so only the velocity-based bank shows ---

{
  const { context, page } = await openGame();
  const spin = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);
    game.player.rot = 1.2345;
    game.player.update();
    return { rotAfter: game.player.rot };
  });

  report.spin = spin;
  try {
    assert.equal(spin.rotAfter, 0, `rot must be frozen at 0 for MONAS, got ${spin.rotAfter}`);
  } catch (error) {
    failures.push(`spin frozen: ${error.message}`);
  }
  await context.close();
}

// --- HEX's own tap-to-flap kick is untouched by the MONAS jump wrap ----------------

{
  const { context, page } = await openGame();
  const hexJump = await page.evaluate(() => {
    document.getElementById('startHexBtn').click();
    game.player.vy = 0;
    game.player.jump();
    return { vyAfterJump: game.player.vy };
  });

  report.hexJump = hexJump;
  try {
    assert.ok(hexJump.vyAfterJump < 0, `HEX's jump() must still kick vy upward, got ${hexJump.vyAfterJump}`);
  } catch (error) {
    failures.push(`hex jump untouched: ${error.message}`);
  }
  await context.close();
}

// --- Coherence is earned by the centre, through the real update loop ---------------

{
  const { context, page } = await openGame();
  const coherence = await page.evaluate(async () => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    // Drive the game's own update loop and steer the avatar onto the centre line of
    // whichever pillar is nearest, so the passes are real passes through real gates.
    function runCentred(frames) {
      for (let frame = 0; frame < frames; frame += 1) {
        const next = game.obstacles.find(pillar => !pillar.marked);
        if (next) game.player.y = next.top + (next.gap / 2);
        game.player.vy = 0;
        game.frames += 1;
        game.updateGameObjects();
      }
    }

    const before = { ...game.monasState };
    runCentred(900);
    return { before, after: { ...game.monasState } };
  });

  report.coherence = {
    gatesPassed: coherence.after.gatesPassed,
    perfectPasses: coherence.after.perfectPasses,
    surges: coherence.after.surges,
    bestCentred: coherence.after.bestCentred
  };
  try {
    assert.ok(coherence.after.gatesPassed > 0, 'centred flight passes real gates');
    assert.ok(coherence.after.perfectPasses > 0, 'and dead-centre passes are recognised');
    assert.ok(coherence.after.bestCentred > 0.99, 'the centre line scores as centred');
  } catch (error) {
    failures.push(`coherence: ${error.message}`);
  }
  await context.close();
}

// --- flying the edges earns nothing, which is the inversion of HEX ------------------

{
  const { context, page } = await openGame();
  const edges = await page.evaluate(async () => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);
    for (let frame = 0; frame < 900; frame += 1) {
      const next = game.obstacles.find(pillar => !pillar.marked);
      // Ride the very lip of the gap - the line HEX pays most for.
      if (next) game.player.y = next.top + 6;
      game.player.vy = 0;
      game.frames += 1;
      game.updateGameObjects();
    }
    return { ...game.monasState };
  });

  report.edgeFlying = { gatesPassed: edges.gatesPassed, coherence: edges.coherence, surges: edges.surges };
  try {
    assert.ok(edges.gatesPassed > 0, 'the edge run still passes gates');
    assert.ok(edges.coherence < 1, `but earns almost no Coherence, got ${edges.coherence}`);
    assert.equal(edges.surges, 0, 'and never opens a Warp Surge');
  } catch (error) {
    failures.push(`edge flying: ${error.message}`);
  }
  await context.close();
}

// --- the Warp Surge opens, streaks, and ends ----------------------------------------

{
  const { context, page } = await openGame();
  const surge = await page.evaluate(async () => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    let speedFiniteThroughout = true;
    let voidModeEverTrue = false;
    let sawWiderGap = null;
    let baselineGap = null;

    for (let frame = 0; frame < 2400; frame += 1) {
      const next = game.obstacles.find(pillar => !pillar.marked);
      if (next) game.player.y = next.top + (next.gap / 2);
      game.player.vy = 0;
      if (baselineGap === null && !game.monasState.surgeActive) baselineGap = game.getCurrentGap();
      game.frames += 1;
      game.updateGameObjects();
      if (!Number.isFinite(game.gameSpeed)) speedFiniteThroughout = false;
      // The surge must never touch voidMode - that flag is HEX's Void, and setting
      // it also arms occult-field-runtime's expensive vignette and paints its
      // reserved cyan, which is what the draw-cost and colour bugs below trace to.
      if (game.voidMode === true) voidModeEverTrue = true;
      if (game.monasState.surgeActive && sawWiderGap === null) sawWiderGap = game.getCurrentGap();
      if (game.monasState.surges > 0 && !game.monasState.surgeActive && sawWiderGap !== null) break;
    }

    // The streak speed itself, isolated from drawScene(): construct a star at a
    // known depth and step it once with the surge on and once with it off,
    // confirming WarpStar.prototype.update - not voidMode - is what moves it.
    const probeStill = new WarpStar();
    probeStill.z = 500;
    probeStill.update(game.gameSpeed * 0.05, false);
    const stillDelta = 500 - probeStill.z;

    const savedSurge = game.monasState.surgeActive;
    game.monasState.surgeActive = true;
    const probeSurging = new WarpStar();
    probeSurging.z = 500;
    probeSurging.update(game.gameSpeed * 0.05, false);
    const surgingDelta = 500 - probeSurging.z;
    game.monasState.surgeActive = savedSurge;

    return {
      surges: game.monasState.surges,
      surgeActive: game.monasState.surgeActive,
      baselineGap,
      surgeGap: sawWiderGap,
      speedFiniteThroughout,
      voidModeEverTrue,
      voidModeAfterSurge: game.voidMode,
      gameSpeedAfterSurge: game.gameSpeed,
      stillDelta,
      surgingDelta,
      hudText: document.getElementById('monas-status')?.textContent ?? null
    };
  });

  report.surge = surge;
  try {
    assert.ok(surge.surges > 0, 'sustained centred flight opens a Warp Surge');
    assert.ok(
      surge.surgeGap > surge.baselineGap,
      `the surge opens the corridor rather than closing it: ${surge.baselineGap} -> ${surge.surgeGap}`
    );
    assert.equal(surge.surgeActive, false, 'and the surge ends on its own');
    assert.equal(surge.speedFiniteThroughout, true, 'gameSpeed must stay finite for the whole run');
    assert.equal(Number.isFinite(surge.gameSpeedAfterSurge), true, 'and must still be finite afterwards');
    assert.equal(surge.voidModeEverTrue, false, 'the surge must never set voidMode - that flag belongs to HEX');
    assert.equal(surge.voidModeAfterSurge, false, 'and it stays untouched after the surge ends');
    assert.ok(
      surge.surgingDelta > surge.stillDelta * 5,
      `the surge must speed up the warp streak itself: still=${surge.stillDelta} surging=${surge.surgingDelta}`
    );
  } catch (error) {
    failures.push(`warp surge: ${error.message}`);
  }
  await context.close();
}

// --- HEX is untouched ----------------------------------------------------------------

{
  const { context, page } = await openGame();
  const hex = await page.evaluate(() => {
    document.getElementById('startHexBtn').click();
    const before = game.player.y;
    window.__SEX_MAGICK_MONAS__.setHeldForTest(true);
    for (let frame = 0; frame < 45; frame += 1) game.player.update();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);
    return {
      gameMode: game.gameMode,
      hasGateSliceState: Boolean(game.gateSliceState),
      hasMonasState: Boolean(game.monasState),
      fellWhileHeld: game.player.y > before,
      monasHudHidden: document.getElementById('monas-hud')?.hidden ?? null
    };
  });

  report.hex = hex;
  try {
    assert.equal(hex.gameMode, 'HEX');
    assert.equal(hex.hasGateSliceState, true, 'HEX still runs the Gate slice');
    assert.equal(hex.hasMonasState, false, 'and carries no Monas state');
    assert.equal(hex.fellWhileHeld, true, 'holding does not make HEX glide - it still falls and taps');
    assert.equal(hex.monasHudHidden, true, 'the Coherence meter stays out of HEX');
  } catch (error) {
    failures.push(`hex untouched: ${error.message}`);
  }
  await context.close();
}

// --- the backdrop actually rotates through a real run --------------------------
//
// M27 unsealed MONAS; M28 is what gives it a look of its own. Before this,
// currentLevelIdx was never assigned for a MONAS run, so the photo, the accent
// wash and the tunnel/warp-star colour were pinned to gameLevels[0] for the whole
// game. This drives real gates and asserts the pointer and the gallery both move.

{
  const { context, page, pageErrors } = await openGame();
  const drift = await page.evaluate(async () => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    const samples = [];
    function sample() {
      samples.push({
        levelIdx: game.currentLevelIdx,
        entryName: window.__SEX_MAGICK_MONAS__.getBackgroundEntry()?.name
          ?? window.__SEX_MAGICK_MONAS__.getBackgroundEntry()?.img?.src
          ?? window.__SEX_MAGICK_MONAS__.getBackgroundEntry()?.accent
          ?? null
      });
    }

    sample();
    for (let frame = 0; frame < 6000 && samples.length < 10; frame += 1) {
      const next = game.obstacles.find(pillar => !pillar.marked);
      if (next) game.player.y = next.top + (next.gap / 2);
      game.player.vy = 0;
      game.frames += 1;
      const gatesBefore = game.monasState.gatesPassed;
      game.updateGameObjects();
      // Sample once on the frame a gate is actually cleared, not on every frame the
      // count happens to sit on a multiple - gatesPassed can plateau at a multiple
      // of 4 for well over a hundred frames waiting for the next pillar, and a
      // level check re-armed every frame samples that one plateau ten times over.
      if (game.monasState.gatesPassed !== gatesBefore && game.monasState.gatesPassed % 4 === 0) sample();
    }
    return { samples, galleryInfo: window.__SEX_MAGICK_MONAS__.getGalleryInfo() };
  });

  report.backdrop = {
    distinctLevelIdx: new Set(drift.samples.map(s => s.levelIdx)).size,
    distinctEntries: new Set(drift.samples.map(s => s.entryName)).size,
    gallerySize: drift.galleryInfo.size,
    samples: drift.samples.length
  };
  try {
    assert.ok(drift.samples.length >= 4, 'a real run must clear enough gates to sample the drift');
    assert.ok(
      new Set(drift.samples.map(s => s.levelIdx)).size > 1,
      `currentLevelIdx must advance during a MONAS run, got constant ${drift.samples[0]?.levelIdx}`
    );
    assert.ok(
      new Set(drift.samples.map(s => s.entryName)).size > 1,
      'the background gallery entry must change during a MONAS run'
    );
    assert.ok(drift.galleryInfo.size > 1, 'MONAS must have its own multi-image gallery to rotate through');
    assert.deepEqual(pageErrors, [], `no page errors: ${pageErrors.join(', ')}`);
  } catch (error) {
    failures.push(`backdrop rotation: ${error.message}`);
  }
  await context.close();
}

// --- the photo change carries the original's whole level-up spectacle -----------
//
// The original bundled shake, a freeze frame, an RGB-split glitch and a particle
// burst into one moment, because score threshold and level index advanced
// together. M28 split MONAS's photo and colour onto independent beats, and in
// doing so this bundle was never given to either - the picture used to (and
// still, via HEX's band ascent) change with an earthquake and a glitch; here it
// changed in total silence. This drives real gates and asserts the burst fires
// on the exact frame the gallery photo itself advances.

{
  const { context, page } = await openGame();
  const spectacle = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    function entryKey() {
      const entry = window.__SEX_MAGICK_MONAS__.getBackgroundEntry();
      return entry?.name ?? entry?.img?.src ?? entry?.accent ?? null;
    }

    let previousEntry = entryKey();
    let sawChange = false;
    let shakeOnChange = null;
    let hitStopOnChange = null;
    let particlesBefore = 0;
    let particlesOnChange = null;
    let glitchActiveOnChange = null;

    for (let frame = 0; frame < 6000 && !sawChange; frame += 1) {
      const next = game.obstacles.find(pillar => !pillar.marked);
      if (next) game.player.y = next.top + (next.gap / 2);
      game.player.vy = 0;
      game.frames += 1;
      particlesBefore = game.particles.length;
      game.updateGameObjects();
      const currentEntry = entryKey();
      if (currentEntry !== previousEntry) {
        sawChange = true;
        shakeOnChange = game.shake;
        hitStopOnChange = game.hitStop;
        particlesOnChange = game.particles.length;
        glitchActiveOnChange = GlitchFX.active;
      }
      previousEntry = currentEntry;
    }

    return { sawChange, shakeOnChange, hitStopOnChange, particlesBefore, particlesOnChange, glitchActiveOnChange };
  });

  report.photoChangeSpectacle = spectacle;
  try {
    assert.ok(spectacle.sawChange, 'a real run must clear enough gates to see the photo change at least once');
    assert.ok(spectacle.shakeOnChange > 0, `the photo change must shake the screen, got ${spectacle.shakeOnChange}`);
    assert.ok(spectacle.hitStopOnChange > 0, `the photo change must freeze-frame briefly, got ${spectacle.hitStopOnChange}`);
    assert.ok(
      spectacle.particlesOnChange > spectacle.particlesBefore,
      `the photo change must burst particles, got ${spectacle.particlesBefore} -> ${spectacle.particlesOnChange}`
    );
    assert.equal(spectacle.glitchActiveOnChange, true, 'the photo change must trigger a glitch');
  } catch (error) {
    failures.push(`photo change spectacle: ${error.message}`);
  }
  await context.close();
}

// --- the warp field is a fractal spark, not a filled square ---------------------

{
  const { context, page } = await openGame();
  const shape = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const star = new WarpStar();
    // Force it close to the camera and dead centre, so it renders large enough to
    // sample and its footprint fills a known region of the probe canvas.
    star.x = 0;
    star.y = 0;
    star.z = 4;
    star.rotation = 0;
    star.draw(ctx, 32, 32, '#ffd700');

    const data = ctx.getImageData(0, 0, 64, 64).data;
    let lit = 0;
    let transparentInsideBoundingBox = 0;
    let minX = 64, maxX = 0, minY = 64, maxY = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const alpha = data[((y * 64) + x) * 4 + 3];
        if (alpha > 10) {
          lit += 1;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const alpha = data[((y * 64) + x) * 4 + 3];
        if (alpha <= 10) transparentInsideBoundingBox += 1;
      }
    }
    const boxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));

    return {
      lit,
      boxArea,
      transparentInsideBoundingBox,
      hollowFraction: transparentInsideBoundingBox / boxArea,
      spriteCacheGrew: window.SexMagickOccultArt?.cacheSize?.() ?? null
    };
  });

  report.warpShape = shape;
  try {
    assert.ok(shape.lit > 0, 'a close warp star must paint something');
    // The original was a solid fillRect - a filled square has a hollow fraction of
    // 0 inside its own bounding box. Line-art with gaps between spikes does not.
    assert.ok(
      shape.hollowFraction > 0.15,
      `a solid square would have ~0 hollow fraction inside its bounding box; got ${shape.hollowFraction.toFixed(3)}, expected genuine line-art gaps`
    );
    assert.ok(shape.spriteCacheGrew > 0, 'the fractal sprite must be cached, not redrawn as live paths per star');
  } catch (error) {
    failures.push(`warp field shape: ${error.message}`);
  }
  await context.close();
}

// --- a perfect pass carries its own glitch signature -----------------------------

{
  const { context, page } = await openGame();
  const pulse = await page.evaluate(async () => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    // Orb pickup already raises an identical gold #ffd700 flash plus a GlitchFX
    // trigger (triggerOrbGlitch, a pre-existing effect unrelated to Coherence) and
    // orbs spawn dead-centre in the gap - exactly where this test steers - so it is
    // indistinguishable from the pulse under test unless orbs are kept out of it.
    let flashOnPassFrame = false;
    let glitchSeenAcrossPasses = 0;
    let passesObserved = 0;
    for (let frame = 0; frame < 1200 && passesObserved < 4; frame += 1) {
      game.collectibles = [];
      const next = game.obstacles.find(pillar => !pillar.marked);
      if (next) game.player.y = next.top + (next.gap / 2);
      game.player.vy = 0;
      game.frames += 1;
      game.screenFlash = null;
      GlitchFX.active = false;
      const gatesBefore = game.monasState.gatesPassed;
      game.updateGameObjects();
      if (game.monasState.gatesPassed !== gatesBefore) {
        passesObserved += 1;
        if (game.screenFlash?.active && game.screenFlash.color === '#ffd700') flashOnPassFrame = true;
        if (GlitchFX.active) glitchSeenAcrossPasses += 1;
      }
    }
    return { flashOnPassFrame, glitchSeenAcrossPasses, passesObserved, gatesPassed: game.monasState.gatesPassed };
  });

  report.coherencePulse = pulse;
  try {
    assert.ok(pulse.passesObserved > 0, 'centred flight must pass gates for this to mean anything');
    assert.equal(pulse.flashOnPassFrame, true, 'a perfect pass must raise a gold screen-flash pulse on that exact frame');
    // The glitch trigger is a 50% roll per perfect pass; over several passes it is
    // expected to fire at least once and is reported rather than strictly required.
  } catch (error) {
    failures.push(`coherence pulse: ${error.message}`);
  }
  await context.close();
}

// --- the ambient glyph flicker schedules itself -----------------------------------

{
  const { context, page } = await openGame();
  const flicker = await page.evaluate(() => {
    document.getElementById('startMonasBtn').click();
    // Force the schedule due immediately rather than waiting out the real interval.
    game.__monasNextGlyphAt = game.frames;
    const before = game.__monasGlyphActiveUntil;
    game.drawHyperspaceTunnel(game.gameLevels[game.currentLevelIdx].accent);
    return {
      before,
      activeUntilAfter: game.__monasGlyphActiveUntil,
      nextScheduled: game.__monasNextGlyphAt
    };
  });

  report.ambientGlyph = flicker;
  try {
    assert.ok(
      flicker.activeUntilAfter > flicker.before,
      'a due glyph flicker must open an active window when the tunnel is drawn'
    );
    assert.ok(flicker.nextScheduled > flicker.activeUntilAfter, 'and reschedule itself further out');
  } catch (error) {
    failures.push(`ambient glyph: ${error.message}`);
  }
  await context.close();
}

// --- the Warp Surge bloom actually paints ------------------------------------------

{
  const { context, page } = await openGame();
  const bloom = await page.evaluate(async () => {
    document.getElementById('startMonasBtn').click();
    window.__SEX_MAGICK_MONAS__.setHeldForTest(false);

    // The canvas is opaque under the bloom (ground, strata, artwork all paint
    // there first), so alpha reads 255 with or without it - the bloom's own
    // contribution is a warm RGB tint layered on top, not a change in opacity.
    // A small region rather than one pixel, so a stroke or a glyph under the
    // sample point cannot decide the result either way.
    function centreWarmth() {
      const canvas = document.getElementById('gameCanvas');
      const ctx = canvas.getContext('2d');
      const size = 40;
      const cx = Math.floor((canvas.width - size) / 2);
      const cy = Math.floor((canvas.height - size) / 2);
      const data = ctx.getImageData(cx, cy, size, size).data;
      let warmth = 0;
      for (let i = 0; i < data.length; i += 4) warmth += data[i] + data[i + 1] - data[i + 2];
      return warmth / (data.length / 4);
    }

    for (let frame = 0; frame < 2400 && !game.monasState.surgeActive; frame += 1) {
      const next = game.obstacles.find(pillar => !pillar.marked);
      if (next) game.player.y = next.top + (next.gap / 2);
      game.player.vy = 0;
      game.frames += 1;
      game.updateGameObjects();
    }
    const duringSurge = game.monasState.surgeActive;
    game.drawScene(performance.now());
    const surgeWarmth = centreWarmth();

    // A frame with the surge flag forced off, everything else identical, isolates
    // the bloom's own contribution rather than whatever else happens to be at the
    // canvas centre (the tunnel, a pillar).
    const savedState = { ...game.monasState };
    game.monasState.surgeActive = false;
    game.drawScene(performance.now());
    const withoutSurgeWarmth = centreWarmth();
    game.monasState = savedState;

    return { duringSurge, surgeWarmth, withoutSurgeWarmth };
  });

  report.surgeBloom = bloom;
  try {
    assert.equal(bloom.duringSurge, true, 'sustained centred flight must reach a surge for this to mean anything');
    assert.ok(
      bloom.surgeWarmth > bloom.withoutSurgeWarmth,
      `the bloom must visibly warm the canvas centre: surge=${bloom.surgeWarmth.toFixed(1)} without=${bloom.withoutSurgeWarmth.toFixed(1)}`
    );
  } catch (error) {
    failures.push(`surge bloom: ${error.message}`);
  }
  await context.close();
}

// --- the new visuals do not add a meaningful cost of their own ------------------
//
// An absolute millisecond ceiling turned out to be the wrong bar here. Borrowing
// browser-m21-aesthetic-test.mjs's <12ms bound (its own measurement of HEX under a
// different setup) made MONAS look regressed by ~40ms; the actual cause traced to
// a real MONAS-specific bug (below), and fixing it did not bring the number under
// that ceiling. Measuring HEX under this exact suite's own methodology - real
// gameplay driven through updateGameObjects(), then ten warm-up and sixty measured
// drawScene() calls - shows HEX costing the *same* ~16-17ms on this container,
// warm-up length from 0 to 900 frames, every time. That cost lives in
// drawLevelArtwork's `ctx.filter = 'blur(1px)'` before its drawImage - expensive
// CPU-rasterised filter work, shared with HEX, present whenever artwork is loaded
// and drawn, regardless of mode. It is a pre-existing characteristic of this
// container, not something this milestone introduced, so the comparison that means
// something is MONAS against HEX in the same run, not either of them against an
// absolute number measured somewhere else under different conditions.
//
// The real bug this surfaced, and did fix: an earlier version of the surge set
// `this.voidMode = true` to reach the warp starfield's fast-streak branch, which
// also armed occult-field-runtime's expensive Void vignette and painted the
// Hexagram's reserved cyan over a MONAS event - see the comment above
// updateGameObjects. That cost ~30ms on its own and is gone now that the streak
// speed comes from a dedicated WarpStar.prototype.update wrap instead.

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

{
  const monasResult = await (async () => {
    const { context, page } = await openGame();
    const result = await page.evaluate(async () => {
      document.getElementById('startMonasBtn').click();
      window.__SEX_MAGICK_MONAS__.setHeldForTest(false);
      // Drive into a surge so the measurement includes the bloom, the sprite
      // field and the coherence pulses at once - the worst case, not the average.
      // The surge timer only ticks inside updateGameObjects(), never inside
      // drawScene(), so it stays open for the whole multi-trial measurement below.
      for (let frame = 0; frame < 2400 && !game.monasState.surgeActive; frame += 1) {
        const next = game.obstacles.find(pillar => !pillar.marked);
        if (next) game.player.y = next.top + (next.gap / 2);
        game.player.vy = 0;
        game.frames += 1;
        game.updateGameObjects();
      }
      // Several independent trials, because this container's per-call timing is
      // noisy enough (observed several-ms swings between back-to-back runs) that
      // one sample either side is not a fair comparison. The median is what gets
      // compared, not any single trial.
      const trials = [];
      for (let t = 0; t < 5; t += 1) {
        for (let f = 0; f < 10; f += 1) game.drawScene(performance.now());
        const start = performance.now();
        for (let f = 0; f < 60; f += 1) game.drawScene(performance.now());
        trials.push((performance.now() - start) / 60);
      }
      return { trials, duringSurge: game.monasState.surgeActive };
    });
    await context.close();
    return result;
  })();

  const hexTrials = await (async () => {
    const { context, page } = await openGame();
    const trials = await page.evaluate(async () => {
      document.getElementById('startHexBtn').click();
      for (let frame = 0; frame < 600; frame += 1) {
        game.frames += 1;
        game.updateGameObjects();
      }
      const out = [];
      for (let t = 0; t < 5; t += 1) {
        for (let f = 0; f < 10; f += 1) game.drawScene(performance.now());
        const start = performance.now();
        for (let f = 0; f < 60; f += 1) game.drawScene(performance.now());
        out.push((performance.now() - start) / 60);
      }
      return out;
    });
    await context.close();
    return trials;
  })();

  const monasMedian = median(monasResult.trials);
  const hexMedian = median(hexTrials);
  report.drawCost = {
    monasTrials: monasResult.trials.map(v => Number(v.toFixed(2))),
    hexTrials: hexTrials.map(v => Number(v.toFixed(2))),
    monasMedian: Number(monasMedian.toFixed(2)),
    hexMedian: Number(hexMedian.toFixed(2)),
    duringSurge: monasResult.duringSurge
  };
  try {
    assert.equal(monasResult.duringSurge, true, 'the measurement must land inside a surge to be the worst case');
    assert.ok(
      monasMedian < hexMedian + 6,
      `MONAS's own visuals must not add a meaningful cost over HEX measured the same way: monas=${monasMedian.toFixed(2)}ms hex=${hexMedian.toFixed(2)}ms`
    );
  } catch (error) {
    failures.push(`draw cost: ${error.message}`);
  }
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
for (const child of children) child.kill('SIGKILL');

if (failures.length > 0) {
  console.error('\nFAILURES:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nbrowser-monas-test: all assertions passed');
}
