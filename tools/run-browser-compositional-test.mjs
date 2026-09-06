await import('./qa-chrome-env.mjs');

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';

const ROOT = process.cwd();
const PORT = Number(process.env.COMPOSITION_QA_HTTP_PORT || 4178);
const URL = `http://127.0.0.1:${PORT}/tools/compositional-browser-test.html`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findCommand(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync('bash', ['-lc', `command -v ${candidate}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

function httpStatus(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
  });
}

async function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if ((await httpStatus(URL)) === 200) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for QA server: ${lastError?.message || 'unknown error'}`);
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

async function main() {
  const chrome = process.env.CHROME_BIN || findCommand(['google-chrome', 'chromium', 'chromium-browser']);
  const python = findCommand(['python3', 'python']);
  assert.ok(chrome, 'Chrome/Chromium executable not found');
  assert.ok(python, 'Python executable not found');

  const server = spawn(python, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();
    const result = spawnSync(chrome, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--mute-audio',
      '--window-size=390,844',
      '--virtual-time-budget=28000',
      '--run-all-compositor-stages-before-draw',
      '--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE 127.0.0.1',
      '--dump-dom',
      URL
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 8 * 1024 * 1024
    });

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const match = result.stdout?.match(/<pre id="result">([\s\S]*?)<\/pre>/i);
    const summary = match ? decodeHtml(match[1]) : output.slice(-4000);
    console.log(summary.trim());

    assert.equal(result.status, 0, `Chrome exited with status ${result.status}`);
    assert.match(result.stdout, /data-status="pass"/, `Browser QA did not pass:\n${summary}`);
    assert.match(summary, /PASS compositional reachability browser integration/);
  } finally {
    if (!server.killed) server.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});