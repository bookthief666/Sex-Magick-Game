/**
 * M43 - MONAS becomes a rite you can read.
 *
 * M42 gave MONAS a Gnosis meter and a portal, and both were bookkeeping. The
 * player was asked to court an edge the game never drew, and the portal was a
 * variable that ticked for 300 frames while nothing on screen changed.
 *
 * Everything asserted here was invisible from inside the modules that own it -
 * which is the pattern behind every defect of the last three milestones - so all
 * of it is asserted against the real page:
 *   - the risk boundary rules draw for MONAS, in gold, only on risk-live bands,
 *     and land exactly where `classifyGateClear` scores
 *   - HEX's cyan bleed is untouched, and grows no boundary line
 *   - the band ladder still governs `gameSpeed` after frames have run
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4196, DBG = 9253;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'm43rite-'));
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
  await send('Page.navigate', { url: `${BASE}/index.html?m43=${Date.now()}` });
  await loaded;
  for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);


  assert.equal(await evaluate(`!!window.SexMagickOccultField`),
    true, 'occult-field-runtime.js must load from the page, not only from Node');

  // ---------------------------------------------------------------------------
  // The risk boundary, drawn.
  //
  // `chargeRiskEdges` is called for every pillar of both rites and used to bail
  // on `gateSliceState`, which MONAS has never had. Rather than screenshot the
  // result - which would tell us a colour changed but not *where* - the canvas
  // context is instrumented and the actual fill rectangles are read back. That is
  // the only way to assert the boundary line lands on the number
  // `classifyGateClear` scores against, which is the whole point of drawing it.
  // ---------------------------------------------------------------------------
  const PILLAR = { x: 100, top: 200, gap: 260, w: 45 };

  const paintProbe = `(() => {
    window.__m43Probe = (pillar) => {
      const ctx = game.ctx;
      const rects = [];
      let style = null;
      const realFillRect = ctx.fillRect.bind(ctx);
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(ctx), 'fillStyle');
      Object.defineProperty(ctx, 'fillStyle', {
        configurable: true,
        get() { return descriptor.get.call(this); },
        set(value) { style = value; descriptor.set.call(this, value); }
      });
      ctx.fillRect = (x, y, w, h) => {
        rects.push({ x, y, w, h, style: typeof style === 'string' ? style : 'gradient' });
        return realFillRect(x, y, w, h);
      };
      try {
        window.SexMagickOccultField.chargeRiskEdges(ctx, pillar, game);
      } finally {
        delete ctx.fillStyle;
        ctx.fillRect = realFillRect;
      }
      return rects;
    };
    return true;
  })()`;
  assert.equal(await evaluate(paintProbe), true, 'probe must install');

  const monasEdges = await evaluate(`(() => {
    const pillar = ${JSON.stringify(PILLAR)};
    game.gameMode = 'MONAS';
    game.startGame();
    const at = (gates) => {
      window.__SEX_MAGICK_MONAS_PROGRESSION__.forceGatesForTest(gates);
      return {
        gates,
        band: game.monasState.progressionBandIndex,
        rects: window.__m43Probe(pillar)
      };
    };
    // Band 0 is MONAS's LEARN THE CURRENT band: risk is not live, so nothing
    // should be promised there.
    const quiet = at(0);
    const live = at(36);

    // What the economy itself says the boundary is, computed independently of the
    // drawing. If these two ever disagree the line is lying to the player.
    const half = window.SexMagickMonas.MONAS_PLAYER_HALF;
    const scored = window.SexMagickGateSlice.classifyGateClear({
      playerY: pillar.top + (pillar.gap / 2),
      gapTop: pillar.top,
      gapSize: pillar.gap,
      playerHalf: half
    });
    return { quiet, live, scored, half };
  })()`);

  console.log('MONAS band 0 rects:', JSON.stringify(monasEdges.quiet.rects));
  console.log('MONAS band 3 rects:', JSON.stringify(monasEdges.live.rects));
  console.log('scored boundaries:', JSON.stringify(monasEdges.scored));

  assert.equal(monasEdges.quiet.band, 0, 'gate 0 must sit on band 0');
  assert.deepEqual(monasEdges.quiet.rects, [],
    'band 0 has risk inactive - drawing an edge there promises a reward that is not on offer');

  assert.ok(monasEdges.live.rects.length >= 4,
    `a risk-live MONAS band must paint two bleeds and two boundary rules (got ${monasEdges.live.rects.length})`);

  const gold = monasEdges.live.rects.filter(r => typeof r.style === 'string' && r.style.includes('255, 215, 0'));
  assert.equal(gold.length, 2, 'exactly the two boundary rules carry a flat colour, and it must be MONAS gold');
  assert.ok(
    !monasEdges.live.rects.some(r => typeof r.style === 'string' && r.style.includes('0, 229, 255')),
    'cyan is the Hexagram reserved colour (M7) and must never appear on a MONAS wall'
  );

  // The line must land on the scored boundary, not near it.
  const lineYs = gold.map(r => r.y).sort((a, b) => a - b);
  assert.ok(Math.abs(lineYs[0] - monasEdges.scored.topRiskBoundary) < 0.001,
    `top rule at ${lineYs[0]} must equal the scored boundary ${monasEdges.scored.topRiskBoundary}`);
  assert.ok(Math.abs(lineYs[1] - monasEdges.scored.bottomRiskBoundary) < 0.001,
    `bottom rule at ${lineYs[1]} must equal the scored boundary ${monasEdges.scored.bottomRiskBoundary}`);

  // And they must be inside the corridor, not on its walls - a rule drawn at the
  // gap edge would tell the player to fly into the wall.
  assert.ok(lineYs[0] > PILLAR.top && lineYs[1] < PILLAR.top + PILLAR.gap,
    'both rules must sit strictly inside the gap');

  // ---------------------------------------------------------------------------
  // HEX is untouched. Its bleed is a functional signal the entry-rate metric
  // depends on reading the same, and the M14 visual baselines are drawn from it.
  // ---------------------------------------------------------------------------
  const hexEdges = await evaluate(`(() => {
    const pillar = ${JSON.stringify(PILLAR)};
    game.gameMode = 'HEX';
    game.startGame();
    if (!game.gateSliceState) return { skipped: true };
    const quiet = (game.gateSliceState.bandIndex = 0, window.__m43Probe(pillar));
    const live = (game.gateSliceState.bandIndex = 3, window.__m43Probe(pillar));
    return { skipped: false, quiet, live, monasResidue: !!game.monasState };
  })()`);

  console.log('HEX band 3 rects:', JSON.stringify(hexEdges));
  assert.equal(hexEdges.skipped, false, 'the Gate slice must be live on the product URL');
  assert.equal(hexEdges.monasResidue, false, 'MONAS state must not survive into a HEX run');
  assert.deepEqual(hexEdges.quiet, [], 'MALKUTH has risk inactive and must stay unpainted');
  assert.equal(hexEdges.live.length, 2,
    'HEX must still paint exactly the two gradient bleeds M21 shipped, and no boundary rule');
  assert.ok(hexEdges.live.every(r => r.style === 'gradient'),
    'HEX bleeds are gradients; a flat fill here means the MONAS rule leaked into the Hexagram');

  // ---------------------------------------------------------------------------
  // The ladder still owns speed once frames have run. This is the regression the
  // M32 suite could not see, asserted again here because it is the defect most
  // likely to be reintroduced by anything that touches the MONAS frame path.
  // ---------------------------------------------------------------------------
  const speeds = await evaluate(`(() => {
    game.gameMode = 'MONAS';
    game.startGame();
    const out = [];
    for (const gates of [0, 36, 80, 150]) {
      window.__SEX_MAGICK_MONAS_PROGRESSION__.forceGatesForTest(gates);
      const written = game.gameSpeed;
      for (let f = 0; f < 5; f += 1) { game.frames += 1; game.updateGameObjects(); }
      out.push({ gates, band: game.monasState.progressionBandIndex, written, live: game.gameSpeed });
    }
    return out;
  })()`);

  console.log('speed after frames:', JSON.stringify(speeds));
  for (const entry of speeds) {
    assert.ok(Math.abs(entry.live - entry.written) < 1e-9,
      `gameSpeed at gate ${entry.gates} must still be ${entry.written} after frames run, was ${entry.live}`);
  }
  assert.ok(speeds.at(-1).live > speeds[0].live * 1.7,
    `the ladder must nearly double across its range (${speeds[0].live} -> ${speeds.at(-1).live})`);

  sock.close();
  console.log('\nAll M43 MONAS rite checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
