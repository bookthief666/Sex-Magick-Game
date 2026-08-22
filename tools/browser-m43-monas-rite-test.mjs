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
    for (const gates of [0, 36, 80, 110]) {
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

  // ---------------------------------------------------------------------------
  // Inside the portal.
  //
  // The section is the reason M43 exists, and the reason its numbers matter is
  // that they are a difficulty claim: the clamp has to land the hardest possible
  // portal on D-051's audited 5.7/190 ceiling and never past it. Sampled every
  // frame rather than once, because a bracket that restores wrongly would show a
  // correct value at the edges and a wrong one in between.
  // ---------------------------------------------------------------------------
  const inside = await evaluate(`(() => {
    game.gameMode = 'MONAS';
    game.startGame();
    // The top live band, so the clamp is actually exercised: 5.3 * 1.5 = 7.95 raw,
    // which must come back as the audited 5.7.
    window.__SEX_MAGICK_MONAS_PROGRESSION__.forceGatesForTest(110);
    const bandSpeed = game.gameSpeed;
    const bandGap = game.monasState.progressionGap;
    game.monasState.gnosis = game.monasState.gnosisCapacity;
    game.monasState.portalReady = true;
    // A surge running as the ring is reached, so suppression is tested rather
    // than assumed.
    game.monasState.surgeActive = true;
    game.monasState.surgeFramesRemaining = 600;

    let waited = 0;
    while (!game.__monasPortalOffer && waited++ < 900) {
      game.frames = (game.frames || 0) + 1;
      game.player.y = game.canvas.height / 2; game.player.vy = 0;
      game.updateGameObjects();
    }
    let reach = 0;
    while (game.__monasPortalOffer && !game.__monasPortal && reach++ < 900) {
      game.frames += 1;
      game.player.x = game.__monasPortalOffer.x;
      game.player.y = game.__monasPortalOffer.y;
      game.updateGameObjects();
    }
    if (!game.__monasPortal) return { entered: false };

    // Capture the speed the walls are actually moved by, at the call site that
    // moves them. Reading game.gameSpeed after the frame would read the *restored*
    // value - the bracket's whole job - and measuring a pillar's travel breaks
    // whenever that pillar is spliced mid-frame. The argument Pillar.update is
    // handed is the speed the player experienced, with no inference in between.
    const realPillarUpdate = Pillar.prototype.update;
    Pillar.prototype.update = function m43Measured(speed, ...rest) {
      speeds.push(speed);
      return realPillarUpdate.call(this, speed, ...rest);
    };

    const classWhileInside = document.getElementById('game-container')?.className || '';
    const surgeWhileInside = game.monasState.surgeActive;
    const speeds = [];
    const gaps = [];
    const sectionGaps = [];
    let guard = 0;
    while (game.__monasPortal && guard++ < 900) {
      game.frames += 1;
      game.player.y = game.canvas.height / 2; game.player.vy = 1;
      // Sampled from inside the delegated update by reading what the pillars were
      // actually built with, plus the live speed the frame ran at.
      const beforeCount = game.obstacles.length;
      game.updateGameObjects();
      // The *nominal* corridor the section set, not the per-pillar gap.
      // obstacle-variety-runtime.js scales each pillar by its pattern's own
      // gapScale, and the reachability audit takes that scale as a parameter - so a
      // scaled pillar at a verified nominal is inside the audited surface, and
      // asserting on the scaled number would be asserting the wrong quantity.
      if (game.__monasSectionGap != null) sectionGaps.push(game.__monasSectionGap);
      if (game.obstacles.length > beforeCount) gaps.push(game.obstacles[game.obstacles.length - 1].gap);
    }
    Pillar.prototype.update = realPillarUpdate;
    return {
      entered: true, bandSpeed, bandGap, classWhileInside, surgeWhileInside,
      gaps, speeds, sectionGaps, frames: guard,
      speedAfter: game.gameSpeed,
      classAfter: document.getElementById('game-container')?.className || ''
    };
  })()`);

  console.log('inside the portal:', JSON.stringify({ ...inside, gaps: inside.gaps?.slice(0, 4), speeds: [...new Set(inside.speeds || [])], sectionGaps: [...new Set(inside.sectionGaps || [])] }));
  assert.equal(inside.entered, true, 'the crown-band portal must be reachable');
  assert.ok(inside.classWhileInside.includes('monas-portal-active'),
    'the section must arm the darkened field while it runs');
  assert.equal(inside.surgeWhileInside, false,
    'the Warp Surge must be suppressed inside the portal - two escalations at once is both unreadable and unaudited');

  assert.ok(inside.gaps.length > 0, 'pillars must keep coming inside the portal - it is a wager on a corridor');
  assert.ok(inside.sectionGaps.length > 0, 'the section must have owned the corridor every frame');
  const nominal = [...new Set(inside.sectionGaps)];
  assert.deepEqual(nominal, [190],
    `the portal corridor must be the audited 190 nominal on every frame (saw ${JSON.stringify(nominal)})`);
  assert.ok(nominal[0] < inside.bandGap,
    `the portal must actually tighten the corridor (band ${inside.bandGap}, portal ${nominal[0]})`);

  assert.ok(inside.speeds.length > 0, 'the section must have been measured');
  const observed = [...new Set(inside.speeds)];
  assert.deepEqual(observed, [5.7],
    `every wall inside the portal must move at the clamped 5.7 and nothing else (saw ${JSON.stringify(observed)})`);
  assert.ok(observed[0] > inside.bandSpeed,
    `the portal must be faster than the band it interrupted (band ${inside.bandSpeed}, portal ${observed[0]})`);

  assert.ok(Math.abs(inside.speedAfter - inside.bandSpeed) < 1e-9,
    `the band speed must be restored when the section ends (${inside.bandSpeed} -> ${inside.speedAfter})`);
  assert.ok(!inside.classAfter.includes('monas-portal-active'),
    'the darkened field must come down with the section');

  // The clamp itself, asserted directly against the module rather than inferred
  // from a frame - a pure function is the right place to prove a ceiling.
  const clamps = await evaluate(`(() => {
    const m = window.SexMagickMonas;
    const bands = window.__SEX_MAGICK_MONAS_PROGRESSION__.getFingerprint().bands;
    return {
      has: typeof m.portalSpeedFor === 'function',
      top: m.portalSpeedFor(5.3), mid: m.portalSpeedFor(2.9),
      gapTop: m.portalGapFor(200), gapMid: m.portalGapFor(260),
      escalates: bands.map(b => ({
        id: b.id,
        fasterBy: m.portalSpeedFor(b.speed) - b.speed,
        tighterBy: b.gap - m.portalGapFor(b.gap)
      }))
    };
  })()`);
  console.log('portal clamps:', JSON.stringify(clamps));
  assert.equal(clamps.has, true, 'the clamp must be exported so its ceiling is assertable');
  assert.equal(clamps.top, 5.7, 'the hardest portal must saturate at the audited ceiling, not run past it');
  assert.equal(clamps.gapTop, 190, 'the tightest portal corridor must saturate at the audited 190');
  assert.ok(clamps.mid > 2.9 && clamps.mid < 5.7, 'a low-band portal must escalate without reaching the ceiling');
  assert.ok(clamps.gapMid < 260 && clamps.gapMid > 190, 'a low-band portal must tighten without reaching the floor');

  // The reason 5.7 / 190 is not a live band: if it were, a portal opening on the
  // top band would be identical to ordinary play - a stake and a dark field with no
  // escalation behind them. Every band must have somewhere to escalate to.
  for (const band of clamps.escalates) {
    assert.ok(band.fasterBy > 0, `a portal on ${band.id} must be faster than the band it interrupts`);
    assert.ok(band.tighterBy > 0, `a portal on ${band.id} must be tighter than the band it interrupts`);
  }

  sock.close();
  console.log('\nAll M43 MONAS rite checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
