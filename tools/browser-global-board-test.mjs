// The global Rite board, in a real page against a real handler.
//
// The recurring failure in this project has been a check that never touches the
// real data path, so the stub server here is not a canned JSON fixture — it is
// `worker/board.js` itself, the same module the Worker deploys, running over an
// in-memory KV. A run submitted by the browser is judged by the code that will
// judge it in production.
//
// The deployed board is now on by default. The first section therefore protects
// the explicit emergency-off contract: `?globalBoard=0` must make zero board
// requests and leave the local Rite board intact.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const workerBoard = require('../worker/board.js');

const PORT = Number(process.env.PORT || 4593);
const WORKER_PORT = Number(process.env.WORKER_PORT || 4594);
const children = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// --- the stub Worker ----------------------------------------------------------
// An in-memory KV plus a Node http server that adapts to the handler's
// (Request, env) -> Response contract.

function createKV() {
  const store = new Map();
  return {
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); }
  };
}

const env = { BOARD: createKV() };

const workerServer = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const request = new Request(`http://127.0.0.1:${WORKER_PORT}${req.url}`, {
    method: req.method,
    headers: { ...req.headers, 'cf-connecting-ip': '203.0.113.9' },
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body
  });

  const response = await workerBoard.handleRequest(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});

await new Promise(resolve => workerServer.listen(WORKER_PORT, '127.0.0.1', resolve));
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;

children.push(spawn(which('python3'), ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' }));
await sleep(1500);

const browser = await chromium.launch();
const failures = [];
const report = {};

/**
 * Open the game and record every request that leaves the page's own origin. The
 * local server is ours; anything else is an external request in the sense the
 * no-network guarantee cares about.
 */
async function openGame(query) {
  const context = await browser.newContext({ viewport: { width: 884, height: 1104 } });
  const page = await context.newPage();
  const external = [];
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  return { context, page, external };
}

// --- explicit off: emergency switch must stay genuinely network-free ----------

{
  const { context, page, external } = await openGame('assetMode=offline&gateSlice=1&globalBoard=0');
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_BOARD__), null, { timeout: 20000 });
  await sleep(1200);

  const state = await page.evaluate(() => ({
    globalInstalled: Boolean(window.__SEX_MAGICK_GLOBAL_BOARD__),
    scriptRequested: Boolean(document.querySelector('script[data-sex-magick-global-board]')),
    localBoardPresent: Boolean(document.getElementById('leaderboardList')),
    globalSection: Boolean(document.getElementById('global-rite-board'))
  }));

  const boardTraffic = external.filter(url => /board|leaderboard|score|lootlocker/i.test(url));
  report.flagOff = { external, boardTraffic, ...state };

  try {
    assert.deepEqual(boardTraffic, [],
      `globalBoard=0 must send no board traffic, saw: ${boardTraffic.join(', ')}`);
    assert.equal(state.globalInstalled, false, 'the emergency-off flag must prevent global installation');
    assert.equal(state.globalSection, false, 'no global board section may be rendered while explicitly off');
    assert.equal(state.localBoardPresent, true, 'the local Rite board must be unaffected');
  } catch (error) {
    failures.push(`flag off: ${error.message}`);
  }
  await context.close();
}

// --- production default on: a real run submits and renders --------------------

