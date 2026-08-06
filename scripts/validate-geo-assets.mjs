import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCES_PATH = resolve(ROOT, 'src/config/geoBoundarySources.ts');

/**
 * Extracts the vendored path + sha256 pairs declared in the source module by
 * scanning the exported constants. The module uses runtime-only helpers, so we
 * read the checksum table directly from the source text.
 */
export const parseDeclaredDatasets = () => {
  const content = readFileSync(SOURCES_PATH, 'utf8');
  const entries = [];
  const recordPattern = /key:\s*'([A-Za-z]+)',[\s\S]*?vendoredPath:\s*'([^']+)',[\s\S]*?sha256:\s*'([0-9A-F]+)'/g;
  for (const match of content.matchAll(recordPattern)) {
    entries.push({ key: match[1], vendoredPath: match[2], sha256: match[3] });
  }
  return entries;
};

/** Computes the SHA-256 hex digest of a file. */
export const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Verifies every declared dataset exists and matches its pinned checksum. */
export const verifyVendoredDatasets = (datasets) => {
  const results = [];
  for (const dataset of datasets) {
    const path = resolve(ROOT, dataset.vendoredPath);
    if (!existsSync(path)) {
      results.push({ ...dataset, ok: false, error: 'missing' });
      continue;
    }
    const actual = sha256Of(path);
    if (actual !== dataset.sha256.toLowerCase()) {
      results.push({ ...dataset, ok: false, error: `checksum mismatch (expected ${dataset.sha256})` });
    } else {
      results.push({ ...dataset, ok: true });
    }
  }
  return results;
};

/** Runs the CLI verification, exiting non-zero on any failure. */
const main = () => {
  const datasets = parseDeclaredDatasets();
  if (datasets.length === 0) {
    console.error('No vendored boundary datasets declared in geoBoundarySources.ts.');
    process.exit(1);
  }

  const results = verifyVendoredDatasets(datasets);
  let failed = false;
  for (const result of results) {
    if (result.ok) {
      console.log(`OK ${result.vendoredPath} (${result.key})`);
    } else {
      console.error(`${result.error}: ${result.vendoredPath}`);
      failed = true;
    }
  }

  if (failed) {
    console.error('Boundary dataset integrity check FAILED.');
    process.exit(1);
  }
  console.log(`Boundary dataset integrity OK (${results.length} datasets).`);
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main();
}
