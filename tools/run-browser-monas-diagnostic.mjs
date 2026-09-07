import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const artifactDir = path.resolve('artifacts');
const artifactPath = path.join(artifactDir, 'monas-browser-report.txt');
const child = spawn(process.execPath, ['tools/browser-monas-test.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });

const result = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => resolve({ code, signal }));
});

mkdirSync(artifactDir, { recursive: true });
const captured = [
  'MONAS browser diagnostic',
  `exitCode=${result.code ?? 'null'}`,
  `signal=${result.signal ?? 'none'}`,
  '',
  '--- stdout ---',
  stdout.trimEnd(),
  '',
  '--- stderr ---',
  stderr.trimEnd(),
  ''
].join('\n');
writeFileSync(artifactPath, captured, 'utf8');

if (result.code === 0) {
  console.log('MONAS browser integration PASS; full report captured for CI artifact.');
} else {
  const diagnosticLines = `${stdout}\n${stderr}`.trim().split(/\r?\n/);
  const tail = diagnosticLines.slice(-80).join('\n');
  console.error('MONAS browser integration FAILED; compact diagnostic tail follows:');
  console.error(tail || '(no child output captured)');
}

if (result.signal) {
  console.error(`MONAS browser integration terminated by signal ${result.signal}.`);
}
process.exitCode = result.code ?? 1;
