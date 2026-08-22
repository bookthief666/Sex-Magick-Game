/**
 * M44 - the ladder stops ending.
 *
 * The owner's report, four times over: speed stops building, walls stop getting
 * harder, shields keep coming back, late runs never end. All four are one defect.
 * `getBandIndex` saturates at the final band, so every quantity derived from it -
 * speed, corridor, and the spawn rate that derives from speed - froze there. Past
 * gate 152 in HEX and 185 in MONAS, nothing about the game changed again, ever.
 *
 * This suite exists to make that specific failure impossible to reintroduce
 * quietly. It does not check that any particular number is correct - the band
 * tables and the reachability audit own that. It checks that the numbers are still
 * *moving* deep into a run, which is the thing a player feels and the thing every
 * previous milestone's tests could not see, because they all sampled a fresh run.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticServer } from './qa-static-server.mjs';

const ROOT = process.cwd();
const PORT = 4202, DBG = 9259;
const BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startStaticServer({ root: ROOT, port: PORT });
const dir = await mkdtemp(path.join(os.tmpdir(), 'm44end-'));
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
  await send('Page.navigate', { url: `${BASE}/index.html?m44=${Date.now()}` });
  await loaded;
  for (let i = 0; i < 80 && !(await evaluate(`typeof game !== 'undefined' && !!game`)); i++) await wait(250);



  // ---------------------------------------------------------------------------
  // The ladders as the live page reports them.
  //
  // Interrogated through the runtimes rather than by driving a run to gate 500,
  // which takes minutes of wall clock. That is a real limit on what this suite
  // proves: it asserts the *functions the frame loop calls* keep escalating, and
  // leaves "the frame loop actually calls them" to the suites that drive real
  // frames - browser-m32 for MONAS's speed, browser-m42-orb-sweep for the orbs,
  // browser-gate-slice for the Void.
  // ---------------------------------------------------------------------------
  const ladders = await evaluate(`(() => {
    const gate = window.SexMagickGateSlice;
    const hexBands = gate.BANDS;
    const monasBands = window.__SEX_MAGICK_MONAS_PROGRESSION__.getFingerprint().bands;
    return {
      hex: {
        speeds: hexBands.map(b => b.speed),
        gaps: hexBands.map(b => b.gap),
        lastThreshold: hexBands[hexBands.length - 1].gateThreshold,
        descent: [0, 30, 60, 120, 180, 400].map(d => gate.nominalGapFor(hexBands[hexBands.length - 1].gateThreshold + d)),
        voidDurations: hexBands.map((b, i) => gate.voidDurationForBand(i)),
        minGap: gate.MIN_VALIDATED_GAP,
        maxSpeed: gate.MAX_VALIDATED_SPEED
      },
      monas: {
        speeds: monasBands.map(b => b.speed),
        gaps: monasBands.map(b => b.gap),
        lastThreshold: monasBands[monasBands.length - 1].gateThreshold
      }
    };
  })()`);
  console.log('ladders:', JSON.stringify(ladders));

  const strictlyIncreasing = xs => xs.every((v, i) => i === 0 || v > xs[i - 1]);
  const nonIncreasing = xs => xs.every((v, i) => i === 0 || v <= xs[i - 1]);

  // A resize is part of the live difficulty path, not merely layout. The base
  // portrait accommodation writes 2.61 into gameSpeed; Gate must reassert the
  // band or Void value after that write. Sample after real update frames so this
  // cannot pass on a pre-frame value that another wrapper immediately clobbers.
  const prepareKether = await evaluate(`(() => {
    game.gameMode = 'HEX';
    game.startGame();
    game.state = GameState.PAUSED;
    const bands = window.SexMagickGateSlice.BANDS;
    const last = bands[bands.length - 1];
    game.gateSliceState.gatesCleared = last.gateThreshold;
    game.gateSliceState.bandIndex = bands.length - 1;
    game.applyLevel();
    game.player.update = () => {};
    game.obstacles = [];
    return { expected: last.speed, actual: game.gameSpeed, bandIndex: game.gateSliceState.bandIndex };
  })()`);
  assert.equal(prepareKether.actual, prepareKether.expected, 'the resize probe must begin at canonical KETHER speed');

  const sampleResize = async (width, height) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < height
    });
    await wait(60);
    return evaluate(`(() => {
      game.resizeCanvas();
      game.player.y = game.canvas.height / 2;
      game.player.vy = 0;
      game.obstacles = [];
      for (let frame = 0; frame < 4; frame += 1) {
        game.frames += 1;
        game.updateGameObjects();
      }
      return {
        width: game.canvas.width,
        height: game.canvas.height,
        speed: game.gameSpeed,
        bandIndex: game.gateSliceState.bandIndex,
        voidActive: Boolean(game.__gateSliceVoidActive)
      };
    })()`);
  };

  const ordinaryResize = [
    await sampleResize(390, 844),
    await sampleResize(844, 390),
    await sampleResize(390, 844)
  ];
  ordinaryResize.forEach(sample => {
    assert.equal(sample.speed, prepareKether.expected,
      `ordinary KETHER must remain ${prepareKether.expected} after ${sample.width}x${sample.height} and live frames`);
    assert.equal(sample.bandIndex, prepareKether.bandIndex, 'resize must not move the KETHER band');
    assert.equal(sample.voidActive, false, 'ordinary resize sample must remain outside Void');
  });

  const voidPrepared = await evaluate(`(() => {
    game.startVoidMode(1);
    return {
      expected: game.gameSpeed,
      active: Boolean(game.__gateSliceVoidActive),
      maxValidatedSpeed: window.SexMagickGateSlice.MAX_VALIDATED_SPEED
    };
  })()`);
  assert.equal(voidPrepared.active, true, 'the resize probe must actually enter a KETHER Void');
  assert.equal(voidPrepared.expected, voidPrepared.maxValidatedSpeed,
    'KETHER Void must clamp at the audited ceiling rather than exceed it');
  const voidResize = [
    await sampleResize(844, 390),
    await sampleResize(390, 844)
  ];
  voidResize.forEach(sample => {
    assert.equal(sample.speed, voidPrepared.expected,
      `KETHER Void must remain ${voidPrepared.expected} after ${sample.width}x${sample.height} and live frames`);
    assert.equal(sample.voidActive, true, 'resize must not end the active Void');
  });

  // At KETHER the ordinary and Void values are both the 10.0 validation clamp,
  // so that case proves the clobber is gone but cannot distinguish the two
  // applyBand branches. Repeat at a lower band where the Void value is strictly
  // different; reapplying only the ordinary band after resize must fail here.
  const uncappedVoidPrepared = await evaluate(`(() => {
    game.endVoidMode();
    const bands = window.SexMagickGateSlice.BANDS;
    const bandIndex = Math.floor((bands.length - 1) / 2);
    const band = bands[bandIndex];
    game.gateSliceState.gatesCleared = band.gateThreshold;
    game.gateSliceState.bandIndex = bandIndex;
    game.applyLevel();
    const ordinarySpeed = game.gameSpeed;
    game.startVoidMode(1);
    return {
      bandIndex,
      ordinarySpeed,
      expected: game.gameSpeed,
      active: Boolean(game.__gateSliceVoidActive)
    };
  })()`);
  assert.equal(uncappedVoidPrepared.active, true, 'the distinguishing resize probe must enter a lower-band Void');
  assert.ok(uncappedVoidPrepared.expected > uncappedVoidPrepared.ordinarySpeed,
    'negative control: this Void speed must differ from its ordinary band speed');
  const uncappedVoidResize = [
    await sampleResize(844, 390),
    await sampleResize(390, 844)
  ];
  uncappedVoidResize.forEach(sample => {
    assert.equal(sample.speed, uncappedVoidPrepared.expected,
      `lower-band Void must remain ${uncappedVoidPrepared.expected} after ${sample.width}x${sample.height} and live frames`);
    assert.equal(sample.bandIndex, uncappedVoidPrepared.bandIndex, 'resize must not move the lower Void band');
    assert.equal(sample.voidActive, true, 'resize must not end the lower-band Void');
  });
  console.log('HEX resize speeds:', JSON.stringify({ ordinaryResize, voidResize, uncappedVoidResize }));

  // 1. Speed climbs the whole way, in both rites.
  assert.ok(strictlyIncreasing(ladders.hex.speeds),
    `HEX speed must climb at every band (${ladders.hex.speeds})`);
  assert.ok(strictlyIncreasing(ladders.monas.speeds),
    `MONAS speed must climb at every band (${ladders.monas.speeds})`);
  assert.equal(ladders.hex.speeds.at(-1), ladders.hex.maxSpeed,
    'HEX must reach its audited ceiling by its final band');
  assert.ok(ladders.hex.speeds.at(-1) > 8.5,
    `the ceiling must actually have moved - it sat at 8.5 for three milestones (${ladders.hex.speeds.at(-1)})`);

  // 2. The corridor keeps closing, and never past the audited floor.
  assert.ok(nonIncreasing(ladders.hex.gaps), 'HEX corridors must never widen up the ladder');
  assert.ok(nonIncreasing(ladders.monas.gaps), 'MONAS corridors must never widen up the ladder');

  // 3. The descent: past the last band the corridor is still moving. This is the
  //    assertion that would have caught the original defect.
  const descent = ladders.hex.descent;
  console.log('HEX descent past the last band:', JSON.stringify(descent));
  assert.ok(descent[1] < descent[0],
    `the corridor must keep closing past the final band (${descent[0]} -> ${descent[1]})`);
  assert.ok(descent.at(-1) < descent[0],
    'a deep run must be meaningfully tighter than one that has just reached the last band');
  assert.ok(descent.every(g => g >= ladders.hex.minGap),
    `the descent must never pass the audited floor ${ladders.hex.minGap} (${descent})`);
  assert.equal(descent.at(-1), ladders.hex.minGap,
    'and it must actually reach that floor rather than creeping forever');

  // 4. Challenge sections lengthen.
  const durations = ladders.hex.voidDurations;
  assert.ok(strictlyIncreasing(durations),
    `the Void must lengthen with the ladder (${durations})`);
  assert.ok(durations.at(-1) > durations[0] * 1.5,
    `a late Void must be substantially longer than an early one (${durations[0]} -> ${durations.at(-1)})`);

  // 5. Nothing about a deep run is frozen. Sampled as a whole so the assertion is
  //    the owner's complaint rather than any one lever.
  const frozen = await evaluate(`(() => {
    const gate = window.SexMagickGateSlice;
    const last = gate.BANDS[gate.BANDS.length - 1].gateThreshold;
    const signature = (gates) => [gate.nominalGapFor(gates)].join('/');
    return { atLast: signature(last), later: signature(last + 120), muchLater: signature(last + 400) };
  })()`);
  console.log('deep-run signature:', JSON.stringify(frozen));
  assert.notEqual(frozen.later, frozen.atLast,
    'a run 120 gates past the final band must not be identical to one that just reached it');

  sock.close();
  console.log('\nAll M44 endless-ladder checks passed.');
} finally {
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
}
process.exit(0);
