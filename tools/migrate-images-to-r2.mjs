#!/usr/bin/env node
/**
 * One-time (and re-runnable) migration: pull the gallery's 71 images off their
 * Google Drive hotlinks and push them into a private Cloudflare R2 bucket.
 *
 * Why this exists: every image in the game is fetched at runtime from
 * `lh3.googleusercontent.com/d/{id}=s0`, which is a Drive *viewer* URL, not a
 * CDN - it already shows retry parameters in captured traffic, and a failed
 * fetch is why `SIGIL CHANNEL OFFLINE` exists at all. R2 removes that
 * fragility: no egress fees, no Drive rate limiting, images stay private
 * unless the bucket is explicitly made public.
 *
 * The image list is never hand-copied here - it is parsed straight out of
 * index.html's `originalLevels`, `newImageIDs` and `esotericNames` arrays,
 * the same three arrays MASTER_POOL is built from at runtime, so this script
 * can never drift from what the game actually loads. Re-run it any time new
 * images are added to those arrays; already-uploaded keys are skipped.
 *
 * Usage:
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=sex-magick-gallery node tools/migrate-images-to-r2.mjs
 *
 * Credentials are read only from the environment - never pass them on the
 * command line where they would land in shell history, and never commit a
 * .env file containing them.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const REPO_ROOT = new URL('..', import.meta.url);
const INDEX_HTML_PATH = new URL('index.html', REPO_ROOT);
const MANIFEST_PATH = new URL('tools/gallery-manifest.json', REPO_ROOT);

const DRIVE_BASE_URL = 'https://lh3.googleusercontent.com/d/';
const DRIVE_IMG_SUFFIX = '=s0';

const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Pull a top-level `const NAME = [ ... ];` array literal out of index.html by
 * name and evaluate it in isolation. Deliberately narrow (only ever sees the
 * bracketed literal itself, not the surrounding script) rather than a general
 * HTML/JS parser, since the three arrays this reads are simple string/object
 * literals with no external references.
 */
function extractArrayLiteral(source, constName) {
  const pattern = new RegExp(`const\\s+${constName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`, 'm');
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find "const ${constName} = [...]" in index.html`);
  }
  // eslint-disable-next-line no-new-func
  return new Function(`return ${match[1]};`)();
}

/**
 * Reconstructs the same {name, id} list MASTER_POOL is built from at runtime
 * in index.html (originalLevels first, then newImageIDs deduplicated and
 * paired with esotericNames on a wrapping index) - see index.html around the
 * `MASTER_POOL` declaration for the logic this mirrors.
 */
function buildGalleryManifestSource(html) {
  const originalLevels = extractArrayLiteral(html, 'originalLevels');
  const newImageIDs = extractArrayLiteral(html, 'newImageIDs').filter(
    (value, index, self) => self.indexOf(value) === index
  );
  const esotericNames = extractArrayLiteral(html, 'esotericNames');

  const entries = originalLevels.map((level) => ({ name: level.name, id: level.id }));
  newImageIDs.forEach((id, index) => {
    const nameIndex = index % esotericNames.length;
    entries.push({ name: esotericNames[nameIndex], id });
  });
  return entries;
}

function driveUrlFor(id) {
  return `${DRIVE_BASE_URL}${id}${DRIVE_IMG_SUFFIX}`;
}

function r2KeyFor(id) {
  return `gallery/${id}.jpg`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
  } catch (error) {
    if (attempt >= MAX_RETRIES) throw error;
    const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    console.warn(`  retry ${attempt}/${MAX_RETRIES - 1} after ${delay}ms: ${error.message}`);
    await sleep(delay);
    return fetchWithRetry(url, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

async function alreadyUploaded(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') return false;
    throw error;
  }
}

async function migrate() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET');
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || null;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });

  const html = await readFile(INDEX_HTML_PATH, 'utf8');
  const entries = buildGalleryManifestSource(html);
  console.log(`Found ${entries.length} gallery images referenced in index.html.\n`);

  const manifest = {};
  const failures = [];
  let uploaded = 0;
  let skipped = 0;

  for (const [index, entry] of entries.entries()) {
    const key = r2KeyFor(entry.id);
    const label = `[${index + 1}/${entries.length}] ${entry.name} (${entry.id})`;

    try {
      if (await alreadyUploaded(s3, bucket, key)) {
        console.log(`${label}: already in bucket, skipping`);
        skipped += 1;
      } else {
        console.log(`${label}: downloading from Drive...`);
        const { buffer, contentType } = await fetchWithRetry(driveUrlFor(entry.id));
        console.log(`${label}: uploading ${(buffer.length / 1024).toFixed(0)} KB to r2://${bucket}/${key}`);
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType
        }));
        uploaded += 1;
      }
      manifest[entry.id] = {
        name: entry.name,
        key,
        url: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : null
      };
    } catch (error) {
      console.error(`${label}: FAILED - ${error.message}`);
      failures.push({ id: entry.id, name: entry.name, error: error.message });
    }
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failures.length}`);
  console.log(`Manifest written to ${MANIFEST_PATH.pathname}`);
  if (failures.length > 0) {
    console.log('\nFailures (re-run the script to retry - already-uploaded images are skipped):');
    for (const failure of failures) {
      console.log(`  - ${failure.name} (${failure.id}): ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

migrate().catch((error) => {
  console.error(`\nMigration aborted: ${error.message}`);
  process.exitCode = 1;
});
