import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const APPROVED_ACTIONS = new Map([
  ['actions/checkout', 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09'],
  ['actions/setup-node', 'a0853c24544627f65ddf259abe73b1d18a591444'],
  ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
  ['browserstack/github-actions/setup-env', '1ab56d9521ce20f4651bb5d9f3ef39c5ba54805a'],
  ['browserstack/github-actions/setup-local', '1ab56d9521ce20f4651bb5d9f3ef39c5ba54805a']
]);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const workflowFiles = fs.readdirSync(WORKFLOW_DIR)
  .filter(name => /\.ya?ml$/i.test(name))
  .map(name => path.join(WORKFLOW_DIR, name));

for (const file of workflowFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const uses = [...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map(match => match[1]);
  for (const reference of uses) {
    const at = reference.lastIndexOf('@');
    expect(at > 0, `${file}: action reference lacks @ revision: ${reference}`);
    if (at <= 0) continue;
    const action = reference.slice(0, at);
    const revision = reference.slice(at + 1);
    expect(/^[0-9a-f]{40}$/.test(revision), `${file}: action reference must use a 40-character commit SHA: ${reference}`);
    if (APPROVED_ACTIONS.has(action)) {
      expect(revision === APPROVED_ACTIONS.get(action), `${file}: ${action} must use approved SHA ${APPROVED_ACTIONS.get(action)}, found ${revision}`);
    } else {
      failures.push(`${file}: unreviewed third-party action reference: ${reference}`);
    }
  }

  if (/npm\s+(?:install|i)(?:\s|$)/.test(source) && !/npm install --package-lock-only/.test(source)) {
    failures.push(`${file}: workflow contains unlocked npm install`);
  }
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const rootLock = packageLock.packages?.['']?.devDependencies || {};

expect(packageLock.lockfileVersion === 3, 'package-lock.json must use lockfileVersion 3');
expect(packageJson.devDependencies?.['@playwright/test'] === '1.59.1', 'Playwright package.json pin changed unexpectedly');
expect(packageJson.devDependencies?.['browserstack-node-sdk'] === '1.65.3', 'BrowserStack SDK package.json pin changed unexpectedly');
expect(rootLock['@playwright/test'] === packageJson.devDependencies['@playwright/test'], 'Playwright lockfile root does not match package.json');
expect(rootLock['browserstack-node-sdk'] === packageJson.devDependencies['browserstack-node-sdk'], 'BrowserStack SDK lockfile root does not match package.json');
expect(rootLock['http-server'] === packageJson.devDependencies['http-server'], 'http-server lockfile root does not match package.json');

const auditWorkflow = fs.readFileSync('.github/workflows/m15-supply-chain-audit.yml', 'utf8');
expect(/production\.total !== 0/.test(auditWorkflow), 'Audit workflow must reject any production dependency vulnerability');
expect(/full\.high/.test(auditWorkflow) && /full\.critical/.test(auditWorkflow), 'Audit workflow must reject high and critical QA vulnerabilities');
expect(/git diff --exit-code -- package-lock\.json/.test(auditWorkflow), 'Audit workflow must verify lockfile drift');

if (failures.length) {
  console.error('QA supply-chain contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  workflowFiles: workflowFiles.length,
  approvedActions: Object.fromEntries(APPROVED_ACTIONS),
  lockfileVersion: packageLock.lockfileVersion,
  playwright: rootLock['@playwright/test'],
  browserstackNodeSdk: rootLock['browserstack-node-sdk']
}, null, 2));
