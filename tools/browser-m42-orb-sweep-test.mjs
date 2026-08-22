/**
 * M42 - the orb sweeps the corridor instead of hovering in it.
 *
 * The claim is a gameplay one and it has a precise safety condition attached: the
 * orb must reach both risk edges (or it is not a choice) while never leaving the
 * band the player can actually occupy (or it is a pickup you can only take by
 * dying). Both halves are asserted here, sampled across many frames against real
 * pillars whose gaps breathe and drift.
 *
 * Driven through the grammar path rather than the legacy one, because that is the
 * path a player gets and because it builds orbs field-by-field with
 * `Object.create` - so a constructor field added and not mirrored there is
 * exactly the defect this suite exists to catch.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4194, DBG = 9251;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'orb-'));
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
  await send('Page.navigate', { url: `${BASE}/index.html?gateSlice=1&orb=${Date.now()}` });
  await loaded;
  for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);

  const report = await evaluate(`(() => {
    game.gameMode = 'HEX';
    game.startGame();
    // Guarantee orbs rather than waiting on a 0.5 roll.
    CONFIG.ORB_SPAWN_CHANCE = 1;

    const PLAYER_HALF = 12;
    let sampled = 0, orbsSeen = 0, withoutPillar = 0;
    let minOffsetFromTop = Infinity;   // how close to the top wall the orb gets
    let minOffsetFromBottom = Infinity;
    let outsideSafeBand = 0;
    let distinctYs = new Set();

    for (let frame = 0; frame < 1600; frame += 1) {
      game.frames = (game.frames || 0) + 1;
      // Fly the gap so the run survives long enough to sample many orbs.
      const ahead = game.obstacles.filter(o => o.x + o.w > game.player.x).sort((a, b) => a.x - b.x)[0];
      game.player.y = ahead ? ahead.top + (ahead.gap / 2) : game.canvas.height / 2;
      game.player.vy = 0;
      game.updateGameObjects();

      for (const orb of game.collectibles) {
        if (orb.collected) continue;
        orbsSeen += 1;
        if (!orb.pillar) { withoutPillar += 1; continue; }
        const top = orb.pillar.top;
        const gap = orb.pillar.gap;
        if (!(gap > 0)) continue;
        sampled += 1;
        distinctYs.add(Math.round(orb.y));
        const fromTop = orb.y - top;
        const fromBottom = (top + gap) - orb.y;
        minOffsetFromTop = Math.min(minOffsetFromTop, fromTop);
        minOffsetFromBottom = Math.min(minOffsetFromBottom, fromBottom);
        // The safe band is where the player's centre may legally sit.
        if (orb.y < top + PLAYER_HALF - 0.6 || orb.y > top + gap - PLAYER_HALF + 0.6) outsideSafeBand += 1;
      }
    }
    return { sampled, orbsSeen, withoutPillar, minOffsetFromTop, minOffsetFromBottom,
             outsideSafeBand, distinctY: distinctYs.size };
  })()`);
  console.log('orb sweep:', JSON.stringify(report));

  assert.ok(report.sampled > 400, `needed a real sample of orb frames, got ${report.sampled}`);
  assert.equal(report.withoutPillar, 0,
    'every orb the grammar spawns must carry its pillar, or the sweep silently falls back to a hover');
  assert.equal(report.outsideSafeBand, 0,
    `the orb must never leave the band the player can occupy (${report.outsideSafeBand} frames outside)`);
  assert.ok(report.distinctY > 40,
    `the orb must actually travel, not hover (${report.distinctY} distinct heights seen)`);
  // Reaching within a couple of px of the 12px safe boundary at both ends is what
  // makes taking it compete with edging; hovering near the centre would not.
  assert.ok(report.minOffsetFromTop < 15,
    `the orb must approach the top wall (closest ${report.minOffsetFromTop}px)`);
  assert.ok(report.minOffsetFromBottom < 15,
    `the orb must approach the bottom wall (closest ${report.minOffsetFromBottom}px)`);

  sock.close();
  console.log('\nAll M42 orb sweep checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
