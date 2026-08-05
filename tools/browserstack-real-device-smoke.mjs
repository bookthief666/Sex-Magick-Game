import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const username = process.env.BROWSERSTACK_USERNAME;
const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;
const localIdentifier = process.env.BROWSERSTACK_LOCAL_IDENTIFIER;
const build = process.env.BROWSERSTACK_BUILD_NAME || `sex-magick-m13-${Date.now()}`;
const project = process.env.BROWSERSTACK_PROJECT_NAME || 'Sex-Magick-Game';
const clientVersion = execSync('npx playwright --version', { encoding: 'utf8' }).trim().split(/\s+/).pop();

if (!username || !accessKey) throw new Error('BrowserStack repository secrets are unavailable.');
if (!localIdentifier) throw new Error('BrowserStack Local identifier is unavailable.');
if (clientVersion !== '1.60.0') {
  throw new Error(`Unexpected Playwright client version ${clientVersion}; expected 1.60.0 for this BrowserStack gate.`);
}

const targets = [
  {
    name: 'Desktop Chrome smoke',
    supportsConsole: true,
    caps: {
      os: 'Windows',
      osVersion: '11',
      browser: 'chrome',
      browser_version: 'latest',
      resolution: '1440x900'
    }
  },
  {
    name: 'Samsung Galaxy S23 Ultra smoke',
    supportsConsole: true,
    caps: {
      deviceName: 'Samsung Galaxy S23 Ultra',
      osVersion: '13.0',
      browser: 'chrome',
      realMobile: 'true'
    }
  },
  {
    name: 'iPhone 13 Safari smoke',
    supportsConsole: false,
    caps: {
      deviceName: 'iPhone 13',
      osVersion: '15',
      browser: 'safari',
      realMobile: 'true'
    }
  }
];

async function mark(page, status, reason) {
  try {
    await page.evaluate(
      () => {},
      `browserstack_executor: ${JSON.stringify({ action: 'setSessionStatus', arguments: { status, reason } })}`
    );
  } catch (_) {}
}

function createCapabilities(target) {
  const caps = {
    ...target.caps,
    name: target.name,
    build,
    project,
    'browserstack.username': username,
    'browserstack.accessKey': accessKey,
    'browserstack.local': 'true',
    'browserstack.localIdentifier': localIdentifier,
    'browserstack.playwrightVersion': '1.60',
    'client.playwrightVersion': clientVersion,
    'browserstack.debug': 'true',
    'browserstack.networkLogs': 'true',
    'browserstack.video': 'true'
  };
  if (target.supportsConsole) caps['browserstack.console'] = 'info';
  return caps;
}

async function runTarget(target) {
  const caps = createCapabilities(target);
  const endpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
  const browser = await chromium.connect({ wsEndpoint: endpoint, timeout: 60_000 });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto('http://localhost:8099/index.html?assetMode=offline&renderDpr=native', {
      waitUntil: 'domcontentloaded', timeout: 45_000
    });
    await page.locator('#game-container').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_VIEWPORT__?.getSnapshot?.()), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__SEX_MAGICK_TOUCH_TARGETS__), null, { timeout: 30_000 });

    const evidence = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      const viewport = window.__SEX_MAGICK_VIEWPORT__?.getSnapshot?.();
      const visibleButtons = [...document.querySelectorAll('button')].filter(element => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && bounds.width > 0 && bounds.height > 0;
      });
      const undersized = visibleButtons.map(button => {
        const bounds = button.getBoundingClientRect();
        return { text: button.textContent?.trim().slice(0, 40), width: bounds.width, height: bounds.height };
      }).filter(item => item.width < 44 || item.height < 44);
      return {
        title: document.title,
        profile: viewport?.profile,
        viewport: [innerWidth, innerHeight],
        overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        canvas: rect ? [rect.width, rect.height] : null,
        backingPixels: Number(canvas?.dataset.smBackingWidth || 0) * Number(canvas?.dataset.smBackingHeight || 0),
        touchTargetMinimum: window.__SEX_MAGICK_TOUCH_TARGETS__?.minimumCssPixels,
        undersized
      };
    });

    if (evidence.title !== '93 PROTOCOL: DUALITY') throw new Error(`Unexpected title: ${evidence.title}`);
    if (evidence.overflow > 1) throw new Error(`Horizontal overflow: ${evidence.overflow}px`);
    if (!evidence.canvas || evidence.canvas[0] < evidence.viewport[0] - 2 || evidence.canvas[1] < evidence.viewport[1] - 2) {
      throw new Error(`Canvas does not cover viewport: ${JSON.stringify(evidence)}`);
    }
    if (evidence.backingPixels > 8_000_000) throw new Error(`Backing budget exceeded: ${evidence.backingPixels}`);
    if (evidence.touchTargetMinimum !== 44 || evidence.undersized.length) {
      throw new Error(`Touch target policy failed: ${JSON.stringify(evidence.undersized)}`);
    }
    if (errors.length) throw new Error(`Browser exceptions: ${errors.join(' | ')}`);

    console.log(JSON.stringify({ target: target.name, evidence }, null, 2));
    await mark(page, 'passed', 'Responsive smoke contract passed.');
  } catch (error) {
    await mark(page, 'failed', String(error?.message || error).slice(0, 255));
    throw error;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

const failures = [];
for (const target of targets) {
  try { await runTarget(target); }
  catch (error) { failures.push(`${target.name}: ${error?.message || error}`); }
}
if (failures.length) throw new Error(failures.join('\n'));
