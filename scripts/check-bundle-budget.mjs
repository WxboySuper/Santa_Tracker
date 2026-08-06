import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_DIR = resolve(ROOT, 'build', 'assets');

/** Maximum accepted size (in bytes) for the initial entry chunk. */
const ENTRY_CHUNK_BUDGET_BYTES = 450 * 1024; // 450 kB

/** Maximum accepted total (in bytes) for all JS chunks. */
const TOTAL_JS_BUDGET_BYTES = 3.5 * 1024 * 1024; // 3.5 MB

/** Reads the built index.html to find the entry script chunk. */
const findEntryChunk = () => {
  const html = readFileSync(resolve(ROOT, 'build', 'index.html'), 'utf8');
  const match = html.match(/<script[^>]+src="([^"]+\.js)"/);
  return match ? match[1].replace(/^\//, '') : null;
};

/** Returns sizes for a given built asset file. */
const assetSize = (relativePath) => {
  const file = readFileSync(resolve(ROOT, 'build', relativePath));
  return file.byteLength;
};

const main = () => {
  const entryPath = findEntryChunk();
  if (!entryPath) {
    console.error('Could not locate the entry JS chunk in build/index.html.');
    process.exit(1);
  }

  const entryBytes = assetSize(entryPath);
  const budgetKb = (ENTRY_CHUNK_BUDGET_BYTES / 1024).toFixed(0);
  const entryKb = (entryBytes / 1024).toFixed(1);

  if (entryBytes > ENTRY_CHUNK_BUDGET_BYTES) {
    console.error(
      `Entry chunk budget exceeded: ${entryPath} is ${entryKb} kB (budget ${budgetKb} kB). ` +
        'Move more feature code behind lazy route chunks or reduce eager imports.'
    );
    process.exit(1);
  }

  const jsFiles = readdirSync(BUILD_DIR).filter((name) => name.endsWith('.js'));
  const totalJs = jsFiles.reduce((sum, name) => sum + readFileSync(resolve(BUILD_DIR, name)).byteLength, 0);
  const totalKb = (totalJs / 1024).toFixed(0);

  if (totalJs > TOTAL_JS_BUDGET_BYTES) {
    console.error(
      `Total JS budget exceeded: ${totalKb} kB across ${jsFiles.length} chunks (budget ${(TOTAL_JS_BUDGET_BYTES / 1024).toFixed(0)} kB).`
    );
    process.exit(1);
  }

  console.log(`Entry chunk OK: ${entryPath} (${entryKb} kB / ${budgetKb} kB budget).`);
  console.log(`Total JS OK: ${totalKb} kB across ${jsFiles.length} chunks (budget ${(TOTAL_JS_BUDGET_BYTES / 1024).toFixed(0)} kB).`);
};

main();
