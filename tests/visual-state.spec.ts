import { test, expect, type Page } from '@playwright/test';

const visualReferenceProjects = new Set([
  'chromium-small-phone',
  'chromium-fold-cover',
  'chromium-fold-inner',
  'chromium-desktop'
]);
const seededPages = new WeakSet<Page>();

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

async function seedPage(page: Page) {
  if (seededPages.has(page)) return;
  seededPages.add(page);
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
    // installAccessibilityControls() in collision-runtime.js shows a one-time
    // sensitivity notice ("VISUAL INTENSITY... ACKNOWLEDGE") on any fresh browser
    // profile - correct for a real first-time player, but every QA capture is a
    // fresh profile, so without this it would be glued to the bottom of every
    // baseline screenshot forever. Pre-seeding the same key it checks makes this
    // context look like a returning player who already dismissed it.
    localStorage.setItem('sex_magick_sensitivity_notice_v1', '1');
  });
}

async function installDynamicTextLock(page: Page) {
  await page.evaluate(() => {
    const values: Record<string, string> = {
      leaderboardList: 'VISUAL QA · LOCAL ONLY',
      trackName: 'SOURCE: PROCEDURAL OFFLINE ASSET',
      fpsCounter: '60',
      audioStatus: 'MUTED',
      uploadStatus: 'VISUAL QA · LOCAL ONLY'
    };
    const previous = (window as any).__M14_DYNAMIC_TEXT_LOCKS__ as MutationObserver[] | undefined;
    previous?.forEach(observer => observer.disconnect());
    const observers: MutationObserver[] = [];
    for (const [id, text] of Object.entries(values)) {
      const node = document.getElementById(id);
      if (!node) continue;
      const apply = () => {
        if (node.textContent !== text) node.textContent = text;
      };
      apply();
      const observer = new MutationObserver(apply);
      observer.observe(node, { childList: true, subtree: true, characterData: true });
      observers.push(observer);
    }
    (window as any).__M14_DYNAMIC_TEXT_LOCKS__ = observers;
  });
}

async function geometrySignature(page: Page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
    const container = document.getElementById('game-container');
    const canvasRect = canvas?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const viewport = (window as any).__SEX_MAGICK_VIEWPORT__?.getSnapshot?.();
    const render = (window as any).__SEX_MAGICK_RENDER__?.getSnapshot?.();
    return JSON.stringify({
      inner: [innerWidth, innerHeight],
      profile: viewport?.profile || null,
      viewportSize: [viewport?.width || null, viewport?.height || null],
      orientation: viewport?.orientation || null,
      htmlProfile: document.documentElement.dataset.smViewportProfile || null,
      htmlOrientation: document.documentElement.dataset.smViewportOrientation || null,
      canvasRect: canvasRect ? [
        Number(canvasRect.x.toFixed(3)),
        Number(canvasRect.y.toFixed(3)),
        Number(canvasRect.width.toFixed(3)),
        Number(canvasRect.height.toFixed(3))
      ] : null,
      containerRect: containerRect ? [
        Number(containerRect.x.toFixed(3)),
        Number(containerRect.y.toFixed(3)),
        Number(containerRect.width.toFixed(3)),
        Number(containerRect.height.toFixed(3))
      ] : null,
      logical: canvas ? [canvas.dataset.smLogicalWidth || null, canvas.dataset.smLogicalHeight || null] : null,
      backing: canvas ? [canvas.dataset.smBackingWidth || null, canvas.dataset.smBackingHeight || null] : null,
      effectiveDpr: canvas?.dataset.smEffectiveDpr || null,
      renderResizeCount: render?.resizeCount || null
    });
  });
}

async function waitForVisualSettlement(page: Page, stableSamples = 4) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    (window as any).__SEX_MAGICK_VIEWPORT__?.refresh?.();
    (window as any).__SEX_MAGICK_RENDER__?.refresh?.();
  });

  let previous = '';
  let stable = 0;
  const observed: string[] = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await geometrySignature(page);
    observed.push(current);
    if (current === previous) stable += 1;
    else stable = 1;
    previous = current;
    if (stable >= stableSamples) return current;
    await page.waitForTimeout(50);
  }
  throw new Error(`Visual geometry did not settle: ${observed.slice(-6).join(' | ')}`);
}

function stateSeed(stateName: string) {
  let seed = 0x93c0ffee >>> 0;
  for (const character of stateName) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return seed || 1;
}

async function resetStateRandom(page: Page, stateName: string) {
  const seed = stateSeed(stateName);
  await page.evaluate(initialSeed => {
    let state = initialSeed >>> 0;
    Math.random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

async function openVisualController(page: Page, gateSlice = false, primeGameplay = true) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const lootLockerRequests: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', request => {
    if (/lootlocker\.io/i.test(request.url())) lootLockerRequests.push(request.url());
  });
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
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_RENDER__));

  if (!gateSlice) {
    await page.waitForFunction(() => {
      const preflight = (window as any).__SEX_MAGICK_VISUAL_QA_PREFLIGHT__?.getSnapshot?.();
      const text = document.getElementById('leaderboardList')?.textContent || '';
      return preflight?.leaderboardSuppressed === true && /LOCAL ONLY/i.test(text);
    });
  }

  await installDynamicTextLock(page);
  await page.addScriptTag({ url: '/tools/visual-state-runtime.js' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VISUAL_QA__));
  if (gateSlice) await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_GATE_SLICE__));
  await installDynamicTextLock(page);

  if (primeGameplay) {
    await resetStateRandom(page, gateSlice ? 'gate-page-init' : 'standard-page-init');
    await page.evaluate(() => (window as any).__SEX_MAGICK_VISUAL_QA__.showGameplay());
    await waitForVisualSettlement(page);
  }
  return { pageErrors, consoleErrors, lootLockerRequests };
}

