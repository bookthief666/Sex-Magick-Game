/**
 * M42/M44 - where the orb is, and why it moved.
 *
 * M42's claim was that the orb sweeps the whole corridor, so taking it competes
 * with hugging an edge. That was right early and inverted late: the sweep is
 * bounded by the gap, so as the corridor narrows the orb converges onto exactly
 * the line the player already has to fly. By the top band it was a free shield
 * every time, which is most of why late runs stopped ending.
 *
 * M44 decouples it. On the opening band the orb still sweeps the corridor - that
 * behaviour is unchanged and still asserted below. As a run progresses the orb is
 * held further off the corridor's centre line and its sweep damps, so taking one
 * becomes a deliberate dip out of safety and back. The old "never leaves the band
 * the player can occupy" invariant is therefore deliberately **not** true at
 * depth, and asserting it there would be asserting the defect.
 *
 * What replaces it: the orb must stay on screen and stay takeable. Missing one
 * costs a shield, never a life, so it needs no reachability proof - but an orb
 * drawn off the top of the field would read as broken rather than as demanding.
 *
 * Driven through the grammar path rather than the legacy one, because that is the
 * path a player gets and because it builds orbs field-by-field with
 * `Object.create` - so a constructor field added and not mirrored there is
 * exactly the defect this suite exists to catch. M44 added `offset` and forgot it
 * there on the first attempt; every orb in the shipped path got a NaN height while
 * the fallback path looked correct, and this suite is what caught it.
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

  // One sampler, run at two depths. The early pass is M42's contract unchanged;
  // the late pass is M44's, and the difference between them is the whole point.
  const sampler = (gates) => `(() => {
    game.gameMode = 'HEX';
    game.startGame();
    // Guarantee orbs rather than waiting on a 0.5 roll, so the *scarcity* measured
    // below is the progression decay alone and not the base chance.
    CONFIG.ORB_SPAWN_CHANCE = 1;
    if (${gates} > 0 && game.gateSliceState) {
      game.gateSliceState.gatesCleared = ${gates};
      game.gateSliceState.bandIndex = window.__SEX_MAGICK_GATE_SLICE__.getFingerprint().bandNames.length - 1;
    }

    const PLAYER_HALF = 12;
    let sampled = 0, orbsSeen = 0, withoutPillar = 0;
    let offScreen = 0, maxAbsOffset = 0, walls = 0, orbsSpawned = 0;
    const counted = new Set();
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
      const wallsBefore = game.obstacles.length;
      game.updateGameObjects();
      if (game.obstacles.length > wallsBefore) walls += 1;
      if (${gates} > 0 && game.gateSliceState) game.gateSliceState.gatesCleared = ${gates};

      for (const orb of game.collectibles) {
        if (!counted.has(orb)) { counted.add(orb); orbsSpawned += 1; }
        if (orb.y < 0 || orb.y > game.canvas.height) offScreen += 1;
        if (Number.isFinite(orb.offset)) maxAbsOffset = Math.max(maxAbsOffset, Math.abs(orb.offset));
      }

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
             outsideSafeBand, distinctY: distinctYs.size, offScreen, maxAbsOffset,
             walls, orbsSpawned,
             spawnRatio: walls > 0 ? Math.round((orbsSpawned / walls) * 100) / 100 : null };
  })()`;

  const report = await evaluate(sampler(0));
  const deep = await evaluate(sampler(400));
  console.log('orb sweep:', JSON.stringify(report));

  assert.ok(report.sampled > 400, `needed a real sample of orb frames, got ${report.sampled}`);
  assert.equal(report.withoutPillar, 0,
    'every orb the grammar spawns must carry its pillar, or the sweep silently falls back to a hover');
  assert.ok(Number.isFinite(report.minOffsetFromTop) && Number.isFinite(report.minOffsetFromBottom),
    'orb heights must be real numbers - a NaN here means a field the constructor sets was not mirrored into the grammar path');
  assert.equal(report.offScreen, 0,
    `the orb must always be drawn on screen (${report.offScreen} frames outside the field)`);

  // The opening band is unchanged from M42: no offset, so the orb still sweeps the
  // whole corridor and still reaches both risk edges.
  assert.equal(report.outsideSafeBand, 0,
    `on the opening band the orb must stay inside the band the player can occupy (${report.outsideSafeBand} frames outside)`);
  assert.ok(report.distinctY > 40,
    `the orb must actually travel, not hover (${report.distinctY} distinct heights seen)`);
  assert.ok(report.minOffsetFromTop < 15,
    `the orb must approach the top wall (closest ${report.minOffsetFromTop}px)`);
  assert.ok(report.minOffsetFromBottom < 15,
    `the orb must approach the bottom wall (closest ${report.minOffsetFromBottom}px)`);

  // And at depth it must have left that line, or the late-game defect is back.
  console.log('orb at depth:', JSON.stringify(deep));
  assert.ok(deep.sampled > 100, `needed a sample of late-run orb frames, got ${deep.sampled}`);
  assert.ok(deep.maxAbsOffset > 40,
    `a late-run orb must sit well off the corridor centre (largest offset ${deep.maxAbsOffset}px)`);
  assert.equal(deep.offScreen, 0,
    `a late-run orb must still be on screen (${deep.offScreen} frames outside the field)`);
  assert.ok(deep.spawnRatio < report.spawnRatio,
    `orbs must thin out as a run progresses (early ${report.spawnRatio}, late ${deep.spawnRatio})`);

  sock.close();
  console.log('\nAll M42 orb sweep checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
