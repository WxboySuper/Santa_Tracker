#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  process.env.BUNDLE_BUDGET_ROOT ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
);
const configPath = path.resolve(
  process.env.BUNDLE_BUDGET_CONFIG ?? path.join(root, 'tools', 'bundle-budget.config.json'),
);
const appRoot = path.join(root, 'apps', 'web');
const CLIENT_ASSET_EXTENSIONS = new Set(['.js', '.mjs', '.css']);
const MAX_CLIENT_ASSET_BYTES = 50 * 1024 * 1024;

function hasNonZeroBudget(limits) {
  return Object.values(limits).some((limit) => limit > 0);
}

function hasNoMeasuredBytes(measurement) {
  return Object.values(measurement).every((size) => size === 0);
}

function assertMeasurementExists(tier, measurement) {
  if (!measurement) throw new Error(`Missing bundle measurement for tier "${tier}".`);
}

function assertMeasurementHasBytes(tier, measurement, limits) {
  if (hasNoMeasuredBytes(measurement) && hasNonZeroBudget(limits)) {
    throw new Error(
      `Bundle tier "${tier}" measured 0 bytes despite a non-zero budget. Check the build output and manifest.`,
    );
  }
}

function validateTierMeasurement(tier, measurement, limits) {
  assertMeasurementExists(tier, measurement);
  assertMeasurementHasBytes(tier, measurement, limits);
}

function compareAssetKind(tier, kind, measurement, limits) {
  if (typeof measurement[kind] !== 'number')
    throw new Error(`Missing ${kind.toUpperCase()} measurement for tier "${tier}".`);
  const actual = measurement[kind];
  const limit = limits[kind];
  return { tier, kind, actual, limit, passed: actual <= limit };
}

export function compareBudgets(measured, budgets) {
  return Object.entries(budgets).flatMap(([tier, limits]) => {
    const measurement = measured[tier];
    validateTierMeasurement(tier, measurement, limits);
    return ['js', 'css'].map((kind) => compareAssetKind(tier, kind, measurement, limits));
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
  if (!fs.existsSync(referencesPath)) return false;
  const references = JSON.parse(fs.readFileSync(referencesPath, 'utf8'));
  for (const [source, file] of Object.entries(references)) addOwner(owners, file, source);
  return true;
}

function readManifestAssets(outDir) {
  const manifestPath = path.join(outDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath))
    throw new Error(
      `Vite manifest not found at ${manifestPath}. Check that the configured build output directory is correct.`,
    );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const owners = new Map();
  for (const [source, entry] of Object.entries(manifest)) {
    const files = [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])];
    for (const file of files) addOwner(owners, file, source, entry.name, entry.src);
  }
  const hasClientReferences = addClientReferenceOwners(outDir, owners);
  return { manifest, owners, hasClientReferences };
}

function locateAssetDir() {
  if (process.env.BUNDLE_BUDGET_OUT_DIR) return path.resolve(process.env.BUNDLE_BUDGET_OUT_DIR);
  const candidates = [
    path.join(appRoot, '.vinext', 'client'),
    path.join(appRoot, '.cloudflare', 'output', 'v1', 'workers', 'default', 'assets'),
    path.join(appRoot, 'dist', 'client'),
    path.join(appRoot, 'dist'),
  ];
  const found = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, '.vite', 'manifest.json')),
  );
  if (!found)
    throw new Error(
      'No client build output found. Run VINEXT_BUILD=1 vite build in apps/web first.',
    );
  return found;
}

function walkEntry(dir, entry) {
  const full = path.join(dir, entry.name);
  if (entry.isSymbolicLink()) {
    throw new Error(`Client build output must not contain symbolic links: ${full}`);
  }
  if (entry.isDirectory()) return walk(full);
  return entry.isFile() ? [full] : [];
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => walkEntry(dir, entry));
}

function readClientAsset(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_CLIENT_ASSET_BYTES)
    throw new Error(
      `Client asset exceeds the ${MAX_CLIENT_ASSET_BYTES}-byte safety limit: ${file}`,
    );
  return fs.readFileSync(file);
}

function categoryClue(value) {
  const clue = value.toLowerCase();
  if (/three|village|tracker-3d|tracker-art|pole-scene|sleigh-scene|mini-scene/.test(clue))
    return '3d';
  if (/admin/.test(clue)) return 'admin';
  return null;
}

function isGraphSeed(key, entry, tier, referenceCategories) {
  const clue =
    categoryClue(`${key} ${entry.name ?? ''} ${entry.src ?? ''}`) ?? referenceCategories.get(key);
  return tier === 'public' ? (entry.isEntry || entry.isDynamicEntry) && !clue : clue === tier;
}

function graphSeeds(manifest, tier, referenceSeeds, referenceCategories) {
  const entries = Object.entries(manifest)
    .filter(([key, entry]) => isGraphSeed(key, entry, tier, referenceCategories))
    .map(([key]) => key);
  return [...entries, ...referenceSeeds];
}

function isPublicDynamicTarget(target, { manifest, referenceCategories }) {
  const entry = manifest[target];
  if (!entry) return true;
  const tier =
    categoryClue(`${target} ${entry.name ?? ''} ${entry.src ?? ''}`) ??
    referenceCategories.get(target);
  return tier !== '3d' && tier !== 'admin';
}

function graphNeighbors(key, context) {
  const { manifest, tier } = context;
  const entry = manifest[key];
  const imports = entry.imports ?? [];
  const dynamicImports = entry.dynamicImports ?? [];
  if (tier !== 'public') return [...imports, ...dynamicImports];
  return [...imports, ...dynamicImports.filter((target) => isPublicDynamicTarget(target, context))];
}

