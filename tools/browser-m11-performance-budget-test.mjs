import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M11_QA_HTTP_PORT || 4188);
const DEBUG_PORT = Number(process.env.M11_QA_DEBUG_PORT || 9238);
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const children = [];
const BLOCKED = [
  'https://cdn.tailwindcss.com/*',
  'https://fonts.googleapis.com/*',
  'https://fonts.gstatic.com/*',
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
      const timer = setTimeout(() => reject(new Error('CDP open timeout')), 10_000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP socket error')); }, { once: true });
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

async function waitForExpression(client, expression, timeoutMs = 20_000) {
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
  throw new Error(`Timed out waiting for: ${expression}\n${lastError?.message || ''}`);
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m11-'));
  const server = spawn(pythonBinary, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(server);
  await waitForHttp(`${BASE_URL}/index.html`);

  const chrome = spawn(chromeBinary, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--mute-audio',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank'
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
  await client.send('Network.setBlockedURLs', { urls: BLOCKED });
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
  const requestedUrls = [];
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
  client.on('Network.requestWillBeSent', event => requestedUrls.push(event.request.url));

  try {
    const url = `${BASE_URL}/index.html?assetMode=offline&renderDpr=native&perfProbe=1&perfPanel=1&perfWarmupFrames=0&perfSampleFrames=120&perfMaxSegments=4&viewportProfile=fold-closed&session=m11-${Date.now()}`;
    await client.send('Page.navigate', { url });
    await waitForExpression(client, `
      typeof game !== 'undefined' && !!game &&
      !!globalThis.__SEX_MAGICK_PERFORMANCE__ &&
      !!globalThis.__SEX_MAGICK_RENDER__ &&
      !!globalThis.__SEX_MAGICK_ASSETS__ &&
      !!globalThis.__SEX_MAGICK_VIEWPORT__ &&
      globalThis.__SEX_MAGICK_ASSETS__.getSnapshot()?.summary?.pending === 0
    `);
    await waitForExpression(client, `!document.getElementById('menuButtons')?.classList.contains('hidden')`);

    const storageBefore = await evaluate(client, `Object.keys(localStorage).sort()`);
    await evaluate(client, `
      (() => {
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
        CONFIG.ORB_SPAWN_CHANCE = 0;
        Game.prototype.gameOver = function () {};
        Game.prototype.checkLevel = function () {};
        Player.prototype.update = function () {
          this.y = innerHeight / 2;
          this.vy = 0;
          if (this.jumpCooldown > 0) this.jumpCooldown -= 1;
        };
        game.settings.music = false;
        game.settings.sfx = false;
        game.settings.vibration = false;
        game.gameMode = 'HEX';
        game.startGame();
        return true;
      })()
    `);

    await waitForExpression(client, `
      __SEX_MAGICK_PERFORMANCE__.getSnapshot().segments.at(-1)?.frameIntervals?.count >= 120
    `, 30_000);

    await evaluate(client, `
      (() => {
        const start = performance.now();
        while (performance.now() - start < 65) {}
        return true;
      })()
    `);
    await sleep(150);

    const closed = await evaluate(client, `
      (() => {
        const snapshot = __SEX_MAGICK_PERFORMANCE__.getSnapshot();
        const segment = snapshot.segments.at(-1);
        const panel = document.getElementById('smPerformancePanel');
        return {
          snapshot,
          segment,
          panelVisible: !!panel && !panel.hidden,
          panelText: panel?.innerText || '',
          downloadType: typeof __SEX_MAGICK_PERFORMANCE__.downloadReport,
          runtimeScriptPresent: !!document.querySelector('script[data-sex-magick-performance-budget-runtime]')
        };
      })()
    `);

    assert.equal(closed.snapshot.mode, 'local-opt-in-performance-budget-probe');
    assert.equal(closed.snapshot.version, 1);
    assert.equal(closed.snapshot.active, true);
    assert.equal(closed.snapshot.options.sampleLimit, 120);
    assert.equal(closed.segment.context.profile, 'fold-closed');
    assert.equal(closed.segment.context.logicalWidth, 368);
    assert.equal(closed.segment.context.logicalHeight, 869);
    assert.equal(closed.segment.context.effectiveDpr, 2.625);
    assert.equal(closed.segment.context.backingWidth, 966);
    assert.equal(closed.segment.context.backingHeight, 2281);
    assert.equal(closed.segment.frameIntervals.count, 120);
    assert.ok(closed.segment.frameIntervals.p50 > 0);
    assert.ok(closed.segment.frameIntervals.p95 > 0);
    assert.ok(closed.segment.drawDurations.count > 0);
    assert.ok(closed.segment.callbackDurations.count > 0);
    assert.ok(closed.segment.droppedSimulationMs >= 0);
    assert.ok(closed.segment.suspensionResets >= 0);
    assert.equal(typeof closed.snapshot.environment.longTaskObserverSupported, 'boolean');
    assert.equal(closed.snapshot.startup.assets.assetMode, 'offline');
    assert.equal(closed.snapshot.startup.assets.networkAttempts, 0);
    assert.ok(closed.snapshot.startup.assets.durationMs >= 0);
    assert.equal(closed.panelVisible, true);
    assert.match(closed.panelText, /PERF PROBE · LOCAL/);
    assert.equal(closed.downloadType, 'function');
    assert.equal(closed.runtimeScriptPresent, true);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 884,
      height: 1104,
      deviceScaleFactor: 2.625,
      mobile: true
    });
    await waitForExpression(client, 'innerWidth === 884 && innerHeight === 1104');
    await evaluate(client, `
      (() => {
        __SEX_MAGICK_VIEWPORT__.refresh();
        __SEX_MAGICK_RENDER__.refresh();
        if (game.state !== GameState.PLAYING) {
          game.state = GameState.PLAYING;
          game.resetFixedStepTiming();
          game.scheduleFixedStepFrame();
        }
        return true;
      })()
    `);

    await waitForExpression(client, `
      __SEX_MAGICK_PERFORMANCE__.getSnapshot().segments.at(-1)?.context?.profile === 'fold-open' &&
      __SEX_MAGICK_PERFORMANCE__.getSnapshot().segments.at(-1)?.frameIntervals?.count >= 30
    `, 20_000);

    const final = await evaluate(client, `
      (() => {
        const beforeStop = __SEX_MAGICK_PERFORMANCE__.getSnapshot();
        const stopped = __SEX_MAGICK_PERFORMANCE__.stop();
        return {
          beforeStop,
          stopped,
          storageAfter: Object.keys(localStorage).sort(),
          panelText: document.getElementById('smPerformancePanel')?.innerText || ''
        };
      })()
    `);

    assert.equal(final.beforeStop.segments.length, 2);
    assert.deepEqual(final.beforeStop.segments.map(segment => segment.context.profile), ['fold-closed', 'fold-open']);
    assert.equal(final.beforeStop.segments[1].context.logicalWidth, 884);
    assert.equal(final.beforeStop.segments[1].context.logicalHeight, 1104);
    assert.equal(final.beforeStop.segments[1].context.backingWidth, 2321);
    assert.equal(final.beforeStop.segments[1].context.backingHeight, 2898);
    assert.ok(final.beforeStop.aggregate.sampledFrames >= 150);
    assert.equal(final.stopped.active, false);
    assert.equal(final.stopped.currentSegmentId, null);
    assert.deepEqual(final.storageAfter, storageBefore);
    assert.equal(final.storageAfter.some(key => /perf|performance/i.test(key)), false);

    const catalogImageRequests = requestedUrls.filter(url =>
      url.startsWith('https://lh3.googleusercontent.com/d/') &&
      !url.includes('1BXrXXd9TKSqCFNwvS-cJpNORbyvP6fkR')
    );
    const lootLockerRequests = requestedUrls.filter(url => url.includes('lootlocker'));
    assert.equal(catalogImageRequests.length, 0, `Offline mode requested catalog images: ${catalogImageRequests.join(', ')}`);
    assert.equal(lootLockerRequests.length, 0, `Performance probe initiated LootLocker requests: ${lootLockerRequests.join(', ')}`);
    assert.equal(exceptions.length, 0, `Browser exceptions: ${JSON.stringify(exceptions)}`);

    const result = {
      closed: {
        profile: closed.segment.context.profile,
        dpr: closed.segment.context.effectiveDpr,
        backing: `${closed.segment.context.backingWidth}x${closed.segment.context.backingHeight}`,
        frameIntervals: closed.segment.frameIntervals,
        drawDurations: closed.segment.drawDurations,
        callbackDurations: closed.segment.callbackDurations,
        longFrames: closed.segment.longFrames,
        criticalFrames: closed.segment.criticalFrames,
        droppedSimulationMs: closed.segment.droppedSimulationMs,
        longTasks: closed.segment.longTasks,
        classification: closed.segment.classification
      },
      open: {
        profile: final.beforeStop.segments[1].context.profile,
        dpr: final.beforeStop.segments[1].context.effectiveDpr,
        backing: `${final.beforeStop.segments[1].context.backingWidth}x${final.beforeStop.segments[1].context.backingHeight}`,
        frameIntervals: final.beforeStop.segments[1].frameIntervals,
        classification: final.beforeStop.segments[1].classification
      },
      aggregate: final.beforeStop.aggregate,
      startup: closed.snapshot.startup,
      longTaskObserverSupported: closed.snapshot.environment.longTaskObserverSupported,
      storageKeys: final.storageAfter,
      catalogImageRequests,
      lootLockerRequests,
      browserExceptions: exceptions.length
    };
    console.log('m11-performance-budget-browser: all integration checks passed');
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
