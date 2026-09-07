#!/usr/bin/env node
/**
 * M36 - bring the gallery out of Google Drive and into the repository.
 *
 * Why this exists: all 75 gallery images are fetched at runtime from
 * `lh3.googleusercontent.com/d/{id}=s0`, a Drive *viewer* URL rather than a
 * CDN. On 2026-08-20 that failed outright on the owner's Fold 6 - every image
 * fell back to the procedural placeholder surface - which is device-level
 * confirmation of the fragility `migrate-images-to-r2.mjs` already described
 * but never fixed (that migration was never run; there is no manifest).
 *
 * The owner chose in-repo hosting over R2: no third-party account in the
 * critical path, and the itch build becomes genuinely self-contained, which is
 * one of the audit's own release requirements.
 *
 * The image list is never hand-copied - `gallery-source.mjs` derives it from
 * index.html's own three arrays, so this cannot drift from what the game
 * loads. Filenames are the existing Drive ids, so `originalLevels`,
 * `newImageIDs` and `esotericNames` stay byte-identical and the whole wiring
 * change in index.html is two CONFIG lines.
 *
 * Usage:
 *   node tools/fetch-gallery.mjs                     # fetch from Drive
 *   node tools/fetch-gallery.mjs --from-dir ./raw    # use already-downloaded files
 *   node tools/fetch-gallery.mjs --dry-run           # report the plan, touch nothing
 *   node tools/fetch-gallery.mjs --quality 78 --max-dim 1400
 *   node tools/fetch-gallery.mjs --force             # re-encode images already present
 *
 * Re-runnable and resumable: images already in assets/gallery are skipped
 * unless --force is passed, so a run interrupted by a rate limit can simply be
 * run again.
 *
 * NOTE ON COMMITTING: git history is permanent. Encoding at one quality,
 * committing, then re-encoding at another leaves *both* copies in the repo
 * forever. Run this, look at the result on the real device, and only then
 * commit.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildGalleryManifestSource } from './gallery-source.mjs';

const REPO_ROOT = new URL('..', import.meta.url);
const INDEX_HTML_PATH = fileURLToPath(new URL('index.html', REPO_ROOT));
const OUTPUT_DIR = fileURLToPath(new URL('assets/gallery/', REPO_ROOT));
const MANIFEST_PATH = fileURLToPath(new URL('tools/gallery-manifest.json', REPO_ROOT));
const TRANSCODER_PATH = fileURLToPath(new URL('gallery-transcode.py', import.meta.url));

const DRIVE_BASE_URL = 'https://lh3.googleusercontent.com/d/';

// `=s0` asks Drive for the untouched original, which for these photographs can
// be several megabytes each - far more than a canvas that is at most 2176px
// wide will ever use, and far more likely to trip Drive's rate limiting across
// 75 sequential requests. Ask for the size we actually intend to keep.
const DRIVE_SIZE_SUFFIX = '=s1600';

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_QUALITY = 82;
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

// Drive rate-limits aggressively enough that this whole migration exists
// because of it. Sequential with a small pause finishes 75 images in a couple
// of minutes and is far less likely to need a second pass than parallelism is
// to save one.
const INTER_REQUEST_DELAY_MS = 250;

function parseArgs(argv) {
  const options = {
    fromDir: null,
    dryRun: false,
    force: false,
    maxDim: DEFAULT_MAX_DIM,
    quality: DEFAULT_QUALITY,
    python: process.env.PYTHON || 'python3'
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--from-dir': options.fromDir = path.resolve(next()); break;
      case '--dry-run': options.dryRun = true; break;
      case '--force': options.force = true; break;
      case '--max-dim': options.maxDim = Number(next()); break;
      case '--quality': options.quality = Number(next()); break;
      case '--python': options.python = next(); break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.maxDim) || options.maxDim < 256 || options.maxDim > 4096) {
    throw new Error(`--max-dim must be an integer between 256 and 4096 (got ${options.maxDim})`);
  }
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    throw new Error(`--quality must be an integer between 1 and 100 (got ${options.quality})`);
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function driveUrlFor(id) {
  return `${DRIVE_BASE_URL}${id}${DRIVE_SIZE_SUFFIX}`;
}

async function fetchWithRetry(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) {
      // 403/404 mean Drive is refusing this id outright; retrying just burns
      // the rate-limit budget the other 74 images still need.
      const permanent = response.status === 403 || response.status === 404;
      const error = new Error(`HTTP ${response.status} ${response.statusText}`);
      error.permanent = permanent;
      throw error;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error.permanent || attempt >= MAX_RETRIES) throw error;
    const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    console.warn(`    retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms: ${error.message}`);
    await sleep(delay);
    return fetchWithRetry(url, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Index a directory of manually-exported originals by the Drive id embedded in
 * each filename, so `MALKUTH-1jI7bl....jpg` and `1jI7bl....jpg` both resolve.
 * This is the path for when Drive refuses hotlinks entirely and the owner
 * exports from their own Drive account instead.
 */
