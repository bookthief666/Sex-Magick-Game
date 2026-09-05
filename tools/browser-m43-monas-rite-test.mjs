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
  // Death presentation state belongs to the run that caused it.
  //
  // The Game instance is reused for retry and for switching rites. A fresh run
  // must not inherit the previous death's red flash or RGB split.
  // ---------------------------------------------------------------------------
  const freshRunEffects = await evaluate(`(() => {
    const snapshot = () => ({
      screenFlash: game.screenFlash,
      glitchEffect: game.glitchEffect,
      glitchTimer: game.glitchTimer,
      glitchFxActive: GlitchFX.active,
      glitchFxDuration: GlitchFX.duration
    });
    const clean = value => value.screenFlash === null && value.glitchEffect === false &&
      value.glitchTimer === 0 && value.glitchFxActive === false && value.glitchFxDuration === 0;

    game.gameMode = 'HEX';
    game.startGame();
    game.gameOver();
    const firstDeath = snapshot();
    game.restartGame();
    game.state = GameState.PAUSED;
    const retry = snapshot();

    game.state = GameState.PLAYING;
    game.gameOver();
    const secondDeath = snapshot();
    game.returnToMenu();
    game.gameMode = 'MONAS';
    game.startGame();
    game.state = GameState.PAUSED;
    const switchedRite = snapshot();
    return {
      firstDeath,
      retry,
      secondDeath,
      switchedRite,
      retryClean: clean(retry),
      switchClean: clean(switchedRite)
    };
  })()`);
  console.log('fresh-run effects:', JSON.stringify(freshRunEffects));
  assert.ok(freshRunEffects.firstDeath.screenFlash?.active,
    'negative control: death must arm a visible screen flash before retry');
  assert.equal(freshRunEffects.firstDeath.glitchFxActive, true,
    'negative control: death must arm the canvas-wide RGB glitch before retry');
  assert.ok(freshRunEffects.firstDeath.glitchFxDuration > 0,
    'negative control: the death RGB glitch must have live duration before retry');
  assert.ok(freshRunEffects.secondDeath.screenFlash?.active,
    'negative control: death must arm the effect before switching rites');
  assert.equal(freshRunEffects.retryClean, true,
    'death -> retry must begin with no inherited flash or RGB split');
  assert.equal(freshRunEffects.switchClean, true,
    'death -> menu -> MONAS must begin with no HEX death presentation state');

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
    // The top live band, so the clamp is actually exercised: the band speed times
    // 1.5 overshoots the ceiling and must come back clamped to it.
    const bands = window.__SEX_MAGICK_MONAS_PROGRESSION__.getFingerprint().bands;
    window.__SEX_MAGICK_MONAS_PROGRESSION__.forceGatesForTest(bands[bands.length - 1].gateThreshold);
    const bandSpeed = game.gameSpeed;
    const bandGap = game.monasState.progressionGap;
    const maxSpeed = window.SexMagickMonas.MONAS_MAX_VERIFIED_SPEED;
    const minGap = window.SexMagickMonas.MONAS_MIN_VERIFIED_GAP;
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
      entered: true, bandSpeed, bandGap, maxSpeed, minGap, classWhileInside, surgeWhileInside,
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
  const expectedNominal = Math.max(inside.minGap, inside.bandGap - 20);
  assert.deepEqual(nominal, [expectedNominal],
    `the portal corridor must be the clamped nominal on every frame (wanted ${expectedNominal}, saw ${JSON.stringify(nominal)})`);
  assert.ok(nominal[0] >= inside.minGap,
    `the portal corridor must never go below the audited floor ${inside.minGap}`);
  assert.ok(nominal[0] < inside.bandGap,
    `the portal must actually tighten the corridor (band ${inside.bandGap}, portal ${nominal[0]})`);

  assert.ok(inside.speeds.length > 0, 'the section must have been measured');
  const observed = [...new Set(inside.speeds)];
  // Derived from the envelope constant rather than written as a literal: M43 wrote
  // 5.7 here and M44's re-search moved the ceiling, leaving a test that failed
  // while the behaviour it guards was still correct.
  assert.deepEqual(observed, [inside.maxSpeed],
    `every wall inside the portal must move at the clamped ${inside.maxSpeed} and nothing else (saw ${JSON.stringify(observed)})`);
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
      top: m.portalSpeedFor(bands[bands.length - 1].speed), mid: m.portalSpeedFor(2.9),
      gapTop: m.portalGapFor(bands[bands.length - 1].gap), gapMid: m.portalGapFor(260),
      maxSpeed: m.MONAS_MAX_VERIFIED_SPEED, minGap: m.MONAS_MIN_VERIFIED_GAP,
      escalates: bands.map(b => ({
        id: b.id,
        fasterBy: m.portalSpeedFor(b.speed) - b.speed,
        tighterBy: b.gap - m.portalGapFor(b.gap)
      }))
    };
  })()`);
  console.log('portal clamps:', JSON.stringify(clamps));
  assert.equal(clamps.has, true, 'the clamp must be exported so its ceiling is assertable');
  assert.equal(clamps.top, clamps.maxSpeed, 'the hardest portal must saturate at the audited ceiling, not run past it');
  assert.equal(clamps.gapTop, clamps.minGap, 'the tightest portal corridor must saturate at the audited floor');
  assert.ok(clamps.mid > 2.9 && clamps.mid < clamps.maxSpeed, 'a low-band portal must escalate without reaching the ceiling');
  assert.ok(clamps.gapMid < 260 && clamps.gapMid > clamps.minGap, 'a low-band portal must tighten without reaching the floor');

  // The reason 5.7 / 190 is not a live band: if it were, a portal opening on the
  // top band would be identical to ordinary play - a stake and a dark field with no
  // escalation behind them. Every band must have somewhere to escalate to.
  for (const band of clamps.escalates) {
    assert.ok(band.fasterBy > 0, `a portal on ${band.id} must be faster than the band it interrupts`);
    assert.ok(band.tighterBy > 0, `a portal on ${band.id} must be tighter than the band it interrupts`);
  }

  // ---------------------------------------------------------------------------
  // Orbs pay in shields.
  //
  // The interesting case is the cap: `awardCharge` has nowhere to put a fourth
  // charge, and throwing the progress away there would quietly punish a player for
  // collecting while full. Asserted explicitly, because it is the branch that is
  // never hit in casual testing and always hit in a good run.
  // ---------------------------------------------------------------------------
  const orbs = await evaluate(`(() => {
    game.gameMode = 'HEX';
    game.startGame();
    const powerups = window.__SEX_MAGICK_POWERUPS__;
    const charges = () => powerups.getSnapshot()?.charges?.aegis ?? null;

    const collectOne = () => {
      const orb = new Orb(game.player.x, game.player.y, null);
      game.collectibles.push(orb);
      const before = game.score;
      game.updateGameObjects();
      return { scoreDelta: game.score - before, charges: charges(), progress: game.orbShieldProgress };
    };

    const start = { charges: charges(), progress: game.orbShieldProgress };
    // Derived from the constant: M43 wrote three collections here and M44 raised
    // the price to five, so a literal would fail while the mechanic was correct.
    const perShield = CONFIG.ORBS_PER_SHIELD;
    const steps = [];
    for (let i = 0; i < perShield; i += 1) steps.push(collectOne());

    // Fill to the cap, then keep collecting.
    while ((charges() ?? 0) < 3) powerups.grant('aegis', 1);
    const atCap = charges();
    const overflow = [];
    for (let i = 0; i < perShield; i += 1) overflow.push(collectOne());
    const afterOverflow = { charges: charges(), progress: game.orbShieldProgress };

    return { start, steps, atCap, overflow, afterOverflow, perShield,
             exposed: typeof powerups.awardCharge };
  })()`);

  console.log('orb shields:', JSON.stringify(orbs));
  assert.equal(orbs.exposed, 'function', 'the orb award path must be a real API, not a test affordance');
  assert.equal(orbs.start.charges, 0, 'a fresh run starts with no shields');
  assert.ok(orbs.steps.every(step => step.scoreDelta === 0),
    'collecting an orb must no longer move the score - it pays in shields now');
  assert.ok(orbs.perShield >= 2, 'a shield must cost more than one orb to be a price at all');
  orbs.steps.slice(0, -1).forEach((step, index) => {
    assert.equal(step.charges, 0, `orb ${index + 1} of ${orbs.perShield} must not yet be a shield`);
    assert.equal(step.progress, index + 1, `orb ${index + 1} must bank toward the next shield`);
  });
  assert.equal(orbs.steps.at(-1).charges, 1,
    `orb ${orbs.perShield} must grant exactly one AEGIS charge`);
  assert.equal(orbs.steps.at(-1).progress, 0,
    `and must consume the ${orbs.perShield} that paid for it`);

  assert.equal(orbs.atCap, 3, 'the cap must actually be reached for the overflow case to mean anything');
  assert.equal(orbs.afterOverflow.charges, 3, 'a full bank must stay full');
  assert.equal(orbs.afterOverflow.progress, orbs.perShield,
    'progress collected at the cap must be held, not discarded - the last orb is deferred, never wasted');

  // ---------------------------------------------------------------------------
  // The tap melody: in key, fresh per run, and reaching MONAS as well as HEX.
  // ---------------------------------------------------------------------------
  const melody = await evaluate(`(() => {
    game.gameMode = 'HEX';
    game.startGame();
    const first = [...SFX.melody];
    game.startGame();
    const second = [...SFX.melody];

    const scale = new Set(SFX.MELODY_SCALE);
    const inScale = first.concat(second).every(note => scale.has(note));
    const leaps = [];
    for (let i = 1; i < first.length; i += 1) {
      leaps.push(Math.abs(SFX.MELODY_SCALE.indexOf(first[i]) - SFX.MELODY_SCALE.indexOf(first[i - 1])));
    }

    // Advancing must walk the phrase rather than repeat a note.
    SFX.melodyIndex = 0;
    const walked = [SFX.melodyIndex];
    for (let i = 0; i < 4; i += 1) { SFX.playMelodyNote(); walked.push(SFX.melodyIndex); }

    return {
      length: first.length, inScale, maxLeap: Math.max(...leaps),
      differs: JSON.stringify(first) !== JSON.stringify(second),
      walked, gain: SFX.MELODY_GAIN
    };
  })()`);

  console.log('tap melody:', JSON.stringify(melody));
  assert.ok(melody.length >= 8, 'a phrase must be long enough not to read as a loop');
  assert.equal(melody.inScale, true, 'every note must come from the scale - no walk may land out of key');
  assert.ok(melody.maxLeap <= 2, `the walk must move by small intervals, not jump (max ${melody.maxLeap})`);
  assert.equal(melody.differs, true, 'each run must draw its own phrase');
  assert.deepEqual(melody.walked, [0, 1, 2, 3, 4], 'each tap must advance one step through the phrase');
  assert.ok(melody.gain < 0.06, `the tap must stay under the music (gain ${melody.gain})`);

  // MONAS is a hold rite whose jump() is a no-op, so the note has to arrive by a
  // different route or MONAS would be silent on input.
  const monasNote = await evaluate(`(() => {
    game.gameMode = 'MONAS';
    game.startGame();
    game.state = GameState.PLAYING;
    let calls = 0;
    const real = SFX.playMelodyNote;
    SFX.playMelodyNote = function counted(...args) { calls += 1; return real.apply(this, args); };
    try {
      window.dispatchEvent(new PointerEvent('pointerdown'));
      const afterPress = calls;
      window.dispatchEvent(new PointerEvent('pointerdown'));
      const afterRepeat = calls;
      window.dispatchEvent(new PointerEvent('pointerup'));
      window.dispatchEvent(new PointerEvent('pointerdown'));
      return { afterPress, afterRepeat, afterRelease: calls };
    } finally { SFX.playMelodyNote = real; }
  })()`);

  console.log('MONAS glide note:', JSON.stringify(monasNote));
  assert.equal(monasNote.afterPress, 1, 'the press that begins a MONAS glide must sound a note');
  assert.equal(monasNote.afterRepeat, 1, 'a held finger must not repeat the note - holding is how MONAS is played');
  assert.equal(monasNote.afterRelease, 2, 'releasing and pressing again must sound the next note');

  sock.close();
  console.log('\nAll M43 MONAS rite checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
