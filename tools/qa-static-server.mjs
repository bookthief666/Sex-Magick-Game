#!/usr/bin/env node
'use strict';

/**
 * The QA static file server.
 *
 * Every browser suite needs the page served over HTTP, and until M41 every one of
 * them spawned `python3 -m http.server`. That server is single-threaded and, more
 * to the point, `SimpleHTTPRequestHandler` performs blocking socket I/O with no
 * timeout: one client that goes away mid-response leaves the handler blocked in
 * `wfile.write()` forever, and a single-threaded server that is blocked in a
 * handler accepts nothing else for the rest of its life.
 *
 * That is not hypothetical. `browser-fixed-step-test` navigates nine times, and
 * each navigation abandons whatever is still in flight from the previous page -
 * with the in-repo gallery (D-059) that is up to 75 images per load. It went red
 * at the commit that brought the gallery in-repo and stayed red for 16 runs. At
 * the moment of failure the renderer is healthy (`readyState: 'interactive'`,
 * `game` constructed, 50 of 75 images decoded) and it is the *server* that has
 * stopped answering - a plain `fetch` from Node to the same URL times out too,
 * which is what separates "the page is slow" from "the server is gone".
 *
 * Threading it is not enough, and that was measured rather than assumed: with
 * `ThreadingHTTPServer` the suite still hangs, because the blocked threads pile up
 * behind the same accept path. Node's server is evented and never blocks on a
 * socket, so an abandoned response costs one destroyed stream instead of the
 * process.
 *
 * Deliberately dependency-free (`node:http` only, no `http-server` package) so the
 * suites keep running before `npm ci`, and deliberately no-cache so a run cannot
 * pass on a stale asset.
 *
 * Usable two ways:
 *   import { startStaticServer } from './qa-static-server.mjs'   // in-process
 *   node tools/qa-static-server.mjs <port> <root>                // child process
 */

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
});

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Resolve a request path inside `root`, or return null.
 *
 * The containment check is `resolved === root || resolved.startsWith(root + sep)`
 * rather than a bare `startsWith`, so a sibling directory whose name merely begins
 * with the root's name cannot be reached.
 */
function resolveWithin(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0].split('#')[0]);
  } catch (_error) {
    return null;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const resolved = path.resolve(root, '.' + path.posix.normalize(decoded));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function startStaticServer({ root = process.cwd(), port = 0, host = '127.0.0.1' } = {}) {
  const resolvedRoot = path.resolve(root);

  const server = http.createServer(async (request, response) => {
    // A client that navigated away is the ordinary case here, not an error, and
    // must not reach the process-level 'uncaughtException' path.
    request.on('error', () => {});
    response.on('error', () => {});

    const filePath = resolveWithin(resolvedRoot, request.url || '/');
    if (!filePath) {
      response.writeHead(400, { 'content-type': 'text/plain' });
      response.end('Bad request');
      return;
    }

    let info;
    try {
      info = await stat(filePath);
    } catch (_error) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    if (info.isDirectory()) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': contentTypeFor(filePath),
      'content-length': info.size,
      // QA reads the working tree, so a cached asset is a stale verdict.
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => response.destroy());
    // Destroying the stream when the client disconnects is what keeps an
    // abandoned response from holding a file descriptor open for the run.
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });

  // Bound so a wedged peer cannot hold a connection open indefinitely.
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        port: address.port,
        url: `http://${host}:${address.port}`,
        close: () => new Promise(done => {
          server.closeAllConnections?.();
          server.close(() => done());
        })
      });
    });
  });
}

// CLI: `node tools/qa-static-server.mjs <port> <root>`, so suites that spawn a
// server as a child process keep that shape and their existing teardown.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.argv[2] || 0);
  const root = process.argv[3] || process.cwd();
  startStaticServer({ port, root })
    .then(server => { process.stdout.write(`qa-static-server listening on ${server.url}\n`); })
    .catch(error => { process.stderr.write(`qa-static-server failed: ${error.message}\n`); process.exit(1); });
}
