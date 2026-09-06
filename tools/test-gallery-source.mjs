/**
 * Guards the gallery's two invariants:
 *
 *  1. The image list derived by `gallery-source.mjs` matches what index.html
 *     actually builds MASTER_POOL from. Everything downstream - the fetch
 *     tool, the manifest, the files on disk - keys off that derivation, so a
 *     silent drift here is a silent missing asset at runtime.
 *
 *  2. Once the gallery is in-repo (M36), *every* referenced id has a file and
 *     a manifest entry, and index.html's CONFIG points at those files rather
 *     than back at Google Drive. Before the migration has been run this half
 *     reports pending rather than failing, so the check can land with the
 *     tooling and start enforcing the moment the assets arrive.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildGalleryManifestSource, extractArrayLiteral } from './gallery-source.mjs';

const REPO_ROOT = new URL('..', import.meta.url);
const INDEX_HTML_PATH = fileURLToPath(new URL('index.html', REPO_ROOT));
const MANIFEST_PATH = fileURLToPath(new URL('tools/gallery-manifest.json', REPO_ROOT));

const html = readFileSync(INDEX_HTML_PATH, 'utf8');
const entries = buildGalleryManifestSource(html);

// --- 1. derivation matches index.html ------------------------------------

const originalLevels = extractArrayLiteral(html, 'originalLevels');
const newImageIDs = extractArrayLiteral(html, 'newImageIDs').filter(
  (value, index, self) => self.indexOf(value) === index
);

assert.equal(
  entries.length,
  originalLevels.length + newImageIDs.length,
  'derived gallery must be originalLevels plus deduplicated newImageIDs'
);
assert.deepEqual(
  entries.slice(0, originalLevels.length).map((entry) => entry.id),
  originalLevels.map((level) => level.id),
  'originalLevels must come first and in order, as MASTER_POOL builds them'
);
assert.deepEqual(
  entries.slice(originalLevels.length).map((entry) => entry.id),
  newImageIDs,
  'newImageIDs must follow, deduplicated, in order'
);

const ids = entries.map((entry) => entry.id);
assert.equal(new Set(ids).size, ids.length, 'every gallery id must be unique');
for (const entry of entries) {
  assert.match(entry.id, /^[A-Za-z0-9_-]{20,}$/, `id is not a Drive file id: ${entry.id}`);
  assert.ok(entry.name && typeof entry.name === 'string', `id ${entry.id} has no name`);
}

// --- 2. the parser refuses malformed input rather than degrading ---------

assert.throws(
  () => buildGalleryManifestSource(html.replace(/const\s+esotericNames\s*=\s*\[[\s\S]*?\];/, 'const esotericNames = [];')),
  /esotericNames is empty/,
  'an empty name pool must throw, not silently produce undefined names'
);
assert.throws(
  () => buildGalleryManifestSource('const originalLevels = [];'),
  /Could not find "const newImageIDs/,
  'a missing array must name the array it could not find'
);
{
  // A duplicate between originalLevels and newImageIDs survives the
  // newImageIDs-only dedup, so the cross-list check has to catch it.
  const collided = html.replace(
    /const\s+newImageIDs\s*=\s*\[/,
    `const newImageIDs = [\n  "${originalLevels[0].id}",`
  );
  assert.throws(
    () => buildGalleryManifestSource(collided),
    /appears twice after deduplication/,
    'an id repeated across both arrays must throw'
  );
}

// --- 3. in-repo assets, once M36 has been run ----------------------------

const configBaseUrl = /BASE_URL:\s*"([^"]*)"/.exec(html)?.[1];
const configSuffix = /IMG_SUFFIX:\s*"([^"]*)"/.exec(html)?.[1];
assert.ok(configBaseUrl !== undefined, 'index.html must declare CONFIG.BASE_URL');
assert.ok(configSuffix !== undefined, 'index.html must declare CONFIG.IMG_SUFFIX');

const manifestExists = existsSync(MANIFEST_PATH);
const configPointsLocal = !/^https?:/i.test(configBaseUrl);

if (!manifestExists && !configPointsLocal) {
  console.log(
    `gallery: ${entries.length} ids derived; assets not yet in repo ` +
    `(CONFIG.BASE_URL is still ${configBaseUrl}). Completeness check pending M36.`
  );
} else {
  // Half-migrated is the dangerous state: assets present but the game still
  // fetching Drive, or CONFIG switched over with no files behind it. Either
  // one ships a broken gallery, so once *either* side has moved, both must.
  assert.ok(
    manifestExists,
    `CONFIG.BASE_URL points at "${configBaseUrl}" but tools/gallery-manifest.json is missing - ` +
    'run node tools/fetch-gallery.mjs'
  );
  assert.ok(
    configPointsLocal,
    `gallery assets are in the repo but CONFIG.BASE_URL is still remote (${configBaseUrl})`
  );

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  assert.equal(
    manifest.expected,
    entries.length,
    `manifest was generated for ${manifest.expected} images but index.html now references ${entries.length} - re-run node tools/fetch-gallery.mjs`
  );

  let totalBytes = 0;
  for (const entry of entries) {
    const record = manifest.images?.[entry.id];
    assert.ok(record, `no manifest entry for ${entry.name} (${entry.id})`);
    assert.equal(record.name, entry.name, `manifest name drifted for ${entry.id}`);

    const expectedFile = `${configBaseUrl}${entry.id}${configSuffix}`;
    assert.equal(
      record.file,
      expectedFile,
      `manifest path for ${entry.id} does not match what CONFIG builds (${expectedFile})`
    );

    const assetPath = fileURLToPath(new URL(record.file, REPO_ROOT));
    assert.ok(existsSync(assetPath), `${entry.name}: missing asset ${record.file}`);

    const bytes = readFileSync(assetPath);
    assert.equal(bytes.length, statSync(assetPath).size);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      record.sha256,
      `${entry.name}: ${record.file} does not match its manifest sha256`
    );
    assert.ok(record.width > 0 && record.height > 0, `${entry.name}: manifest has no geometry`);
    totalBytes += bytes.length;
  }

  const megabytes = totalBytes / (1024 * 1024);
  console.log(
    `gallery: ${entries.length}/${entries.length} assets present, ` +
    `${megabytes.toFixed(1)} MB total, CONFIG serves them from "${configBaseUrl}"`
  );
}

console.log('gallery source contract OK');
