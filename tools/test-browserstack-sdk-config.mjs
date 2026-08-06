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
expect(/browserName:\s*safari/.test(yaml), 'iPhone Safari browser is missing');
expect(/osVersion:\s*["']15["']/.test(yaml), 'iPhone iOS 15 platform is missing');
expect(/deviceName:\s*iPhone 13/.test(yaml), 'iPhone 13 canary platform is missing');
expect(/testDir:\s*\.\/tests/.test(yaml), 'testDir must be owned by playwrightConfigOptions in browserstack.yml');
expect(/testMatch:\s*["']\*\*\/browserstack-mobile\.spec\.ts["']/.test(yaml), 'testMatch must be a quoted string glob in browserstack.yml');
expect(/baseURL:\s*["']http:\/\/bs-local\.com:3000["']/.test(yaml), 'iOS BrowserStack project must use the explicit bs-local.com base URL');
expect(/browserStackLocalOptions:\s*\n\s+forcelocal:\s*true/.test(yaml), 'iOS BrowserStack project must force traffic through the Local tunnel');
expect(!/testMatch\s*:\s*\//.test(playwrightConfig), 'Playwright config must not serialize a RegExp testMatch through the BrowserStack SDK');
expect(!/projects\s*:/.test(playwrightConfig), 'BrowserStack SDK platform projects must be owned by browserstack.yml');
expect(/http-server \. -a 0\.0\.0\.0 -p 3000/.test(workflow), 'Real-device workflow must use the iOS-compatible local server port 3000');
expect(/http:\/\/127\.0\.0\.1:3000\/index\.html/.test(workflow), 'Real-device workflow must health-check port 3000');
expect(/http:\/\/bs-local\.com:3000\/index\.html/.test(mobileSpec), 'iPhone test must navigate directly to bs-local.com');
expect(/navigationEvidence/.test(mobileSpec) && /responseStatus/.test(mobileSpec) && /bodyText/.test(mobileSpec), 'iPhone test must retain navigation diagnostics');
expect(packageJson.devDependencies?.['browserstack-node-sdk'] === '1.64.2', 'BrowserStack Node SDK must remain pinned');
expect(packageJson.devDependencies?.['@playwright/test'] === '1.59.1', 'Playwright must remain pinned to the validated client version');
expect(packageJson.scripts?.['test:browserstack-mobile'] === 'browserstack-node-sdk playwright test --config=playwright.browserstack.config.ts', 'Mobile SDK command changed unexpectedly');

if (failures.length) {
  console.error('BrowserStack SDK configuration contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('BrowserStack SDK configuration contract passed.');