function walkManifest(context, seeds) {
  const { manifest } = context;
  const reachable = new Set();
  const pending = [...seeds];
  while (pending.length) {
    const key = pending.pop();
    const entry = manifest[key];
    if (!entry || reachable.has(key)) continue;
    reachable.add(key);
    pending.push(...graphNeighbors(key, context));
  }
  return reachable;
}

function manifestAssetFiles(manifest, keys) {
  const files = [];
  for (const key of keys) {
    const entry = manifest[key];
    files.push(entry.file, ...(entry.css ?? []), ...(entry.assets ?? []));
  }
  return files.filter(Boolean).map(normalizeAssetPath);
}

function reachableFiles(manifest, tier, extraSeeds = [], referenceCategories = new Map()) {
  const seeds = graphSeeds(manifest, tier, extraSeeds, referenceCategories);
  const context = { manifest, tier, referenceCategories };
  const reachable = walkManifest(context, seeds);
  return new Set(manifestAssetFiles(manifest, reachable));
}

function indexManifestFiles(manifest) {
  const manifestKeysByFile = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    if (!entry.file) continue;
    const normalizedFile = normalizeAssetPath(entry.file);
    const keys = manifestKeysByFile.get(normalizedFile) ?? [];
    keys.push(key);
    manifestKeysByFile.set(normalizedFile, keys);
  }
  return manifestKeysByFile;
}

function referenceTier(sources) {
  const hintedCategory = categoryClue(sources.join(' '));
  if (hintedCategory) return hintedCategory;
  return sources.some((source) => /^src\/app\//.test(source)) ? 'public' : null;
}

function addReferenceSeeds({ file, sources, manifestKeysByFile, seeds, categoriesByKey }) {
  const tier = referenceTier(sources);
  if (!tier) return;
  const entryKeys = manifestKeysByFile.get(file) ?? [];
  seeds[tier].push(...entryKeys);
  for (const key of entryKeys) categoriesByKey.set(key, tier);
}

function clientReferenceSeeds(manifest, owners) {
  const manifestKeysByFile = indexManifestFiles(manifest);
  const seeds = { public: [], '3d': [], admin: [] };
  const categoriesByKey = new Map();
  for (const [file, sources] of owners)
    addReferenceSeeds({ file, sources, manifestKeysByFile, seeds, categoriesByKey });
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
  if (categories?.size) return { tiers: [...categories], unattributed: false };
  const fallback = categoryClue(
    `${file} ${(owners.get(normalizeAssetPath(file)) ?? []).join(' ')}`,
  );
  if (fallback) return { tiers: [fallback], unattributed: false };
  return { tiers: ['public'], unattributed: true };
}

function isClientAsset(file) {
  return CLIENT_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function measureAssets(outDir) {
  const { manifest, owners, hasClientReferences } = readManifestAssets(outDir);
  const graphCategories = buildGraphCategories(manifest, owners);
  const scanDir = outDir;
  const totals = { public: { js: 0, css: 0 }, '3d': { js: 0, css: 0 }, admin: { js: 0, css: 0 } };
  const assets = [];
  const warnings = [];
  let unattributedAssetCount = 0;
  if (!hasClientReferences) {
    warnings.push(
      'Client reference source file is missing. Attribution uses the Vite manifest graph only.',
    );
  }
  for (const file of walk(scanDir)) {
    if (!isClientAsset(file)) continue;
    const ext = path.extname(file).toLowerCase();
    const relativePath = normalizeAssetPath(path.relative(outDir, file));
    const classification = classify(relativePath, owners, graphCategories);
    const { tiers } = classification;
    if (classification.unattributed) unattributedAssetCount += 1;
    const kind = ext === '.css' ? 'css' : 'js';
    const gzipBytes = gzipSync(readClientAsset(file), { level: 9 }).byteLength;
    for (const tier of tiers) totals[tier][kind] += gzipBytes;
    assets.push({
      file: relativePath,
      tier: tiers.join(', '),
      tiers,
      kind,
      gzipBytes,
      owners: owners.get(relativePath) ?? [],
    });
  }
  if (!assets.length)
    throw new Error(
      `No client JS or CSS assets found under ${scanDir}. Check the build output directory.`,
    );
  if (unattributedAssetCount) {
    warnings.push(
      `${unattributedAssetCount} client asset(s) had no manifest graph or filename attribution and were charged to the public tier.`,
    );
  }
  assets.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return { totals, assets, warnings, unattributedAssetCount };
}

export function renderReport(measurement, budgets, results) {
  const lines = [
    '# Bundle budget report',
    '',
    '| Tier | Asset type | Gzip size | Budget | Status |',
    '| --- | --- | ---: | ---: | --- |',
    ...results.map(
      ({ tier, kind, actual, limit, passed }) =>
        `| ${tier} | ${kind.toUpperCase()} | ${(actual / 1024).toFixed(1)} KiB | ${(limit / 1024).toFixed(1)} KiB | ${passed ? 'pass' : 'over budget'} |`,
    ),
    ...(measurement.warnings.length
      ? ['', 'Warnings:', '', ...measurement.warnings.map((warning) => `- ${warning}`)]
      : []),
    '',
    'Largest client assets (gzip):',
    '',
    '| Asset | Tier | Type | Gzip size | Source attribution |',
    '| --- | --- | --- | ---: | --- |',
    ...measurement.assets.slice(0, 10).map(
      (asset) =>
        `| \`${asset.file}\` | ${asset.tier} | ${asset.kind.toUpperCase()} | ${(asset.gzipBytes / 1024).toFixed(1)} KiB | ${
          asset.owners
            .filter((owner) => owner && !owner.includes('node_modules'))
            .slice(0, 3)
            .join(', ') || 'shared chunk'
        } |`,
    ),
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
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
