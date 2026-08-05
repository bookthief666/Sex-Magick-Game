import { test, expect } from '@playwright/test';

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