/**
 * The single source of truth for *which* images the gallery contains.
 *
 * `index.html` builds `MASTER_POOL` at runtime from three array literals -
 * `originalLevels`, `newImageIDs` and `esotericNames`. Any tool that needs the
 * image list must derive it from those same three arrays rather than keeping a
 * copy, or the copy drifts the first time an image is added and nobody notices
 * until a fetch 404s. This module is that derivation, imported by both
 * `fetch-gallery.mjs` (in-repo hosting, the shipped path) and
 * `migrate-images-to-r2.mjs` (the unused R2 alternative), for the same reason
 * `rite-validation.js` is imported by both the client and the Worker.
 */

const ID_SHAPE = /^[A-Za-z0-9_-]{20,}$/;

/**
 * Pull a top-level `const NAME = [ ... ];` array literal out of index.html by
 * name and evaluate it in isolation. Deliberately narrow (only ever sees the
 * bracketed literal itself, not the surrounding script) rather than a general
 * HTML/JS parser, since the three arrays this reads are simple string/object
 * literals with no external references.
 */
export function extractArrayLiteral(source, constName) {
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
 *
 * Throws rather than returning a partial list: a malformed or duplicated id
 * silently becomes a missing asset at runtime, which is precisely the failure
 * mode this whole milestone exists to remove.
 */
export function buildGalleryManifestSource(html) {
  const originalLevels = extractArrayLiteral(html, 'originalLevels');
  const newImageIDs = extractArrayLiteral(html, 'newImageIDs').filter(
    (value, index, self) => self.indexOf(value) === index
  );
  const esotericNames = extractArrayLiteral(html, 'esotericNames');

  if (esotericNames.length === 0) {
    throw new Error('esotericNames is empty - newImageIDs cannot be named');
  }

  const entries = originalLevels.map((level) => ({ name: level.name, id: level.id }));
  newImageIDs.forEach((id, index) => {
    const nameIndex = index % esotericNames.length;
    entries.push({ name: esotericNames[nameIndex], id });
  });

  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry.id !== 'string' || !ID_SHAPE.test(entry.id)) {
      throw new Error(`Gallery id is not a Drive file id: ${JSON.stringify(entry.id)}`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`Gallery id appears twice after deduplication: ${entry.id}`);
    }
    seen.add(entry.id);
  }

  return entries;
}
