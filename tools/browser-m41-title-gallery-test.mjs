/**
 * M41 - the menu wears the Void's treatment.
 *
 * The owner asked for the start screen to carry what the wagered Void got in
 * M40.5: a darkened, zoomed photograph with the figures traced in light. This
 * asserts it in pixels rather than in structure, because the failure mode that
 * matters here is the one D-070 already hit once - a backdrop that installs,
 * reports success, and paints nothing.
 *
 * Three things are checked that a unit test cannot see: that the canvas exists
 * and is sized to the screen, that what it paints is neither black nor flat (a
 * dimmed photograph has a wide luminance spread; a failed draw does not), and
 * that the edge layer was actually built - the silhouettes are the whole point,
 * and the photograph alone would pass a "not black" check on its own.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4189, DBG = 9246;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'title-'));
const chrome = spawn(process.env.CHROME_BIN || 'chromium', ['--headless=new', '--no-sandbox',
  '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${DBG}`,
  `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });

const cleanup = async () => { try { chrome.kill(); } catch {} try { await server.close(); } catch {} };

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
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://cdn.tailwindcss.com/*',
    'https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*',
    'https://cdn.jsdelivr.net/*', 'https://7l3mo9bh.api.lootlocker.io/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 1, mobile: false });

  const loaded = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired') { on.splice(on.indexOf(h), 1); r(); } }; on.push(h); });
  await send('Page.navigate', { url: `${BASE}/index.html?title=${Date.now()}` });
  await loaded;

  // The backdrop waits for the gallery to decode, so poll rather than assume.
  let present = false;
  for (let i = 0; i < 60 && !present; i++) {
    present = await evaluate(`!!document.getElementById('sex-magick-title-field')`);
    if (!present) await wait(400);
  }
  assert.equal(present, true, 'the title canvas must be created once the gallery decodes');

  const geometry = await evaluate(`(() => {
    const c = document.getElementById('sex-magick-title-field');
    const s = document.getElementById('startScreen').getBoundingClientRect();
    return { w: c.width, h: c.height, screenW: Math.round(s.width), screenH: Math.round(s.height),
             menuHidden: document.getElementById('startScreen').classList.contains('hidden') };
  })()`);
  console.log('title canvas geometry:', JSON.stringify(geometry));
  assert.equal(geometry.menuHidden, false, 'the menu must be showing for this measurement');
  assert.equal(geometry.w, geometry.screenW, 'canvas width must track the start screen');
  assert.equal(geometry.h, geometry.screenH, 'canvas height must track the start screen');

  await wait(700);

  // Read the pixels back. A failed draw is black and flat; a dimmed photograph
  // with lit edges is neither.
  const pixels = await evaluate(`(() => {
    const c = document.getElementById('sex-magick-title-field');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, total = 0, sum = 0, max = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      total += 1; sum += l; if (l > 18) lit += 1; if (l > max) max = l;
    }
    return { sampled: total, litFraction: lit / total, meanLuma: sum / total, maxLuma: max };
  })()`);
  console.log('title canvas pixels:', JSON.stringify(pixels));
  assert.ok(pixels.sampled > 500, 'sampling must actually cover the canvas');
  assert.ok(pixels.litFraction > 0.15, `the menu must not be black (lit fraction ${pixels.litFraction})`);
  assert.ok(pixels.maxLuma > 90, `the silhouettes must be bright somewhere (max ${pixels.maxLuma})`);
  assert.ok(pixels.meanLuma < 170, `the picture must stay darkened (mean ${pixels.meanLuma})`);

  // The edges are the point, so prove the Sobel layer was really built and that
  // it is the same cached layer the Void will use.
  const edgeLayer = await evaluate(`(() => {
    const api = window.SexMagickVoidEdgeLayer;
    if (!api) return null;
    return { cached: api.cacheSize(), built: api.buildCount() };
  })()`);
  console.log('edge layer:', JSON.stringify(edgeLayer));
  assert.ok(edgeLayer, 'the edge layer module must be present');
  assert.ok(edgeLayer.built >= 1, `the Sobel pass must have run for the menu (built ${edgeLayer.built})`);
  assert.ok(edgeLayer.cached >= 1, 'the built layer must be cached for the Void to reuse');

  // And it must be deterministic under visual QA, or the M14 baseline is noise.
  const first = await evaluate(`(() => { const p = window.SexMagickOccultField; return p && p.pickTitleImage ? (p.pickTitleImage()||{}).src || null : null; })()`);
  const loadedQa = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired') { on.splice(on.indexOf(h), 1); r(); } }; on.push(h); });
  await send('Page.navigate', { url: `${BASE}/index.html?visualQa=1&title=${Date.now()}` });
  await loadedQa;
  for (let i = 0; i < 60; i++) { if (await evaluate(`!!document.getElementById('sex-magick-title-field')`)) break; await wait(400); }
  const qaA = await evaluate(`(() => { const p = window.SexMagickOccultField; return p && p.pickTitleImage ? (p.pickTitleImage()||{}).src || null : null; })()`);
  const qaB = await evaluate(`(() => { const p = window.SexMagickOccultField; return p && p.pickTitleImage ? (p.pickTitleImage()||{}).src || null : null; })()`);
  console.log('visualQa picks stable:', qaA === qaB, String(qaA).slice(-28));
  assert.ok(qaA, 'visualQa must still choose a picture');
  assert.equal(qaA, qaB, 'under visualQa the choice must be deterministic');
  console.log('(ordinary load picked', String(first).slice(-28) + ')');

  sock.close();
  console.log('\nAll M41 title gallery checks passed.');
} finally {
  await cleanup();
}
process.exit(0);
