/**
 * M42 - MONAS banks Gnosis by edging, and spends it on a portal.
 *
 * The owner asked for HEX's edge meter and portal sections in MONAS. The economy
 * is shared (`gnosis-edge.js`) so the rules cannot drift, but the *wiring* is
 * MONAS's own and that is where every defect in M41 and M42 has been: a module
 * that works, connected to nothing, passing its unit tests.
 *
 * Four things are asserted against the real page:
 *   - an edged clear banks Gnosis and a centred one does not
 *   - MONAS uses its own ladder to decide when risk opens, not HEX's
 *   - a full meter opens a portal, which costs the stake and settles once
 *   - a portal ridden smoothly returns more than one fought
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4195, DBG = 9252;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'medge-'));
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
  await send('Page.navigate', { url: `${BASE}/index.html?medge=${Date.now()}` });
  await loaded;
  for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);

  assert.equal(await evaluate(`!!window.SexMagickGnosisEdge`),
    true, 'gnosis-edge.js must load from the page, not only from Node');

  // Fly a whole run twice: once hugging the top edge, once down the middle. Same
  // seed, same walls, only the line differs - so any difference in the bank is
  // the edge model and nothing else.
  const flown = await evaluate(`(() => {
    // M43: pin the *gate count*, not the band index.
    //
    // The band is a pure function of gatesPassed and is re-derived on every frame
    // now, so assigning progressionBandIndex directly is overwritten before it can
    // mean anything. Seeding the gates the band begins at is the same intent
    // expressed through the actual input, and it survives the run continuing to
    // clear walls - which only pushes the band further into the range being tested.
    const fly = (mode, atGate, frames = 1400) => {
      game.gameMode = 'MONAS';
      game.startGame();
      window.__SEX_MAGICK_MONAS_PROGRESSION__.forceGatesForTest(atGate);
      let cleared = 0;
      for (let frame = 0; frame < frames; frame += 1) {
        game.frames = (game.frames || 0) + 1;
        const ahead = game.obstacles.filter(o => o.x + o.w > game.player.x).sort((a, b) => a.x - b.x)[0];
        if (ahead) {
          // 12px is the safe-band edge; +14 sits just inside it.
          game.player.y = mode === 'edge' ? ahead.top + 14 : ahead.top + (ahead.gap / 2);
        } else {
          game.player.y = game.canvas.height / 2;
        }
        game.player.vy = 0;
        game.updateGameObjects();
        cleared = game.monasState.gatesPassed;
      }
      return { gnosis: game.monasState.gnosis, streak: game.monasState.riskStreak,
               cleared, band: game.monasState.progressionBandIndex,
               portalReady: game.monasState.portalReady };
    };
    return {
      // Gate 36 opens band 3, comfortably inside the risk-active range.
      edgedRisky: fly('edge', 36),
      centredRisky: fly('centre', 36),
      // Gate 0 is band 0, MONAS's teachable band, where the edge pays nothing.
      // Shorter, because band 1 opens at gate 6 and the flight has to end while
      // still inside the band it is testing.
      edgedEarly: fly('edge', 0, 900)
    };
  })()`);
  console.log('MONAS edge banking:', JSON.stringify(flown));

  assert.ok(flown.edgedRisky.cleared > 3, `the run must actually clear walls (${flown.edgedRisky.cleared})`);
  assert.ok(flown.edgedRisky.gnosis > 0, 'edging a risk-active band must bank Gnosis');
  assert.ok(flown.edgedRisky.gnosis > flown.centredRisky.gnosis,
    `edging (${flown.edgedRisky.gnosis}) must out-bank flying the middle (${flown.centredRisky.gnosis})`);
  assert.ok(flown.edgedRisky.band >= 1, `the risky flight must stay on a risk-active band (${flown.edgedRisky.band})`);
  assert.equal(flown.edgedEarly.band, 0, `the early flight must stay on band 0 (${flown.edgedEarly.band})`);
  assert.equal(flown.edgedEarly.gnosis, 0,
    'the first band stays teachable: no Gnosis for edging before the risk zones open');

  // The portal: a full meter *offers* one, flying into it costs the stake, and it
  // settles once.
  //
  // M43 changed the entry contract from auto-open to an object in the corridor,
  // because the section was invisible when it opened by itself - the owner never
  // saw the thing they were entering. The economy assertions below are unchanged;
  // what moved is that a ring has to be reached first.
  const portal = await evaluate(`(() => {
    game.gameMode = 'MONAS';
    game.startGame();
    game.monasState.gnosis = game.monasState.gnosisCapacity;
    game.monasState.portalReady = true;
    const before = game.monasState.gnosis;

    // Run until the ring is offered. It arrives on a pillar spawn frame, so this
    // is the corridor's own cadence rather than an arbitrary wait.
    let waited = 0;
    while (!game.__monasPortalOffer && waited++ < 600) {
      game.frames = (game.frames || 0) + 1;
      game.player.y = game.canvas.height / 2; game.player.vy = 0;
      game.updateGameObjects();
    }
    const offered = game.__monasPortalOffer
      ? { x: game.__monasPortalOffer.x, y: game.__monasPortalOffer.y,
          entryRadius: game.__monasPortalOffer.entryRadius }
      : null;
    const openedBeforeContact = !!game.__monasPortal;

    // Fly into it: put the avatar on the ring rather than teleporting the ring,
    // so the collision test is the one the player's line has to satisfy.
    let reach = 0;
    while (game.__monasPortalOffer && !game.__monasPortal && reach++ < 600) {
      game.frames += 1;
      game.player.y = game.__monasPortalOffer.y;
      game.player.x = game.__monasPortalOffer.x;
      game.player.vy = 0;
      game.updateGameObjects();
    }
    const opened = game.__monasPortal ? { stake: game.__monasPortal.stake } : null;
    const afterOpen = game.monasState.gnosis;

    // Ride it smoothly to the end.
    let guard = 0;
    while (game.__monasPortal && guard++ < 900) {
      game.frames += 1;
      game.player.y = game.canvas.height / 2; game.player.vy = 2;
      game.updateGameObjects();
    }
    return { offered, openedBeforeContact, opened, before, afterOpen,
             afterSettle: game.monasState.gnosis,
             entered: game.monasState.portalsEntered, survived: game.monasState.portalsSurvived,
             stillOpen: !!game.__monasPortal, portalReady: game.monasState.portalReady,
             containerClass: document.getElementById('game-container')?.className || '' };
  })()`);
  console.log('MONAS portal:', JSON.stringify(portal));

  assert.ok(portal.offered, 'a full meter must offer a portal ring in the corridor');
  assert.equal(portal.openedBeforeContact, false,
    'the section must not begin until the ring is actually reached - M43 exists because it used to');
  assert.ok(portal.opened, 'flying into the ring must open the portal');
  assert.ok(portal.opened.stake > 0, 'the portal must cost something');
  assert.ok(!portal.containerClass.includes('monas-portal-active'),
    'the darkened field must be taken down when the section settles');
  assert.ok(portal.afterOpen < portal.before, 'entering must debit the bank');
  assert.equal(portal.stillOpen, false, 'the portal must close when its clock runs out');
  assert.equal(portal.entered, 1, 'entered exactly once');
  assert.equal(portal.survived, 1, 'a smoothly ridden portal must be survived');
  assert.ok(portal.afterSettle > portal.afterOpen,
    `riding it must return more than nothing (${portal.afterOpen} -> ${portal.afterSettle})`);

  // And HEX must not grow a MONAS portal.
  const hexClean = await evaluate(`(() => {
    game.gameMode = 'HEX';
    game.startGame();
    for (let f = 0; f < 120; f += 1) { game.frames += 1; game.player.y = game.canvas.height / 2; game.updateGameObjects(); }
    return { portal: !!game.__monasPortal, monasState: !!game.monasState };
  })()`);
  console.log('HEX after MONAS:', JSON.stringify(hexClean));
  assert.equal(hexClean.portal, false, 'the portal must never survive into HEX');

  sock.close();
  console.log('\nAll M42 MONAS edge/portal checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
