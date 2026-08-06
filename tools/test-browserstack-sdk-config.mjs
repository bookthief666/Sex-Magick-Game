import fs from 'node:fs';

const yaml = fs.readFileSync('browserstack.yml', 'utf8');
const playwrightConfig = fs.readFileSync('playwright.browserstack.config.ts', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(/framework:\s*playwright/.test(yaml), 'browserstack.yml must declare framework: playwright');
expect(/deviceName:\s*Samsung Galaxy S23 Ultra/.test(yaml), 'Samsung Android canary platform is missing');
expect(/testDir:\s*\.\/tests/.test(yaml), 'testDir must be owned by playwrightConfigOptions in browserstack.yml');
expect(/testMatch:\s*["']\*\*\/browserstack-mobile\.spec\.ts["']/.test(yaml), 'testMatch must be a quoted string glob in browserstack.yml');
expect(!/testMatch\s*:\s*\//.test(playwrightConfig), 'Playwright config must not serialize a RegExp testMatch through the BrowserStack SDK');
expect(!/projects\s*:/.test(playwrightConfig), 'BrowserStack SDK platform projects must be owned by browserstack.yml');
expect(packageJson.devDependencies?.['browserstack-node-sdk'] === '1.64.2', 'BrowserStack Node SDK must remain pinned');
expect(packageJson.devDependencies?.['@playwright/test'] === '1.59.1', 'Playwright must remain pinned to the validated client version');
expect(packageJson.scripts?.['test:browserstack-mobile'] === 'browserstack-node-sdk playwright test --config=playwright.browserstack.config.ts', 'Mobile SDK command changed unexpectedly');

if (failures.length) {
  console.error('BrowserStack SDK configuration contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('BrowserStack SDK configuration contract passed.');
