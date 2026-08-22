/**
 * M41 - the three HUD defects the owner's Fold playtest found.
 *
 * All three are the same shape: state that is correct in the model and wrong on
 * screen, which no unit test can see and which only shows up when a real session
 * moves between rites and screens. They are asserted here against the real page
 * for the same reason D-069's constellation wiring was: the modules would have
 * gone on passing with the HUD stuck on.
 *
 *   1. The MONAS coherence meter hides only through `renderHud`, whose only other
 *      caller returns early once the rite is not MONAS - so it survived into the
 *      next HEX run and sat over the top of the play field.
 *   2. `riskStreak` reads zero for most of a run by construction (it resets on any
 *      centred clear, and early bands have no risk zone at all), so a permanent
 *      "STREAK 0" readout told the player nothing. It now appears only while the
 *      bonus is actually paying, and names the bonus rather than the count.
 *   3. `#statsPanel` had no `hidden` class in the markup and no `display: none` in
 *      CSS, so the three `classList.remove('hidden')` calls guarded by
 *      `CONFIG.DEBUG` were no-ops and the FPS/AUDIO panel showed in ordinary
 *      sessions.
 *
 * The streak sampling deliberately re-starts the run and re-checks `game.state` at
 * the moment of the read: an unattended run dies in about a second, and the HUD
 * keeps its last text once it does, so a naive read measures a corpse and passes
 * or fails at random.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4188, DBG = 9245;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'verify-'));
const chrome = spawn(process.env.CHROME_BIN, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', `--remote-debugging-port=${DBG}`, `--user-data-dir=${dir}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore'] });
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
await send('Network.setBlockedURLs', { urls: ['https://cdn.tailwindcss.com/*','https://fonts.googleapis.com/*','https://fonts.gstatic.com/*','https://cdn.jsdelivr.net/*','https://7l3mo9bh.api.lootlocker.io/*'] });

const loaded = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired') { on.splice(on.indexOf(h), 1); r(); } }; on.push(h); });
await send('Page.navigate', { url: `${BASE}/index.html?gateSlice=1&verify=${Date.now()}` });
await loaded;
for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);

// --- defect 3: the stats panel must not be visible on an ordinary (non-#debug) load
const statsVisible = await evaluate(`(() => { const el = document.getElementById('statsPanel');
  return { hasHidden: el.classList.contains('hidden'), display: getComputedStyle(el).display }; })()`);
console.log('defect 3 — statsPanel on plain load:', JSON.stringify(statsVisible));
assert.equal(statsVisible.display, 'none', 'stats panel must be hidden without #debug');

// --- defect 1: play MONAS, then start HEX, and the coherence meter must be gone
await evaluate(`(() => { game.gameMode = 'MONAS'; game.startGame(); return true; })()`);
await wait(400);
const duringMonas = await evaluate(`(() => { const el = document.getElementById('monas-hud');
  return el ? { present: true, hidden: el.hidden } : { present: false }; })()`);
console.log('defect 1 — monas hud during MONAS:', JSON.stringify(duringMonas));

await evaluate(`(() => { game.returnToMenu(); return true; })()`);
await wait(200);
const atMenu = await evaluate(`(() => { const el = document.getElementById('monas-hud'); return el ? el.hidden : null; })()`);
console.log('defect 1 — monas hud back at menu:', atMenu);

await evaluate(`(() => { game.gameMode = 'HEX'; game.startGame(); return true; })()`);
await wait(400);
const duringHex = await evaluate(`(() => { const el = document.getElementById('monas-hud'); return el ? el.hidden : null; })()`);
console.log('defect 1 — monas hud during a following HEX run:', duringHex);
assert.equal(atMenu, true, 'coherence meter must hide on return to menu');
assert.equal(duringHex, true, 'coherence meter must hide once HEX starts');

// --- defect 2: the streak slot is blank until the bonus actually pays
const streakResting = await evaluate(`(() => { const el = document.getElementById('gate-slice-streak'); return el ? el.textContent : null; })()`);
console.log('defect 2 — streak slot at rest:', JSON.stringify(streakResting));
assert.equal(streakResting, '', 'streak slot must be blank when not paying');

// No exposed renderHud, and an unattended run dies within a second or two - so
// start a fresh run, set the streak, and read back in the same breath, confirming
// the run was still live at the moment of the read rather than trusting a corpse.
const GameStatePlaying = await evaluate('GameState.PLAYING');
async function sampleStreakAt(value) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await evaluate(`(() => { game.gameMode = 'HEX'; game.startGame(); return true; })()`);
    await wait(250);
    const sample = await evaluate(`(() => {
      if (!game.gateSliceState) return { ok: false, why: 'no gateSliceState' };
      game.gateSliceState.riskStreak = ${value};
      return { ok: true, state: game.state };
    })()`);
    if (!sample.ok) continue;
    await wait(160);
    const read = await evaluate(`({ text: document.getElementById('gate-slice-streak').textContent, state: game.state })`);
    if (read.state === GameStatePlaying) return read.text;
  }
  throw new Error(`could not sample the streak HUD at ${value} with the run still live`);
}

const streakPaying = await sampleStreakAt(5);
console.log('defect 2 — streak slot at riskStreak=5:', JSON.stringify(streakPaying));
assert.equal(streakPaying, 'EDGE 5 · +1', 'a paying streak must name the bonus it earns (+1 from 3, +2 from 7)');

const streakHigh = await sampleStreakAt(8);
console.log('defect 2 — streak slot at riskStreak=8:', JSON.stringify(streakHigh));
assert.equal(streakHigh, 'EDGE 8 · +2', 'the higher tier must read +2');

const streakBelow = await sampleStreakAt(1);
console.log('defect 2 — streak slot at riskStreak=1 (below the paying threshold):', JSON.stringify(streakBelow));
assert.equal(streakBelow, '', 'a streak that pays nothing must show nothing');

sock.close(); chrome.kill(); await server.close();
console.log('\nALL DEFECT CHECKS PASSED');
process.exit(0);
