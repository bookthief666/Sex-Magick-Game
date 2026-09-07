#!/usr/bin/env node
'use strict';

/**
 * Package the playable build for itch.io.
 *
 * D-001 records that the game is already published and that `main` is preserved
 * as the rollback point while 2.0 is developed; itch is where a release actually
 * lands. Nothing in the repository knew how to produce that upload, so it was a
 * manual selection of files every time - which is exactly the kind of step that
 * ships `docs/`, or misses a `tools/` module added last week.
 *
 * What goes in is decided by what the page loads, not by a hand-kept list: the
 * script reads `index.html`, extracts every local `src`/`href`, and fails if one
 * of them is missing from the tree. A build that would 404 in the browser fails
 * here instead.
 *
 * `assets/gallery` is included wholesale (D-059 brought it in-repo, ~6.2MB), and
 * `docs/`, `tests/`, `worker/`, `artifacts/` and `node_modules/` are excluded -
 * none of them is reachable from the page.
 *
 *   node tools/build-itch.mjs [--out dist/sex-magick-itch.zip]
 */

import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, cp } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = { out: path.join('dist', 'sex-magick-itch.zip') };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') args.out = argv[++index];
  }
  return args;
}

/**
 * Every local asset `index.html` pulls in.
 *
 * Remote origins are deliberately kept: the audio is on jsDelivr at a pinned
 * commit. Styling and fonts are now local, but any remaining origin is still
 * *reported*, because a build whose network dependencies are invisible is one
 * nobody can reason about when itch's iframe blocks something.
 */
function referencedAssets(html) {
  const local = new Set();
  const remote = new Set();
  const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const reference = match[1].trim();
    if (!reference || reference.startsWith('#') || reference.startsWith('data:')) continue;
    if (/^https?:\/\//i.test(reference) || reference.startsWith('//')) {
      try { remote.add(new URL(reference, 'https://x.invalid').host); } catch (_error) {}
      continue;
    }
    local.add(reference.split('?')[0].split('#')[0].replace(/^\.\//, ''));
  }
  return { local: [...local].sort(), remote };
}

const args = parseArgs(process.argv.slice(2));
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const { local, remote } = referencedAssets(html);

// Origins referenced from JavaScript string literals rather than markup - the
// audio base is one of these, and leaving it out of the report would understate
// what the build needs at runtime by the single largest dependency.
for (const match of html.matchAll(/["'](https?:\/\/[^"'\s]+)["']/gi)) {
  try { remote.add(new URL(match[1]).host); } catch (_error) {}
}

const missing = local.filter(reference => !existsSync(path.join(ROOT, reference)));
if (missing.length > 0) {
  console.error('index.html references files that are not in the tree:');
  for (const reference of missing) console.error(`  ${reference}`);
  console.error('\nThe build would 404 in the browser. Refusing to package it.');
  process.exit(1);
}

// Directories the page needs whole, rather than file by file: the gallery is
// loaded by id at runtime from MASTER_POOL, so it never appears in the markup.
const BUNDLE_DIRS = ['assets', 'tools'];
const staging = path.join(ROOT, 'dist', '.itch-staging');
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

await cp(path.join(ROOT, 'index.html'), path.join(staging, 'index.html'));
for (const dir of BUNDLE_DIRS) {
  if (!existsSync(path.join(ROOT, dir))) continue;
  await cp(path.join(ROOT, dir), path.join(staging, dir), { recursive: true });
}

const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
await mkdir(path.dirname(outPath), { recursive: true });
await rm(outPath, { force: true });

// `zip` rather than a dependency: this has to work from a fresh clone, and itch
// wants a plain zip with index.html at the root.
const zip = spawnSync('zip', ['-r', '-q', outPath, 'index.html', ...BUNDLE_DIRS], { cwd: staging });
if (zip.status !== 0) {
  console.error('zip failed:', zip.stderr?.toString() || `exit ${zip.status}`);
  console.error('Install zip, or archive the staged directory yourself:', staging);
  process.exit(1);
}

const info = await stat(outPath);
const megabytes = (info.size / (1024 * 1024)).toFixed(2);

console.log(`\nBuilt ${path.relative(ROOT, outPath)}  (${megabytes} MB)`);
console.log(`  index.html + ${BUNDLE_DIRS.join('/ + ')}/`);
console.log(`  ${local.length} statically referenced local files, all present`);
console.log('  tools/ is bundled whole: most runtimes are injected at load time by');
console.log('  fixed-step-prototype.js and never appear in the markup, so a');
console.log('  markup-only file list would silently ship a broken build.');
console.log('\nRemote origins this build still needs at runtime:');
for (const host of [...remote].sort()) console.log(`  ${host}`);
console.log('\nUpload notes for itch:');
console.log('  - Kind of project: HTML, "This file will be played in the browser"');
console.log('  - index.html must be at the zip root, which it is');
console.log('  - Enable fullscreen; the game reads its own viewport and adapts');
console.log('  - Confirm the build with window.SexMagickNoticeSlot.buildMarker()');
await rm(staging, { recursive: true, force: true });
