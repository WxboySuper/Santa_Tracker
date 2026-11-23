#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.BUNDLE_BUDGET_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const configPath = path.join(root, 'tools', 'bundle-budget.config.json');
const appRoot = path.join(root, 'apps', 'web');
const CLIENT_ASSET_EXTENSIONS = new Set(['.js', '.mjs', '.css']);

export function compareBudgets(measured, budgets) {
  return Object.entries(budgets).flatMap(([tier, limits]) => {
    const measurement = measured[tier];
    if (!measurement) throw new Error(`Missing bundle measurement for tier "${tier}".`);
    const tierTotal = (measurement.js ?? 0) + (measurement.css ?? 0);
    if (tierTotal === 0 && (limits.js > 0 || limits.css > 0)) {
      throw new Error(`Bundle tier "${tier}" measured 0 bytes despite a non-zero budget. Check the build output and manifest.`);
    }
    return ['js', 'css'].map((kind) => {
      if (typeof measurement[kind] !== 'number') throw new Error(`Missing ${kind.toUpperCase()} measurement for tier "${tier}".`);
      const actual = measurement[kind];
      const limit = limits[kind];
      return { tier, kind, actual, limit, passed: actual <= limit };
    });
  });
}

function normalizeAssetPath(file) {
  return file.replaceAll('\\', '/').replace(/^\.\//, '');
}

function addOwner(owners, file, ...sources) {
  if (!file) return;
  const key = normalizeAssetPath(file);
  const list = owners.get(key) ?? [];
  list.push(...sources.filter(Boolean));
  owners.set(key, list);
}

function addClientReferenceOwners(outDir, owners) {
  const referencesPath = path.join(outDir, '.vite', 'vinext-client-reference-sources.json');
  if (!fs.existsSync(referencesPath)) return;
  const references = JSON.parse(fs.readFileSync(referencesPath, 'utf8'));
  for (const [source, file] of Object.entries(references)) addOwner(owners, file, source);
}

function readManifestAssets(outDir) {
  const manifestPath = path.join(outDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Vite manifest not found at ${manifestPath}. Check that the configured build output directory is correct.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const owners = new Map();
  for (const [source, entry] of Object.entries(manifest)) {
    const files = [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])];
    for (const file of files) addOwner(owners, file, source, entry.name, entry.src);
  }
  addClientReferenceOwners(outDir, owners);
  return { manifest, owners };
}

