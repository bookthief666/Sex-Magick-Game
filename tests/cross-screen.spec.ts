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

test('release shell styling is identical with every CDN blocked', async ({ page, context }, testInfo) => {
  const releaseGeometries = new Set([
    'chromium-small-phone',
    'chromium-fold-cover',
    'chromium-fold-inner',
    'chromium-desktop'
  ]);
  test.skip(!releaseGeometries.has(testInfo.project.name), 'CDN parity runs at the four release visual geometries.');

  const blockedPage = await context.newPage();
  const styleCdnPattern = /(?:cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/i;
  const onlineStyleRequests: string[] = [];
  const blockedExternalRequests: string[] = [];
  page.on('request', request => {
    if (styleCdnPattern.test(request.url())) onlineStyleRequests.push(request.url());
  });
  await blockedPage.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      blockedExternalRequests.push(url.href);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const onlinePageErrors = await openGame(page);
  const blockedPageErrors = await openGame(blockedPage);
  await Promise.all([
    page.evaluate(() => document.fonts?.ready),
    blockedPage.evaluate(() => document.fonts?.ready)
  ]);

  const signature = (target: import('@playwright/test').Page) => target.evaluate(() => {
    const selectors = [
      'html', 'body', '#game-container', '#startScreen', '.title-text',
      '.mystic-btn', '#gameOverScreen', '.release-final-score'
    ];
    const properties = [
      'boxSizing', 'borderTopWidth', 'fontFamily', 'fontSize', 'fontWeight',
      'lineHeight', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'backgroundColor', 'backgroundImage', 'color', 'display', 'position', 'textTransform'
    ];
    return Object.fromEntries(selectors.map(selector => {
      const node = document.querySelector(selector) as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return [selector, {
        styles: Object.fromEntries(properties.map(property => [property, (style as any)[property]])),
        rect: [rect.x, rect.y, rect.width, rect.height].map(value => Number(value.toFixed(3)))
      }];
    }));
  });

  const onlineSignature = await signature(page);
  const blockedSignature = await signature(blockedPage);
  expect(blockedSignature).toEqual(onlineSignature);
  expect(blockedSignature['body'].styles, 'captured Tailwind preflight body contract').toMatchObject({
    boxSizing: 'border-box', borderTopWidth: '0px', marginTop: '0px', marginRight: '0px',
    marginBottom: '0px', marginLeft: '0px', lineHeight: '24px'
  });
  expect(blockedSignature['.title-text'].styles, 'captured heading/preflight contract').toMatchObject({
    boxSizing: 'border-box', borderTopWidth: '0px', marginTop: '0px', marginRight: '0px',
    marginBottom: '0px', marginLeft: '0px'
  });
  const localFonts = await blockedPage.evaluate(() => {
    const embeddedFaces = [...document.styleSheets].flatMap(sheet => {
      try {
        return [...sheet.cssRules]
          .filter(rule => rule instanceof CSSFontFaceRule)
          .map(rule => {
            const style = (rule as CSSFontFaceRule).style;
            return {
              family: style.fontFamily.replaceAll(/['"]/g, ''),
              weight: style.fontWeight,
              embedded: /^url\(["']?data:font\/ttf;base64,/i.test(style.getPropertyValue('src').trim())
            };
          });
      } catch { return []; }
    });
    return {
      embeddedFaces,
      checks: {
        orbitron: document.fonts.check('400 16px "Orbitron"'),
        cinzelBold: document.fonts.check('700 16px "Cinzel Decorative"'),
        cinzelBlack: document.fonts.check('900 16px "Cinzel Decorative"')
      }
    };
  });
  expect(localFonts.embeddedFaces.map(face => `${face.family}|${face.weight}|${face.embedded}`).sort(),
    'the named faces must have actual embedded @font-face sources; FontFaceSet.check alone can succeed via fallback').toEqual([
    'Cinzel Decorative|700|true',
    'Cinzel Decorative|900|true',
    'Orbitron|400 900|true'
  ]);
  expect(localFonts.checks, 'all embedded release typefaces must resolve without a network request').toEqual({
    orbitron: true, cinzelBold: true, cinzelBlack: true
  });
  expect(onlineStyleRequests, 'the release must not request Tailwind or Google Fonts').toEqual([]);
  expect(blockedExternalRequests.some(url => /cdn\.jsdelivr\.net/i.test(url)),
    'negative control: the all-external route must actually intercept the remaining audio CDN').toBe(true);
  expect(onlinePageErrors, 'online release shell must initialize without page errors').toEqual([]);
  expect(blockedPageErrors, 'all-CDNs-blocked release shell must initialize without page errors').toEqual([]);
  await blockedPage.close();
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

test('power-up readout adds no control and clears the missions HUD', async ({ page }) => {
  // M19 put a breaker button in this corner and the owner never pressed it once
  // across a whole session, so M20 removed it. This test is what stops it coming
  // back: the entire screen is the jump surface, and nothing may compete for a tap.
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/index.html?assetMode=offline&renderDpr=native&gateSlice=1', { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction('!!window.__SEX_MAGICK_POWERUPS__ && typeof game !== "undefined" && !!game');

  const result = await page.evaluate(() => {
    const api = (window as any).__SEX_MAGICK_POWERUPS__;
    api.reset();
    api.forceBand(7);
    game.gameMode = 'HEX';
    game.startGame();
    // D-062 retired DISSOLUTION; AEGIS is the whole ladder now.
    api.grant('aegis', 3);

    const hud = document.getElementById('sex-magick-powerups') as HTMLElement;
    const missions = document.getElementById('sex-magick-missions') as HTMLElement;
    const hudRect = hud.getBoundingClientRect();
    const missionsRect = missions.getBoundingClientRect();
    const canvasRect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect();

    return {
      hudHidden: hud.hidden,
      pointerEvents: getComputedStyle(hud).pointerEvents,
      controlCount: hud.querySelectorAll('button, [role="button"], input, select, textarea, a').length,
      legacyButton: Boolean(document.getElementById('sex-magick-dissolve')),
      hudRect: {
        left: hudRect.left, right: hudRect.right,
        top: hudRect.top, bottom: hudRect.bottom,
        width: hudRect.width, height: hudRect.height
      },
      missionsRect: {
        left: missionsRect.left, right: missionsRect.right,
        top: missionsRect.top, bottom: missionsRect.bottom
      },
      viewport: { width: innerWidth, height: innerHeight },
      corridorBottom: canvasRect.top + canvasRect.height * 0.75,
      bodyScrollWidth: document.body.scrollWidth
    };
  });

  expect(result.hudHidden).toBe(false);
  expect(result.hudRect.width).toBeGreaterThan(0);

  // The structural guard: no control, and no way to take a tap.
  expect(result.legacyButton).toBe(false);
  expect(result.controlCount).toBe(0);
  expect(result.pointerEvents).toBe('none');

  // Inside the viewport and below the play corridor at every geometry.
  expect(result.hudRect.left).toBeGreaterThanOrEqual(-1);
  expect(result.hudRect.right).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.hudRect.bottom).toBeLessThanOrEqual(result.viewport.height + 1);
  expect(result.hudRect.top).toBeGreaterThanOrEqual(result.corridorBottom);

  const overlaps =
    result.hudRect.right > result.missionsRect.left &&
    result.hudRect.left < result.missionsRect.right &&
    result.hudRect.bottom > result.missionsRect.top &&
    result.hudRect.top < result.missionsRect.bottom;
  expect(overlaps, `power-ups ${JSON.stringify(result.hudRect)} overlap missions ${JSON.stringify(result.missionsRect)}`).toBe(false);

  expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(pageErrors).toEqual([]);
});

test('every centered transient overlay clears every other one, worst case', async ({ page }) => {
  // D-064: three prior fixes (D-060, D-062, D-063) each moved one overlay
  // without checking it against the others. On the owner's Fold 6 the ascent
  // banner and the persistent missions list visibly overlapped by ~21px, and
  // separately the gate telegraph overlapped the powerup readout - both
  // findings from real play, not synthetic. This test forces every centered
  // overlay visible at once, with worst-case content (the longest telegraph
  // string, a live band-transition banner, both toast rows), and asserts no
  // two of them ever share screen space. It is the only thing that can catch
  // a fifth instance of this before a human has to find it by hand again.
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/index.html?assetMode=offline&renderDpr=native&gateSlice=1', { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container').waitFor({ state: 'visible' });
  await page.waitForFunction(`
    !!window.__SEX_MAGICK_GATE_SLICE__ && !!window.__SEX_MAGICK_RITUAL_ASCENT__ &&
    !!window.__SEX_MAGICK_POWERUPS__ && typeof game !== "undefined" && !!game
  `);

  const result = await page.evaluate(async () => {
    const api = (window as any).__SEX_MAGICK_POWERUPS__;
    api.reset();
    game.gameMode = 'HEX';
    game.startGame();
    api.grant('aegis', 3);
    game.gateSliceState.gatesCleared = 8;
    game.gateSliceState.bandIndex = 0;

    // Drive real updateGameObjects() calls so the ascent banner shows via its
    // real band-transition path, not a synthetic DOM write.
    for (let i = 0; i < 20 && document.getElementById('sex-magick-ascent-banner')?.hidden !== false; i += 1) {
      game.updateGameObjects();
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // D-065: reveal each notice the way the runtimes do - register with the
    // shared slot and claim it - rather than writing `.hidden = false` directly.
    // The D-064 version of this test bypassed the announce path entirely, which
    // is exactly why it could pass while four notices piled up on the owner's
    // screen. Going through the slot is what makes this test able to fail.
    const slot = (window as any).SexMagickNoticeSlot;
    const show = (id: string, text?: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (text !== undefined) el.textContent = text;
      slot?.register(id);
      slot?.claim(id);
      el.hidden = false;
    };
    show('gate-slice-telegraph', 'GATE OPEN  ·  ENTER → VOID ×10  /  PASS → BANK ×3');
    show('sex-magick-missions-announce', 'COURT THE EDGE COMPLETE');
    show('sex-magick-powerups-announce', 'AEGIS SHATTERS · THE WALL IS REFUSED');

    await new Promise(resolve => setTimeout(resolve, 150));

    const centeredIds = [
      'gate-slice-telegraph', 'sex-magick-ascent-banner', 'sex-magick-missions',
      'sex-magick-missions-announce', 'sex-magick-powerups-announce'
    ];
    const rects: Record<string, any> = {};
    for (const id of centeredIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      rects[id] = { hidden: el.hidden, top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    }

    const visible = Object.keys(rects).filter(id => !rects[id].hidden);
    const overlaps: string[] = [];
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = rects[visible[i]];
        const b = rects[visible[j]];
        const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        if (overlap) overlaps.push(`${visible[i]} x ${visible[j]}`);
      }
    }

    return { rects, visible, overlaps, viewport: { width: innerWidth, height: innerHeight } };
  });

  // D-065 made this structural rather than tuned: notice-slot.js guarantees at
  // most one *transient* notice is visible, so overlap between them is not
  // merely absent, it is unreachable. The persistent missions list may also be
  // up, so the visible set is at most the one notice plus that list.
  const transientIds = [
    'gate-slice-telegraph', 'sex-magick-ascent-banner',
    'sex-magick-missions-announce', 'sex-magick-powerups-announce'
  ];
  const visibleTransients = result.visible.filter((id: string) => transientIds.includes(id));
  expect(
    visibleTransients.length,
    `more than one transient notice on screen: ${JSON.stringify(visibleTransients)}`
  ).toBeLessThanOrEqual(1);

  // And every notice stays in the bottom fifth on every geometry - the property
  // four previous fixes each believed they had and did not.
  for (const id of result.visible) {
    const rect = result.rects[id];
    expect(rect.height, `${id} is stretched (${rect.height}px) - a top+bottom pair`).toBeLessThan(90);
    expect(
      rect.top / result.viewport.height,
      `${id} sits at ${Math.round(rect.top / result.viewport.height * 100)}% - inside the corridor`
    ).toBeGreaterThan(0.60);
  }

  expect(result.overlaps, `overlaps found: ${JSON.stringify(result.overlaps)}\nrects: ${JSON.stringify(result.rects)}`).toEqual([]);
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
