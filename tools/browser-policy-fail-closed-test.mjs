import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.POLICY_QA_HTTP_PORT || 4180);
const DEBUG_PORT = Number(process.env.POLICY_QA_DEBUG_PORT || 9230);
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const children = [];

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
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
      else pending.resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
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

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-policy-'));
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
  await client.send('Network.setBlockedURLs', {
    urls: [
      '*reachability-policy.js*',
      'https://cdn.tailwindcss.com/*',
      'https://fonts.googleapis.com/*',
      'https://fonts.gstatic.com/*',
      'https://lh3.googleusercontent.com/*',
      'https://cdn.jsdelivr.net/*',
      'https://7l3mo9bh.api.lootlocker.io/*'
    ]
  });

  try {
    await client.send('Page.navigate', { url: `${BASE_URL}/index.html?policyFailClosedQa=${Date.now()}` });
    await waitForExpression(client, `typeof game !== 'undefined' && !!game && !!globalThis.__SEX_MAGICK_POLICY_BOOTSTRAP__`);
    await waitForExpression(
      client,
      `globalThis.__SEX_MAGICK_POLICY_BOOTSTRAP__?.getSnapshot?.().status === 'failed-closed'`,
      9_000
    );

    const result = await evaluate(client, `
      (() => {
        AudioSys.pause = () => {};
        AudioSys.resume = () => {};
        AudioSys.play = () => {};
        AudioSys.stop = () => {};
        const before = __SEX_MAGICK_POLICY_BOOTSTRAP__.getSnapshot();
        const hexButton = document.getElementById('startHexBtn');
        const monasButton = document.getElementById('startMonasBtn');
        game.gameMode = 'MONAS';
        game.state = GameState.PLAYING;
        game.updateGameObjects();
        return {
          before,
          after: __SEX_MAGICK_POLICY_BOOTSTRAP__.getSnapshot(),
          hexDisabled: Boolean(hexButton?.disabled),
          monasDisabled: Boolean(monasButton?.disabled),
          monasText: monasButton?.textContent || '',
          gameState: game.state,
          pauseHeading: document.querySelector('#pauseScreen .title-text')?.textContent || '',
          resumeText: document.getElementById('resumeBtn')?.textContent || ''
        };
      })()
    `);

    assert.equal(result.before.status, 'failed-closed');
    assert.equal(result.before.policyInstalled, false);
    assert.equal(result.before.failClosedInstalled, true);
    assert.equal(result.before.monasSealed, true);
    assert.equal(result.hexDisabled, false, 'Hexagram must remain available when policy loading fails');
    assert.equal(result.monasDisabled, true, 'Monas must seal when its correction policy is unavailable');
    assert.match(result.monasText, /SEALED/);
    assert.equal(result.gameState, 'paused', 'active Monas must pause before unverified pattern scheduling');
    assert.equal(result.pauseHeading, 'RITE SEALED');
    assert.equal(result.resumeText, 'RETURN TO VOID');

    console.log('policy-fail-closed-browser: all integration checks passed');
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
