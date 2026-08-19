import { existsSync } from 'node:fs';
import process from 'node:process';

/**
 * Prefer the Chromium revision installed by the locked @playwright/test dependency.
 * Legacy CDP harnesses still retain their system-Chrome fallback for lightweight
 * workflows that intentionally do not install npm dependencies.
 */
async function preferPinnedPlaywrightChromium() {
  const configured = process.env.CHROME_BIN;
  if (configured && existsSync(configured)) return configured;
  if (configured && !existsSync(configured)) delete process.env.CHROME_BIN;

  try {
    const { chromium } = await import('@playwright/test');
    const executable = chromium?.executablePath?.();
    if (executable && existsSync(executable)) {
      process.env.CHROME_BIN = executable;
      console.log(`[QA] Using pinned Playwright Chromium: ${executable}`);
      return executable;
    }
  } catch (_error) {
    // Some standalone/manual solver workflows deliberately run without npm install.
    // In those contexts the legacy harness will continue to discover system Chrome.
  }

  return null;
}

export const qaChromeBinary = await preferPinnedPlaywrightChromium();
export { preferPinnedPlaywrightChromium };
