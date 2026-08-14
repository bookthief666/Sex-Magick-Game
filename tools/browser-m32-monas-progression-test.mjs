// M32 integration truth: MONAS progression must be gate-count driven and identical
// on the ordinary game URL and the optional ?gateSlice=1 URL, including retry.
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

    await page.locator('#startMonasBtn').click();
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
      for (const gates of [8, 20, 36, 56, 80]) {
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

      // This is the path that used to diverge on ?gateSlice=1: Gate's restart
      // wrapper creates HEX state unconditionally underneath us. M32 must erase it
      // and rebuild a clean MONAS run before returning control to the player.
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
        afterRetry,
        gateSliceModule: Boolean(window.SexMagickGateSlice),
        progressionFingerprint: progression.getFingerprint()
      };
    });

    const expected = [
      { gatesPassed: 8, band: 1, speed: 3.3, nominalGap: 250 },
      { gatesPassed: 20, band: 2, speed: 3.7, nominalGap: 240 },
      { gatesPassed: 36, band: 3, speed: 4.1, nominalGap: 230 },
      { gatesPassed: 56, band: 4, speed: 4.5, nominalGap: 220 },
      { gatesPassed: 80, band: 5, speed: 4.9, nominalGap: 210 }
    ];

    assert.equal(result.initial.gatesPassed, 0, `${label}: fresh run must begin at gate 0`);
    assert.equal(result.initial.band, 0, `${label}: fresh run must begin at band 0`);
    assert.equal(rounded(result.initial.speed), 2.9, `${label}: fresh speed`);
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

    assert.equal(rounded(result.surge.speed), 4.9, `${label}: Warp Surge must not mutate canonical base speed`);
    assert.equal(rounded(result.surge.nominalGap), 210, `${label}: Warp Surge nominal gap`);
    assert.equal(rounded(result.surge.liveGap), 247.8, `${label}: Warp Surge must widen 210 by 1.18`);

    assert.equal(result.afterRetry.gatesPassed, 0, `${label}: retry resets semantic gate progression`);
    assert.equal(result.afterRetry.band, 0, `${label}: retry resets band`);
    assert.equal(rounded(result.afterRetry.speed), 2.9, `${label}: retry resets speed`);
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

  const ordinary = await exercise('ordinary URL', '');
  const gate = await exercise('Gate URL', '&gateSlice=1');

  assert.equal(ordinary.gateSliceModule, false, 'ordinary URL must not enable Gate slice');
  assert.equal(gate.gateSliceModule, true, 'Gate URL should still load Gate slice');

  // Compare only progression semantics; the Gate module itself is intentionally an
  // environment difference. Everything the MONAS player can feel here must match.
  const semantic = result => ({
    initial: result.initial,
    ladder: result.ladder,
    beforeScoreCheck: result.beforeScoreCheck,
    afterScoreCheck: result.afterScoreCheck,
    surge: result.surge,
    afterRetry: result.afterRetry
  });
  assert.deepEqual(semantic(gate), semantic(ordinary), 'ordinary and ?gateSlice=1 MONAS semantics must be identical');

  console.log(JSON.stringify({ ordinary: semantic(ordinary), gate: semantic(gate) }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
