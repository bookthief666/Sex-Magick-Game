import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.GATE_SLICE_QA_HTTP_PORT || 4182);
const DEBUG_PORT = Number(process.env.GATE_SLICE_QA_DEBUG_PORT || 9232);
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const children = [];
const EXTERNAL_BLOCKED_URLS = [
  'https://cdn.tailwindcss.com/*',
  'https://fonts.googleapis.com/*',
  'https://fonts.gstatic.com/*',
  'https://lh3.googleusercontent.com/*',
  'https://cdn.jsdelivr.net/*',
  'https://7l3mo9bh.api.lootlocker.io/*'
];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function findCommand(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync('bash', ['-lc', `command -v ${candidate}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

async function waitForHttp(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const ok = response.ok;
      const status = response.status;
      await response.arrayBuffer();
      if (ok) return;
      lastError = new Error(`HTTP ${status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

async function removeProfile(targetPath) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      if (attempt === 6) return;
      await sleep(attempt * 100);
    }
  }
}

class CDPClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('CDP WebSocket error'));
      }, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        else pending.resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  close() {
    if (this.socket?.readyState <= WebSocket.OPEN) this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return response.result?.value;
}

async function waitForExpression(client, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}: ${lastError?.message || ''}`);
}

async function main() {
  const chromeBinary = process.env.CHROME_BIN || findCommand(['google-chrome', 'chromium', 'chromium-browser']);
  const pythonBinary = findCommand(['python3', 'python']);
  assert.ok(chromeBinary, 'Chrome/Chromium executable not found');
  assert.ok(pythonBinary, 'Python executable not found');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-gate-slice-'));
  const server = spawn(pythonBinary, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(server);
  await waitForHttp(`${BASE_URL}/index.html`);

  const chrome = spawn(chromeBinary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--mute-audio',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(chrome);

  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const pageTarget = targets.find(target => target.type === 'page');
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'Chrome page target not found');

  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setBlockedURLs', { urls: EXTERNAL_BLOCKED_URLS });
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });

  const exceptions = [];
  const requestedUrls = [];
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
  client.on('Network.requestWillBeSent', event => requestedUrls.push(event.request?.url || ''));

  try {
    await client.send('Page.navigate', {
      url: `${BASE_URL}/index.html?gateSlice=1&inputBuffer=3&gateSliceQa=${Date.now()}`
    });
    await waitForExpression(
      client,
      `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_GATE_SLICE__`
    );
    await waitForExpression(
      client,
      `!document.getElementById('menuButtons').classList.contains('hidden')`
    );

    const result = await evaluate(client, `
      (() => {
        globalThis.__qaRafQueue = [];
        globalThis.__qaNextRafId = 1;
        globalThis.requestAnimationFrame = callback => {
          const id = globalThis.__qaNextRafId++;
          globalThis.__qaRafQueue.push({ id, callback });
          return id;
        };
        globalThis.cancelAnimationFrame = id => {
          globalThis.__qaRafQueue = globalThis.__qaRafQueue.filter(item => item.id !== id);
        };

        AudioSys.pause = () => {};
        AudioSys.resume = () => {};
        AudioSys.play = () => {};
        AudioSys.stop = () => {};
        AudioSys.switchToGameMusic = () => {};
        AudioSys.switchToGameOverMusic = () => {};
        AudioSys.switchToMenuMusic = () => {};
        SFX.jump = () => {};
        SFX.collect = () => {};
        SFX.crash = () => {};
        SFX.levelUp = () => {};
        SFX.voidEnter = () => {};
        SFX.playTone = () => {};
        Haptics.jump = () => {};
        Haptics.collect = () => {};
        Haptics.crash = () => {};
        Haptics.levelUp = () => {};
        Haptics.start = () => {};
        Game.prototype.drawScene = function () {};

        game.settings.music = false;
        game.settings.sfx = false;
        game.settings.vibration = false;
        game.gameMode = 'HEX';
        game.startGame();
        game.player.update = () => {};
        game.player.draw = () => {};
        game.particles = [];
        game.collectibles = [];
        game.pentagrams = [];
        __SEX_MAGICK_GATE_SLICE__.clearHistory();

        const menu = {
          monasDisabled: document.getElementById('startMonasBtn').disabled,
          monasText: document.getElementById('startMonasBtn').textContent,
          hexText: document.getElementById('startHexBtn').textContent,
          leaderboardHidden: document.querySelector('.leaderboard-container').hidden,
          leaderboardTitle: document.querySelector('.leaderboard-title')?.textContent?.trim() ?? null,
          riteBoardInstalled: Boolean(window.__SEX_MAGICK_RITE_BOARD__),
          riteBoardNetwork: window.__SEX_MAGICK_RITE_BOARD__?.networkSubmission ?? null
        };
        const preflight = __SEX_MAGICK_GATE_PREFLIGHT__.getSnapshot();
        const orderedLevels = game.gameLevels.map(level => level.name);

        // D-067: one short of YESOD, derived so a re-spacing cannot silently
        // move this probe back into risk-free MALKUTH.
        game.gateSliceState.gatesCleared = SexMagickGateSlice.BANDS[1].gateThreshold;
        game.gateSliceState.bandIndex = 1;
        game.applyLevel();
        game.frames = 1;
        game.player.y = 200;
        game.obstacles = [{
          x: game.player.x - 50,
          w: 45,
          top: 178,
          baseTop: 178,
          gap: 190,
          marked: false,
          patternFamily: 'pressure',
          update() {},
          collides() { return false; },
          draw() {}
        }];
        game.updateGameObjects();
        const afterRisk = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const scoreAfterRisk = game.score;

        game.obstacles = [];
        __SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
        __SEX_MAGICK_GATE_SLICE__.spawnGateNow();
        game.gateSliceOffer.y = game.player.y + 240;
        game.gateSliceOffer.x = game.player.x - game.gateSliceOffer.outerRadius - game.player.r - game.gameSpeed - 2;
        game.frames = 2;
        game.updateGameObjects();
        const afterBank = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const scoreAfterBank = game.score;

        __SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
        __SEX_MAGICK_GATE_SLICE__.spawnGateNow();
        game.gateSliceOffer.x = game.player.x + game.gameSpeed;
        game.gateSliceOffer.y = game.player.y;
        game.frames = 3;
        game.updateGameObjects();
        const afterEntry = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const speedDuringVoid = game.gameSpeed;

        function readTelegraph() {
          const element = document.getElementById('gate-slice-telegraph');
          const style = getComputedStyle(element);
          return {
            text: element.textContent,
            hidden: element.hidden,
            hasFlashClass: element.classList.contains('gate-slice-telegraph-flash'),
            flashColor: style.getPropertyValue('--gate-slice-telegraph-flash').trim(),
            position: style.position,
            top: style.top,
            bottom: style.bottom
          };
        }
        const telegraphOnWager = readTelegraph();

        function readGlitch() {
          return { active: GlitchFX.active, type: GlitchFX.type, tint: GlitchFX.tint };
        }

        // Survive exactly this Void's own length. M44 made the duration scale with
        // the band, so the old hardcoded 480 became a *partial* survival on any
        // band past the first - and the duration fraction duly paid a smaller
        // reward, which is the new behaviour working rather than a regression.
        const plannedVoidSteps = game.__gateSliceVoidPlannedSteps;
        game.__gateSliceVoidStartedAt = game.frames - plannedVoidSteps;
        game.endVoidMode();
        const afterSurvival = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const scoreAfterSurvival = game.score;
        const telegraphOnSurvival = readTelegraph();
        const glitchOnSurvival = readGlitch();

        __SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
        __SEX_MAGICK_GATE_SLICE__.spawnGateNow();
        game.gateSliceOffer.x = game.player.x + game.gameSpeed;
        game.gateSliceOffer.y = game.player.y;
        game.frames = 500;
        game.updateGameObjects();
        game.gameOver();
        const afterDeath = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const glitchOnDeath = readGlitch();
        const history = __SEX_MAGICK_GATE_SLICE__.getHistory();

        // A graze pass - clearance under NEAR_MISS_PX but still safe - used to have
        // no visual signature of its own beyond the score tick.
        game.gateSliceState.gnosis = 0;
        game.gateSliceState.gateReady = false;
        game.screenFlash = null;
        GlitchFX.active = false;
        game.frames = 600;
        game.player.y = 192;
        game.obstacles = [{
          x: game.player.x - 50, w: 45, top: 178, baseTop: 178, gap: 190,
          marked: false, patternFamily: 'pressure',
          update() {}, collides() { return false; }, draw() {}
        }];
        game.updateGameObjects();
        const nearMissGlitch = {
          screenFlashColor: game.screenFlash?.color ?? null,
          screenFlashActive: Boolean(game.screenFlash?.active),
          ...readGlitch()
        };

        // Reduced motion must suppress these new effects entirely, the same way
        // installEffectPolicy suppresses triggerOrbGlitch/triggerLevelUpGlitch/
        // triggerDeathGlitch - these raw GlitchFX.trigger calls are outside that
        // wrap, so gate-slice-runtime.js's own triggerHexGlitch has to check.
        __SEX_MAGICK_COLLISION__.setReducedMotion(true);
        game.gateSliceState.gnosis = 0;
        game.gateSliceState.gateReady = false;
        game.screenFlash = null;
        GlitchFX.active = false;
        game.frames = 601;
        game.player.y = 192;
        game.obstacles = [{
          x: game.player.x - 50, w: 45, top: 178, baseTop: 178, gap: 190,
          marked: false, patternFamily: 'pressure',
          update() {}, collides() { return false; }, draw() {}
        }];
        game.updateGameObjects();
        const nearMissReducedMotion = {
          screenFlashActive: Boolean(game.screenFlash?.active),
          glitchActive: GlitchFX.active
        };
        __SEX_MAGICK_COLLISION__.setReducedMotion(false);

        return {
          menu,
          preflight,
          orderedLevels,
          afterRisk,
          yesodAt: SexMagickGateSlice.BANDS[1].gateThreshold,
          scoreAfterRisk,
          afterBank,
          scoreAfterBank,
          afterEntry,
          speedDuringVoid,
          telegraphOnWager,
          afterSurvival,
          scoreAfterSurvival,
          plannedVoidSteps,
          telegraphOnSurvival,
          glitchOnSurvival,
          afterDeath,
          glitchOnDeath,
          nearMissGlitch,
          nearMissReducedMotion,
          history,
          finalState: game.state,
          inputBufferFrames: __SEX_MAGICK_COLLISION__.getInputBufferFrames(),
          hudPresent: Boolean(document.getElementById('gate-slice-hud')),
          localOnlyStatus: document.getElementById('uploadStatus').textContent
        };
      })()
    `);

    // MONAS is unsealed as of D-041 and now runs its own rite - glide and Coherence -
    // alongside HEX. The Gate slice still owns HEX exclusively, which the
    // gateSliceState assertions throughout this suite continue to cover.
    assert.equal(result.menu.monasDisabled, false);
    assert.doesNotMatch(result.menu.monasText, /SEALED/);
    assert.match(result.menu.monasText, /GLIDE/);
    assert.match(result.menu.hexText, /THE GATE/);
    // The board is shown again as of D-040 - it now carries the local Rite board
    // rather than a shared score list. Submission stays suppressed, which the
    // preflight assertions below and the lootlocker traffic check still cover.
    assert.equal(result.menu.leaderboardHidden, false);
    assert.match(result.menu.leaderboardTitle, /RITE BOARD/);
    assert.equal(result.menu.riteBoardInstalled, true);
    assert.equal(result.menu.riteBoardNetwork, false);
    assert.equal(result.preflight.leaderboardSuppressed, true);
    assert.equal(result.preflight.guestSessionAllowed, false);
    assert.equal(result.preflight.scoreSubmissionAllowed, false);
    assert.equal(
      requestedUrls.some(url => url.includes('lootlocker.io')),
      false,
      `Gate slice must not initiate LootLocker requests: ${JSON.stringify(requestedUrls)}`
    );
    assert.deepEqual(result.orderedLevels, ['MALKUTH', 'YESOD', 'TIPHARETH', 'GEBURAH', 'CHESED', 'BINAH', 'CHOKMAH', 'KETHER']);

    assert.equal(result.afterRisk.state.gatesCleared, result.yesodAt + 1);
    assert.equal(result.afterRisk.state.gnosis, 1);
    assert.equal(result.afterRisk.state.lastClear.zone, 'risk-top');
    assert.equal(result.afterRisk.state.lastClear.family, 'pressure');
    assert.equal(result.scoreAfterRisk, 3);

    assert.equal(result.afterBank.state.gateOffers, 1);
    assert.equal(result.afterBank.state.gateBanks, 1);
    assert.equal(result.afterBank.state.gnosis, 0);
    assert.equal(result.scoreAfterBank, 33);

    assert.equal(result.afterEntry.voidActive, true);
    assert.equal(result.afterEntry.state.currentWager, 10);
    assert.equal(result.afterEntry.state.gateEntries, 1);
    assert.ok(Math.abs(result.speedDuringVoid - 5.7) < 1e-9);

    assert.equal(result.afterSurvival.voidActive, false);
    assert.equal(result.afterSurvival.state.voidSurvivals, 1);
    assert.equal(result.afterSurvival.state.currentWager, 0);
    assert.equal(result.scoreAfterSurvival, 133);
    // The Void's length is the band's now, not a constant. Asserted so a change to
    // the ladder that silently stopped scaling it would be caught here.
    assert.ok(result.plannedVoidSteps >= 480,
      `a Void must run at least the opening band's 480 steps (got ${result.plannedVoidSteps})`);

    // The telegraph used to sit centred at top:42%, opaque enough to obscure the
    // artwork behind it. It is bottom-anchored now (no top offset, an explicit
    // bottom), and each event kind sets a distinct flash colour rather than a
    // single fixed cyan.
    assert.equal(result.telegraphOnWager.position, 'fixed');
    assert.notEqual(result.telegraphOnWager.top, '42%', 'the centred top:42% placement is gone');
    assert.notEqual(result.telegraphOnWager.bottom, 'auto', 'must be anchored to the bottom instead');
    assert.ok(
      parseFloat(result.telegraphOnWager.bottom) > 0,
      `bottom offset must resolve to a real distance, got ${result.telegraphOnWager.bottom}`
    );
    assert.match(result.telegraphOnWager.text, /WAGER ACCEPTED/);
    assert.equal(result.telegraphOnWager.hasFlashClass, true, 'a fresh telegraph must carry the flash class');
    assert.equal(result.telegraphOnWager.flashColor, '#8f7bff', 'wager accepted is a progress-kind flash');

    assert.match(result.telegraphOnSurvival.text, /VOID SURVIVED/);
    assert.equal(result.telegraphOnSurvival.hasFlashClass, true);
    assert.equal(result.telegraphOnSurvival.flashColor, '#5dffb0', 'void survived is a success-kind flash');
    assert.notEqual(
      result.telegraphOnSurvival.flashColor,
      result.telegraphOnWager.flashColor,
      'different event kinds must flash different colours'
    );

    // HEX's own glitch vocabulary: before this, every event - orb, band ascent,
    // death - rendered through the same single rgbSplit technique. Void survival
    // and a wager lost now each carry a distinct technique of their own.
    assert.equal(result.glitchOnSurvival.active, true, 'void survival must trigger a glitch');
    assert.equal(result.glitchOnSurvival.type, 'sweep', 'void survival is a sweep, not the default rgbSplit');
    assert.equal(result.glitchOnSurvival.tint, '#00e5ff', 'void survival flashes the Hexagram\'s own reserved cyan');

    assert.equal(result.glitchOnDeath.active, true, 'a lost wager must trigger a glitch');
    assert.equal(result.glitchOnDeath.type, 'shear', 'a lost wager tears rather than drifts');
    assert.equal(result.glitchOnDeath.tint, '#ff2f6d', 'a lost wager flashes hazard pink');

    // The graze pass is HEX's whole risk model and, until now, had no visual
    // signature of its own beyond a score tick.
    assert.equal(result.nearMissGlitch.screenFlashActive, true, 'a graze pass must raise a screen flash');
    assert.equal(result.nearMissGlitch.screenFlashColor, '#ff2f6d', 'the graze flash is hazard pink');
    assert.equal(result.nearMissGlitch.active, true, 'a graze pass must trigger a glitch');
    assert.equal(result.nearMissGlitch.type, 'shear', 'a graze tears rather than drifts');
    assert.equal(result.nearMissGlitch.tint, '#ff2f6d');

    // Reduced motion suppresses these new effects entirely - the raw GlitchFX
    // triggers sit outside installEffectPolicy's wrap, so gate-slice-runtime.js's
    // own triggerHexGlitch has to make this check itself.
    assert.equal(result.nearMissReducedMotion.screenFlashActive, false, 'reduced motion must suppress the graze flash');
    assert.equal(result.nearMissReducedMotion.glitchActive, false, 'reduced motion must suppress the graze glitch');

    assert.equal(result.finalState, 'gameover');
    assert.equal(result.afterDeath.state.voidDeaths, 1);
    assert.equal(result.afterDeath.state.gateOffers, 3);
    assert.equal(result.afterDeath.state.gateEntries, 2);
    assert.ok(Math.abs(result.afterDeath.gateEntryRate - (2 / 3)) < 1e-9);
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].voidSurvivals, 1);
    assert.equal(result.history[0].voidDeaths, 1);
    assert.equal(result.inputBufferFrames, 3);
    assert.equal(result.hudPresent, true);
    assert.equal(result.localOnlyStatus, 'GATE SLICE — LOCAL ONLY');
    assert.equal(exceptions.length, 0, `Browser exceptions: ${JSON.stringify(exceptions)}`);

    // The original score-based level-up gave shake, a freeze frame, a glitch
    // and a particle burst every time. The Gate slice replaced levelling with
    // bands and, for a while, lost all of that on the transition. This proves
    // it through the real checkLevel() path - driving gatesCleared and calling
    // checkLevel(), not setting bandIndex directly, which is what the earlier
    // probe above does and would bypass the branch entirely.
    const punch = await evaluate(client, `
      (() => {
        game.gameLevels.forEach(l => { l.img = null; l.loaded = false; });
        game.gateSliceState.gatesCleared = SexMagickGateSlice.BANDS[1].gateThreshold - 1;
        game.gateSliceState.bandIndex = 0;
        game.shake = 0;
        game.hitStop = 0;
        game.particles = [];
        GlitchFX.active = false;
        GlitchFX.duration = 0;

        game.gateSliceState.gatesCleared = SexMagickGateSlice.BANDS[1].gateThreshold; // crosses into YESOD (band 1)
        game.checkLevel();

        const matched = game.gameLevels.find(l => l.name.toUpperCase() === 'YESOD');
        return {
          bandIndex: game.gateSliceState.bandIndex,
          shake: game.shake,
          hitStop: game.hitStop,
          particleCount: game.particles.length,
          particleColors: [...new Set(game.particles.map(p => p.c))],
          expectedAccent: matched ? matched.accent : null,
          glitchActive: GlitchFX.active,
          glitchType: GlitchFX.type
        };
      })();
    `);
    assert.equal(punch.bandIndex, 1, 'gatesCleared=6 must cross into band 1 (YESOD)');
    assert.equal(punch.shake, 12, 'a band change must shake the screen like the original level-up did');
    assert.equal(punch.hitStop, 3, 'a band change must freeze-frame like the original level-up did');
    assert.equal(punch.particleCount, 30, 'a band change must burst 30 particles like the original level-up did');
    assert.deepEqual(punch.particleColors, [punch.expectedAccent], "the burst must use the new band's own accent colour");
    assert.equal(punch.glitchActive, true, 'a band change must fire the RGB-split glitch');
    assert.equal(punch.glitchType, 'level', 'the band-change glitch must be the level-up variant');

    // The whole punch above only proved itself against band 1. Every one of the
    // 8 real in-game levels needs its own accent, or this class of bug - a level
    // whose colour is silently undefined, so canvas/CSS both no-op and keep
    // whatever was drawn last - comes back the moment a different band is hit.
    const accentCoverage = await evaluate(client, `
      game.gameLevels.map(l => ({ name: l.name, accent: l.accent }));
    `);
    for (const level of accentCoverage) {
      assert.match(
        String(level.accent),
        /^#[0-9a-f]{6}$/i,
        `level ${level.name} must have a real accent colour, saw ${JSON.stringify(level.accent)}`
      );
    }

    // A gate clear that does not cross a band boundary must stay quiet - the
    // owner chose the punch on band changes only, not on every gate.
    const quiet = await evaluate(client, `
      (() => {
        game.shake = 0;
        game.hitStop = 0;
        game.particles = [];
        GlitchFX.active = false;
        game.gateSliceState.gatesCleared = SexMagickGateSlice.BANDS[1].gateThreshold + 1; // still inside YESOD
        game.checkLevel();
        return { shake: game.shake, hitStop: game.hitStop, particleCount: game.particles.length, glitchActive: GlitchFX.active };
      })();
    `);
    assert.deepEqual(quiet, { shake: 0, hitStop: 0, particleCount: 0, glitchActive: false }, 'a gate clear that does not cross a band boundary must not repeat the punch');

    // M24: the picture on screen must actually advance.
    //
    // Every previous "backgrounds change" claim was verified against hand-set
    // accents, which is why it took three milestones to notice that
    // currentLevelIdx was never assigned at all. This drives the real pointer and
    // the real gallery instead.
    const backgrounds = await evaluate(client, `
      (() => {
        const seen = [];
        for (const gates of [0, 4, 8, 12, 16, 20]) {
          game.gateSliceState.gatesCleared = gates;
          game.gateSliceState.bandIndex = -1; // force applyBand through checkLevel
          game.checkLevel();
          const entry = __SEX_MAGICK_GATE_SLICE__.getBackgroundEntry();
          seen.push({
            gates,
            levelIdx: game.currentLevelIdx,
            galleryName: entry ? entry.name : null,
            galleryAccent: entry ? entry.accent : null
          });
        }
        return { seen, gallery: __SEX_MAGICK_GATE_SLICE__.getGalleryInfo() };
      })();
    `);
    assert.ok(
      backgrounds.gallery.size > 20,
      `the gallery must span the whole image pool, saw ${backgrounds.gallery.size}`
    );
    assert.ok(
      new Set(backgrounds.seen.map(s => s.levelIdx)).size > 1,
      `currentLevelIdx must advance with the band, saw ${JSON.stringify(backgrounds.seen.map(s => s.levelIdx))}`
    );
    assert.ok(
      new Set(backgrounds.seen.map(s => s.galleryName)).size >= 4,
      `the background picture must rotate as gates are cleared, saw ${JSON.stringify(backgrounds.seen.map(s => s.galleryName))}`
    );

    // M24: bonus corridors are back, and the Void wager is untouched by them.
    const corridors = await evaluate(client, `
      (() => {
        const runWindow = (frames) => {
          let pillarsSpawned = 0;
          const before = game.obstacles.length;
          for (let f = 0; f < frames; f += 1) { game.frames += 1; game.updateGameObjects(); }
          pillarsSpawned = Math.max(0, game.obstacles.length - before);
          return pillarsSpawned;
        };

        // Land exactly on a bonus multiple with no offer and no wager running.
        game.__gateSliceVoidActive = false;
        game.gateSliceOffer = null;
        game.obstacles = [];
        game.pentagrams = [];
        game.__bonusCorridorFrames = 0;
        game.__bonusCorridorLastGate = -1;
        game.gateSliceState.gatesCleared = SexMagickGateSlice.BANDS[2].gateThreshold + 3;
        const bonusPillars = runWindow(90);
        const bonus = { pentagrams: game.pentagrams.length, pillars: bonusPillars };

        // Now the wager: pillars keep coming and pentagrams must not appear.
        game.__bonusCorridorFrames = 0;
        game.__bonusCorridorLastGate = -1;
        game.pentagrams = [];
        game.obstacles = [];
        game.__gateSliceVoidActive = true;
        const voidPillars = runWindow(90);
        const wager = { pentagrams: game.pentagrams.length, pillars: voidPillars };
        game.__gateSliceVoidActive = false;
        return { bonus, wager };
      })();
    `);
    assert.ok(
      corridors.bonus.pentagrams > 0,
      `a bonus corridor must spawn pentagrams, saw ${corridors.bonus.pentagrams}`
    );
    assert.equal(
      corridors.bonus.pillars, 0,
      'a bonus corridor must suppress pillars - it is a reward, not another wall run'
    );
    assert.equal(
      corridors.wager.pentagrams, 0,
      'the Void wager must stay a wager: no pentagrams inside the challenge tunnel'
    );
    assert.ok(
      corridors.wager.pillars > 0,
      'the Void wager must still spawn pillars - the challenge tunnel must survive this change'
    );

    // M40.6: the corridor is a constellation - a finite set with a streak, a
    // completion, and a payout. Driven through the real page rather than the
    // unit tests because everything interesting here is the *wiring*: the unit
    // tests already prove void-constellation.js scores correctly in isolation,
    // and would have gone on passing if the script tag were missing, if the
    // spawn seam attached to the wrong section, or if the award were never
    // called. That is the exact shape of the D-062 shield bug.
    const constellation = await evaluate(client, `
      (() => {
        const enterCorridor = () => {
          game.__gateSliceVoidActive = false;
          game.gateSliceOffer = null;
          game.obstacles = [];
          game.pentagrams = [];
          game.constellation = null;
          game.__bonusCorridorFrames = 0;
          game.__bonusCorridorLastGate = -1;
          game.gateSliceState.gatesCleared = SexMagickGateSlice.BANDS[2].gateThreshold + 3;
        };

        const modules = {
          polygram: Boolean(window.SexMagickPolygram),
          constellation: Boolean(window.SexMagickVoidConstellation),
          // Read from the module rather than pinned here, so retuning the set
          // size stays a one-line change instead of a two-file one.
          minStars: window.SexMagickVoidConstellation?.MIN_STARS ?? null,
          maxStars: window.SexMagickVoidConstellation?.MAX_STARS ?? null,
          minPoints: window.SexMagickPolygram?.MIN_POINTS ?? null,
          maxPoints: window.SexMagickPolygram?.MAX_POINTS ?? null
        };

        // --- the set is finite -------------------------------------------
        enterCorridor();
        let spawned = 0;
        let total = null;
        let lastSpawnFrame = 0;
        const pointsSeen = [];
        for (let f = 0; f < 300; f += 1) {
          game.frames += 1;
          game.updateGameObjects();
          if (game.constellation && total === null) total = game.constellation.total;
          for (const star of game.pentagrams) {
            if (!star.__qaSeen) {
              star.__qaSeen = true;
              spawned += 1;
              lastSpawnFrame = f;
              pointsSeen.push(star.points);
            }
          }
        }
        const finite = { total, spawned, lastSpawnFrame, pointsSeen };

        // --- catching every star -----------------------------------------
        enterCorridor();
        const scoreBefore = game.score;
        const orders = [];
        let completed = false;
        let caughtTotal = null;
        for (let f = 0; f < 420; f += 1) {
          const star = game.pentagrams[0];
          if (star) {
            game.player.x = star.x;
            game.player.y = star.y;
            game.player.vy = 0;
            orders.push(star.points);
          }
          game.frames += 1;
          game.updateGameObjects();
          if (game.constellation) {
            if (caughtTotal === null) caughtTotal = game.constellation.total;
            if (game.constellation.completed) completed = true;
          }
        }
        const perfect = {
          scoreGain: game.score - scoreBefore,
          total: caughtTotal,
          completed,
          minOrder: orders.length ? Math.min(...orders) : null,
          maxOrder: orders.length ? Math.max(...orders) : null
        };

        // --- a miss is counted exactly once ------------------------------
        enterCorridor();
        for (let f = 0; f < 120; f += 1) { game.frames += 1; game.updateGameObjects(); }
        const live = game.constellation;
        const stray = { points: 5, collected: false, x: -400 };
        const missedBefore = live ? live.missed : null;
        game.retireStar(stray);
        game.retireStar(stray);
        const missAccounting = {
          before: missedBefore,
          after: live ? live.missed : null,
          streak: live ? live.streak : null
        };

        // --- the wager gets no constellation ------------------------------
        // The catch block above parks the player on top of a star, which leaves
        // it somewhere a pillar can reach. Put it back before spawning walls,
        // and stop sampling the moment the wager ends: a death clears
        // __gateSliceVoidActive, and the frames after that are an ordinary run
        // that may legitimately open a corridor. Sampling through them was
        // measuring the wrong section.
        enterCorridor();
        game.__bonusCorridorFrames = 0;
        game.__bonusCorridorLastGate = -1;
        game.constellation = null;
        game.player.x = window.innerWidth * 0.25;
        game.player.y = window.innerHeight / 2;
        game.player.vy = 0;
        game.__gateSliceVoidActive = true;

        let sawConstellationDuringWager = false;
        let wagerFrames = 0;
        for (let f = 0; f < 90; f += 1) {
          if (!game.__gateSliceVoidActive) break;
          game.frames += 1;
          game.updateGameObjects();
          wagerFrames += 1;
          if (game.constellation) sawConstellationDuringWager = true;
        }
        game.__gateSliceVoidActive = false;

        // --- M40.5: the Void draws, and the Sobel pass does not ------------
        // The effect is affordable only because the edge layer is built once
        // per background and composited thereafter. A cache that silently
        // missed would look identical on screen and cost a frame every frame,
        // which is exactly the class of regression D-060 was chasing.
        const edges = window.SexMagickVoidEdgeLayer;
        let voidDraw = null;
        if (edges) {
          edges.clearCache();
          const buildsBefore = edges.buildCount();

          // Reads back a thumbnail of the frame. The Void's whole complaint was
          // that it rendered black, so "not black" is the one thing worth
          // measuring in pixels rather than inferring from call counts.
          const sample = () => {
            try {
              const probe = document.createElement('canvas');
              probe.width = 60; probe.height = 60;
              const probeCtx = probe.getContext('2d');
              probeCtx.drawImage(game.canvas, 0, 0, 60, 60);
              const data = probeCtx.getImageData(0, 0, 60, 60).data;
              let sum = 0, max = 0;
              for (let i = 0; i < data.length; i += 4) {
                const v = data[i] + data[i + 1] + data[i + 2];
                sum += v; if (v > max) max = v;
              }
              return { mean: Math.round(sum / (60 * 60)), max };
            } catch (error) { return String(error && error.message); }
          };

          game.voidMode = true;
          game.__gateSliceVoidActive = true;
          // drawHyperspaceTunnel rather than drawScene: occult-field-runtime.js
          // replaces this method, and its replacement is what owns the artwork
          // and the M40.5 Void treatment. Calling it directly tests the
          // installed path with no dependence on the rest of the frame.
          for (let f = 0; f < 120; f += 1) {
            game.frames += 1;
            game.drawHyperspaceTunnel('#00ffff');
          }
          // Captured before anything else touches the module, so this counts
          // only what the 120 drawn frames did. Probing first and subtracting
          // later confused the two and made the number unreadable.
          const buildsFromDrawing = edges.buildCount() - buildsBefore;
          // Is anything at all being painted? A pure-black Void frame means the
          // artwork branch never ran; non-black means it ran and only the edge
          // layer is missing. That distinction is what to chase next.
          const voidPixels = sample();
          game.__gateSliceVoidActive = false;
          game.voidMode = false;
          const lvl = game.gameLevels[game.currentLevelIdx] || {};
          const resolved = game.levelImage(lvl);
          voidDraw = {
            builds: buildsFromDrawing,
            cached: edges.cacheSize(),
            maxEdgeDim: edges.MAX_EDGE_DIM,
            maxCached: edges.MAX_CACHED_LAYERS,
            // Without these the builds assertion can pass at zero simply
            // because the background never loaded, which is a green test that
            // proves nothing.
            // The copy's own fields are deliberately reported alongside the
            // resolved image: they are what a shallow snapshot taken at Start
            // sees, and copyLoaded being false while resolvedImage is true is
            // the bug this milestone fixed.
            copyLoaded: Boolean(lvl.loaded),
            resolvedImage: Boolean(resolved),
            naturalWidth: resolved ? resolved.naturalWidth : 0,
            levelIdx: game.currentLevelIdx,
            levelCount: game.gameLevels.length,
            poolLoaded: MASTER_POOL.filter(entry => entry && entry.loaded).length,
            resolvedNaturalWidth: resolved ? resolved.naturalWidth : 0,
            voidPixels,
            occultFieldInstalled: Boolean(window.__SEX_MAGICK_OCCULT_FIELD__),
            backgroundEntryLoaded: Boolean(window.__SEX_MAGICK_GATE_SLICE__?.getBackgroundEntry?.()?.loaded)
          };
        }

        return {
          modules,
          finite,
          perfect,
          missAccounting,
          voidDraw,
          wager: { frames: wagerFrames, sawConstellation: sawConstellationDuringWager }
        };
      })();
    `);

    assert.ok(constellation.modules.polygram, 'tools/polygram.js must load from index.html');
    assert.ok(constellation.modules.constellation, 'tools/void-constellation.js must load from index.html');

    // The pre-M40.6 spawn was one star per 10 frames for as long as the
    // corridor ran - 30 of them, unbounded. A set you can finish is the whole
    // premise of the streak and the completion bonus.
    assert.ok(
      constellation.finite.total >= constellation.modules.minStars &&
      constellation.finite.total <= constellation.modules.maxStars,
      `a corridor must hold a bounded set, saw total ${constellation.finite.total}`
    );
    assert.equal(
      constellation.finite.spawned, constellation.finite.total,
      `the corridor must spawn exactly its set, saw ${constellation.finite.spawned} of ${constellation.finite.total}`
    );
    assert.ok(
      constellation.finite.pointsSeen.every(points =>
        points >= constellation.modules.minPoints && points <= constellation.modules.maxPoints),
      `every star must be a drawable polygram order, saw ${JSON.stringify(constellation.finite.pointsSeen)}`
    );
    // The set must actually span the corridor. A fixed spawn interval left the
    // smallest set finishing in 120 of 300 frames, with the rest of the section
    // empty - the reason spawn pacing is derived from the corridor's countdown.
    assert.ok(
      constellation.finite.lastSpawnFrame >= 200,
      `the set must span the corridor, last star arrived at frame ${constellation.finite.lastSpawnFrame} of 300`
    );

    assert.ok(constellation.perfect.completed, 'catching every star must complete the set');
    assert.ok(
      constellation.perfect.maxOrder > constellation.perfect.minOrder,
      `a streak must raise the star order, saw ${constellation.perfect.minOrder}..${constellation.perfect.maxOrder}`
    );
    // The owner asked for stars worth significantly more than the old flat +10.
    assert.ok(
      constellation.perfect.scoreGain > constellation.perfect.total * 40,
      `clearing a set must dwarf the old 10-a-star rate, saw ${constellation.perfect.scoreGain} for ${constellation.perfect.total} stars`
    );

    assert.equal(
      constellation.missAccounting.after, constellation.missAccounting.before + 1,
      'a star retired twice - once by the splice, once by the compaction filter - must break the streak only once'
    );

    assert.ok(constellation.voidDraw, 'tools/void-edge-layer.js must load from index.html');
    // Guards the two assertions below against passing on a Void that never drew:
    // the first attempt at this measured zero builds and looked green, because
    // the background had not loaded and nothing ran at all.
    assert.ok(
      constellation.voidDraw.occultFieldInstalled && constellation.voidDraw.backgroundEntryLoaded,
      'the artwork path must be live before its Void behaviour can be measured'
    );
    assert.ok(
      constellation.voidDraw.builds >= 1,
      'the Void must build an edge layer at all - zero means it never drew'
    );
    // One Sobel pass across 120 drawn Void frames. Anything above a handful
    // means the cache is missing and the pass has become a per-frame cost.
    assert.ok(
      constellation.voidDraw.builds <= 2,
      `the edge layer must be built once per background, saw ${constellation.voidDraw.builds} builds across 120 frames`
    );
    assert.ok(
      constellation.voidDraw.cached <= constellation.voidDraw.maxCached,
      `the layer cache must stay bounded, saw ${constellation.voidDraw.cached}`
    );
    // The milestone's actual claim, in pixels: the Void is not a black screen.
    assert.ok(
      constellation.voidDraw.voidPixels && constellation.voidDraw.voidPixels.max > 0,
      `the Void must render something, saw ${JSON.stringify(constellation.voidDraw.voidPixels)}`
    );

    // Guards against the assertion below passing vacuously on zero sampled frames.
    assert.ok(
      constellation.wager.frames > 30,
      `the wager must survive long enough to be measured, saw ${constellation.wager.frames} frames`
    );
    assert.equal(
      constellation.wager.sawConstellation, false,
      'the Void wager is a wall run, not a star section: it must never build a constellation'
    );

    console.log('gate-slice-browser: all integration checks passed');
    console.log(JSON.stringify({ ...result, requestedUrls, punch, quiet, backgrounds: { gallerySize: backgrounds.gallery.size, seen: backgrounds.seen }, corridors, constellation }, null, 2));
  } finally {
    client.close();
    for (const child of children.reverse()) {
      if (!child.killed) child.kill('SIGTERM');
    }
    await removeProfile(userDataDir);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  for (const child of children.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exitCode = 1;
});