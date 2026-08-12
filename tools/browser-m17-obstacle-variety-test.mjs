import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M17_QA_HTTP_PORT || 4186);
const DEBUG_PORT = Number(process.env.M17_QA_DEBUG_PORT || 9236);
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m17-variety-'));
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
      url: `${BASE_URL}/index.html?gateSlice=1&m17Qa=${Date.now()}`
    });
    await waitForExpression(
      client,
      `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_GATE_SLICE__ && !!globalThis.SexMagickObstacleVariety`
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

        const variety = globalThis.SexMagickObstacleVariety;
        const installed = Boolean(globalThis.__SEX_MAGICK_OBSTACLE_VARIETY__);
        const verifiedStaticGap = variety.VERIFIED_STATIC_GAP;

        game.gameMode = 'HEX';
        game.startGame();

        // This test is about the geometry the grammar produces, not about
        // surviving it. Neutralise death and hold the player mid-screen so the
        // spawn stream keeps running long enough to sample every band's output.
        game.gameOver = () => {};
        const holdY = game.canvas.height / 2;

        // Drive enough simulation to spawn a long stream of pillars, sampling
        // every one the grammar produces before it scrolls away.
        const observed = [];
        const seenPillars = new Set();
        let corridorViolations = 0;
        let subFloorGaps = 0;
        let motionExceeded = 0;

        for (let frame = 0; frame < 20000; frame += 1) {
          if (game.player) { game.player.y = holdY; game.player.vy = 0; }
          game.runFixedSimulationStep();
          for (const pillar of game.obstacles) {
            if (seenPillars.has(pillar)) continue;
            seenPillars.add(pillar);
            const amplitude = Number(pillar.motionAmplitude);
            const gap = Number(pillar.gap);
            if (!(gap - (2 * Math.max(0, amplitude)) >= verifiedStaticGap - 1e-6)) corridorViolations += 1;
            if (!(gap >= verifiedStaticGap - 1e-6)) subFloorGaps += 1;
            observed.push({
              patternId: pillar.patternId,
              gap,
              gapScale: Number(pillar.gapScale),
              amplitude,
              phase: Number(pillar.motionPhase),
              baseTop: Number(pillar.baseTop)
            });
          }
        }

        // A pillar's rendered top must never leave the swing it was clamped to.
        const swingProbe = game.obstacles[0] || null;
        let swingExceeded = 0;
        if (swingProbe) {
          const base = swingProbe.baseTop;
          const allowed = Math.max(0, Number(swingProbe.motionAmplitude));
          for (let frame = 0; frame < 400; frame += 1) {
            game.frames = frame;
            swingProbe.update(0);
            if (Math.abs(swingProbe.top - base) > allowed + 1e-6) swingExceeded += 1;
          }
          swingProbe.baseTop = base;
        }

        for (const entry of observed) {
          if (Math.abs(entry.amplitude) > variety.MOTION_MAX_AMPLITUDE_PX + 1e-6) motionExceeded += 1;
        }

        return {
          hudBandName: (document.getElementById('gate-slice-band') || {}).textContent || null,
          installed,
          verifiedStaticGap,
          maxMotionAmplitude: variety.MOTION_MAX_AMPLITUDE_PX,
          pillarsObserved: observed.length,
          distinctPatterns: [...new Set(observed.map(x => x.patternId))].length,
          distinctPhases: [...new Set(observed.map(x => x.phase))].length,
          distinctAmplitudes: [...new Set(observed.map(x => Math.round(x.amplitude * 100)))].length,
          distinctGapScales: [...new Set(observed.map(x => x.gapScale))].length,
          movingPillars: observed.filter(x => x.amplitude > 0).length,
          stillPillars: observed.filter(x => x.amplitude === 0).length,
          minGap: Math.min(...observed.map(x => x.gap)),
          maxAmplitudeSeen: Math.max(...observed.map(x => x.amplitude)),
          corridorViolations,
          subFloorGaps,
          motionExceeded,
          swingExceeded,
          swingProbed: Boolean(swingProbe),
          gatesCleared: game.gateSliceState ? game.gateSliceState.gatesCleared : 0,
          bandIndex: game.gateSliceState ? game.gateSliceState.bandIndex : -1
        };
      })();
    `);

    assert.ok(result.installed, 'the obstacle variety runtime must install in the real page');
    assert.equal(result.verifiedStaticGap, 110);

    assert.ok(result.pillarsObserved > 40, `expected a long pillar stream, saw ${result.pillarsObserved}`);

    // The safety invariant, checked against every pillar the game actually built.
    assert.equal(result.corridorViolations, 0, 'a spawned pillar left less than the verified corridor');
    assert.equal(result.subFloorGaps, 0, 'a spawned pillar had a gap below the verified floor');
    assert.equal(result.motionExceeded, 0, 'a spawned pillar exceeded the motion ceiling');
    assert.ok(result.minGap >= 110 - 1e-6, `narrowest spawned gap was ${result.minGap}`);

    // The variety is real, not nominal.
    assert.ok(result.distinctPatterns >= 4, `expected several patterns, saw ${result.distinctPatterns}`);
    assert.ok(result.distinctPhases > 5, `walls are still moving in lockstep: ${result.distinctPhases} phases`);
    assert.ok(result.distinctAmplitudes >= 3, `expected varied motion, saw ${result.distinctAmplitudes} amplitudes`);
    assert.ok(result.distinctGapScales >= 3, `expected varied gaps, saw ${result.distinctGapScales} scales`);
    assert.ok(result.movingPillars > 0, 'no pillar actually moved');
    assert.ok(result.stillPillars > 0, 'no pillar held still');

    // Motion stays inside the amplitude it was clamped to, frame by frame.
    assert.ok(result.swingProbed, 'the swing probe needs at least one live pillar');
    assert.equal(result.swingExceeded, 0, 'a pillar swung beyond its clamped amplitude');

    // The curve keeps escalating past where it used to stop. GEBURAH is band 3
    // and used to be the ceiling; a run this long must now be beyond it.
    assert.ok(
      result.gatesCleared > 32,
      `the probe run only cleared ${result.gatesCleared} gates, too few to exercise the extension`
    );
    assert.ok(
      result.bandIndex > 3,
      `band index stalled at ${result.bandIndex} after ${result.gatesCleared} gates; the curve still ends at GEBURAH`
    );
    assert.ok(
      typeof result.hudBandName === 'string' && result.hudBandName.length > 0,
      'the HUD must name the band the run reached'
    );
    assert.ok(
      !['MALKUTH', 'YESOD', 'TIPHARETH', 'GEBURAH'].includes(result.hudBandName),
      `the HUD still shows a pre-M17 band: ${result.hudBandName}`
    );

    assert.deepEqual(exceptions, [], `page threw: ${JSON.stringify(exceptions.map(e => e.text))}`);
    assert.equal(
      requestedUrls.some(url => url.includes('lootlocker.io')),
      false,
      'M17 must not initiate LootLocker requests'
    );

    console.log('m17-obstacle-variety-browser: all integration checks passed');
    console.log(JSON.stringify({
      pillarsObserved: result.pillarsObserved,
      distinctPatterns: result.distinctPatterns,
      distinctPhases: result.distinctPhases,
      distinctAmplitudes: result.distinctAmplitudes,
      distinctGapScales: result.distinctGapScales,
      movingPillars: result.movingPillars,
      stillPillars: result.stillPillars,
      minGap: result.minGap,
      maxAmplitudeSeen: result.maxAmplitudeSeen,
      gatesCleared: result.gatesCleared,
      bandIndex: result.bandIndex,
      hudBandName: result.hudBandName
    }, null, 2));
  } finally {
    await client.close();
    for (const child of children) child.kill('SIGKILL');
    // Chrome can still be releasing its profile; removeProfile retries rather
    // than failing an otherwise-passing run on ENOTEMPTY.
    await removeProfile(userDataDir);
  }
}

main().catch(error => {
  for (const child of children) child.kill('SIGKILL');
  console.error(error);
  process.exit(1);
});
