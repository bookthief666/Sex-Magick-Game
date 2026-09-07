import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HTTP_PORT = Number(process.env.M12_QA_HTTP_PORT || 4189);
const DEBUG_PORT = Number(process.env.M12_QA_DEBUG_PORT || 9239);
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
async function removeProfile(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); return; }
    catch (error) {
      if (attempt === 7) { console.warn(`[M12 QA] Could not remove profile: ${error.message}`); return; }
      await sleep(100 * (attempt + 1));
    }
  }
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
async function waitExpression(cdp, expression, timeout = 15000) {
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
  const profile = await mkdtemp(path.join(os.tmpdir(), 'sex-magick-m12-'));
  children.push(spawn(python, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }));
  await waitHttp(`${BASE_URL}/tools/performance-budget-playtest.html`);
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
  const exceptions = [];
  const requests = [];
  cdp.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
  cdp.on('Network.requestWillBeSent', event => requests.push(event.request.url));

  try {
    await cdp.send('Page.navigate', { url: `${BASE_URL}/tools/performance-budget-playtest.html?m12=${Date.now()}` });
    await waitExpression(cdp, `!!window.__SEX_MAGICK_M12_HARNESS__ && !!window.SexMagickPerformanceEvidence`);
    const result = await evaluate(cdp, `(() => {
      const A=SexMagickPerformanceEvidence;
      const H=__SEX_MAGICK_M12_HARNESS__;
      function report(preset,repeat,p95=17,p99=19,critical=0.001,dropped=10){
        const d=A.presetDefinition(preset);const samples=3600;const duration=samples*16.667;
        return {mode:A.REPORT_MODE,version:1,active:false,generatedAtMs:duration+100,environment:{visibilityState:'visible'},measurement:{schemaVersion:1,protocol:A.PROTOCOL,source:'browser-test',sessionId:preset+'-r'+repeat,preset,repeat,requestedDpr:d.requestedDpr,expectedProfile:d.profile},segments:[{id:1,startedAtMs:100,endedAtMs:duration+100,context:{profile:d.profile,effectiveDpr:d.tier==='native'?2.625:d.tier==='2x'?2:1,logicalWidth:d.profile==='fold-open'?884:368,logicalHeight:d.profile==='fold-open'?1104:869,backingWidth:100,backingHeight:100,backingPixels:10000,renderMode:'logical-css-pixels-with-bounded-dpr-backing',assetMode:'offline'},frameIntervals:{count:samples,p50:16.667,p95,p99},drawDurations:{p95:1},callbackDurations:{p95:2},longFrameRate:0,criticalFrameRate:critical,droppedSimulationMs:dropped,suspensionGaps:0,suspensionResets:0,contextTransitionFramesIgnored:0,longTasks:{count:0,totalDurationMs:0}}]};
      }
      for(const preset of Object.keys(A.PRESETS)) for(let repeat=1;repeat<=3;repeat++) {
        const bad=preset==='open-native';
        H.loadedReports.push({sourceLabel:preset+'-'+repeat,report:report(preset,repeat,bad?24:17,bad?31:19,bad?0.01:0.001,bad?100:10)});
      }
      const first=H.renderAnalysis();
      H.loadedReports.push({sourceLabel:'duplicate',report:structuredClone(H.loadedReports[0].report)});
      const second=H.renderAnalysis();
      const annotated=H.annotateSnapshot({mode:A.REPORT_MODE,version:1,segments:[]},{preset:'closed-2x',repeat:7,sessionId:'session-7'});
      return {
        firstSummary:first.summary,
        secondSummary:second.summary,
        recommendations:second.recommendations,
        annotated:annotated.measurement,
        runRowCount:document.querySelectorAll('#runRows tr').length,
        groupRowCount:document.querySelectorAll('#groupRows tr').length,
        recommendationText:document.getElementById('recommendations').innerText,
        storageKeys:Object.keys(localStorage),
        sessionKeys:Object.keys(sessionStorage),
        presetButtons:document.querySelectorAll('button[data-preset]').length
      };
    })()`);
    assert.equal(result.firstSummary.acceptedReportCount, 18);
    assert.equal(result.secondSummary.rejectedReportCount, 1);
    assert.equal(result.recommendations.find(item => item.profile === 'fold-closed').recommendation, 'closed-native');
    assert.equal(result.recommendations.find(item => item.profile === 'fold-open').recommendation, 'open-2x');
    assert.equal(result.annotated.protocol, 'm12-fold6-performance-v1');
    assert.equal(result.annotated.preset, 'closed-2x');
    assert.equal(result.annotated.repeat, 7);
    assert.equal(result.annotated.requestedDpr, '2');
    assert.equal(result.runRowCount, 18);
    assert.equal(result.groupRowCount, 6);
    assert.match(result.recommendationText, /closed-native/);
    assert.match(result.recommendationText, /open-2x/);
    assert.equal(result.presetButtons, 6);
    assert.deepEqual(result.storageKeys, []);
    assert.deepEqual(result.sessionKeys, []);
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
    assert.ok(requests.every(url => url.startsWith(BASE_URL)), `Unexpected network request: ${requests.join(', ')}`);
    console.log('m12-physical-performance-evidence-browser: all integration checks passed');
    console.log(JSON.stringify({ summary: result.secondSummary, recommendations: result.recommendations, requestCount: requests.length, browserExceptions: exceptions.length }, null, 2));
  } finally {
    cdp.close();
    for (const child of children.reverse()) if (!child.killed) child.kill('SIGTERM');
    await sleep(250);
    await removeProfile(profile);
  }
}
main().catch(error => {
  console.error(error.stack || error);
  for (const child of children.reverse()) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = 1;
});
