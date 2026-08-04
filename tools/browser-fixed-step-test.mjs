import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.QA_HTTP_PORT || 4173);
const DEBUG_PORT = Number(process.env.QA_DEBUG_PORT || 9222);
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const STEP_MS = 1000 / 60;
const childProcesses = [];
const EXTERNAL_BLOCKED_URLS = Object.freeze([
  'https://cdn.tailwindcss.com/*',
  'https://fonts.googleapis.com/*',
  'https://fonts.gstatic.com/*',
  'https://lh3.googleusercontent.com/*',
  'https://cdn.jsdelivr.net/*',
  'https://7l3mo9bh.api.lootlocker.io/*'
]);
const FIXED_STEP_RUNTIME_URLS = Object.freeze([
  `${BASE_URL}/tools/fixed-step-clock.js`,
  `${BASE_URL}/tools/fixed-step-prototype.js`
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeChromeProfile(targetPath) {
  const retryableCodes = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM']);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!retryableCodes.has(error.code)) throw error;
      if (attempt === 6) {
        console.warn(`Chrome profile cleanup skipped after ${attempt} attempts: ${error.message}`);
        return;
      }
      await sleep(attempt * 100);
    }
  }
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
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
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
      this.socket.addEventListener('error', event => {
        clearTimeout(timeout);
        reject(new Error(`CDP WebSocket error: ${event.message || 'unknown'}`));
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
        const handlers = this.listeners.get(message.method) || [];
        for (const handler of [...handlers]) handler(message.params || {});
      }
    });
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP socket unavailable for ${method}`));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) || [];
    handlers.push(handler);
    this.listeners.set(method, handlers);
    return () => {
      const current = this.listeners.get(method) || [];
      this.listeners.set(method, current.filter(item => item !== handler));
    };
  }

  waitForEvent(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, params => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(params);
      });
    });
  }

  close() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
  }
}

async function evaluate(client, expression, { awaitPromise = true } = {}) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Unknown Runtime.evaluate exception';
    throw new Error(description);
  }
  return response.result?.value;
}

async function waitForExpression(client, expression, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(client, expression);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for expression: ${expression}\n${lastError?.message || ''}`);
}

async function navigate(client, url, viewport = { width: 1280, height: 720 }) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    mobile: Boolean(viewport.mobile)
  });

  const loaded = client.waitForEvent('Page.loadEventFired', 15_000);
  await client.send('Page.navigate', { url });
  await loaded;
  await waitForExpression(client, `typeof game !== 'undefined' && !!game && typeof GameState !== 'undefined'`, 10_000);
}

async function injectScript(client, src) {
  return evaluate(client, `
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ${JSON.stringify(src)};
      script.onload = () => resolve(script.src);
      script.onerror = () => reject(new Error('Failed to load ' + script.src));
      document.head.appendChild(script);
    })
  `);
}

const TEST_SETUP = `
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
    SFX.playTone = async () => {};
    Haptics.jump = () => {};
    Haptics.collect = () => {};
    Haptics.crash = () => {};
    Haptics.levelUp = () => {};
    Haptics.start = () => {};

    Game.prototype.drawScene = function () {};
    Game.prototype.gameOver = function () {};
    Game.prototype.checkLevel = function () {};
    Player.prototype.update = function () {
      this.y = window.innerHeight / 2;
      this.vy = 0;
      if (this.jumpCooldown > 0) this.jumpCooldown -= 1;
    };

    game.settings.music = false;
    game.settings.sfx = false;
    game.settings.vibration = false;
    game.gameMode = 'HEX';
    game.startGame();

    globalThis.__qaDriveFrames = ({ hz, seconds, baseTimeMs }) => {
      const frameCount = Math.round(hz * seconds);
      const intervalMs = 1000 / hz;
      for (let index = 1; index <= frameCount; index += 1) {
        const entry = globalThis.__qaRafQueue.shift();
        if (!entry) throw new Error('RAF queue emptied at render frame ' + index);
        entry.callback(baseTimeMs + index * intervalMs);
      }
      return {
        renderFrames: frameCount,
        simulationFrames: game.frames,
        score: game.score,
        obstacleCount: game.obstacles.length,
        queueLength: globalThis.__qaRafQueue.length,
        state: game.state,
        timing: globalThis.__SEX_MAGICK_TIMING__?.getSnapshot?.() || null
      };
    };

    return {
      initialSimulationFrames: game.frames,
      queueLength: globalThis.__qaRafQueue.length,
      timing: globalThis.__SEX_MAGICK_TIMING__?.getSnapshot?.() || null
    };
  })()
`;

