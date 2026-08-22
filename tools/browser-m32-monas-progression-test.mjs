// M32/M33 integration truth: MONAS progression must be gate-count driven and
// independent of the HEX wrapper underneath it. M33 makes the full Gate stack the
// ordinary product default, so this suite now compares that product path with both
// an explicit ?gateSlice=1 path and the retained ?gateSlice=0 legacy opt-out.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4593);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function rounded(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

const python = which('python3');
assert.ok(python, 'python3 is required for the browser integration server');

const server = spawn(python, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

let browser;
try {
  await sleep(1200);
  browser = await chromium.launch();

  async function exercise(label, query) {
    const context = await browser.newContext({
      viewport: { width: 884, height: 1104 },
      userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`http://127.0.0.1:${PORT}/index.html?assetMode=offline${query}`, {
      waitUntil: 'domcontentloaded'
    });
    await page.locator('#game-container').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_REACHABILITY_POLICY__), null, { timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS__), null, { timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_MONAS_PROGRESSION__), null, { timeout: 20000 });
    await page.waitForFunction(() => {
      const button = document.getElementById('startMonasBtn');
      return Boolean(button && !button.disabled);
    }, null, { timeout: 20000 });

    // This suite owns runtime semantics, not animated-menu hit testing. M30 uses the
    // same DOM invocation so loading/transition motion cannot turn a state contract
    // into an actionability flake; dedicated UI suites retain physical click coverage.
    await page.evaluate(() => document.getElementById('startMonasBtn').click());
    await page.waitForFunction(() => game?.gameMode === 'MONAS' && Boolean(game?.monasState), null, { timeout: 10000 });

    const result = await page.evaluate(() => {
      // Stop the already-scheduled loop on its next callback so the regression can
      // inspect exact progression states without time-dependent player movement.
      game.gameLoop = () => undefined;
      game.state = GameState.PAUSED;
      game.frames = 0;

      const progression = window.__SEX_MAGICK_MONAS_PROGRESSION__;
      const snapshot = () => {
        game.frames = 0;
        const snap = progression.getSnapshot();
        return {
          gatesPassed: snap.gatesPassed,
          band: snap.progressionBandIndex,
          changes: snap.progressionChanges,
          speed: snap.speed,
          nominalGap: snap.nominalGap,
          liveGap: snap.liveGap,
          surgeActive: snap.surgeActive,
          gateResidue: snap.gateResidue,
          voidMode: Boolean(game.voidMode),
          gameMode: game.gameMode,
          playerMode: game.player?.mode ?? null
        };
      };

      const initial = snapshot();
      const ladder = [];
      for (const gates of [8, 20, 36, 56, 80, 110, 150]) {
        progression.forceGatesForTest(gates);
        ladder.push(snapshot());
      }

      // Score and the legacy checkLevel path must not own MONAS difficulty anymore.
      progression.forceGatesForTest(20);
      const beforeScoreCheck = snapshot();
      const levelBeforeScoreCheck = game.currentLevelIdx;
      game.score = 9999;
      game.checkLevel();
      const afterScoreCheck = snapshot();
      const levelAfterScoreCheck = game.currentLevelIdx;

      progression.forceGatesForTest(80);
      game.monasState.surgeActive = true;
      const surge = snapshot();
      game.monasState.surgeActive = false;

      // M43: the assertion whose absence hid a live defect for two milestones.
      //
      // Everything above reads `getSnapshot()` immediately after
      // `forceGatesForTest`, which calls `applyProgression` directly. That measures
      // what progression *writes* and never what survives a frame - so when
      // `monas-runtime.js` overwrote `gameSpeed` from a flat ramp on every
      // `updateGameObjects`, this suite stayed green while the shipped game ran the
      // whole ladder at 2.61 -> 3.17. D-058 was written to fix that shortfall and
      // its fix was silently undone one call-frame further out.
      //
      // So: force the band, then actually run frames, then look. The player only
      // ever experiences the post-frame value.
      const afterFrames = [];
      for (const gates of [8, 36, 80, 110, 150]) {
        progression.forceGatesForTest(gates);
        const written = game.gameSpeed;
        game.state = GameState.PLAYING;
        for (let i = 0; i < 4; i += 1) {
          try { game.updateGameObjects(); } catch (_error) {}
        }
        game.state = GameState.PAUSED;
        afterFrames.push({
          gates,
          band: game.monasState.progressionBandIndex,
          written,
          live: game.gameSpeed,
          surgeActive: Boolean(game.monasState.surgeActive)
        });
      }

      // Gate's restart wrapper creates HEX state underneath MONAS when Gate exists;
      // M32 must erase it and rebuild a clean MONAS run before returning control.
      progression.forceGatesForTest(80);
      game.restartGame();
      game.gameLoop = () => undefined;
      game.state = GameState.PAUSED;
      game.frames = 0;
      const afterRetry = snapshot();

      return {
        initial,
        ladder,
        beforeScoreCheck,
        afterScoreCheck,
        levelBeforeScoreCheck,
        levelAfterScoreCheck,
        surge,
        afterFrames,
        afterRetry,
        gateSliceModule: Boolean(window.SexMagickGateSlice),
        effectiveSearch: location.search,
        progressionFingerprint: progression.getFingerprint()
      };
    });

    // D-045 gives this fixture's portrait viewport (884x1104) a 0.9x geometry
    // accommodation on top of D-053's ladder (see monas-progression-runtime.js's
    // geometrySpeedFactor) - every band speed below is the shipped value x0.9,
    // not the raw ladder literal. Gap is untouched by that composition.
    const expected = [
      { gatesPassed: 8, band: 1, speed: 2.97, nominalGap: 250 },
      { gatesPassed: 20, band: 2, speed: 3.33, nominalGap: 240 },
      { gatesPassed: 36, band: 3, speed: 3.69, nominalGap: 230 },
      { gatesPassed: 56, band: 4, speed: 4.05, nominalGap: 220 },
      { gatesPassed: 80, band: 5, speed: 4.41, nominalGap: 210 },
      { gatesPassed: 110, band: 6, speed: 4.77, nominalGap: 200 },
      { gatesPassed: 150, band: 7, speed: 5.13, nominalGap: 190 }
    ];

    assert.equal(result.initial.gatesPassed, 0, `${label}: fresh run must begin at gate 0`);
    assert.equal(result.initial.band, 0, `${label}: fresh run must begin at band 0`);
    assert.equal(rounded(result.initial.speed), 2.61, `${label}: fresh speed`);
    assert.equal(rounded(result.initial.nominalGap), 260, `${label}: fresh nominal gap`);
    assert.equal(result.initial.gateResidue, false, `${label}: fresh MONAS must not carry HEX Gate state`);
    assert.equal(result.initial.voidMode, false, `${label}: fresh MONAS must not enter base/HEX Void`);
    assert.equal(result.initial.gameMode, 'MONAS');
    assert.equal(result.initial.playerMode, 'MONAS');

    result.ladder.forEach((entry, index) => {
      const wanted = expected[index];
      assert.equal(entry.gatesPassed, wanted.gatesPassed, `${label}: gate threshold ${wanted.gatesPassed}`);
      assert.equal(entry.band, wanted.band, `${label}: band at ${wanted.gatesPassed}`);
      assert.equal(rounded(entry.speed), wanted.speed, `${label}: speed at ${wanted.gatesPassed}`);
      assert.equal(rounded(entry.nominalGap), wanted.nominalGap, `${label}: gap at ${wanted.gatesPassed}`);
      assert.equal(entry.gateResidue, false, `${label}: Gate residue at ${wanted.gatesPassed}`);
    });

    assert.deepEqual(result.afterScoreCheck, result.beforeScoreCheck, `${label}: score/checkLevel must not alter MONAS progression`);
    assert.equal(result.levelAfterScoreCheck, result.levelBeforeScoreCheck, `${label}: legacy level index must not advance from score`);
    assert.equal(result.afterScoreCheck.voidMode, false, `${label}: score/checkLevel must never trigger base Void`);

    assert.equal(rounded(result.surge.speed), 4.41, `${label}: Warp Surge must not mutate canonical base speed`);
    assert.equal(rounded(result.surge.nominalGap), 210, `${label}: Warp Surge nominal gap`);
    assert.equal(rounded(result.surge.liveGap), 247.8, `${label}: Warp Surge must widen 210 by 1.18`);

    // M43: the ladder must still be the live speed after frames have run. A
    // regression here means something is writing `gameSpeed` per frame again, and
    // the ladder above has quietly become decoration.
    const liveExpected = { 8: 2.97, 36: 3.69, 80: 4.41, 110: 4.77, 150: 5.13 };
    result.afterFrames.forEach(entry => {
      const wanted = liveExpected[entry.gates];
      assert.equal(entry.surgeActive, false, `${label}: surge must be off for the live-speed check at ${entry.gates}`);
      assert.equal(
        rounded(entry.written), wanted,
        `${label}: applyProgression must write ${wanted} at gate ${entry.gates}`
      );
      assert.equal(
        rounded(entry.live), wanted,
        `${label}: gameSpeed must still be ${wanted} at gate ${entry.gates} after frames run - ` +
        'a mismatch means the band ladder is being overwritten per frame again (D-058, M43)'
      );
    });

    assert.equal(result.afterRetry.gatesPassed, 0, `${label}: retry resets semantic gate progression`);
    assert.equal(result.afterRetry.band, 0, `${label}: retry resets band`);
    assert.equal(rounded(result.afterRetry.speed), 2.61, `${label}: retry resets speed`);
    assert.equal(rounded(result.afterRetry.nominalGap), 260, `${label}: retry resets gap`);
    assert.equal(result.afterRetry.gateResidue, false, `${label}: retry must clear Gate residue`);
    assert.equal(result.afterRetry.voidMode, false, `${label}: retry must clear Void residue`);
    assert.equal(result.afterRetry.gameMode, 'MONAS');
    assert.equal(result.afterRetry.playerMode, 'MONAS');
    assert.equal(result.progressionFingerprint.scoreDrivenProgression, false);
    assert.equal(result.progressionFingerprint.gateCountDrivenProgression, true);

    assert.deepEqual(pageErrors, [], `${label}: page errors: ${pageErrors.join(', ')}`);
    await context.close();
    return result;
  }

  const product = await exercise('product default URL', '');
  const gate = await exercise('explicit Gate URL', '&gateSlice=1');
  const legacy = await exercise('legacy Gate opt-out URL', '&gateSlice=0');

  assert.equal(product.gateSliceModule, true, 'M33 ordinary product URL must enable the completed Gate stack');
  assert.equal(gate.gateSliceModule, true, 'explicit Gate URL must load Gate slice');
  assert.equal(legacy.gateSliceModule, false, 'explicit gateSlice=0 must retain the diagnostic base-game path');

  // Compare only progression semantics. The presence of the HEX wrapper is an
  // environment difference; everything the MONAS player can feel must remain equal.
  const semantic = result => ({
    initial: result.initial,
    ladder: result.ladder,
    beforeScoreCheck: result.beforeScoreCheck,
    afterScoreCheck: result.afterScoreCheck,
    surge: result.surge,
    afterFrames: result.afterFrames,
    afterRetry: result.afterRetry
  });
  assert.deepEqual(semantic(gate), semantic(product), 'product-default and explicit-Gate MONAS semantics must be identical');
  assert.deepEqual(semantic(legacy), semantic(product), 'Gate opt-out must not change MONAS semantics');

  console.log(JSON.stringify({
    product: { search: product.effectiveSearch, semantic: semantic(product) },
    gate: { search: gate.effectiveSearch, semantic: semantic(gate) },
    legacy: { search: legacy.effectiveSearch, semantic: semantic(legacy) }
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
