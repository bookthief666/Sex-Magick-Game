import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M21_QA_HTTP_PORT || 4194);
const DEBUG_PORT = Number(process.env.M21_QA_DEBUG_PORT || 9242);
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

const HARNESS = `
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
  AudioSys.pause = () => {}; AudioSys.resume = () => {}; AudioSys.play = () => {};
  AudioSys.stop = () => {}; AudioSys.switchToGameMusic = () => {};
  AudioSys.switchToGameOverMusic = () => {}; AudioSys.switchToMenuMusic = () => {};
  SFX.jump = () => {}; SFX.collect = () => {}; SFX.crash = () => {};
  SFX.levelUp = () => {}; SFX.voidEnter = () => {}; SFX.playTone = () => {};
`;

// Counts lit pixels, which is how "did anything render" is answered without
// comparing screenshots.
const LIT = `
  (() => {
    const d = game.ctx.getImageData(0, 0, game.canvas.width, game.canvas.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 24) lit += 1;
    return lit;
  })()
`;

async function main() {
  const chromeBinary = process.env.CHROME_BIN || findCommand(['google-chrome', 'chromium', 'chromium-browser']);
  const pythonBinary = findCommand(['python3', 'python']);
  assert.ok(chromeBinary, 'Chrome/Chromium executable not found');
  assert.ok(pythonBinary, 'Python executable not found');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m21-aesthetic-'));
  const server = spawn(pythonBinary, ['tools/serve-playtest.py', String(HTTP_PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(server);
  await waitForHttp(`${BASE_URL}/index.html`);

  const chrome = spawn(chromeBinary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-default-apps', '--disable-extensions',
    '--mute-audio', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank'
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
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true
  });

  const exceptions = [];
  const requestedUrls = [];
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
  client.on('Network.requestWillBeSent', event => requestedUrls.push(event.request?.url || ''));

  try {
    // Deliberately offline: the whole point is that the field is the real art and
    // needs nothing from Google Drive to look finished.
    await client.send('Page.navigate', {
      url: `${BASE_URL}/index.html?gateSlice=1&assetMode=offline&m21Qa=${Date.now()}`
    });
    await waitForExpression(
      client,
      `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_OCCULT_FIELD__ && !!globalThis.__SEX_MAGICK_GATE_SLICE__`
    );
    await waitForExpression(client, `!document.getElementById('menuButtons').classList.contains('hidden')`);

    // --- the title card no longer comes off the network --------------------
    const title = await evaluate(client, `
      (() => {
        const screen = document.getElementById('startScreen');
        const background = getComputedStyle(screen).backgroundImage;
        return {
          generated: background.startsWith('url("data:image/png'),
          remote: background.includes('googleusercontent') || background.includes('drive.google')
        };
      })();
    `);
    assert.equal(title.remote, false, 'the first frame must not depend on Google Drive');
    assert.equal(title.generated, true, 'the title card must be generated locally');

    // --- the field renders with nothing fetched ----------------------------
    const rendered = await evaluate(client, `
      (() => {
        ${HARNESS}
        game.gameMode = 'HEX';
        game.startGame();
        game.gameOver = () => {};
        for (let f = 0; f < 400; f += 1) { game.player.y = game.canvas.height / 2; game.runFixedSimulationStep(); }
        game.drawScene(performance.now());
        return {
          lit: ${LIT},
          total: game.canvas.width * game.canvas.height,
          cacheSize: globalThis.__SEX_MAGICK_OCCULT_FIELD__.getCacheSize(),
          band: globalThis.__SEX_MAGICK_OCCULT_FIELD__.getBandName()
        };
      })();
    `);
    assert.ok(rendered.lit > rendered.total * 0.25, `the field barely rendered: ${rendered.lit}/${rendered.total} lit`);
    assert.ok(rendered.cacheSize > 0, 'strata must be cached, or the frame budget is unbounded');

    // The error card the owner hit in the first pilot must no longer be reachable.
    const errorText = await evaluate(client, `document.body.innerText.includes('SIGIL CHANNEL OFFLINE')`);
    assert.equal(errorText, false, 'the offline error card must not appear anywhere');

    // --- functional signals are untouched ----------------------------------
    // This is what keeps Gate entry rate comparable to the 46.4 and 54.5 baselines.
    const signals = await evaluate(client, `
      (() => {
        globalThis.__SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
        globalThis.__SEX_MAGICK_GATE_SLICE__.spawnGateNow();
        const offer = game.gateSliceOffer;
        const print = globalThis.__SEX_MAGICK_GATE_SLICE__.getFingerprint();
        const art = globalThis.SexMagickOccultArt;
        return {
          entryRadius: offer.entryRadius,
          outerRadius: offer.outerRadius,
          fingerprintEntry: print.gateEntryRadius,
          bandCount: print.bandCount,
          paletteCollisions: art.paletteCollisions(),
          reserved: art.RESERVED_COLORS
        };
      })();
    `);
    assert.equal(signals.entryRadius, 44, 'the M16 aperture must be untouched by the aesthetic pass');
    assert.equal(signals.fingerprintEntry, 44);
    assert.equal(signals.outerRadius, 60);
    assert.equal(signals.bandCount, 8);
    assert.deepEqual(signals.paletteCollisions, [], 'a palette entry collided with a reserved signal colour');
    assert.equal(signals.reserved.hexAura, '#00e5ff');
    assert.equal(signals.reserved.hazard, '#ff2f6d');
    assert.equal(signals.reserved.ward, '#c9b4ff');

    // --- the Void is visibly worse than ordinary play ----------------------
    const voidLook = await evaluate(client, `
      (() => {
        game.__gateSliceVoidActive = false; game.voidMode = false;
        game.drawScene(performance.now());
        const normal = ${LIT};
        game.__gateSliceVoidActive = true; game.voidMode = true; game.voidTimer = 60;
        game.drawScene(performance.now());
        const inVoid = ${LIT};
        game.__gateSliceVoidActive = false; game.voidMode = false;
        game.drawScene(performance.now());
        const restored = ${LIT};
        return { normal, inVoid, restored };
      })();
    `);
    assert.ok(voidLook.inVoid < voidLook.normal * 0.9,
      `the Void must visibly close in: ${voidLook.inVoid} lit against ${voidLook.normal} normally`);
    assert.ok(Math.abs(voidLook.restored - voidLook.normal) < voidLook.normal * 0.1,
      'leaving the Void must restore the field');

    // --- per-band palettes actually change the world -----------------------
    const bands = await evaluate(client, `
      (() => {
        const seen = {};
        for (const index of [0, 3, 7]) {
          game.gateSliceState.bandIndex = index;
          globalThis.__SEX_MAGICK_OCCULT_FIELD__.getBandName();
          game.drawScene(performance.now());
          const d = game.ctx.getImageData(game.canvas.width / 2, 40, 1, 1).data;
          seen[index] = [d[0], d[1], d[2]].join(',');
        }
        return seen;
      })();
    `);
    assert.equal(new Set(Object.values(bands)).size, 3,
      `each band must look different, saw ${JSON.stringify(bands)}`);

    // --- reduced motion keeps the artwork, drops the movement --------------
    const reduced = await evaluate(client, `
      (() => {
        document.documentElement.classList.add('sex-magick-reduced-motion');
        globalThis.__SEX_MAGICK_COLLISION__.setReducedMotion?.(true);
        game.drawScene(performance.now());
        const a = ${LIT};
        game.frames += 120;
        game.drawScene(performance.now());
        const b = ${LIT};
        document.documentElement.classList.remove('sex-magick-reduced-motion');
        globalThis.__SEX_MAGICK_COLLISION__.setReducedMotion?.(false);
        return { a, b };
      })();
    `);
    assert.ok(reduced.a > 0, 'reduced motion must keep the artwork, not blank it');

    // --- draw cost stays inside the frame budget ---------------------------
    const cost = await evaluate(client, `
      (() => {
        for (let f = 0; f < 10; f += 1) game.drawScene(performance.now());
        const start = performance.now();
        for (let f = 0; f < 60; f += 1) game.drawScene(performance.now());
        return (performance.now() - start) / 60;
      })();
    `);
    assert.ok(cost < 12, `per-frame draw cost ${cost.toFixed(2)}ms leaves no room in a 16.6ms frame`);

    assert.equal(
      requestedUrls.some(url => url.includes('googleusercontent') || url.includes('drive.google')),
      false,
      `the offline field must not reach for Drive at all; requested ${JSON.stringify(requestedUrls.filter(u => u.includes('googleusercontent') || u.includes('drive.google')))}`
    );
    assert.equal(requestedUrls.some(url => url.includes('lootlocker.io')), false);
    assert.deepEqual(exceptions, [], `page threw: ${JSON.stringify(exceptions.map(e => e.text))}`);

    console.log('m21-aesthetic-browser: all integration checks passed');
    console.log(JSON.stringify({
      titleGeneratedLocally: title.generated,
      litFraction: Number((rendered.lit / rendered.total).toFixed(3)),
      cachedLayers: rendered.cacheSize,
      voidDarkening: Number((1 - voidLook.inVoid / voidLook.normal).toFixed(3)),
      distinctBandLooks: new Set(Object.values(bands)).size,
      perFrameDrawMs: Number(cost.toFixed(2)),
      gateApertureUnchanged: signals.entryRadius === 44
    }, null, 2));
  } finally {
    await client.close();
    for (const child of children) child.kill('SIGKILL');
    await removeProfile(userDataDir);
  }
}

main().catch(error => {
  for (const child of children) child.kill('SIGKILL');
  console.error(error);
  process.exit(1);
});
