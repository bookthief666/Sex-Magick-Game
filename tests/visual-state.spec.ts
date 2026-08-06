import { test, expect, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASELINE_PATH = path.join(process.cwd(), 'tests', 'visual-baselines', 'm14-signatures.json');
const visualReferenceProjects = new Set([
  'chromium-small-phone',
  'chromium-fold-cover',
  'chromium-fold-inner',
  'chromium-desktop'
]);

const standardStates = ['gameplay', 'menu', 'death', 'retry'] as const;
const gateStates = ['gate-offer', 'gate-bank', 'void'] as const;
const expectedLayers: Record<string, string> = {
  menu: 'startScreen',
  gameplay: 'gameplay',
  death: 'gameOverScreen',
  retry: 'gameplay',
  'gate-offer': 'gameplay',
  'gate-bank': 'gameplay',
  void: 'gameplay'
};

function baselineData(): Record<string, Record<string, string>> | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

async function seedPage(page: Page) {
  await page.addInitScript(() => {
    const fixedWallClock = 1_782_000_000_000;
    Date.now = () => fixedWallClock;
    let state = 0x93c0ffee >>> 0;
    Math.random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  });
}

async function canonicalizeDynamicText(page: Page) {
  await page.evaluate(() => {
    const leaderboard = document.getElementById('leaderboardList');
    if (leaderboard) leaderboard.textContent = 'VISUAL QA · LOCAL ONLY';
    const track = document.getElementById('trackName');
    if (track) track.textContent = 'SOURCE: PROCEDURAL OFFLINE ASSET';
    const fps = document.getElementById('fpsCounter');
    if (fps) fps.textContent = '60';
    const audio = document.getElementById('audioStatus');
    if (audio) audio.textContent = 'MUTED';
  });
}

async function openVisualController(page: Page, gateSlice = false) {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await seedPage(page);
  await page.route(/lootlocker\.io/i, route => route.abort('failed'));

  const query = new URLSearchParams({
    assetMode: 'offline',
    renderDpr: '1',
    visualQa: '1'
  });
  if (gateSlice) {
    query.set('gateSlice', '1');
    query.set('inputBuffer', '3');
  }

  await page.goto(`/index.html?${query.toString()}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VIEWPORT__));

  if (!gateSlice) {
    await page.waitForFunction(() => {
      const text = document.getElementById('leaderboardList')?.textContent || '';
      return /OFFLINE|NO TOKEN|NO SCORES/i.test(text);
    });
  }

  await canonicalizeDynamicText(page);
  await page.addScriptTag({ url: '/tools/visual-state-runtime.js' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VISUAL_QA__));
  if (gateSlice) await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_GATE_SLICE__));
  await canonicalizeDynamicText(page);
  return pageErrors;
}

async function showState(page: Page, state: string) {
  const snapshot = await page.evaluate(stateName => (window as any).__SEX_MAGICK_VISUAL_QA__.showState(stateName), state);
  if (state === 'menu') await canonicalizeDynamicText(page);
  return snapshot;
}

async function visualHash(page: Page, project: string, state: string) {
  const outputDir = path.join(process.cwd(), 'test-results', 'm14-visual', project);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${state}.png`);
  const buffer = await page.locator('#game-container').screenshot({
    path: outputPath,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css'
  });
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

test('standard visual states remain reachable and internally consistent', async ({ page }) => {
  const pageErrors = await openVisualController(page, false);
  for (const state of standardStates) {
    const snapshot = await showState(page, state);
    expect(snapshot.label).toBe(state);
    expect(snapshot.layer).toBe(expectedLayers[state]);
    expect(snapshot.viewport[0]).toBeGreaterThan(0);
    expect(snapshot.viewport[1]).toBeGreaterThan(0);
    expect(snapshot.logicalCanvas[0]).toBeGreaterThan(0);
    expect(snapshot.logicalCanvas[1]).toBeGreaterThan(0);
    if (state === 'death') expect(snapshot.score).toBe(13);
    if (state === 'retry') expect(snapshot.score).toBe(0);
  }
  expect(pageErrors).toEqual([]);
});

test('Gate offer, bank, and Void states remain reachable', async ({ page }, testInfo) => {
  test.skip(!visualReferenceProjects.has(testInfo.project.name), 'Gate state coverage runs on visual reference projects.');
  const pageErrors = await openVisualController(page, true);

  const offer = await showState(page, 'gate-offer');
  expect(offer.layer).toBe('gameplay');
  expect(offer.gate?.offer).toBe(true);
  expect(offer.gate?.gnosis).toBe(10);

  const bank = await showState(page, 'gate-bank');
  expect(bank.layer).toBe('gameplay');
  expect(bank.gate?.offer).toBe(false);
  expect(bank.gate?.banks).toBeGreaterThanOrEqual(1);
  expect(bank.gate?.gnosis).toBe(0);

  const voidState = await showState(page, 'void');
  expect(voidState.layer).toBe('gameplay');
  expect(voidState.gate?.voidActive).toBe(true);
  expect(voidState.gate?.entries).toBeGreaterThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('deterministic visual signatures match the M14 reference baseline', async ({ page }, testInfo) => {
  test.skip(!visualReferenceProjects.has(testInfo.project.name), 'Visual signatures use four representative geometries.');
  const baseline = baselineData();
  const signatures: Record<string, string> = {};

  await openVisualController(page, false);
  for (const state of standardStates) {
    await showState(page, state);
    signatures[state] = await visualHash(page, testInfo.project.name, state);
  }

  await openVisualController(page, true);
  for (const state of gateStates) {
    await showState(page, state);
    signatures[state] = await visualHash(page, testInfo.project.name, state);
  }

  console.log(`M14_VISUAL_SIGNATURE ${JSON.stringify({ project: testInfo.project.name, signatures })}`);

  if (baseline) {
    expect(signatures).toEqual(baseline[testInfo.project.name]);
  }
});
