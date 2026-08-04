import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.COLLISION_QA_HTTP_PORT || 4174);
const DEBUG_PORT = Number(process.env.COLLISION_QA_DEBUG_PORT || 9223);
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-collision-'));
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
    await client.send('Page.navigate', { url: `${BASE_URL}/index.html?collisionQa=${Date.now()}#debug` });
    await loaded;
    await waitForExpression(
      client,
      `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_TIMING__ && !!globalThis.__SEX_MAGICK_COLLISION__`
    );

    const result = await evaluate(client, `
      (() => {
        AudioSys.pause = () => {};
        AudioSys.resume = () => {};
        AudioSys.play = () => {};
        AudioSys.stop = () => {};
        Haptics.jump = () => {};
        Haptics.collect = () => {};
        Haptics.crash = () => {};
        Haptics.levelUp = () => {};
        Haptics.start = () => {};

        const pillar = new Pillar(0, 180);
        pillar.x = 200;
        pillar.w = 80;
        pillar.top = 220;
        pillar.baseTop = 220;
        pillar.gap = 180;
        pillar.hasWarning = false;

        const rects = pillar.getCollisionRects(844);
        const safeGap = !pillar.collides(220, 240, 221, 399);
        const topCollision = pillar.collides(220, 240, 210, 230);
        const bottomCollision = pillar.collides(220, 240, 390, 410);
        const edgeTouchSafe = !pillar.collides(220, 240, 220, 230);

        __SEX_MAGICK_COLLISION__.setDebug(true);
        game.obstacles = [pillar];
        game.state = GameState.PLAYING;

        let jumpCount = 0;
        game.player = {
          x: 100,
          y: 300,
          r: CONFIG.PLAYER_RADIUS,
          vy: 0,
          jump() { jumpCount += 1; },
          update() {},
          draw() {}
        };

        const canvasTouch = new Event('touchstart', { bubbles: true, cancelable: true });
        game.canvas.dispatchEvent(canvasTouch);
        const afterUpperScreenTouch = jumpCount;

        const controlTouch = new Event('touchstart', { bubbles: true, cancelable: true });
        document.getElementById('pauseBtn').dispatchEvent(controlTouch);
        const afterControlTouch = jumpCount;

        let deathCount = 0;
        let obstacleUpdates = 0;
        game.gameOver = () => {
          deathCount += 1;
          game.state = GameState.GAME_OVER;
        };
        game.player = {
          x: 220,
          y: 210,
          r: CONFIG.PLAYER_RADIUS,
          vy: 0,
          update() {},
          draw() {}
        };
        pillar.update = () => { obstacleUpdates += 1; };
        pillar.marked = true;
        game.obstacles = [pillar];
        game.collectibles = [];
        game.pentagrams = [];
        game.particles = [];
        game.hitStop = 0;
        game.voidMode = false;
        game.state = GameState.PLAYING;
        game.fixedStepClock = new SexMagickFixedStep.FixedStepClock({
          stepMs: 1000 / 60,
          maxStepsPerFrame: 5,
          suspensionResetMs: 250
        });
        game.fixedStepClock.reset(0);
        game.fixedStepClock.advance(100, () => {
          if (game.state === GameState.PLAYING) game.runFixedSimulationStep();
        });

        return {
          runtimeVersion: __SEX_MAGICK_COLLISION__.version,
          rects,
          safeGap,
          topCollision,
          bottomCollision,
          edgeTouchSafe,
          debugEnabled: __SEX_MAGICK_COLLISION__.isDebugEnabled(),
          touchPolicy: __SEX_MAGICK_COLLISION__.getSnapshot().touchPolicy,
          indicatorText: document.querySelector('.mobile-jump-indicator')?.textContent,
          jumpAreaPointerEvents: getComputedStyle(document.querySelector('.mobile-jump-area')).pointerEvents,
          afterUpperScreenTouch,
          afterControlTouch,
          canvasTouchPrevented: canvasTouch.defaultPrevented,
          controlTouchPrevented: controlTouch.defaultPrevented,
          deathCount,
          obstacleUpdates,
          stateAfterCatchUp: game.state
        };
      })()
    `);

    assert.equal(result.runtimeVersion, 2);
    assert.equal(result.safeGap, true);
    assert.equal(result.topCollision, true);
    assert.equal(result.bottomCollision, true);
    assert.equal(result.edgeTouchSafe, true);
    assert.equal(result.debugEnabled, true);
    assert.equal(result.touchPolicy, 'full-screen-gameplay-excluding-controls');
    assert.equal(result.indicatorText, 'TAP ANYWHERE');
    assert.equal(result.jumpAreaPointerEvents, 'none');
    assert.equal(result.afterUpperScreenTouch, 1, 'upper-screen gameplay touch must jump');
    assert.equal(result.afterControlTouch, 1, 'touching a control must not jump');
    assert.equal(result.canvasTouchPrevented, true);
    assert.equal(result.controlTouchPrevented, false);
    assert.equal(result.deathCount, 1, 'catch-up must produce one death transition');
    assert.equal(result.obstacleUpdates, 1, 'simulation must stop after death changes state');
    assert.equal(result.stateAfterCatchUp, 'gameover');
    assert.equal(exceptions.length, 0, `Browser emitted ${exceptions.length} uncaught exception(s)`);

    console.log('collision-browser: all integration checks passed');
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
