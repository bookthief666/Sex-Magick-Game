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
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));

  try {
    await client.send('Page.navigate', {
      url: `${BASE_URL}/index.html?gateSlice=1&inputBuffer=3&gateSliceQa=${Date.now()}`
    });
    await waitForExpression(
      client,
      `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_GATE_SLICE__`
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
          leaderboardHidden: document.querySelector('.leaderboard-container').hidden
        };
        const orderedLevels = game.gameLevels.map(level => level.name);

        game.gateSliceState.gatesCleared = 6;
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

        game.__gateSliceVoidStartedAt = game.frames - 480;
        game.endVoidMode();
        const afterSurvival = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const scoreAfterSurvival = game.score;

        __SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
        __SEX_MAGICK_GATE_SLICE__.spawnGateNow();
        game.gateSliceOffer.x = game.player.x + game.gameSpeed;
        game.gateSliceOffer.y = game.player.y;
        game.frames = 500;
        game.updateGameObjects();
        game.gameOver();
        const afterDeath = __SEX_MAGICK_GATE_SLICE__.getSnapshot();
        const history = __SEX_MAGICK_GATE_SLICE__.getHistory();

        return {
          menu,
          orderedLevels,
          afterRisk,
          scoreAfterRisk,
          afterBank,
          scoreAfterBank,
          afterEntry,
          speedDuringVoid,
          afterSurvival,
          scoreAfterSurvival,
          afterDeath,
          history,
          finalState: game.state,
          inputBufferFrames: __SEX_MAGICK_COLLISION__.getInputBufferFrames(),
          hudPresent: Boolean(document.getElementById('gate-slice-hud')),
          localOnlyStatus: document.getElementById('uploadStatus').textContent
        };
      })()
    `);

    assert.equal(result.menu.monasDisabled, true);
    assert.match(result.menu.monasText, /SEALED/);
    assert.match(result.menu.hexText, /THE GATE/);
    assert.equal(result.menu.leaderboardHidden, true);
    assert.deepEqual(result.orderedLevels, ['MALKUTH', 'YESOD', 'TIPHARETH', 'GEBURAH']);

    assert.equal(result.afterRisk.state.gatesCleared, 7);
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
    assert.equal(result.speedDuringVoid, 5.7);

    assert.equal(result.afterSurvival.voidActive, false);
    assert.equal(result.afterSurvival.state.voidSurvivals, 1);
    assert.equal(result.afterSurvival.state.currentWager, 0);
    assert.equal(result.scoreAfterSurvival, 133);

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

    console.log('gate-slice-browser: all integration checks passed');
    console.log(JSON.stringify(result, null, 2));
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