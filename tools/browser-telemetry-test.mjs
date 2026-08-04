import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.TELEMETRY_QA_HTTP_PORT || 4175);
const DEBUG_PORT = Number(process.env.TELEMETRY_QA_DEBUG_PORT || 9224);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
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
      if (attempt === 6) {
        console.warn(`Chrome profile cleanup skipped: ${error.message}`);
        return;
      }
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
      if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
      }
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
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => this.listeners.set(method, listeners.filter(item => item !== listener));
  }

  waitForEvent(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, params => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(params);
      });
    });
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
    throw new Error(
      response.exceptionDetails.exception?.description ||
      response.exceptionDetails.text ||
      'Runtime.evaluate failed'
    );
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-telemetry-'));
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
    const loaded = client.waitForEvent('Page.loadEventFired');
    await client.send('Page.navigate', { url: `${BASE_URL}/index.html?telemetryQa=${Date.now()}#debug` });
    await loaded;
    await waitForExpression(
      client,
      `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_TIMING__ && !!globalThis.__SEX_MAGICK_RUNS__`
    );

    const result = await evaluate(client, `
      (async () => {
        __SEX_MAGICK_RUNS__.clearHistory();
        localStorage.removeItem(__SEX_MAGICK_RUNS__.storageKey);

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
        Haptics.jump = () => {};
        Haptics.collect = () => {};
        Haptics.crash = () => {};
        Haptics.levelUp = () => {};
        Haptics.start = () => {};
        Leaderboard.submit = () => {};
        Game.prototype.drawScene = function () {};

        game.settings.music = false;
        game.settings.sfx = false;
        game.settings.vibration = false;
        game.gameMode = 'HEX';
        game.startGame();

        const started = __SEX_MAGICK_RUNS__.getSnapshot();
        const firstRunId = started.current.runId;
        const queueAfterStart = __qaRafQueue.length;

        game.frames = 2;
        game.player = {
          x: 100,
          y: 400,
          r: CONFIG.PLAYER_RADIUS,
          vy: 0,
          update() {},
          draw() {},
          jump() {}
        };
        game.obstacles = [{
          x: 50,
          w: 10,
          marked: false,
          update() {},
          collides() { return false; }
        }];
        game.collectibles = [];
        game.pentagrams = [];
        game.particles = [];
        game.updateGameObjects();

        game.togglePause();
        game.togglePause();
        game.startVoidMode();
        game.endVoidMode();
        game.gameOver();
        await Promise.resolve();

        const afterDeath = __SEX_MAGICK_RUNS__.getSnapshot();
        const storedAfterDeath = JSON.parse(localStorage.getItem(__SEX_MAGICK_RUNS__.storageKey));

        const retryEvent = new KeyboardEvent('keydown', {
          code: 'KeyR',
          key: 'r',
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(retryEvent);

        const afterRetry = __SEX_MAGICK_RUNS__.getSnapshot();
        const retryRunId = afterRetry.current.runId;
        const retryState = game.state;
        const retryScore = game.score;
        const retryFrames = game.frames;
        const queueAfterRetry = __qaRafQueue.length;

        __SEX_MAGICK_RUNS__.setDebug(true);
        const panel = document.getElementById('sex-magick-run-telemetry');
        const hint = document.getElementById('sex-magick-fast-retry-hint');

        game.returnToMenu();
        const finalSnapshot = __SEX_MAGICK_RUNS__.getSnapshot();
        const storedJson = localStorage.getItem(__SEX_MAGICK_RUNS__.storageKey) || '';

        return {
          runtimeVersion: __SEX_MAGICK_RUNS__.version,
          privacy: __SEX_MAGICK_RUNS__.privacy,
          firstRunId,
          retryRunId,
          queueAfterStart,
          queueAfterRetry,
          deathCurrent: afterDeath.current,
          deathRun: afterDeath.recent[0],
          storedAfterDeathCount: storedAfterDeath.length,
          retryEventPrevented: retryEvent.defaultPrevented,
          retryState,
          retryScore,
          retryFrames,
          retryStartReason: afterRetry.current.startReason,
          panelVisible: panel && !panel.hidden,
          panelText: panel?.textContent || '',
          hintText: hint?.textContent || '',
          finalCurrent: finalSnapshot.current,
          finalRecentCount: finalSnapshot.recent.length,
          finalEndReasons: finalSnapshot.recent.map(run => run.endReason),
          forbiddenPersistence: ['player_identifier', 'session_token', 'userAgent', 'ipAddress', 'deviceId']
            .filter(term => storedJson.includes(term))
        };
      })()
    `);

    assert.equal(result.runtimeVersion, 1);
    assert.equal(result.privacy, 'local-gameplay-only-no-account-or-device-identifiers');
    assert.match(result.firstRunId, /^run_[a-z0-9]+_[a-z0-9]+$/);
    assert.notEqual(result.retryRunId, result.firstRunId);
    assert.equal(result.queueAfterStart, 1, 'start must create one pending RAF chain');
    assert.equal(result.deathCurrent, null, 'death must finalize the current run');
    assert.equal(result.deathRun.rite, 'HEX');
    assert.equal(result.deathRun.startReason, 'menu');
    assert.equal(result.deathRun.endReason, 'death');
    assert.equal(result.deathRun.finalScore, 1);
    assert.equal(result.deathRun.scoreEvents.length, 1);
    assert.equal(result.deathRun.scoreEvents[0].delta, 1);
    assert.equal(result.deathRun.scoreEvents[0].source, 'gate');
    assert.equal(result.deathRun.voidEntries, 1);
    assert.equal(result.deathRun.lifecycleEvents.some(event => event.type === 'pause'), true);
    assert.equal(result.deathRun.lifecycleEvents.some(event => event.type === 'resume'), true);
    assert.equal(result.deathRun.lifecycleEvents.some(event => event.type === 'void-enter'), true);
    assert.equal(result.deathRun.lifecycleEvents.some(event => event.type === 'void-exit'), true);
    assert.equal(result.deathRun.timing.mode, 'fixed-step-runtime');
    assert.equal(result.storedAfterDeathCount, 1);
    assert.equal(result.retryEventPrevented, true);
    assert.equal(result.retryState, 'playing');
    assert.equal(result.retryScore, 0);
    assert.equal(result.retryFrames, 0, 'retry must synchronously reset simulation frames');
    assert.equal(result.retryStartReason, 'retry');
    assert.equal(result.queueAfterRetry, 1, 'retry must preserve one pending RAF chain');
    assert.equal(result.panelVisible, true);
    assert.match(result.panelText, /RUN TELEMETRY/);
    assert.equal(result.hintText, '[ TAP / SPACE / R TO RETRY ]');
    assert.equal(result.finalCurrent, null);
    assert.equal(result.finalRecentCount, 2);
    assert.deepEqual(result.finalEndReasons, ['menu', 'death']);
    assert.deepEqual(result.forbiddenPersistence, []);
    assert.equal(exceptions.length, 0, `Browser emitted ${exceptions.length} uncaught exception(s)`);

    console.log('telemetry-browser: all integration checks passed');
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
