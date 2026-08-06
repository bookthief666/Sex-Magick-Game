import fs from 'node:fs';

const yaml = fs.readFileSync('browserstack.yml', 'utf8');
const playwrightConfig = fs.readFileSync('playwright.browserstack.config.ts', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/real-device-qa.yml', 'utf8');
const mobileSpec = fs.readFileSync('tests/browserstack-mobile.spec.ts', 'utf8');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(/framework:\s*playwright/.test(yaml), 'browserstack.yml must declare framework: playwright');
expect(/browserName:\s*chrome/.test(yaml), 'Samsung Chrome browser is missing');
expect(/osVersion:\s*["']13\.0["']/.test(yaml), 'Samsung Android 13 platform is missing');
expect(/deviceName:\s*Samsung Galaxy S23 Ultra/.test(yaml), 'Samsung Galaxy S23 Ultra platform is missing');
expect(/name:\s*browserstack-android/.test(yaml), 'Android BrowserStack project name is missing');
expect(/browserName:\s*safari/.test(yaml), 'iPhone Safari browser is missing');
expect(/osVersion:\s*["']15["']/.test(yaml), 'iPhone iOS 15 platform is missing');
expect(/deviceName:\s*iPhone 13/.test(yaml), 'iPhone 13 platform is missing');
expect(/name:\s*browserstack-ios/.test(yaml), 'iOS BrowserStack project name is missing');
expect((yaml.match(/testDir:\s*\.\/tests/g) || []).length === 2, 'Both mobile platforms must own testDir in browserstack.yml');
expect((yaml.match(/testMatch:\s*["']\*\*\/browserstack-mobile\.spec\.ts["']/g) || []).length === 2, 'Both mobile platforms must use the quoted smoke-test glob');
expect((yaml.match(/baseURL:\s*["']http:\/\/bs-local\.com:3000["']/g) || []).length === 2, 'Both real-mobile platforms must use the explicit bs-local.com tunnel URL');
expect(/browserstackLocal:\s*true/.test(yaml), 'BrowserStack Local must remain enabled');
expect(/browserStackLocalOptions:\s*\n\s+forcelocal:\s*true/.test(yaml), 'Real-mobile traffic must remain forced through the Local tunnel');
expect(!/testMatch\s*:\s*\//.test(playwrightConfig), 'Playwright config must not serialize a RegExp testMatch through the BrowserStack SDK');
expect(!/projects\s*:/.test(playwrightConfig), 'BrowserStack SDK platform projects must be owned by browserstack.yml');

expect(/desktop-browserstack-smoke:/.test(workflow), 'Reusable BrowserStack workflow must retain the desktop job');
expect(/real-mobile-browserstack-smoke:/.test(workflow), 'Reusable BrowserStack workflow must retain the real-mobile job');
expect(/BROWSERSTACK_TARGET_FILTER:\s*Desktop Chrome smoke/.test(workflow), 'Desktop workflow must select only the validated desktop target');
expect(/node tools\/browserstack-real-device-smoke\.mjs/.test(workflow), 'Desktop workflow must retain the validated raw Playwright runner');
expect(/http-server \. -a 0\.0\.0\.0 -p 8099/.test(workflow), 'Desktop workflow must serve the validated port 8099');
expect(/http:\/\/127\.0\.0\.1:8099\/index\.html/.test(workflow), 'Desktop workflow must health-check port 8099');
expect(/http-server \. -a 0\.0\.0\.0 -p 3000/.test(workflow), 'Real-mobile workflow must use the iOS-compatible local server port 3000');
expect(/http:\/\/127\.0\.0\.1:3000\/index\.html/.test(workflow), 'Real-mobile workflow must health-check port 3000');
expect(/npm run test:browserstack-mobile/.test(workflow), 'Real-mobile workflow must run the BrowserStack SDK matrix');
expect(/http:\/\/bs-local\.com:3000\/index\.html/.test(mobileSpec), 'Real-mobile test must navigate directly to bs-local.com');
expect(/navigationEvidence/.test(mobileSpec) && /responseStatus/.test(mobileSpec) && /bodyText/.test(mobileSpec), 'Real-mobile test must retain navigation diagnostics');
expect(packageJson.devDependencies?.['browserstack-node-sdk'] === '1.64.2', 'BrowserStack Node SDK must remain pinned');
expect(packageJson.devDependencies?.['@playwright/test'] === '1.59.1', 'Playwright must remain pinned to the validated client version');
expect(packageJson.scripts?.['test:browserstack-mobile'] === 'browserstack-node-sdk playwright test --config=playwright.browserstack.config.ts', 'Mobile SDK command changed unexpectedly');

if (failures.length) {
  console.error('BrowserStack SDK configuration contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('BrowserStack SDK configuration contract passed.');
