/**
 * M41 - the Caduceus, MONAS's own star section.
 *
 * The wiring is where the risk is, not the module: `test-monas-currents.js` would
 * go on passing with the script tag missing, the section never opening, or the
 * catch never scored. That is the exact shape of the D-062 shield bug and the
 * D-069 constellation wiring, so this drives the real page.
 *
 * `?caduceusEvery=2` exists for the same reason `?bonusEvery=` does: a section
 * that arrives every 18 gates is one nobody verifies.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4192, DBG = 9249;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'caduceus-'));
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
  await send('Page.navigate', { url: `${BASE}/index.html?caduceusEvery=2&cad=${Date.now()}` });
  await loaded;
  for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);

  assert.equal(await evaluate(`!!window.SexMagickMonasCurrents`),
    true, 'monas-currents.js must load from the page, not just from Node');

  // Drive a MONAS run headlessly: freeze the player mid-screen so it cannot die,
  // push the gate count onto the interval, and step frames by hand.
  const report = await evaluate(`(() => {
    game.gameMode = 'MONAS';
    game.startGame();
    game.monasState.gatesPassed = 2;

    const seen = { opened: false, maxNodes: 0, totals: null, spawnedPillars: 0 };
    const scoreAtStart = game.score;

    // game.frames is advanced by the game loop, not by updateGameObjects, and
    // isSpawnFrame reads it - so a harness that only calls updateGameObjects never
    // spawns a pillar at all, and any claim about pillar suppression made against
    // it is vacuous. The first version of this test made exactly that mistake: it
    // recorded obstacles.length as 0 during the section and that number meant
    // nothing. Frames are advanced by hand here so the comparison below is real.
    for (let frame = 0; frame < 420; frame += 1) {
      game.frames = (game.frames || 0) + 1;
      // Hold the avatar still and alive: this measures the section, not the pilot.
      game.player.y = game.canvas.height / 2;
      game.player.vy = 0;
      game.updateGameObjects();

      const state = game.__monasCaduceus;
      if (state) {
        seen.opened = true;
        seen.maxNodes = Math.max(seen.maxNodes, game.pentagrams.length);
        seen.totals = { total: state.total, spawned: state.spawned, framesRemaining: state.framesRemaining };
        seen.spawnedPillars = Math.max(seen.spawnedPillars, game.obstacles.length);
      }
      if (seen.opened && !state) break;
    }

    // The control: the same number of frames in MONAS with no section running.
    // Without this, "no pillars during the section" is unfalsifiable.
    game.gameMode = 'MONAS';
    game.startGame();
    let controlPillars = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      game.frames = (game.frames || 0) + 1;
      game.player.y = game.canvas.height / 2;
      game.player.vy = 0;
      game.updateGameObjects();
      controlPillars = Math.max(controlPillars, game.obstacles.length);
    }
    return { ...seen, scoreAtStart, controlPillars };
  })()`);
  console.log('caduceus run:', JSON.stringify(report));

  assert.equal(report.opened, true, 'the section must open on the gate interval');
  assert.ok(report.maxNodes > 0, 'nodes must actually reach the field');
  assert.ok(report.totals.spawned >= report.totals.total,
    `every node in the set must spawn before the section closes (${report.totals.spawned}/${report.totals.total})`);
  assert.ok(report.controlPillars > 0,
    'the control must actually spawn pillars, or the suppression check below proves nothing');
  assert.equal(report.spawnedPillars, 0,
    `no pillar may spawn while the section runs (saw ${report.spawnedPillars}, control saw ${report.controlPillars})`);

  // Catching pays, and gliding pays more - through the real page, not the module.
  const payouts = await evaluate(`(() => {
    const api = window.SexMagickMonasCurrents;
    const run = jerky => {
      game.gameMode = 'MONAS';
      game.startGame();
      game.monasState.gatesPassed = 2;
      const before = game.score;
      let guard = 0;
      while (!game.__monasCaduceus && guard++ < 200) {
        game.player.y = game.canvas.height / 2; game.player.vy = 0;
        game.updateGameObjects();
      }
      const state = game.__monasCaduceus;
      if (!state) return null;
      // Reversals are read off player.vy by the update wrapper, so drive that.
      for (let frame = 0; frame < 200; frame += 1) {
        game.player.y = game.canvas.height / 2;
        game.player.vy = jerky ? (frame % 2 === 0 ? 4 : -4) : 2;
        game.updateGameObjects();
      }
      // Now collect every node still on the field.
      for (const node of game.pentagrams) node.collected = true;
      game.updateGameObjects();
      return { gained: game.score - before, smoothness: api.caduceusSmoothness(game.__monasCaduceus || state) };
    };
    return { glided: run(false), thrashed: run(true) };
  })()`);
  console.log('caduceus payouts:', JSON.stringify(payouts));
  assert.ok(payouts.glided && payouts.thrashed, 'both sample runs must have opened a section');
  assert.ok(payouts.glided.gained > 0, 'catching nodes must score');
  assert.ok(payouts.glided.gained > payouts.thrashed.gained,
    `gliding (${payouts.glided.gained}) must pay more than thrashing (${payouts.thrashed.gained}) on the real page`);

  // And HEX must be untouched by any of it.
  const hexClean = await evaluate(`(() => {
    game.gameMode = 'HEX';
    game.startGame();
    for (let frame = 0; frame < 120; frame += 1) { game.player.y = game.canvas.height / 2; game.updateGameObjects(); }
    return { caduceus: !!game.__monasCaduceus, monasState: !!game.monasState };
  })()`);
  console.log('HEX after MONAS:', JSON.stringify(hexClean));
  assert.equal(hexClean.caduceus, false, 'the Caduceus must never open in HEX');

  sock.close();
  console.log('\nAll M41 Caduceus checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
