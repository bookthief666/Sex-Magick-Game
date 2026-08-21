import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M19_QA_HTTP_PORT || 4192);
const DEBUG_PORT = Number(process.env.M19_QA_DEBUG_PORT || 9240);
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

// Places a pillar squarely on top of the player so the next collision test is
// guaranteed lethal, without waiting for one to happen naturally.
const LETHAL_PILLAR = `
  (() => {
    const p = new Pillar(0, 40);
    p.gap = 40;
    p.top = game.player.y - 200;
    p.baseTop = p.top;
    p.x = game.player.x - (p.w / 2);
    p.marked = false;
    p.motionAmplitude = 0;
    game.obstacles = [p];
    return p;
  })()
`;

async function openGame(client, query) {
  await client.send('Page.navigate', { url: `${BASE_URL}/index.html?${query}` });
  await waitForExpression(
    client,
    `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_POWERUPS__`
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m19-powerups-'));
  // Deliberately the no-cache server rather than `python -m http.server`. The
  // 2026-08-12 session was corrupted by heuristic caching serving a stale Gate
  // slice, so the suite exercises the same server the owner is told to use.
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
    // --- unlocks arrive by ascent, charges by challenge --------------------
    await openGame(client, `gateSlice=1&m19Qa=${Date.now()}`);

    // The check that would have caught the wasted round in one line.
    const fingerprint = await evaluate(client, `
      (() => ({
        gateSlice: globalThis.__SEX_MAGICK_GATE_SLICE__.getFingerprint(),
        grammarVersion: globalThis.__SEX_MAGICK_PATTERNS__?.version ?? null,
        powerupsVersion: globalThis.__SEX_MAGICK_POWERUPS__.version
      }))();
    `);
    assert.equal(fingerprint.gateSlice.gateEntryRadius, 44, 'a stale Gate slice is being served');
    assert.equal(fingerprint.gateSlice.bandCount, 8, 'the extended band table is not the one running');
    assert.equal(fingerprint.gateSlice.bandNames.at(-1), 'KETHER');
    assert.equal(fingerprint.grammarVersion, 2, 'a stale obstacle grammar is being served');

    const climb = await evaluate(client, `
      (() => {
        ${HARNESS}
        const api = globalThis.__SEX_MAGICK_POWERUPS__;
        api.reset();
        const atStart = api.getPowerups();

        game.gameMode = 'HEX';
        game.startGame();
        game.gameOver = () => {};
        const holdY = game.canvas.height / 2;

        let afterYesod = null;
        for (let frame = 0; frame < 20000; frame += 1) {
          if (game.player) { game.player.y = holdY; game.player.vy = 0; }
          game.runFixedSimulationStep();
          if (!afterYesod && game.gateSliceState && game.gateSliceState.bandIndex >= 1) {
            afterYesod = api.getPowerups();
          }
        }

        return {
          atStart,
          afterYesod,
          atEnd: api.getPowerups(),
          bandIndex: game.gateSliceState.bandIndex,
          gatesCleared: game.gateSliceState.gatesCleared,
          voidSurvivals: game.gateSliceState.voidSurvivals,
          snapshot: api.getSnapshot(),
          gatesPerCharge: api.gatesPerCharge
        };
      })();
    `);

    // D-062: AEGIS is unlocked from MALKUTH by design - the band gate is what
    // kept the owner from ever holding the only power-up. Unlocked-but-empty is
    // the correct opening state, and the HUD now says EMPTY rather than leaving
    // it to be inferred.
    assert.ok(climb.atStart.every(entry => entry.charges === 0), 'no charges may be held in MALKUTH');
    assert.ok(climb.bandIndex >= 3, `the probe run only reached band ${climb.bandIndex}`);

    const aegisEnd = climb.atEnd.find(entry => entry.id === 'aegis');
    assert.ok(aegisEnd.unlocked, 'AEGIS is unlocked from the first band');

    // Charges must have been earned from real play, not granted.
    const expectedMinimum = Math.floor(climb.gatesCleared / climb.gatesPerCharge) + climb.voidSurvivals;
    assert.ok(expectedMinimum > 0, 'the probe run earned no charges to check');
    assert.ok(
      climb.snapshot.earned > 0,
      `no charges earned across ${climb.gatesCleared} gates and ${climb.voidSurvivals} Void survivals`
    );
    for (const entry of climb.atEnd) {
      assert.ok(entry.charges <= entry.capacity, `${entry.id} exceeded its cap in a real run`);
    }

    // --- AEGIS absorbs a crash --------------------------------------------
    const absorbed = await evaluate(client, `
      (() => {
        const api = globalThis.__SEX_MAGICK_POWERUPS__;
        // Restore the real gameOver the climb stubbed out, then start a fresh run
        // so the milestone marker and the run's gate count agree - the climb left
        // 100+ gates behind it, which would otherwise award charges mid-probe.
        delete game.gameOver;
        api.reset();
        game.startGame();
        api.grant('aegis', 1);
        const before = api.getPowerups().find(x => x.id === 'aegis').charges;

        game.state = GameState.PLAYING;
        const pillar = ${LETHAL_PILLAR};
        game.updateGameObjects();

        return {
          before,
          after: api.getPowerups().find(x => x.id === 'aegis').charges,
          state: game.state,
          playing: game.state === GameState.PLAYING,
          pillarGone: !game.obstacles.includes(pillar),
          hitStop: game.hitStop
        };
      })();
    `);

    assert.equal(absorbed.before, 1, 'the probe needs exactly one shield charge');
    assert.equal(absorbed.after, 0, 'AEGIS must be consumed by the crash it absorbs');
    assert.equal(absorbed.playing, true, 'the run must continue after an absorb');
    assert.equal(absorbed.pillarGone, true, 'the blocking pillar must dissolve so the next frame is survivable');
    assert.ok(absorbed.hitStop > 0, 'an absorb must register as an impact');

    // --- AEGIS covers the Void too, since D-062 ---------------------------
    // The exception was defensible - the Void is the wager - but invisible: a
    // player crashing inside a Gate run saw the shield decline for a reason
    // nothing on screen ever stated. A wall is a wall.
    const voidDeath = await evaluate(client, `
      (() => {
        const api = globalThis.__SEX_MAGICK_POWERUPS__;
        api.reset();
        game.startGame();
        api.grant('aegis', 1);
        const before = api.getPowerups().find(x => x.id === 'aegis').charges;

        game.state = GameState.PLAYING;
        game.__gateSliceVoidActive = true;
        game.voidMode = false;
        ${LETHAL_PILLAR};
        game.updateGameObjects();

        return {
          before,
          after: api.getPowerups().find(x => x.id === 'aegis').charges,
          state: game.state,
          died: game.state === GameState.GAME_OVER
        };
      })();
    `);

    assert.equal(voidDeath.before, 1);
    assert.equal(voidDeath.after, 0, 'AEGIS is spent on a wall inside the Void as anywhere else');
    assert.equal(voidDeath.died, false, 'and the run continues');

    // D-062 retired DISSOLUTION and the Void exception. The sections that
    // asserted "the breaker fires before the shield" and "neither covers the
    // Void" are gone with them: there is one power-up now, and a wall is a wall
    // wherever the player hits it. The absorb assertions above are the contract.

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