async function indexSourceDir(dir, ids) {
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    throw new Error(`--from-dir ${dir} is not readable: ${error.message}`);
  }
  const byId = new Map();
  for (const id of ids) {
    const match = names.find((name) => name.includes(id));
    if (match) byId.set(id, path.join(dir, match));
  }
  return byId;
}

function transcode(raw, { python, maxDim, quality }) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [TRANSCODER_PATH, String(maxDim), String(quality)], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => reject(new Error(
      `could not run ${python}: ${error.message}\n` +
      '  Install Python 3 and Pillow, or pass --python /path/to/python3'
    )));
    child.on('close', (code) => {
      const message = Buffer.concat(stderr).toString().trim();
      if (code !== 0) {
        reject(new Error(`transcode exited ${code}: ${message || 'no detail'}`));
        return;
      }
      const buffer = Buffer.concat(stdout);
      if (buffer.length === 0) {
        reject(new Error('transcode produced no output'));
        return;
      }
      const dimensions = /(\d+)x(\d+)\s*$/.exec(message);
      resolve({
        buffer,
        width: dimensions ? Number(dimensions[1]) : null,
        height: dimensions ? Number(dimensions[2]) : null
      });
    });
    child.stdin.on('error', () => { /* surfaced by the close handler */ });
    child.stdin.end(raw);
  });
}

async function existingFile(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0 ? info : null;
  } catch {
    return null;
  }
}