async function prepareRun(client, mode, viewport = { width: 1280, height: 720 }) {
  await client.send('Network.setBlockedURLs', {
    urls: mode === 'baseline'
      ? [...EXTERNAL_BLOCKED_URLS, ...FIXED_STEP_RUNTIME_URLS]
      : EXTERNAL_BLOCKED_URLS
  });

  await navigate(client, `${BASE_URL}/index.html?browserQa=${Date.now()}#debug`, viewport);

  if (mode === 'fixed' && !(await evaluate(client, `!!globalThis.__SEX_MAGICK_TIMING__`))) {
    await injectScript(client, `${BASE_URL}/tools/fixed-step-clock.js`);
    await injectScript(client, `${BASE_URL}/tools/fixed-step-prototype.js`);
  }

  if (mode === 'fixed') {
    await waitForExpression(client, `!!globalThis.__SEX_MAGICK_TIMING__`);
  }

  return evaluate(client, TEST_SETUP);
}

async function runRateCase(client, mode, hz, seconds = 10) {
  const setup = await prepareRun(client, mode);
  assert.equal(setup.queueLength, 1, `${mode} ${hz} Hz should start with exactly one pending RAF`);

  const baseTimeMs = mode === 'fixed'
    ? setup.timing.clock.lastTimeMs ?? setup.timing.lastAdvance?.rawDeltaMs ?? 0
    : 0;

  // The public snapshot intentionally omits lastTimeMs. Obtain it directly from the test page.
  const resolvedBaseTimeMs = mode === 'fixed'
    ? await evaluate(client, `game.fixedStepClock.lastTimeMs`)
    : baseTimeMs;

  const result = await evaluate(client, `__qaDriveFrames(${JSON.stringify({ hz, seconds, baseTimeMs: resolvedBaseTimeMs })})`);
  assert.equal(result.queueLength, 1, `${mode} ${hz} Hz should retain one pending RAF`);
  assert.equal(result.state, 'playing', `${mode} ${hz} Hz should remain in PLAYING state`);
  return result;
}

async function testRefreshRateBehavior(client) {
  const rates = [60, 90, 120, 144];
  const fixedResults = [];
  for (const hz of rates) fixedResults.push({ hz, ...(await runRateCase(client, 'fixed', hz)) });

  for (const result of fixedResults) {
    assert.ok(
      Math.abs(result.simulationFrames - 601) <= 1,
      `fixed ${result.hz} Hz produced ${result.simulationFrames} simulation frames; expected ~601`
    );
    assert.equal(result.timing.clock.suspensionResets, 0, `fixed ${result.hz} Hz unexpectedly reset for suspension`);
    assert.equal(result.timing.clock.droppedMs, 0, `fixed ${result.hz} Hz unexpectedly dropped simulation time`);
  }

  const baseline60 = await runRateCase(client, 'baseline', 60);
  const baseline120 = await runRateCase(client, 'baseline', 120);
  const baseline144 = await runRateCase(client, 'baseline', 144);

  assert.equal(baseline60.simulationFrames, 601, 'baseline 60 Hz should preserve the original 60 Hz tuning reference');
  assert.equal(baseline120.simulationFrames, 1201, 'baseline 120 Hz should demonstrate the existing frame-rate bug');
  assert.equal(baseline144.simulationFrames, 1441, 'baseline 144 Hz should demonstrate the existing frame-rate bug');

  const fixed60 = fixedResults.find(result => result.hz === 60);
  assert.ok(Math.abs(fixed60.simulationFrames - baseline60.simulationFrames) <= 1, 'fixed 60 Hz should preserve baseline step count');

  return { fixedResults, baseline60, baseline120, baseline144 };
}

async function testLifecycleInvariants(client) {
  const setup = await prepareRun(client, 'fixed');
  const baseTimeMs = await evaluate(client, `game.fixedStepClock.lastTimeMs`);

  const rapidCycles = await evaluate(client, `
    (() => {
      for (let index = 0; index < 50; index += 1) {
        game.togglePause();
        game.togglePause();
      }
      const afterPauseQueue = __qaRafQueue.length;
      for (let index = 0; index < 50; index += 1) game.restartGame();
      return {
        afterPauseQueue,
        afterRestartQueue: __qaRafQueue.length,
        state: game.state,
        pendingRaf: game.fixedStepRafId != null
      };
    })()
  `);

  assert.equal(rapidCycles.afterPauseQueue, 1, 'rapid pause/resume must not create duplicate RAF callbacks');
  assert.equal(rapidCycles.afterRestartQueue, 1, 'fifty restarts must not create duplicate RAF callbacks');
  assert.equal(rapidCycles.state, 'playing');
  assert.equal(rapidCycles.pendingRaf, true);

  const pausedFrameCase = await evaluate(client, `
    (() => {
      game.togglePause();
      const queued = __qaRafQueue.shift();
      if (!queued) throw new Error('Expected a queued RAF while paused');
      queued.callback(${baseTimeMs + STEP_MS});
      const afterPausedCallback = {
        state: game.state,
        queueLength: __qaRafQueue.length,
        pendingRaf: game.fixedStepRafId != null
      };
      game.togglePause();
      return {
        afterPausedCallback,
        afterResume: {
          state: game.state,
          queueLength: __qaRafQueue.length,
          pendingRaf: game.fixedStepRafId != null
        }
      };
    })()
  `);

  assert.equal(pausedFrameCase.afterPausedCallback.state, 'paused');
  assert.equal(pausedFrameCase.afterPausedCallback.queueLength, 0, 'a paused callback should terminate the RAF chain');
  assert.equal(pausedFrameCase.afterPausedCallback.pendingRaf, false);
  assert.equal(pausedFrameCase.afterResume.state, 'playing');
  assert.equal(pausedFrameCase.afterResume.queueLength, 1, 'resume should start exactly one new RAF chain');
  assert.equal(pausedFrameCase.afterResume.pendingRaf, true);

  return { setup, rapidCycles, pausedFrameCase };
}

