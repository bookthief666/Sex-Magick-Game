import { test, expect } from '@playwright/test';

test('the real retry path resets score and returns to gameplay', async ({ page }) => {
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

  await page.addInitScript(() => {
    Date.now = () => 1_782_000_000_000;
    let state = 0x93c0ffee >>> 0;
    Math.random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  });
  await page.route(/lootlocker\.io/i, route => route.abort('failed'));

  await page.goto('/index.html?assetMode=offline&renderDpr=1&visualQa=1', {
    waitUntil: 'domcontentloaded'
  });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VIEWPORT__));
  await page.addScriptTag({ url: '/tools/visual-state-runtime.js' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VISUAL_QA__));

  const result = await page.evaluate(() => (
    (window as any).__SEX_MAGICK_VISUAL_QA__.exerciseRetryTransition()
  ));

  expect(result.before.layer).toBe('gameOverScreen');
  expect(result.before.score).toBe(13);
  expect(result.rawAfter.isPlaying).toBe(true);
  expect(result.rawAfter.score).toBe(0);
  expect(result.rawAfter.layer).toBe('gameplay');
  expect(result.rawAfter.gameOverHidden).toBe(true);
  expect(result.normalized.label).toBe('retry-transition');
  expect(result.normalized.layer).toBe('gameplay');
  expect(result.normalized.score).toBe(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(lootLockerRequests).toEqual([]);
});
