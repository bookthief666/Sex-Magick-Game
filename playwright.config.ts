import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8099';

// D-046 shipped `0.006` as an admittedly unmeasured guess. Two calibration runs
// at M14_MAX_DIFF_PIXEL_RATIO=0 (see docs/qa/m35-m14-tolerance-calibration.md)
// measured the real jitter instead of assuming it: sample 1 found one
// non-identical comparison out of 28 (202px / 975,936 on chromium-fold-inner,
// ~0.02%), sample 2 found zero. `0.001` keeps ~5x headroom over the observed
// worst case while being 6x stricter than the original guess. Override for a
// fresh calibration run with M14_MAX_DIFF_PIXEL_RATIO=0.
const M14_DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.001;
const configuredMaxDiffPixelRatio = Number.parseFloat(process.env.M14_MAX_DIFF_PIXEL_RATIO ?? '');
const maxDiffPixelRatio = Number.isFinite(configuredMaxDiffPixelRatio) && configuredMaxDiffPixelRatio >= 0
  ? configuredMaxDiffPixelRatio
  : M14_DEFAULT_MAX_DIFF_PIXEL_RATIO;

export default defineConfig({
  testDir: './tests',
  testMatch: [/cross-screen\.spec\.ts/, /visual-state\.spec\.ts/, /retry-transition\.spec\.ts/],
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // M14's art-regression net (tests/visual-state.spec.ts) used to require its
    // whole-container screenshots to be byte-identical, which failed at roughly a
    // coin-flip rate on the fold geometries from CI-to-CI sub-pixel rasterisation
    // noise unrelated to any real change - see docs/decisions/d046-*.md.
    // Override for a calibration run with M14_MAX_DIFF_PIXEL_RATIO=0.
    toHaveScreenshot: { maxDiffPixelRatio }
  },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run serve:test',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
      },
  projects: [
    {
      name: 'chromium-small-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }
    },
    {
      name: 'chromium-android-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    },
    {
      name: 'chromium-modern-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
    },
    {
      name: 'chromium-fold-cover',
      use: { ...devices['Desktop Chrome'], viewport: { width: 368, height: 869 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' }
    },
    {
      name: 'chromium-fold-inner',
      use: { ...devices['Desktop Chrome'], viewport: { width: 884, height: 1104 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-F956U) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' }
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    },
    {
      name: 'chromium-laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }
    },
    {
      name: 'firefox-desktop-smoke',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'webkit-mobile-smoke',
      use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } }
    }
  ]
});
