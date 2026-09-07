// The Rite board, in a real page.
//
// The recurring failure in this project has been a check that never touches the
// real data path, so this seeds the Gate slice's own storage key, loads the game
// unmodified, and reads what the menu actually shows.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = Number(process.env.PORT || 4581);
const children = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function which(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function makeRun(overrides = {}) {
  return {
    version: 2,
    runId: 'gate_seed',
    rite: 'HEX',
    startedAt: '2026-08-13T10:00:00.000Z',
    endedAt: '2026-08-13T10:05:00.000Z',
    endReason: 'crash',
    gatesCleared: 20,
    bandIndex: 1,
    gnosis: 4,
    gnosisCapacity: 10,
    gateOffers: 3,
    gateEntries: 2,
    gateBanks: 1,
    voidAttempts: 2,
    voidSurvivals: 1,
    voidDeaths: 1,
    finalScore: 140,
    events: [],
    ...overrides
  };
}

const SEEDED = [
  makeRun({ runId: 'mid', gatesCleared: 20, bandIndex: 1, finalScore: 140 }),
  makeRun({ runId: 'best', gatesCleared: 160, bandIndex: 7, finalScore: 900, endedAt: '2026-08-13T10:30:00.000Z' }),
  makeRun({ runId: 'low', gatesCleared: 3, bandIndex: 0, finalScore: 20 }),
  // Internally inconsistent: the band does not follow from the gates, and the pace
  // is impossible. It must not appear on the board.
  makeRun({ runId: 'tampered', gatesCleared: 99999, bandIndex: 0, finalScore: 999999 })
];

children.push(spawn(which('python3'), ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' }));
await sleep(1500);

const browser = await chromium.launch();
const failures = [];
const report = {};

async function openGame(query, seed = true) {
  const context = await browser.newContext({ viewport: { width: 884, height: 1104 } });
  const page = await context.newPage();
  if (seed) {
    await page.addInitScript(runs => {
      try { localStorage.setItem('sex_magick_gate_slice_v1', JSON.stringify(runs)); } catch (_error) {}
    }, SEEDED);
  }
  await page.goto(`http://127.0.0.1:${PORT}/index.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  return { context, page };
}

// --- the board renders the player's own verified runs, best first ---------------

{
  const { context, page } = await openGame('assetMode=offline&gateSlice=1');
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_BOARD__), null, { timeout: 20000 });
  await page.waitForFunction(
    () => (document.getElementById('leaderboardList')?.textContent || '').includes('GATES'),
    null,
    { timeout: 20000 }
  );

  const view = await page.evaluate(() => ({
    title: document.querySelector('.leaderboard-title')?.textContent?.trim() ?? null,
    containerHidden: document.querySelector('.leaderboard-container')?.hidden ?? null,
    rows: Array.from(document.querySelectorAll('#leaderboardList .leaderboard-row'))
      .map(row => row.textContent.replace(/\s+/g, ' ').trim()),
    board: window.__SEX_MAGICK_RITE_BOARD__.getBoard(),
    networkSubmission: window.__SEX_MAGICK_RITE_BOARD__.networkSubmission
  }));

  report.title = view.title;
  report.rows = view.rows;
  report.ranking = view.board.entries.map(entry => `${entry.runId}:${entry.gatesCleared}`);
  report.verifiedRuns = view.board.verifiedRuns;
  report.totalRuns = view.board.totalRuns;

  try {
    assert.equal(view.containerHidden, false, 'the board container must be visible');
    assert.match(view.title, /RITE BOARD/, 'the board keeps its own title');
    assert.deepEqual(
      view.board.entries.map(entry => entry.runId),
      ['best', 'mid', 'low'],
      'verified runs rank by gates cleared, best first'
    );
    assert.equal(view.board.totalRuns, 4, 'every stored run is considered');
    assert.equal(view.board.verifiedRuns, 3, 'the inconsistent run is not counted as verified');
    assert.ok(
      view.board.rejected.some(entry => entry.runId === 'tampered'),
      'the inconsistent run is rejected with a reason'
    );
    assert.equal(view.rows.length, 3, 'the rendered rows match the ranked entries');
    assert.match(view.rows[0], /#1 KETHER/, 'the top row names the band reached');
    assert.match(view.rows[0], /160 GATES/, 'the top row reports the gates cleared');
    assert.ok(
      !view.rows.join(' ').includes('99999'),
      'a rejected run must never reach the rendered board'
    );
    assert.equal(view.networkSubmission, false, 'the board declares itself local');
  } catch (error) {
    failures.push(`board render: ${error.message}`);
  }
  await context.close();
}

// --- no run history yet ---------------------------------------------------------

{
  const { context, page } = await openGame('assetMode=offline&gateSlice=1', false);
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_BOARD__), null, { timeout: 20000 });
  const text = await page.evaluate(() => document.getElementById('leaderboardList')?.textContent?.trim() ?? null);
  report.emptyState = text;
  try {
    assert.match(text, /NO (?:HEX |MONAS )?RUNS YET|NO VERIFIED (?:HEX |MONAS )?RUNS/, 'an empty history says so plainly');
  } catch (error) {
    failures.push(`empty state: ${error.message}`);
  }
  await context.close();
}

// --- the board stays inert under visual QA ---------------------------------------

{
  const { context, page } = await openGame('assetMode=offline&gateSlice=1&visualQa=1&renderDpr=1');
  await page.waitForFunction(
    () => (document.getElementById('leaderboardList')?.textContent || '').length > 0,
    null,
    { timeout: 20000 }
  );
  await page.waitForTimeout(600);
  const text = await page.evaluate(() => document.getElementById('leaderboardList')?.textContent?.trim() ?? null);
  report.visualQaText = text;
  try {
    assert.doesNotMatch(text, /GATES/, 'the board must not paint live run data into a visual QA capture');
    assert.match(text, /LOCAL ONLY/i, 'visual QA keeps its fixed local-only text');
  } catch (error) {
    failures.push(`visual QA suppression: ${error.message}`);
  }
  await context.close();
}

// --- a real run reaches the board -------------------------------------------------
//
// Not a seeded fixture: start a run through the game's own entry point, clear gates
// through checkLevel(), end it, and walk back to the menu the way the player does.

{
  const { context, page } = await openGame('assetMode=offline&gateSlice=1', false);
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_BOARD__), null, { timeout: 20000 });

  const before = await page.evaluate(() => window.__SEX_MAGICK_RITE_BOARD__.getBoard().totalRuns);

  const after = await page.evaluate(async () => {
    game.gameMode = 'HEX';
    game.startGame();
    for (let gate = 0; gate < 9; gate += 1) {
      game.gateSliceState.gatesCleared += 1;
      game.checkLevel();
    }

    // A scripted run takes no wall-clock time at all, and the pace rule correctly
    // refuses 9 gates in zero seconds - that rejection is the validator working, not
    // a bug. Stand the clock forward by a plausible run length so the run under test
    // is the one a player would produce. Nothing in the game state is touched.
    const RealDate = Date;
    const finishedAt = RealDate.now() + 20_000;
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [finishedAt])); }
      static now() { return finishedAt; }
    };
    try {
      game.gameOver();
      game.returnToMenu();
    } finally {
      // eslint-disable-next-line no-global-assign
      Date = RealDate;
    }
    // returnToMenu now schedules the board render on a macrotask (see
    // installMenuRefresh), so yield once and let it paint before we read.
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      totalRuns: window.__SEX_MAGICK_RITE_BOARD__.getBoard().totalRuns,
      entries: window.__SEX_MAGICK_RITE_BOARD__.getBoard().entries.map(entry => ({
        gates: entry.gatesCleared, band: entry.bandName, verified: entry.verified
      })),
      rendered: (document.getElementById('leaderboardList')?.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });

  report.realRun = { totalRunsBefore: before, ...after };
  try {
    assert.equal(before, 0, 'the board starts empty on a fresh profile');
    assert.equal(after.totalRuns, 1, 'the finished run reached the history');
    assert.equal(after.entries.length, 1, 'and it is on the board');
    assert.equal(after.entries[0].gates, 9, 'with the gates it actually cleared');
    assert.equal(after.entries[0].verified, true, 'a genuine run passes its own consistency checks');
    assert.match(after.rendered, /9 GATES/, 'and the menu shows it without a reload');
  } catch (error) {
    failures.push(`real run: ${error.message}`);
  }
  await context.close();
}

// --- no network traffic leaves the page ------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 884, height: 1104 } });
  const page = await context.newPage();
  const external = [];
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(`http://127.0.0.1:${PORT}/`) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });
  await page.addInitScript(runs => {
    try { localStorage.setItem('sex_magick_gate_slice_v1', JSON.stringify(runs)); } catch (_error) {}
  }, SEEDED);
  await page.goto(`http://127.0.0.1:${PORT}/index.html?assetMode=offline&gateSlice=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_RITE_BOARD__), null, { timeout: 20000 });
  await page.waitForTimeout(500);

  // The page loads its own fonts, styles and audio from CDNs, which is pre-existing
  // and not what this checks. What matters is that rendering the board adds nothing.
  const beforeRender = external.length;
  await page.evaluate(() => {
    window.__SEX_MAGICK_RITE_BOARD__.render();
    window.__SEX_MAGICK_RITE_BOARD__.getBoard();
  });
  await page.waitForTimeout(500);
  const addedByBoard = external.slice(beforeRender);

  report.externalRequestsBeforeRender = beforeRender;
  report.externalRequestsAddedByBoard = addedByBoard.length;
  try {
    assert.deepEqual(addedByBoard, [], `rendering the board must add no external requests, saw: ${addedByBoard.join(', ')}`);
    assert.equal(
      external.some(url => /lootlocker|leaderboard|score/i.test(url)),
      false,
      `no score-service traffic may leave the page, saw: ${external.join(', ')}`
    );
  } catch (error) {
    failures.push(`network isolation: ${error.message}`);
  }
  await context.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
for (const child of children) child.kill('SIGKILL');

if (failures.length > 0) {
  console.error('\nFAILURES:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nbrowser-leaderboard-test: all assertions passed');
}