{
  const { context, page } = await openGame(
    `assetMode=offline&gateSlice=1&globalBoardUrl=${encodeURIComponent(WORKER_URL)}`
  );
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_GLOBAL_BOARD__), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_READY__), null, { timeout: 20000 });

  const submission = await page.evaluate(async () => {
    const api = window.__SEX_MAGICK_GLOBAL_BOARD__;

    // Take a token the way a real run does, then drive a run to completion through
    // the Gate slice's own path so the summary is the one finishRun writes.
    const explicitToken = await api.beginRun('HEX');
    const hadToken = Boolean(api.getRunToken());

    game.gameMode = 'HEX';
    game.startGame();
    // startGame issues its own token through the installed hook; wait for it.
    await new Promise(resolve => setTimeout(resolve, 800));
    const tokenAfterStart = api.getRunToken();
    const awaitingBeforeInput = Boolean(game.awaitingRiteInput);
    const framesBeforeInput = game.frames;
    game.playerJump();
    const awaitingAfterInput = Boolean(game.awaitingRiteInput);

    // This run has to survive both bounds at once, which is the point: 10 gates
    // needs at least 4s to be a possible pace, and the claim may not exceed the age
    // of the token plus the clock grace. Nine seconds of play for ten gates sits
    // comfortably inside both.
    game.gateSliceState.gatesCleared = 10;
    game.gateSliceState.bandIndex = 1;
    game.gateSliceState.gateOffers = 3;
    game.gateSliceState.gateEntries = 2;
    game.gateSliceState.gateBanks = 1;
    game.gateSliceState.voidAttempts = 2;
    game.gateSliceState.voidSurvivals = 1;
    game.gateSliceState.voidDeaths = 1;
    game.gateSliceState.startedAt = new Date(Date.now() - 9_000).toISOString();
    game.score = 140;

    const tokenBeforeSubmit = api.getRunToken();
    game.returnToMenu();

    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      hadToken,
      explicitToken: Boolean(explicitToken),
      tokenAfterStart: Boolean(tokenAfterStart),
      tokenBeforeSubmit: Boolean(tokenBeforeSubmit),
      awaitingBeforeInput,
      awaitingAfterInput,
      framesBeforeInput,
      historyLength: window.__SEX_MAGICK_GATE_SLICE__?.getHistory?.()?.length ?? null,
      newestRunId: window.__SEX_MAGICK_GATE_SLICE__?.getHistory?.()?.[0]?.runId ?? null,
      result: api.getLastResult()
    };
  });

  const view = await page.evaluate(() => ({
    section: document.getElementById('global-rite-board')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    rows: Array.from(document.querySelectorAll('#global-rite-board .leaderboard-row'))
      .map(row => row.textContent.replace(/\s+/g, ' ').trim())
  }));

  report.flagOn = { ...submission, ...view };

  try {
    assert.equal(submission.hadToken, true, 'run start must obtain a token from the Worker');
    assert.equal(submission.tokenAfterStart, true,
      'startGame must obtain a token through its hook, not only when called directly');
    assert.equal(submission.tokenBeforeSubmit, true,
      'the token must survive the run and still be held when the run ends');
    assert.equal(submission.awaitingBeforeInput, true,
      'selecting HEX must leave the avatar at the deliberate ready threshold');
    assert.equal(submission.awaitingAfterInput, false,
      'the first gameplay input must release the ready threshold');
    assert.ok(submission.framesBeforeInput >= 0,
      'the ready threshold may animate presentation but must remain a valid state');
    assert.equal(submission.historyLength, 1, 'the run must have been recorded by finishRun');
    assert.ok(submission.result, 'a completed run must produce a submission result');
    assert.equal(submission.result.accepted, true,
      `an honest run must be accepted, got: ${JSON.stringify(submission.result)}`);
    assert.ok(view.rows.length > 0, 'the accepted run must render on the global board');
    assert.match(view.section, /GATES/, 'the board rows must name gates, the thing 2.0 measures');
    assert.match(view.section, /NOT ANTI-CHEAT/,
      'the board must state what its verification does not establish');
  } catch (error) {
    failures.push(`default on: ${error.message}`);
  }
  await context.close();
}

// --- default on: a tampered run is refused and never reaches the DOM -----------

{
  const { context, page } = await openGame(
    `assetMode=offline&gateSlice=1&globalBoardUrl=${encodeURIComponent(WORKER_URL)}`
  );
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_GLOBAL_BOARD__), null, { timeout: 20000 });

  const rejection = await page.evaluate(async () => {
    const api = window.__SEX_MAGICK_GLOBAL_BOARD__;
    await api.beginRun('HEX');

    game.gameMode = 'HEX';
    game.startGame();
    await new Promise(resolve => setTimeout(resolve, 400));
    game.playerJump();

    // The forgery D-040's local board already catches, now put to the server.
    game.gateSliceState.gatesCleared = 99999;
    game.gateSliceState.bandIndex = 0;
    game.gateSliceState.startedAt = new Date(Date.now() - 5_000).toISOString();
    game.score = 999999;
    game.returnToMenu();

    await new Promise(resolve => setTimeout(resolve, 1500));
    return api.getLastResult();
  });

  const rendered = await page.evaluate(() =>
    document.getElementById('global-rite-board')?.textContent ?? ''
  );

  report.tampered = { rejection, rendered: rendered.replace(/\s+/g, ' ').trim() };

  try {
    assert.ok(rejection, 'the tampered run must produce a result');
    assert.equal(rejection.accepted, false, 'the server must refuse a tampered run');
    assert.ok(rejection.reasons?.length > 0, 'a refusal must carry its reasons');
    assert.doesNotMatch(rendered, /99999/, 'a rejected run must never reach the DOM');
  } catch (error) {
    failures.push(`tampered run: ${error.message}`);
  }
  await context.close();
}

