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
  const context = await browser.newContext({ viewport: { width: 884, height: 1104 } });
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

    // The streak is drawn from voidMode by drawScene(), which runs after
    // updateGameObjects() returns - so sample it exactly where the renderer would.
    let voidModeAtDrawTime = false;
    let speedFiniteThroughout = true;
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
      if (game.monasState.surgeActive) {
        if (game.voidMode === true) voidModeAtDrawTime = true;
        if (sawWiderGap === null) sawWiderGap = game.getCurrentGap();
      }
      if (game.monasState.surges > 0 && !game.monasState.surgeActive && sawWiderGap !== null) break;
    }

    return {
      surges: game.monasState.surges,
      surgeActive: game.monasState.surgeActive,
      baselineGap,
      surgeGap: sawWiderGap,
      voidModeAtDrawTime,
      speedFiniteThroughout,
      voidModeAfterSurge: game.voidMode,
      gameSpeedAfterSurge: game.gameSpeed,
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
    assert.equal(
      surge.voidModeAtDrawTime, true,
      'voidMode must still be set when drawScene() runs, or the warp streak never renders'
    );
    assert.equal(surge.speedFiniteThroughout, true, 'gameSpeed must never go NaN via endVoidMode()');
    assert.equal(Number.isFinite(surge.gameSpeedAfterSurge), true, 'and must still be finite afterwards');
    assert.equal(surge.voidModeAfterSurge, false, 'the surge clears voidMode when it ends');
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
