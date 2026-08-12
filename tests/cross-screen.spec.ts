import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// index.html declares the game instance with a top-level `let`, which never
// becomes a property of `window`. Page-side code must reference it by bare
// identifier; this declaration only satisfies the type checker.
declare const game: any;

const expectedProfiles: Record<string, string> = {
  'chromium-small-phone': 'compact-phone',
  'chromium-android-phone': 'tall-phone',
  'chromium-modern-phone': 'tall-phone',
  'chromium-fold-cover': 'fold-closed',
  'chromium-fold-inner': 'fold-open',
  'chromium-tablet': 'tablet',
  'chromium-laptop': 'desktop',
  'chromium-desktop': 'desktop',
  'firefox-desktop-smoke': 'desktop',
  'webkit-mobile-smoke': 'tall-phone'
};

async function openGame(page: import('@playwright/test').Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/index.html?assetMode=offline&renderDpr=native', { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VIEWPORT__?.getSnapshot?.()));
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_TOUCH_TARGETS__));
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    return Boolean(canvas?.dataset.smBackingWidth && canvas?.dataset.smBackingHeight);
  });
  return pageErrors;
}

test('BrowserStack SDK configuration remains serializable', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Configuration contract runs once.');
  const yaml = fs.readFileSync('browserstack.yml', 'utf8');
  const sdkConfig = fs.readFileSync('playwright.browserstack.config.ts', 'utf8');
  expect(yaml).toMatch(/framework:\s*playwright/);
  expect(yaml).toMatch(/testDir:\s*\.\/tests/);
  expect(yaml).toMatch(/testMatch:\s*["']\*\*\/browserstack-mobile\.spec\.ts["']/);
  expect(sdkConfig).not.toMatch(/testMatch\s*:\s*\//);
  expect(sdkConfig).not.toMatch(/projects\s*:/);
});

test('layout, profile, touch targets, and DPR budget remain valid', async ({ page }, testInfo) => {
  const pageErrors = await openGame(page);
  const result = await page.evaluate(() => {
    const viewport = (window as any).__SEX_MAGICK_VIEWPORT__?.getSnapshot?.();
    const touchTargets = (window as any).__SEX_MAGICK_TOUCH_TARGETS__;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const body = document.body;
    const html = document.documentElement;
    const visibleButtons = [...document.querySelectorAll('button')].filter(element => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    }) as HTMLElement[];
    const undersized = visibleButtons.map(button => {
      const rect = button.getBoundingClientRect();
      return { text: button.textContent?.trim().slice(0, 40), width: rect.width, height: rect.height };
    }).filter(item => item.width < 44 || item.height < 44);
    const rect = canvas.getBoundingClientRect();
    const backingWidth = Number(canvas.dataset.smBackingWidth);
    const backingHeight = Number(canvas.dataset.smBackingHeight);
    return {
      profile: viewport?.profile,
      touchTargetMinimum: touchTargets?.minimumCssPixels,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      bodyScrollWidth: body.scrollWidth,
      htmlScrollWidth: html.scrollWidth,
      canvasRect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
      logical: { width: Number(canvas.dataset.smLogicalWidth), height: Number(canvas.dataset.smLogicalHeight) },
      backingPixels: backingWidth * backingHeight,
      undersized
    };
  });

  expect(result.profile).toBe(expectedProfiles[testInfo.project.name]);
  expect(result.touchTargetMinimum).toBe(44);
  expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.htmlScrollWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.canvasRect.left).toBeGreaterThanOrEqual(-1);
  expect(result.canvasRect.top).toBeGreaterThanOrEqual(-1);
  expect(Math.abs(result.canvasRect.width - result.viewportWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(result.canvasRect.height - result.viewportHeight)).toBeLessThanOrEqual(2);
  expect(Math.abs(result.logical.width - result.viewportWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(result.logical.height - result.viewportHeight)).toBeLessThanOrEqual(2);
  expect(result.backingPixels).toBeLessThanOrEqual(8_000_000);
  expect(result.undersized, JSON.stringify(result.undersized)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('missions HUD stays inside the safe area and clear of the play corridor', async ({ page }, testInfo) => {
  // The missions HUD is deliberately absent from the M14 signature baselines,
  // because mission progress is per-player persisted state and would make those
  // screenshots non-deterministic. This is the coverage that replaces them, and
  // it holds at every geometry rather than at the four reference ones.
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/index.html?assetMode=offline&renderDpr=native&gateSlice=1', { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  // The runtime installs off the Game prototype, which exists before the `game`
  // instance is constructed on DOMContentLoaded. Wait for both.
  await page.waitForFunction('!!window.__SEX_MAGICK_MISSIONS__ && typeof game !== "undefined" && !!game');

  const result = await page.evaluate(() => {
    const api = (window as any).__SEX_MAGICK_MISSIONS__;
    game.gameMode = 'HEX';
    game.startGame();

    const hud = document.getElementById('sex-magick-missions') as HTMLElement | null;
    const rect = hud?.getBoundingClientRect();
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const style = hud ? getComputedStyle(hud) : null;

    return {
      active: api.getActive().length,
      suppressed: api.hudSuppressed(),
      present: Boolean(hud),
      hidden: hud ? hud.hidden : true,
      rows: hud ? hud.querySelectorAll('.sm-mission').length : 0,
      pointerEvents: style?.pointerEvents,
      rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      viewport: { width: innerWidth, height: innerHeight },
      // The player flies in the upper-middle band of the screen; the HUD must
      // not intrude on it. An obscured Fold-closed corridor is an explicit stop
      // condition in the pilot protocol.
      corridorBottom: canvasRect.top + canvasRect.height * 0.75,
      bodyScrollWidth: document.body.scrollWidth
    };
  });

  expect(result.present).toBe(true);
  expect(result.suppressed).toBe(false);
  expect(result.hidden).toBe(false);
  expect(result.active).toBe(3);
  expect(result.rows).toBe(3);
  // Never steals a tap from the full-screen touch surface.
  expect(result.pointerEvents).toBe('none');

  const rect = result.rect!;
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.left).toBeGreaterThanOrEqual(-1);
  expect(rect.right).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(rect.bottom).toBeLessThanOrEqual(result.viewport.height + 1);
  expect(rect.top).toBeGreaterThanOrEqual(result.corridorBottom);
  // Adding the HUD must not introduce horizontal overflow at any geometry.
  expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(pageErrors).toEqual([]);
});

test('power-up button is tappable and clears the missions HUD', async ({ page }) => {
  // Like the missions HUD, the power-up HUD is kept out of the M14 signature
  // baselines because charge counts are per-run state. These are the assertions
  // that replace that coverage, and the ones that matter most: a button the
  // player cannot reach, or one that overlaps the missions row, is a real defect
  // at a real screen size.
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/index.html?assetMode=offline&renderDpr=native&gateSlice=1', { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction('!!window.__SEX_MAGICK_POWERUPS__ && typeof game !== "undefined" && !!game');

  const result = await page.evaluate(() => {
    const api = (window as any).__SEX_MAGICK_POWERUPS__;
    // A first-run photosensitivity notice covers the bottom of the screen until
    // acknowledged. A real player dismisses it before playing, so the hit test
    // must too, or it measures the notice instead of the button.
    const notice = document.getElementById('sex-magick-sensitivity-notice');
    if (notice) (notice.querySelector('button') as HTMLButtonElement)?.click();

    api.reset();
    // KETHER, so both power-ups are unsealed and the HUD is at its tallest.
    api.forceBand(7);
    game.gameMode = 'HEX';
    game.startGame();
    api.grant('aegis', 3);
    api.grant('dissolution', 2);

    const hud = document.getElementById('sex-magick-powerups') as HTMLElement;
    const button = document.getElementById('sex-magick-dissolve') as HTMLButtonElement;
    const missions = document.getElementById('sex-magick-missions') as HTMLElement;
    const buttonRect = button.getBoundingClientRect();
    const missionsRect = missions.getBoundingClientRect();
    const canvasRect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect();
    const centre = document.elementFromPoint(
      buttonRect.left + buttonRect.width / 2,
      buttonRect.top + buttonRect.height / 2
    );

    return {
      hudHidden: hud.hidden,
      buttonHidden: button.hidden,
      buttonDisabled: button.disabled,
      buttonRect: {
        left: buttonRect.left, right: buttonRect.right,
        top: buttonRect.top, bottom: buttonRect.bottom,
        width: buttonRect.width, height: buttonRect.height
      },
      missionsRect: {
        left: missionsRect.left, right: missionsRect.right,
        top: missionsRect.top, bottom: missionsRect.bottom
      },
      topmostIsButton: centre === button || button.contains(centre as Node),
      viewport: { width: innerWidth, height: innerHeight },
      corridorBottom: canvasRect.top + canvasRect.height * 0.75,
      bodyScrollWidth: document.body.scrollWidth
    };
  });

  expect(result.hudHidden).toBe(false);
  expect(result.buttonHidden).toBe(false);
  expect(result.buttonDisabled).toBe(false);

  // The touch-target policy the suite enforces elsewhere applies here too.
  expect(result.buttonRect.width).toBeGreaterThanOrEqual(44);
  expect(result.buttonRect.height).toBeGreaterThanOrEqual(44);

  // Actually reachable by a finger, not just by button.click().
  expect(result.topmostIsButton).toBe(true);

  // Inside the viewport and below the play corridor at every geometry.
  expect(result.buttonRect.left).toBeGreaterThanOrEqual(-1);
  expect(result.buttonRect.right).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.buttonRect.bottom).toBeLessThanOrEqual(result.viewport.height + 1);
  expect(result.buttonRect.top).toBeGreaterThanOrEqual(result.corridorBottom);

  // The missions row was shifted up specifically to make room for this button.
  const overlaps =
    result.buttonRect.right > result.missionsRect.left &&
    result.buttonRect.left < result.missionsRect.right &&
    result.buttonRect.bottom > result.missionsRect.top &&
    result.buttonRect.top < result.missionsRect.bottom;
  expect(overlaps, `button ${JSON.stringify(result.buttonRect)} overlaps missions ${JSON.stringify(result.missionsRect)}`).toBe(false);

  expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(pageErrors).toEqual([]);
});

test('major resize creates one settled layout without overflow', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('chromium-'), 'Resize contract runs once per Chromium geometry.');
  const pageErrors = await openGame(page);
  const before = page.viewportSize();
  if (!before) throw new Error('Viewport unavailable');
  await page.setViewportSize({ width: before.height, height: before.width });
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const viewport = (window as any).__SEX_MAGICK_VIEWPORT__?.getSnapshot?.();
    return {
      profile: viewport?.profile,
      width: innerWidth,
      height: innerHeight,
      scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      logicalWidth: Number(canvas.dataset.smLogicalWidth),
      logicalHeight: Number(canvas.dataset.smLogicalHeight),
      backingPixels: Number(canvas.dataset.smBackingWidth) * Number(canvas.dataset.smBackingHeight)
    };
  });
  expect(result.scrollWidth).toBeLessThanOrEqual(result.width + 1);
  expect(Math.abs(result.logicalWidth - result.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(result.logicalHeight - result.height)).toBeLessThanOrEqual(2);
  expect(result.backingPixels).toBeLessThanOrEqual(8_000_000);
  expect(pageErrors).toEqual([]);
});
