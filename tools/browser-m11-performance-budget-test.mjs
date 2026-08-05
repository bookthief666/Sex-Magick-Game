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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function command(names) {
  for (const name of names) {
    const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}
async function waitHttp(url, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch (_error) {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CDP {
  constructor(url) { this.url = url; this.id = 1; this.pending = new Map(); this.listeners = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP socket error')), { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result || {});
      } else {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
      }
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }
  close() { if (this.ws?.readyState <= WebSocket.OPEN) this.ws.close(); }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitExpression(cdp, expression, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await evaluate(cdp, expression)) return; } catch (_error) {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function main() {
  const chrome = process.env.CHROME_BIN || command(['google-chrome', 'chromium', 'chromium-browser']);
  const python = command(['python3', 'python']);
  assert.ok(chrome, 'Chrome/Chromium not found');
  assert.ok(python, 'Python not found');

  const profile = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m11-'));
  children.push(spawn(python, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }));
  await waitHttp(`${BASE_URL}/index.html`);
  children.push(spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
    '--disable-default-apps', '--disable-extensions', '--mute-audio',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' }));
  await waitHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: [
    'https://cdn.tailwindcss.com/*', 'https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*',
    'https://cdn.jsdelivr.net/*', 'https://7l3mo9bh.api.lootlocker.io/*'
  ] });
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 368, height: 869, deviceScaleFactor: 2.625, mobile: true });

  const exceptions = [];
  const requests = [];
  cdp.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
  cdp.on('Network.requestWillBeSent', event => requests.push(event.request.url));

  try {
    await cdp.send('Page.navigate', { url: `${BASE_URL}/index.html?assetMode=offline&renderDpr=native&perfProbe=1&perfPanel=1&perfWarmupFrames=0&perfSampleFrames=120&perfMaxSegments=4&viewportProfile=fold-closed&m11=${Date.now()}` });
    await waitExpression(cdp, `typeof game !== 'undefined' && !!__SEX_MAGICK_PERFORMANCE__ && __SEX_MAGICK_ASSETS__.getSnapshot()?.summary?.pending === 0`);
    await waitExpression(cdp, `!document.getElementById('menuButtons')?.classList.contains('hidden')`);
    await evaluate(cdp, `
      AudioSys.pause=AudioSys.resume=AudioSys.play=AudioSys.stop=()=>{};
      SFX.playTone=async()=>{};
      Haptics.jump=Haptics.collect=Haptics.crash=Haptics.levelUp=Haptics.start=()=>{};
      CONFIG.ORB_SPAWN_CHANCE=0;
      Game.prototype.gameOver=function(){};
      Game.prototype.checkLevel=function(){};
      Player.prototype.update=function(){this.y=innerHeight/2;this.vy=0;if(this.jumpCooldown>0)this.jumpCooldown-=1;};
      game.settings.music=false;game.settings.sfx=false;game.settings.vibration=false;game.gameMode='HEX';game.startGame();true;
    `);
    await waitExpression(cdp, `__SEX_MAGICK_PERFORMANCE__.getSnapshot().segments.at(-1)?.frameIntervals.count >= 120`, 30000);

    await evaluate(cdp, `const t=performance.now();while(performance.now()-t<65){};true;`);
    await sleep(150);
    const closed = await evaluate(cdp, `({
      report:__SEX_MAGICK_PERFORMANCE__.getSnapshot(),
      panel:document.getElementById('smPerformancePanel')?.innerText||'',
      script:!!document.querySelector('script[data-sex-magick-performance-budget-runtime]')
    })`);
    const first = closed.report.segments.at(-1);
    assert.equal(first.context.profile, 'fold-closed');
    assert.equal(first.context.effectiveDpr, 2.625);
    assert.equal(first.context.backingWidth, 966);
    assert.equal(first.context.backingHeight, 2281);
    assert.equal(first.frameIntervals.count, 120);
    assert.ok(first.frameIntervals.p95 > 0);
    assert.ok(first.drawDurations.count > 0);
    assert.ok(first.callbackDurations.count > 0);
    assert.equal(closed.report.startup.assets.assetMode, 'offline');
    assert.equal(closed.report.startup.assets.networkAttempts, 0);
    assert.match(closed.panel, /PERF PROBE · LOCAL/);
    assert.equal(closed.script, true);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 884, height: 1104, deviceScaleFactor: 2.625, mobile: true });
    await waitExpression(cdp, `innerWidth===884&&innerHeight===1104`);
    await evaluate(cdp, `__SEX_MAGICK_VIEWPORT__.refresh();__SEX_MAGICK_RENDER__.refresh();if(game.state!==GameState.PLAYING){game.state=GameState.PLAYING;game.resetFixedStepTiming();game.scheduleFixedStepFrame();}true;`);
    await waitExpression(cdp, `__SEX_MAGICK_PERFORMANCE__.getSnapshot().segments.at(-1)?.context.profile==='fold-open'&&__SEX_MAGICK_PERFORMANCE__.getSnapshot().segments.at(-1)?.frameIntervals.count>=30`);

    const report = await evaluate(cdp, `__SEX_MAGICK_PERFORMANCE__.stop()`);
    assert.equal(report.active, false);
    assert.equal(report.currentSegmentId, null);
    assert.deepEqual(report.segments.map(segment => segment.context.profile), ['fold-closed', 'fold-open']);
    assert.equal(report.segments[1].context.backingWidth, 2321);
    assert.equal(report.segments[1].context.backingHeight, 2898);
    assert.ok(report.aggregate.sampledFrames >= 150);

    const storageKeys = await evaluate(cdp, `Object.keys(localStorage).sort()`);
    assert.equal(storageKeys.some(key => /perf|performance/i.test(key)), false);
    const catalogRequests = requests.filter(url => url.startsWith('https://lh3.googleusercontent.com/d/') && !url.includes('1BXrXXd9TKSqCFNwvS-cJpNORbyvP6fkR'));
    const lootLockerRequests = requests.filter(url => url.includes('lootlocker'));
    assert.equal(catalogRequests.length, 0);
    assert.equal(lootLockerRequests.length, 0);
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));

    console.log('m11-performance-budget-browser: all integration checks passed');
    console.log(JSON.stringify({
      closed: { context: first.context, frames: first.frameIntervals, draw: first.drawDurations, callback: first.callbackDurations, classification: first.classification },
      open: { context: report.segments[1].context, frames: report.segments[1].frameIntervals, classification: report.segments[1].classification },
      aggregate: report.aggregate,
      startup: report.startup,
      longTaskObserverSupported: report.environment.longTaskObserverSupported,
      storageKeys,
      browserExceptions: exceptions.length
    }, null, 2));
  } finally {
    cdp.close();
    for (const child of children.reverse()) if (!child.killed) child.kill('SIGTERM');
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error);
  for (const child of children.reverse()) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = 1;
});
