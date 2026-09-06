/**
 * M41 - the power-up layer was dead in half the game.
 *
 * `observe()` returned early without a `gateSliceState`, which only HEX has. In
 * MONAS that meant no band was ever recorded, no score checkpoint ever paid, and
 * the AEGIS readout never appeared - so a MONAS player could not earn a shield at
 * all, and could not see one they had earned in the other rite.
 *
 * The absorb path was never gated (it wraps `gameOver`), which is why this read as
 * "shields sort of work" rather than "shields are missing": a charge banked in HEX
 * would still save you in MONAS. Only earning and reporting were broken, and both
 * are invisible from inside the module - hence a browser suite.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4191, DBG = 9248;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'monas-pu-'));
const chrome = spawn(process.env.CHROME_BIN || 'chromium', ['--headless=new', '--no-sandbox',
  '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${DBG}`,
  `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });

try {
  for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await wait(250); } }
  const targets = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json();
  const sock = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => sock.addEventListener('open', r));
  let id = 0; const pending = new Map(); const on = [];
  sock.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method) on.forEach(h => h(m)); });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); sock.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true })).result?.value;

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://cdn.tailwindcss.com/*',
    'https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*',
    'https://cdn.jsdelivr.net/*', 'https://7l3mo9bh.api.lootlocker.io/*'] });

  const loaded = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired') { on.splice(on.indexOf(h), 1); r(); } }; on.push(h); });
  await send('Page.navigate', { url: `${BASE}/index.html?monasPowerups=${Date.now()}` });
  await loaded;
  for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);

  const api = await evaluate(`!!window.__SEX_MAGICK_POWERUPS__`);
  assert.equal(api, true, 'the power-up runtime must be installed');
  await evaluate(`window.__SEX_MAGICK_POWERUPS__.resetForTest && window.__SEX_MAGICK_POWERUPS__.resetForTest()`);

  const PLAYING = await evaluate(`GameState.PLAYING`);

  // Start MONAS and confirm the layer is live: a band recorded, and a visible HUD.
  let sample = null;
  for (let attempt = 0; attempt < 6 && !sample; attempt += 1) {
    await evaluate(`(() => { game.gameMode = 'MONAS'; game.startGame(); return true; })()`);
    await wait(350);
    const read = await evaluate(`(() => {
      const hud = document.getElementById('sex-magick-powerups');
      const api = window.__SEX_MAGICK_POWERUPS__;
      return {
        state: game.state,
        monasState: !!game.monasState,
        gateSliceState: !!game.gateSliceState,
        hudHidden: hud ? hud.hidden : null,
        snapshot: api.getSnapshot ? api.getSnapshot() : null
      };
    })()`);
    if (read.state === PLAYING) sample = read;
  }
  assert.ok(sample, 'could not observe a live MONAS run');
  console.log('MONAS run:', JSON.stringify({ monasState: sample.monasState, gateSliceState: sample.gateSliceState, hudHidden: sample.hudHidden }));
  assert.equal(sample.monasState, true, 'MONAS must have its own state');
  assert.equal(sample.gateSliceState, false, 'MONAS must have no Gate-slice state - that is the whole point');
  assert.equal(sample.hudHidden, false, 'the AEGIS readout must be visible during a MONAS run');

  // And that the score checkpoint actually pays in MONAS.
  const earned = await evaluate(`(() => {
    const api = window.__SEX_MAGICK_POWERUPS__;
    const before = api.getSnapshot();
    game.score = 2000;
    game.updateGameObjects();
    const after = api.getSnapshot();
    return { before, after };
  })()`);
  console.log('score checkpoint in MONAS:', JSON.stringify(earned));
  const chargesBefore = earned.before?.charges?.aegis ?? 0;
  const chargesAfter = earned.after?.charges?.aegis ?? 0;
  assert.equal(chargesBefore, 0, 'the run must start with no shield, or this proves nothing');
  assert.ok(chargesAfter > 0,
    `crossing the score checkpoint in MONAS must award a charge (before ${chargesBefore}, after ${chargesAfter})`);
  assert.ok((earned.after?.earned ?? 0) > 0, 'the award must be recorded as earned, not merely present');
  console.log(`   aegis charges in MONAS: ${chargesBefore} -> ${chargesAfter} (cap 3)`);

  sock.close();
  console.log('\nAll M41 MONAS power-up checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