async function testSuspensionReset(client) {
  const setup = await prepareRun(client, 'fixed');
  const baseTimeMs = await evaluate(client, `game.fixedStepClock.lastTimeMs`);
  const result = await evaluate(client, `
    (() => {
      const beforeFrames = game.frames;
      const queued = __qaRafQueue.shift();
      if (!queued) throw new Error('Expected pending RAF before suspension test');
      queued.callback(${baseTimeMs + 1000});
      return {
        beforeFrames,
        afterFrames: game.frames,
        queueLength: __qaRafQueue.length,
        snapshot: __SEX_MAGICK_TIMING__.getSnapshot()
      };
    })()
  `);

  assert.equal(result.afterFrames, result.beforeFrames, 'suspension frame must not advance gameplay');
  assert.equal(result.queueLength, 1, 'simulation should resume with one RAF after suspension reset');
  assert.equal(result.snapshot.clock.suspensionResets, 1);
  assert.equal(result.snapshot.lastAdvance.suspensionReset, true);
  assert.equal(result.snapshot.lastAdvance.steps, 0);
  return { setup, result };
}

async function testViewportResizing(client) {
  await navigate(client, `${BASE_URL}/index.html?viewportQa=${Date.now()}#debug`, { width: 390, height: 844, mobile: true });
  const phone = await evaluate(client, `({
    innerWidth,
    innerHeight,
    canvasWidth: game.canvas.width,
    canvasHeight: game.canvas.height,
    hexButton: !!document.getElementById('startHexBtn'),
    monasButton: !!document.getElementById('startMonasBtn')
  })`);
  assert.deepEqual(
    { width: phone.canvasWidth, height: phone.canvasHeight },
    { width: phone.innerWidth, height: phone.innerHeight },
    'phone canvas should match viewport CSS size'
  );
  assert.equal(phone.hexButton && phone.monasButton, true);

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 884,
    height: 1104,
    deviceScaleFactor: 1,
    mobile: true
  });
  await sleep(100);
  const fold = await evaluate(client, `({
    innerWidth,
    innerHeight,
    canvasWidth: game.canvas.width,
    canvasHeight: game.canvas.height
  })`);
  assert.deepEqual(
    { width: fold.canvasWidth, height: fold.canvasHeight },
    { width: fold.innerWidth, height: fold.innerHeight },
    'Fold-open canvas should remap to the new viewport'
  );

  return { phone, fold };
}

async function main() {
  const chromeBinary = process.env.CHROME_BIN || findCommand(['google-chrome', 'chromium', 'chromium-browser']);
  assert.ok(chromeBinary, 'Chrome/Chromium executable not found');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-chrome-'));
  const pythonBinary = findCommand(['python3', 'python']);
  assert.ok(pythonBinary, 'Python executable not found for local HTTP server');

  const server = spawn(pythonBinary, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  childProcesses.push(server);
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
  childProcesses.push(chrome);

  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const pageTarget = targets.find(target => target.type === 'page');
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'Chrome page target not found');

  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Network.enable');
  await client.send('Network.setBlockedURLs', { urls: EXTERNAL_BLOCKED_URLS });

  const exceptions = [];
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));

  try {
    const refreshRate = await testRefreshRateBehavior(client);
    console.log('PASS refresh-rate integration', JSON.stringify(refreshRate, null, 2));

    const lifecycle = await testLifecycleInvariants(client);
    console.log('PASS lifecycle invariants', JSON.stringify(lifecycle, null, 2));

    const suspension = await testSuspensionReset(client);
    console.log('PASS suspension reset', JSON.stringify(suspension, null, 2));

    const viewports = await testViewportResizing(client);
    console.log('PASS viewport resizing', JSON.stringify(viewports, null, 2));

    assert.equal(exceptions.length, 0, `Browser emitted ${exceptions.length} uncaught exception(s)`);
    console.log('All fixed-step browser integration checks passed.');
  } finally {
    client.close();
    for (const child of childProcesses.reverse()) {
      if (!child.killed) child.kill('SIGTERM');
    }
    await removeChromeProfile(userDataDir);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  for (const child of childProcesses.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exitCode = 1;
});
