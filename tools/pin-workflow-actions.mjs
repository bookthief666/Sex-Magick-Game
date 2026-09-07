import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const PINS = new Map([
  ['actions/checkout', 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09'],
  ['actions/setup-node', 'a0853c24544627f65ddf259abe73b1d18a591444'],
  ['actions/upload-artifact', '330a01c490aca151604b8cf639adc76d48f6c5d4'],
  ['browserstack/github-actions/setup-env', '1ab56d9521ce20f4651bb5d9f3ef39c5ba54805a'],
  ['browserstack/github-actions/setup-local', '1ab56d9521ce20f4651bb5d9f3ef39c5ba54805a']
]);

const files = fs.readdirSync(WORKFLOW_DIR)
  .filter(name => /\.ya?ml$/i.test(name))
  .map(name => path.join(WORKFLOW_DIR, name));

const changed = [];
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const next = original.replace(/(^\s*uses:\s*)([^\s@#]+)@([^\s#]+)(\s*(?:#.*)?)$/gm, (line, prefix, action, revision, suffix) => {
    const pin = PINS.get(action);
    if (!pin) return line;
    const label = action === 'actions/upload-artifact' ? '# v5' :
      action === 'actions/checkout' || action === 'actions/setup-node' ? '# v5' : '';
    return `${prefix}${action}@${pin}${label ? ` ${label}` : suffix}`;
  });
  if (next !== original) {
    fs.writeFileSync(file, next);
    changed.push(file);
  }
}

console.log(JSON.stringify({ changed, pins: Object.fromEntries(PINS) }, null, 2));
