import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M9_QA_HTTP_PORT || 4186);
const DEBUG_PORT = Number(process.env.M9_QA_DEBUG_PORT || 9236);
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const children = [];
const BLOCKED_URLS = [
  'https://cdn.tailwindcss.com/*',
  'https://fonts.googleapis.com/*',
  'https://fonts.gstatic.com/*',
  'https://lh3.googleusercontent.com/*',
  'https://cdn.jsdelivr.net/*',
  'https://7l3mo9bh.api.lootlocker.io/*'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
      await response.arrayBuffer();
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

class CDPClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP open timeout')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('CDP socket error'));
      }, { once: true });
    });

    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
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
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'evaluation failed');
  }
  return response.result?.value;
}

async function waitForExpression(client, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) return;
    } catch (_error) {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function removeProfile(directory) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (_error) {
      await sleep(100 * (attempt + 1));
    }
  }
}

async function main() {
  const chromeBinary = process.env.CHROME_BIN || findCommand(['google-chrome', 'chromium', 'chromium-browser']);
  const pythonBinary = findCommand(['python3', 'python']);
  assert.ok(chromeBinary, 'Chrome/Chromium not found');
  assert.ok(pythonBinary, 'Python not found');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m9-'));
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
  const page = targets.find(target => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target missing');

  const client = new CDPClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setBlockedURLs', { urls: BLOCKED_URLS });
  await client.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 368,
    height: 869,
    deviceScaleFactor: 2.625,
    mobile: true
  });

  const exceptions = [];
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));

  try {
    await client.send('Page.navigate', {
      url: `${BASE_URL}/index.html?gateSlice=1&inputBuffer=3&viewportProfile=fold-closed&session=m9-browser-${Date.now()}`
    });
    await waitForExpression(client, `
      typeof game !== 'undefined' && !!game &&
      !!globalThis.__SEX_MAGICK_GATE_SLICE__ &&
      !!globalThis.__SEX_MAGICK_GATE_EVIDENCE__ &&
      !!globalThis.__SEX_MAGICK_VIEWPORT__
    `);

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
        for (const key of ['jump', 'collect', 'crash', 'levelUp', 'voidEnter', 'playTone']) SFX[key] = () => {};
        for (const key of ['jump', 'collect', 'crash', 'levelUp', 'start']) Haptics[key] = () => {};
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
        __SEX_MAGICK_GATE_EVIDENCE__.startSession({ sessionId: 'm9-browser' });

        game.gateSliceState.gatesCleared = 6;
        game.gateSliceState.bandIndex = 1;
        game.applyLevel();
        game.frames = 1;
        game.player.y = 187;
        const gatesBeforeUnsafe = game.gateSliceState.gatesCleared;
        const scoreBeforeUnsafe = game.score;
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
        const gatesAfterUnsafe = game.gateSliceState.gatesCleared;
        const scoreAfterUnsafe = game.score;
        const afterUnsafe = __SEX_MAGICK_GATE_EVIDENCE__.getSessionSnapshot();

        game.obstacles = [];
        __SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
        __SEX_MAGICK_GATE_SLICE__.spawnGateNow();
        game.gateSliceOffer.x = game.player.x + 160;
        game.gateSliceOffer.y = game.player.y + 90;
        game.frames = 10;
        game.updateGameObjects();
        game.player.y += 72;
        game.frames = 25;
        game.updateGameObjects();
        const duringDecision = __SEX_MAGICK_GATE_EVIDENCE__.getSessionSnapshot();
        game.gateSliceOffer.x = game.player.x + game.gameSpeed;
        game.gateSliceOffer.y = game.player.y;
        game.frames = 30;
        game.updateGameObjects();
        const afterEntry = __SEX_MAGICK_GATE_EVIDENCE__.stopSession();

        const syntheticRuns = Array.from({ length: 25 }, (_, index) => ({
          runId: 'synthetic-' + index,
          endedAt: 'done',
          gatesCleared: 1,
          gateOffers: index % 2,
          gateEntries: index % 4 === 1 ? 1 : 0,
          gateBanks: index % 4 === 3 ? 1 : 0,
          voidAttempts: index % 4 === 1 ? 1 : 0,
          voidSurvivals: index % 8 === 1 ? 1 : 0,
          voidDeaths: index % 8 === 5 ? 1 : 0
        }));

        return {
          viewport: __SEX_MAGICK_VIEWPORT__.getSnapshot(),
          htmlProfile: document.documentElement.dataset.smViewportProfile,
          gatesBeforeUnsafe,
          gatesAfterUnsafe,
          scoreBeforeUnsafe,
          scoreAfterUnsafe,
          unsafeCount: afterUnsafe.unsafeCrossings.length,
          duringDecision: duringDecision.activeDecision,
          afterEntry,
          syntheticAggregate: SexMagickGateEvidence.aggregateRuns(syntheticRuns)
        };
      })()
    `);

    assert.equal(result.viewport.profile, 'fold-closed');
    assert.equal(result.viewport.width, 368);
    assert.equal(result.viewport.height, 869);
    assert.equal(result.viewport.devicePixelRatio, 2.625);
    assert.equal(result.htmlProfile, 'fold-closed');
    assert.equal(result.gatesAfterUnsafe, result.gatesBeforeUnsafe, 'unsafe crossing must not increment Gate clears');
    assert.equal(result.scoreAfterUnsafe, result.scoreBeforeUnsafe, 'unsafe crossing must not increment score');
    assert.equal(result.unsafeCount, 1);
    assert.equal(result.duringDecision.movedTowardGate, true);
    assert.ok(result.duringDecision.framesVisible >= 15);
    assert.equal(result.afterEntry.decisionSummary.entries, 1);
    assert.equal(result.afterEntry.decisionSummary.deliberateEntryProxy, 1);
    assert.equal(result.syntheticAggregate.runsObserved, 25);
    assert.equal(exceptions.length, 0, `Browser exceptions: ${JSON.stringify(exceptions)}`);

    console.log('m9-runtime-hardening-browser: all integration checks passed');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    client.close();
    for (const child of children.reverse()) if (!child.killed) child.kill('SIGTERM');
    await removeProfile(userDataDir);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  for (const child of children.reverse()) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = 1;
});