function locateAssetDir() {
  const candidates = [
    path.join(appRoot, '.cloudflare', 'output', 'v1', 'workers', 'default', 'assets'),
    path.join(appRoot, 'dist', 'client'),
    path.join(appRoot, 'dist'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No client build output found. Run VINEXT_BUILD=1 vite build in apps/web first.');
  return found;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function categoryClue(value) {
  const clue = value.toLowerCase();
  if (/three|village|tracker-3d|tracker-art|pole-scene|sleigh-scene|mini-scene/.test(clue)) return '3d';
  if (/admin/.test(clue)) return 'admin';
  return null;
}

function reachableFiles(manifest, seedCategory, extraSeeds = [], referenceCategories = new Map()) {
  const reachable = new Set();
  const pending = Object.entries(manifest)
    .filter(([key, entry]) => {
      const clue = categoryClue(`${key} ${entry.name ?? ''} ${entry.src ?? ''}`) ?? referenceCategories.get(key);
      return seedCategory === 'public' ? entry.isEntry && !clue : clue === seedCategory;
    })
    .map(([key]) => key);
  pending.push(...extraSeeds);
  while (pending.length) {
    const key = pending.pop();
    if (reachable.has(key) || !manifest[key]) continue;
    reachable.add(key);
    const entry = manifest[key];
    pending.push(...(entry.imports ?? []));
    const dynamicTargets = entry.dynamicImports ?? [];
    if (seedCategory === 'public') {
      if (extraSeeds.includes(key)) {
        pending.push(...dynamicTargets.filter((target) => {
          const targetEntry = manifest[target];
          if (!targetEntry) return true;
          return !categoryClue(`${target} ${targetEntry.name ?? ''} ${targetEntry.src ?? ''}`)
            && !referenceCategories.has(target);
        }));
      }
    } else {
      pending.push(...dynamicTargets);
    }
  }
  return new Set([...reachable].flatMap((key) => {
    const entry = manifest[key];
    return [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])].filter(Boolean).map(normalizeAssetPath);
  }));
}

function clientReferenceSeeds(manifest, owners) {
  const manifestKeysByFile = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    if (!entry.file) continue;
    const normalizedFile = normalizeAssetPath(entry.file);
    const keys = manifestKeysByFile.get(normalizedFile) ?? [];
    keys.push(key);
    manifestKeysByFile.set(normalizedFile, keys);
  }

  const seeds = { public: [], '3d': [], admin: [] };
  const categoriesByKey = new Map();
  for (const [file, sources] of owners) {
    const sourceText = sources.join(' ');
    const hintedCategory = categoryClue(sourceText);
    const isPublicRoute = sources.some((source) => /^src\/app\//.test(source));
    const tier = hintedCategory ?? (isPublicRoute ? 'public' : null);
    if (!tier) continue;
    const entryKeys = manifestKeysByFile.get(file) ?? [];
    seeds[tier].push(...entryKeys);
    for (const key of entryKeys) categoriesByKey.set(key, tier);
  }
  return { seeds, categoriesByKey };
}

function buildGraphCategories(manifest, owners) {
  const byAsset = new Map();
  const { seeds, categoriesByKey } = clientReferenceSeeds(manifest, owners);
  for (const tier of ['public', '3d', 'admin']) {
    for (const file of reachableFiles(manifest, tier, seeds[tier], categoriesByKey)) {
      const categories = byAsset.get(file) ?? new Set();
      categories.add(tier);
      byAsset.set(file, categories);
    }
  }
  return byAsset;
}

function classify(file, owners, graphCategories) {
  const categories = graphCategories.get(normalizeAssetPath(file));
  if (categories?.size === 1) return [...categories][0];
  if (categories?.size > 1) return 'public';
  // Fallback for assets absent from the Vite graph. Manifest-mapped shared assets default to public.
  if (owners.has(normalizeAssetPath(file))) return 'public';
  return categoryClue(`${file} ${(owners.get(normalizeAssetPath(file)) ?? []).join(' ')}`) ?? 'public';
}

function isClientAsset(file) {
  return CLIENT_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function measureAssets(outDir) {
  const { manifest, owners } = readManifestAssets(outDir);
  const graphCategories = buildGraphCategories(manifest, owners);
  const staticDir = path.join(outDir, '_next', 'static');
  const scanDir = fs.existsSync(staticDir) ? staticDir : outDir;
  const totals = { public: { js: 0, css: 0 }, '3d': { js: 0, css: 0 }, admin: { js: 0, css: 0 } };
  const assets = [];
  for (const file of walk(scanDir)) {
    if (!isClientAsset(file)) continue;
    const ext = path.extname(file).toLowerCase();
    const relativePath = normalizeAssetPath(path.relative(outDir, file));
    const tier = classify(relativePath, owners, graphCategories);
    const kind = ext === '.css' ? 'css' : 'js';
    const gzipBytes = gzipSync(fs.readFileSync(file), { level: 9 }).byteLength;
    totals[tier][kind] += gzipBytes;
    assets.push({ file: relativePath, tier, kind, gzipBytes, owners: owners.get(relativePath) ?? [] });
  }
  if (!assets.length) throw new Error(`No client JS or CSS assets found under ${scanDir}. Check the build output directory.`);
  assets.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return { totals, assets };
}

export function renderReport(measurement, budgets, results) {
  const lines = [
    '# Bundle budget report',
    '',
    '| Tier | Asset type | Gzip size | Budget | Status |',
    '| --- | --- | ---: | ---: | --- |',
    ...results.map(({ tier, kind, actual, limit, passed }) =>
      `| ${tier} | ${kind.toUpperCase()} | ${(actual / 1024).toFixed(1)} KiB | ${(limit / 1024).toFixed(1)} KiB | ${passed ? 'pass' : 'over budget'} |`),
    '',
    'Largest client assets (gzip):',
    '',
    '| Asset | Tier | Type | Gzip size | Source attribution |',
    '| --- | --- | --- | ---: | --- |',
    ...measurement.assets.slice(0, 10).map((asset) =>
      `| \`${asset.file}\` | ${asset.tier} | ${asset.kind.toUpperCase()} | ${(asset.gzipBytes / 1024).toFixed(1)} KiB | ${asset.owners.filter((owner) => owner && !owner.includes('node_modules')).slice(0, 3).join(', ') || 'shared chunk'} |`),
  ];
  return lines.join('\n');
}

function main() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const outDir = locateAssetDir();
  const measurement = measureAssets(outDir);
  const results = compareBudgets(measurement.totals, config.budgets);
  const report = renderReport(measurement, config.budgets, results);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
