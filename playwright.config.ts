import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8099';

export default defineConfig({
  testDir: './tests',
  testMatch: /cross-screen\.spec\.ts/,
  fullyParallel: true,
  timeout: 45_000,
  expect: { timeout: 10_000 },
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
