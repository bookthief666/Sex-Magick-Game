import { test, expect } from '@playwright/test';

test('real mobile responsive smoke contract', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html?assetMode=offline&renderDpr=native', {
    waitUntil: 'domcontentloaded'
  });

  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_VIEWPORT__?.getSnapshot?.()));
  await page.waitForFunction(() => Boolean((window as any).__SEX_MAGICK_TOUCH_TARGETS__));
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    return Boolean(canvas?.dataset.smBackingWidth && canvas?.dataset.smBackingHeight);
  });

  const evidence = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const viewport = (window as any).__SEX_MAGICK_VIEWPORT__?.getSnapshot?.();
    const touchTargets = (window as any).__SEX_MAGICK_TOUCH_TARGETS__;
    const visibleButtons = [...document.querySelectorAll('button')].filter(element => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && bounds.width > 0 && bounds.height > 0;
    }) as HTMLElement[];
    const undersized = visibleButtons.map(button => {
      const bounds = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim().slice(0, 40),
        width: bounds.width,
        height: bounds.height
      };
    }).filter(item => item.width < 44 || item.height < 44);

    return {
      title: document.title,
      profile: viewport?.profile,
      viewport: [innerWidth, innerHeight],
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      canvas: [rect.width, rect.height],
      backingPixels: Number(canvas.dataset.smBackingWidth || 0) * Number(canvas.dataset.smBackingHeight || 0),
      touchTargetMinimum: touchTargets?.minimumCssPixels,
      undersized
    };
  });

  expect(evidence.title).toBe('93 PROTOCOL: DUALITY');
  expect(evidence.profile).toBeTruthy();
  expect(evidence.overflow).toBeLessThanOrEqual(1);
  expect(evidence.canvas[0]).toBeGreaterThanOrEqual(evidence.viewport[0] - 2);
  expect(evidence.canvas[1]).toBeGreaterThanOrEqual(evidence.viewport[1] - 2);
  expect(evidence.backingPixels).toBeGreaterThan(0);
  expect(evidence.backingPixels).toBeLessThanOrEqual(8_000_000);
  expect(evidence.touchTargetMinimum).toBe(44);
  expect(evidence.undersized).toEqual([]);
  expect(pageErrors).toEqual([]);

  console.log(JSON.stringify({ realMobileEvidence: evidence }, null, 2));
});
