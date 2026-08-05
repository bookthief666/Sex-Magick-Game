import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M10_QA_HTTP_PORT || 4187);
const DEBUG_PORT = Number(process.env.M10_QA_DEBUG_PORT || 9237);
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m10-'));
  const server = spawn(pythonBinary, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(server);
  await waitForHttp(`${BASE_URL}/index.html`);

  const chrome = spawn(chromeBinary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
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
    await client.send('Page.navigate', {
      url: `${BASE_URL}/index.html?gateSlice=1&assetMode=offline&renderDpr=native&session=m10-${Date.now()}`
    });
    await waitForExpression(client, `
      typeof game !== 'undefined' && !!game &&
      !!globalThis.__SEX_MAGICK_RENDER__ &&
      !!globalThis.__SEX_MAGICK_ASSETS__ &&
      !!globalThis.__SEX_MAGICK_VIEWPORT__ &&
      globalThis.__SEX_MAGICK_ASSETS__.getSnapshot()?.summary?.pending === 0
    `);

    const closed = await evaluate(client, `
      (() => {
        const render = __SEX_MAGICK_RENDER__.getSnapshot();
        const assets = __SEX_MAGICK_ASSETS__.getSnapshot();
        const viewport = __SEX_MAGICK_VIEWPORT__.getSnapshot();
        const descriptors = {
          width: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width'),
          height: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height')
        };
        const nativeWidth = descriptors.width.get.call(game.canvas);
        const nativeHeight = descriptors.height.get.call(game.canvas);
        const transform = game.ctx.getTransform();
        const allLevelsReady = MASTER_POOL.every(level => level.loaded && level.img && level.img.complete);
        const uniqueFallbacks = new Set(MASTER_POOL.map(level => level.img)).size;
        const source = MASTER_POOL[0].img;
        game.ctx.save();
        game.ctx.drawImage(source, 0, 0, 120, 80);
        game.ctx.restore();

        const originalGetImageData = game.ctx.getImageData;
        const originalRandom = Math.random;
        let glitchReadbackSafe = false;
        game.ctx.getImageData = () => { throw new Error('getImageData must not be used in DPR-safe glitch mode'); };
        Math.random = () => 0;
        try {
          const effect = GlitchFX.rgbSplit(game.ctx, 1);
          if (!effect) throw new Error('DPR-safe glitch effect was not created');
          effect.draw(game.ctx, game.canvas.width, game.canvas.height);
          glitchReadbackSafe = true;
        } finally {
          Math.random = originalRandom;
          game.ctx.getImageData = originalGetImageData;
        }

        return {
          viewport,
          render,
          assets,
          logicalWidth: game.canvas.width,
          logicalHeight: game.canvas.height,
          nativeWidth,
          nativeHeight,
          transform: { a: transform.a, d: transform.d, e: transform.e, f: transform.f },
          allLevelsReady,
          uniqueFallbacks,
          totalLevels: MASTER_POOL.length,
          glitchReadbackSafe,
          menuVisible: !document.getElementById('menuButtons').classList.contains('hidden')
        };
      })()
    `);

    const catalogImageRequests = requestedUrls.filter(url =>
      url.startsWith('https://lh3.googleusercontent.com/d/') &&
      !url.includes('1BXrXXd9TKSqCFNwvS-cJpNORbyvP6fkR')
    );

    assert.equal(closed.viewport.profile, 'fold-closed');
    assert.equal(closed.logicalWidth, 368);
    assert.equal(closed.logicalHeight, 869);
    assert.equal(closed.render.effectiveDpr, 2.625);
    assert.equal(closed.render.backingWidth, 966);
    assert.equal(closed.render.backingHeight, 2281);
    assert.equal(closed.nativeWidth, 966);
    assert.equal(closed.nativeHeight, 2281);
    assert.ok(Math.abs(closed.transform.a - closed.render.scaleX) < 1e-6);
    assert.ok(Math.abs(closed.transform.d - closed.render.scaleY) < 1e-6);
    assert.equal(closed.assets.assetMode, 'offline');
    assert.equal(closed.assets.networkAttempts, 0);
    assert.equal(closed.assets.summary.pending, 0);
    assert.equal(closed.assets.summary.fallback, closed.totalLevels);
    assert.equal(closed.allLevelsReady, true);
    assert.ok(closed.assets.fallbackSurfaceCount <= 8);
    assert.equal(closed.uniqueFallbacks, closed.assets.fallbackSurfaceCount);
    assert.equal(closed.glitchReadbackSafe, true);
    assert.equal(closed.menuVisible, true);
    assert.equal(catalogImageRequests.length, 0, `Offline mode requested catalog images: ${catalogImageRequests.join(', ')}`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 884,
      height: 1104,
      deviceScaleFactor: 2.625,
      mobile: true
    });
    await waitForExpression(client, 'innerWidth === 884 && innerHeight === 1104');
    await evaluate(client, `
      __SEX_MAGICK_VIEWPORT__.refresh();
      __SEX_MAGICK_RENDER__.refresh();
      true;
    `);
    await waitForExpression(client, `
      __SEX_MAGICK_VIEWPORT__.getSnapshot()?.profile === 'fold-open' &&
      __SEX_MAGICK_RENDER__.getSnapshot()?.logicalWidth === 884
    `);

    const open = await evaluate(client, `
      (() => {
        const render = __SEX_MAGICK_RENDER__.getSnapshot();
        const viewport = __SEX_MAGICK_VIEWPORT__.getSnapshot();
        const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
        const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
        const transform = game.ctx.getTransform();
        return {
          viewport,
          render,
          logicalWidth: game.canvas.width,
          logicalHeight: game.canvas.height,
          nativeWidth: widthDescriptor.get.call(game.canvas),
          nativeHeight: heightDescriptor.get.call(game.canvas),
          transform: { a: transform.a, d: transform.d }
        };
      })()
    `);

    assert.equal(open.viewport.profile, 'fold-open');
    assert.equal(open.logicalWidth, 884);
    assert.equal(open.logicalHeight, 1104);
    assert.equal(open.render.effectiveDpr, 2.625);
    assert.equal(open.render.backingWidth, 2321);
    assert.equal(open.render.backingHeight, 2898);
    assert.equal(open.nativeWidth, 2321);
    assert.equal(open.nativeHeight, 2898);
    assert.ok(open.render.backingPixels <= open.render.maxBackingPixels);
    assert.ok(Math.abs(open.transform.a - open.render.scaleX) < 1e-6);
    assert.ok(Math.abs(open.transform.d - open.render.scaleY) < 1e-6);
    assert.equal(exceptions.length, 0, `Browser exceptions: ${JSON.stringify(exceptions)}`);

    const result = {
      closed,
      open,
      catalogImageRequests,
      browserExceptions: exceptions.length
    };
    console.log('m10-render-resilience-browser: all integration checks passed');
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