async function showState(page: Page, state: string) {
  await resetStateRandom(page, state);
  const snapshot = await page.evaluate(stateName => (window as any).__SEX_MAGICK_VISUAL_QA__.showState(stateName), state);
  await waitForVisualSettlement(page);
  // Settling calls __SEX_MAGICK_RENDER__.refresh(), and resizing a canvas clears
  // it - so without this repaint every signature was hashing a blank canvas over
  // the DOM. Repaint after the geometry has settled, before anything is captured.
  await page.evaluate(() => (window as any).__SEX_MAGICK_VISUAL_QA__.redraw?.());
  if (state === 'menu') {
    await expect(page.locator('#leaderboardList')).toHaveText('VISUAL QA · LOCAL ONLY');
    await page.waitForTimeout(50);
    await expect(page.locator('#leaderboardList')).toHaveText('VISUAL QA · LOCAL ONLY');
  }
  return snapshot;
}

async function warmVisualStates(page: Page, states: readonly string[]) {
  for (const state of states) {
    await showState(page, state);
    await page.locator('#game-container').screenshot({
      animations: 'disabled',
      caret: 'hide',
      scale: 'css'
    });
  }
}

test('standard visual states remain reachable and internally consistent', async ({ page }) => {
  const { pageErrors, consoleErrors, lootLockerRequests } = await openVisualController(page, false);
  for (const state of standardStates) {
    const snapshot = await showState(page, state);
    expect(snapshot.label).toBe(state);
    expect(snapshot.layer).toBe(expectedLayers[state]);
    expect(snapshot.viewport[0]).toBeGreaterThan(0);
    expect(snapshot.viewport[1]).toBeGreaterThan(0);
    expect(snapshot.logicalCanvas[0]).toBeGreaterThan(0);
    expect(snapshot.logicalCanvas[1]).toBeGreaterThan(0);
    expect(snapshot.playerReady).toBe(true);
    if (state === 'death') expect(snapshot.score).toBe(13);
    if (state === 'retry') expect(snapshot.score).toBe(0);
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(lootLockerRequests).toEqual([]);
});

test('menu can be the first named state on a fresh visual controller', async ({ page }) => {
  const { pageErrors, consoleErrors, lootLockerRequests } = await openVisualController(page, false, false);
  const snapshot = await showState(page, 'menu');

  expect(snapshot.label).toBe('menu');
  expect(snapshot.layer).toBe('startScreen');
  expect(snapshot.playerReady).toBe(true);
  expect(snapshot.logicalCanvas[0]).toBeGreaterThan(0);
  expect(snapshot.logicalCanvas[1]).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(lootLockerRequests).toEqual([]);
});

test('Gate offer, bank, and Void states remain reachable', async ({ page }, testInfo) => {
  test.skip(!visualReferenceProjects.has(testInfo.project.name), 'Gate state coverage runs on visual reference projects.');
  const { pageErrors, consoleErrors, lootLockerRequests } = await openVisualController(page, true);

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
  expect(consoleErrors).toEqual([]);
  expect(lootLockerRequests).toEqual([]);
});

// Whole-container art regression, compared with a per-pixel tolerance rather than
// byte-for-byte. Three real rounds of fixes against a sha256-of-the-screenshot
// version of this test each found something genuine (phase-dependent ambient
// animation, a telegraph hide-timer racing the capture, a blank-canvas capture
// racing settlement) - but a fourth failure mode was never a defect in the page:
// chromium-fold-cover and chromium-fold-inner disagreed with themselves at roughly
// a coin-flip rate between otherwise-identical CI runs of the same commit, ruled
// out as random spawning, animation phase, and elapsed wall-clock time by direct
// measurement (see docs/decisions/d046-*.md). That is sub-pixel rasterisation
// jitter, which a byte-identical hash cannot tell apart from a real change to the
// field, pillars, avatar, or level art - both fail identically. `toHaveScreenshot`
// is the same net with a per-pixel tolerance (configured once, in
// playwright.config.ts) that absorbs the jitter while still failing on a real
// regression, which is the whole point of this test.
//
// Baselines live under `visual-state.spec.ts-snapshots/` and are regenerated only
// via CI's `update_snapshots` workflow_dispatch input, which opens a PR rather than
// committing directly - the explicit human review D-024 requires, now done by eye
// against the actual pictures instead of by eye against a hash diff. They are not
// regenerated locally: this sandbox runs a different Chromium build than the
// Playwright version pinned for CI, so local screenshots cannot be expected to
// match the CI-generated baseline regardless of tolerance.
test('deterministic visual signatures match the M14 reference baseline', async ({ page }, testInfo) => {
  test.skip(!visualReferenceProjects.has(testInfo.project.name), 'Visual signatures use four representative geometries.');

  await openVisualController(page, false);
  await warmVisualStates(page, standardStates);
  for (const state of standardStates) {
    await showState(page, state);
    await expect(page.locator('#game-container')).toHaveScreenshot(`${state}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css'
    });
  }

  await openVisualController(page, true);
  await warmVisualStates(page, gateStates);
  for (const state of gateStates) {
    await showState(page, state);
    await expect(page.locator('#game-container')).toHaveScreenshot(`${state}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css'
    });
  }
});