// --- MONAS records runs too, on its own board ------------------------------
//
// M42 gave MONAS an edge meter and a portal, so it finishes runs and submits them.
// The property worth proving from the real page is the one D-004 requires and a
// unit test cannot see: that a MONAS run reaches the MONAS board and not the HEX
// one. The ladders differ, so a run ranked on the wrong board would also be
// scored against the wrong thresholds.
{
  const { context, page } = await openGame(
    `assetMode=offline&globalBoardUrl=${encodeURIComponent(WORKER_URL)}`
  );
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_GLOBAL_BOARD__), null, { timeout: 20000 });

  const monas = await page.evaluate(async () => {
    const api = window.__SEX_MAGICK_GLOBAL_BOARD__;
    game.gameMode = 'MONAS';
    game.startGame();
    await new Promise(resolve => setTimeout(resolve, 800));
    const awaitingBeforeInput = Boolean(game.awaitingRiteInput);
    game.playerJump();
    const awaitingAfterInput = Boolean(game.awaitingRiteInput);

    // Same shape of claim as the HEX case above: a pace the spawn rate allows, and
    // a duration the token's own age can support.
    const state = game.monasState;
    state.gatesPassed = 10;
    state.progressionBandIndex = 1;
    state.gnosis = 3;
    state.portalsEntered = 1;
    state.portalsSurvived = 1;
    state.startedAt = new Date(Date.now() - 9000).toISOString();
    game.score = 260;

    const summary = window.__SEX_MAGICK_MONAS__.finishRunForTest('death');
    const historyLength = window.__SEX_MAGICK_MONAS__.getHistory().length;
    const result = await api.submitNewestRun();
    const hexBoard = await api.fetchBoard('HEX');
    const monasBoard = await api.fetchBoard('MONAS');
    return { summaryRite: summary?.rite, historyLength, result,
             awaitingBeforeInput, awaitingAfterInput,
             hexEntries: hexBoard?.entries?.length ?? null,
             hexRunIds: (hexBoard?.entries || []).map(entry => entry.runId),
             monasEntries: monasBoard?.entries?.length ?? null,
             monasTop: monasBoard?.entries?.[0] ?? null,
             submittedRunId: summary?.runId ?? null };
  });
  report.monas = monas;

  try {
    assert.equal(monas.awaitingBeforeInput, true, 'MONAS must share the deliberate ready threshold');
    assert.equal(monas.awaitingAfterInput, false, 'first MONAS input must begin the hold/release rite');
    assert.equal(monas.summaryRite, 'MONAS', 'the recorder must stamp the rite');
    assert.equal(monas.historyLength, 1, 'the run must have been recorded');
    assert.equal(monas.result?.accepted, true,
      `an honest MONAS run must be accepted: ${JSON.stringify(monas.result)}`);
    assert.equal(monas.monasEntries, 1, 'the MONAS board must hold exactly this run');
    // The HEX board is not empty here - an earlier block in this file submitted a
    // HEX run to the same Worker - so the separation to assert is that *this* run
    // is absent from it, not that the board has nothing on it.
    assert.ok(monas.submittedRunId, 'the MONAS run must have an id to look for');
    assert.ok(!monas.hexRunIds.includes(monas.submittedRunId),
      `a MONAS run must never reach the HEX board - D-004 (HEX holds ${JSON.stringify(monas.hexRunIds)})`);
    assert.equal(monas.monasTop?.gatesCleared, 10);
    assert.equal(monas.monasTop?.bandName, 'CURRENT-I',
      'MONAS entries must carry MONAS band names rather than HEX Sephiroth labels');
  } catch (error) {
    failures.push(`MONAS board: ${error.message}`);
  }
  await context.close();
}

await browser.close();
workerServer.close();
for (const child of children) child.kill();

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  console.error(`\nglobal-board: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nglobal-board: all assertions passed');
}