function probeDimensions(raw, python) {
  return new Promise((resolve) => {
    const child = spawn(python, [TRANSCODER_PATH, '--probe'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const stdout = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    // Geometry is a nicety on the resume path, never a reason to fail a run
    // that has the bytes on disk already - so every error resolves to nulls.
    child.on('error', () => resolve({ width: null, height: null }));
    child.on('close', () => {
      const match = /(\d+)x(\d+)/.exec(Buffer.concat(stdout).toString());
      resolve(match
        ? { width: Number(match[1]), height: Number(match[2]) }
        : { width: null, height: null });
    });
    child.stdin.on('error', () => { /* surfaced by the close handler */ });
    child.stdin.end(raw);
  });
}

/**
 * A resumed run must not produce a thinner manifest than an uninterrupted one.
 * Prefer the previous manifest's geometry when the bytes on disk are the same
 * file it described; fall back to decoding the header only when they are not.
 */
async function readPreviousManifest() {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    return parsed && typeof parsed.images === 'object' ? parsed.images : {};
  } catch {
    return {};
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Fetch the gallery out of Google Drive and into assets/gallery/ as WebP.

  node tools/fetch-gallery.mjs                    fetch from Drive
  node tools/fetch-gallery.mjs --from-dir DIR     use already-downloaded originals
                                                  (each filename must contain its Drive id)
  node tools/fetch-gallery.mjs --dry-run          report the plan, write nothing
  node tools/fetch-gallery.mjs --force            re-encode images already present
  node tools/fetch-gallery.mjs --quality N        WebP quality, 1-100 (default ${DEFAULT_QUALITY})
  node tools/fetch-gallery.mjs --max-dim N        longest edge in px (default ${DEFAULT_MAX_DIM})
  node tools/fetch-gallery.mjs --python PATH      python3 with Pillow installed

Re-runnable: a run interrupted by a rate limit can simply be run again.
Requires Python 3 with Pillow (pip install pillow).`);
    return;
  }

  const html = await readFile(INDEX_HTML_PATH, 'utf8');
  const entries = buildGalleryManifestSource(html);
  const ids = entries.map((entry) => entry.id);
  console.log(`index.html references ${entries.length} gallery images.`);
  console.log(`Encoding: WebP q${options.quality}, max ${options.maxDim}px, into assets/gallery/\n`);

  const sourceDir = options.fromDir ? await indexSourceDir(options.fromDir, ids) : null;
  if (sourceDir) {
    const missing = ids.filter((id) => !sourceDir.has(id));
    console.log(`--from-dir ${options.fromDir}: matched ${sourceDir.size}/${ids.length} ids by filename.`);
    if (missing.length > 0) {
      console.log(`  ${missing.length} unmatched (each file's name must contain its Drive id):`);
      for (const id of missing.slice(0, 5)) console.log(`    ${id}`);
      if (missing.length > 5) console.log(`    ...and ${missing.length - 5} more`);
    }
    console.log('');
  }

  if (options.dryRun) {
    console.log('--dry-run: nothing fetched, transcoded or written.');
    for (const entry of entries.slice(0, 3)) {
      const origin = sourceDir ? (sourceDir.get(entry.id) ?? '(unmatched)') : driveUrlFor(entry.id);
      console.log(`  ${entry.name} (${entry.id})\n    <- ${origin}\n    -> assets/gallery/${entry.id}.webp`);
    }
    console.log(`  ...and ${Math.max(0, entries.length - 3)} more`);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const previousImages = await readPreviousManifest();
  const images = {};
  const failures = [];
  let written = 0;
  let skipped = 0;
  let totalBytes = 0;

  for (const [index, entry] of entries.entries()) {
    const outputPath = path.join(OUTPUT_DIR, `${entry.id}.webp`);
    const relative = `assets/gallery/${entry.id}.webp`;
    const label = `[${String(index + 1).padStart(2, ' ')}/${entries.length}] ${entry.name}`;

    try {
      const present = options.force ? null : await existingFile(outputPath);
      if (present) {
        const bytes = await readFile(outputPath);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const previous = previousImages[entry.id];
        const geometry = previous?.sha256 === sha256 && Number.isFinite(previous.width)
          ? { width: previous.width, height: previous.height }
          : await probeDimensions(bytes, options.python);
        images[entry.id] = {
          name: entry.name,
          file: relative,
          bytes: present.size,
          width: geometry.width,
          height: geometry.height,
          sha256
        };
        totalBytes += present.size;
        skipped += 1;
        console.log(`${label}: already present (${formatBytes(present.size)}), skipping`);
        continue;
      }

      let raw;
      if (sourceDir) {
        const sourcePath = sourceDir.get(entry.id);
        if (!sourcePath) throw new Error('no file in --from-dir whose name contains this id');
        raw = await readFile(sourcePath);
      } else {
        raw = await fetchWithRetry(driveUrlFor(entry.id));
        await sleep(INTER_REQUEST_DELAY_MS);
      }

      const encoded = await transcode(raw, options);
      await writeFile(outputPath, encoded.buffer);

      images[entry.id] = {
        name: entry.name,
        file: relative,
        bytes: encoded.buffer.length,
        width: encoded.width,
        height: encoded.height,
        sha256: createHash('sha256').update(encoded.buffer).digest('hex')
      };
      totalBytes += encoded.buffer.length;
      written += 1;
      const ratio = raw.length > 0 ? ` (${Math.round((1 - encoded.buffer.length / raw.length) * 100)}% smaller)` : '';
      console.log(
        `${label}: ${formatBytes(raw.length)} -> ${formatBytes(encoded.buffer.length)}` +
        `${ratio} ${encoded.width}x${encoded.height}`
      );
    } catch (error) {
      console.error(`${label}: FAILED - ${error.message}`);
      failures.push({ id: entry.id, name: entry.name, error: error.message });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: sourceDir ? 'local-directory' : 'google-drive',
    encode: { format: 'webp', quality: options.quality, maxDim: options.maxDim },
    expected: entries.length,
    present: Object.keys(images).length,
    totalBytes,
    images
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nwritten=${written} skipped=${skipped} failed=${failures.length}`);
  console.log(`Total on disk: ${formatBytes(totalBytes)} across ${Object.keys(images).length} images`);
  console.log(`Manifest: tools/gallery-manifest.json`);

  if (failures.length > 0) {
    console.log('\nFailures (re-run to retry - images already written are skipped):');
    for (const failure of failures) console.log(`  - ${failure.name} (${failure.id}): ${failure.error}`);
    console.log('\nIf these are 403/404, Drive is refusing hotlinks. Export the originals from');
    console.log('your Drive account and re-run with --from-dir, naming each file after its id.');
    process.exitCode = 1;
    return;
  }

  console.log('\nAll images present. Before committing:');
  console.log('  1. Look at several on the real device - git history keeps every encoding forever.');
  console.log('  2. If the quality is wrong, re-run with --force --quality N and look again.');
  console.log('  3. Only then commit assets/gallery/ and tools/gallery-manifest.json.');
}

main().catch((error) => {
  console.error(`\nAborted: ${error.message}`);
  process.exitCode = 1;
});
