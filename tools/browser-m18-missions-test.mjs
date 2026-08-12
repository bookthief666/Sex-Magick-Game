import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M18_QA_HTTP_PORT || 4188);
const DEBUG_PORT = Number(process.env.M18_QA_DEBUG_PORT || 9238);
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


// Shared page setup: silence audio, make requestAnimationFrame manual so the
// simulation can be stepped deterministically.
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
`;

async function openGame(client, query) {
  await client.send('Page.navigate', { url: `${BASE_URL}/index.html?${query}` });
  await waitForExpression(
    client,
    `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_MISSIONS__`
  );
  await waitForExpression(
    client,
    `!document.getElementById('menuButtons').classList.contains('hidden')`
  );
}

async function main() {
  const chromeBinary = process.env.CHROME_BIN || findCommand(['google-chrome', 'chromium', 'chromium-browser']);
  const pythonBinary = findCommand(['python3', 'python']);
  assert.ok(chromeBinary, 'Chrome/Chromium executable not found');
  assert.ok(pythonBinary, 'Python executable not found');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m18-missions-'));
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
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true
  });

  const exceptions = [];
  const requestedUrls = [];
  client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
  client.on('Network.requestWillBeSent', event => requestedUrls.push(event.request?.url || ''));

  try {
    // --- a real run advances and completes missions ------------------------
    await openGame(client, `gateSlice=1&m18Qa=${Date.now()}`);

    const played = await evaluate(client, `
      (() => {
        ${HARNESS}
        const api = globalThis.__SEX_MAGICK_MISSIONS__;
        api.reset();

        const before = api.getActive();
        game.gameMode = 'HEX';
        game.startGame();

        // Geometry is not the subject here; keep the run alive so mission
        // progress has something to accrue from.
        game.gameOver = () => {};
        const holdY = game.canvas.height / 2;

        const hudBeforeRun = document.getElementById('sex-magick-missions');
        const hudVisibleAtStart = Boolean(hudBeforeRun) && !hudBeforeRun.hidden;

        for (let frame = 0; frame < 20000; frame += 1) {
          if (game.player) { game.player.y = holdY; game.player.vy = 0; }
          game.runFixedSimulationStep();
        }

        const during = api.getActive();
        const hud = document.getElementById('sex-magick-missions');

        return {
          before,
          during,
          hudVisibleAtStart,
          hudPresent: Boolean(hud),
          hudHidden: hud ? hud.hidden : null,
          hudText: hud ? hud.textContent.replace(/\\s+/g, ' ').trim() : '',
          hudRows: hud ? hud.querySelectorAll('.sm-mission').length : 0,
          gatesCleared: game.gateSliceState ? game.gateSliceState.gatesCleared : 0,
          snapshot: api.getSnapshot()
        };
      })();
    `);

    assert.equal(played.before.length, 3, 'three missions must be active from the start');
    assert.equal(played.hudPresent, true, 'the missions HUD must exist');
    assert.equal(played.hudHidden, false, 'the missions HUD must be visible during play');
    assert.equal(played.hudRows, 3, 'the HUD must show one row per active mission');
    assert.ok(played.hudText.length > 0, 'the HUD must render mission text');
    assert.ok(played.gatesCleared > 20, `the probe run only cleared ${played.gatesCleared} gates`);

    // Progress must have moved somewhere across a run this long.
    const movedIds = played.during.filter(entry => entry.progress > 0).map(entry => entry.id);
    const rotatedIn = played.during.some(entry => !played.before.some(prior => prior.id === entry.id));
    assert.ok(
      movedIds.length > 0 || rotatedIn,
      `no mission advanced or rotated across ${played.gatesCleared} gates`
    );

    // Active set stays well-formed after live play.
    assert.equal(played.during.length, 3);
    assert.equal(new Set(played.during.map(entry => entry.id)).size, 3, 'no duplicate active missions');
    for (const entry of played.during) {
      assert.ok(entry.progress >= 0 && entry.progress <= entry.target, `${entry.id} out of range`);
    }

    // --- completion rotates a replacement in -------------------------------
    const rotated = await evaluate(client, `
      (() => {
        const api = globalThis.__SEX_MAGICK_MISSIONS__;
        const before = api.getActive();
        const target = before[0];
        // Park the mission one step from done, then take that step for real.
        api.forceProgress(target.id, target.target - 1);
        const state = game.gateSliceState;
        const previous = JSON.parse(JSON.stringify(state));
        state.gatesCleared += 1;
        state.gateEntries += 1;
        state.gateBanks += 1;
        state.voidSurvivals += 1;
        state.riskStreak += 1;
        state.bandIndex = 7;
        state.scoreBreakdown.bank += 500;
        state.lastClear = { family: 'climax', zone: 'risk-top', riskActive: true, nearMiss: true };
        game.updateGameObjects();
        const after = api.getActive();
        const announce = document.getElementById('sex-magick-missions-announce');
        return {
          completedId: target.id,
          before: before.map(x => x.id),
          after: after.map(x => x.id),
          announceShown: Boolean(announce) && !announce.hidden,
          announceText: announce ? announce.textContent : '',
          completedCount: api.getSnapshot().completed[target.id] || 0
        };
      })();
    `);

    assert.ok(
      !rotated.after.includes(rotated.completedId),
      `${rotated.completedId} completed but stayed active`
    );
    assert.equal(rotated.after.length, 3, 'the freed slot must be refilled');
    assert.equal(new Set(rotated.after).size, 3, 'rotation must not duplicate a mission');
    assert.equal(rotated.completedCount, 1, 'completion must be recorded');
    assert.ok(rotated.announceShown, 'completing a mission must announce it');
    assert.match(rotated.announceText, /RITE FULFILLED/);

    // --- progress survives a real reload -----------------------------------
    const persistedBefore = await evaluate(client, `
      (() => {
        const api = globalThis.__SEX_MAGICK_MISSIONS__;
        const active = api.getActive();
        const tracked = active.find(entry => entry.target > 3) || active[0];
        api.forceProgress(tracked.id, 2);
        return { id: tracked.id, progress: 2, active: active.map(x => x.id) };
      })();
    `);

    await openGame(client, `gateSlice=1&m18Qa=${Date.now()}-reload`);

    const afterReload = await evaluate(client, `
      (() => {
        const api = globalThis.__SEX_MAGICK_MISSIONS__;
        const snapshot = api.getSnapshot();
        return {
          progress: snapshot.progress[${JSON.stringify(persistedBefore.id)}] ?? null,
          active: api.getActive().map(x => x.id)
        };
      })();
    `);

    assert.equal(
      afterReload.progress,
      persistedBefore.progress,
      'mission progress must survive a page reload, not just an in-memory reset'
    );
    assert.deepEqual(
      afterReload.active,
      persistedBefore.active,
      'the active set must survive a page reload'
    );

    // --- the HUD stays out of visual QA ------------------------------------
    await openGame(client, `gateSlice=1&visualQa=1&m18Qa=${Date.now()}-visual`);

    const underVisualQa = await evaluate(client, `
      (() => {
        ${HARNESS}
        const api = globalThis.__SEX_MAGICK_MISSIONS__;
        game.gameMode = 'HEX';
        game.startGame();
        game.gameOver = () => {};
        for (let frame = 0; frame < 400; frame += 1) game.runFixedSimulationStep();
        const hud = document.getElementById('sex-magick-missions');
        return {
          suppressed: api.hudSuppressed(),
          hudHidden: hud ? hud.hidden : true,
          announceHidden: (document.getElementById('sex-magick-missions-announce') || { hidden: true }).hidden
        };
      })();
    `);

    assert.equal(underVisualQa.suppressed, true, 'visualQa=1 must suppress the missions HUD');
    assert.equal(underVisualQa.hudHidden, true, 'the HUD must not render under visual QA');
    assert.equal(underVisualQa.announceHidden, true, 'announcements must not render under visual QA');

    assert.deepEqual(exceptions, [], `page threw: ${JSON.stringify(exceptions.map(e => e.text))}`);
    assert.equal(
      requestedUrls.some(url => url.includes('lootlocker.io')),
      false,
      'missions must not initiate LootLocker requests'
    );

    console.log('m18-missions-browser: all integration checks passed');
    console.log(JSON.stringify({
      gatesCleared: played.gatesCleared,
      activeAtStart: played.before.map(x => `${x.label} 0/${x.target}`),
      activeAfterRun: played.during.map(x => `${x.label} ${x.progress}/${x.target}`),
      rotatedOut: rotated.completedId,
      rotatedIn: rotated.after.filter(id => !rotated.before.includes(id)),
      persistedAcrossReload: `${persistedBefore.id} = ${afterReload.progress}`
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
