#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'tools', 'bundle-budget.config.json');
const appRoot = path.join(root, 'apps', 'web');
const CLIENT_ASSET_EXTENSIONS = new Set(['.js', '.mjs', '.css']);

export function compareBudgets(measured, budgets) {
  return Object.entries(budgets).flatMap(([tier, limits]) =>
    ['js', 'css'].map((kind) => {
      const actual = measured[tier]?.[kind] ?? 0;
      const limit = limits[kind];
      return { tier, kind, actual, limit, passed: actual <= limit };
    }),
  );
}

function addOwner(owners, file, ...sources) {
  if (!file) return;
  const list = owners.get(file) ?? [];
  list.push(...sources.filter(Boolean));
  owners.set(file, list);
}

function addClientReferenceOwners(outDir, owners) {
  const referencesPath = path.join(outDir, '.vite', 'vinext-client-reference-sources.json');
  if (!fs.existsSync(referencesPath)) return;
  const references = JSON.parse(fs.readFileSync(referencesPath, 'utf8'));
  for (const [source, file] of Object.entries(references)) addOwner(owners, file, source);
}

function readManifestAssets(outDir) {
  const manifestPath = path.join(outDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return new Map();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const owners = new Map();
  for (const [source, entry] of Object.entries(manifest)) {
    const files = [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])];
    for (const file of files) addOwner(owners, file, source, entry.name, entry.src);
  }
  addClientReferenceOwners(outDir, owners);
  return owners;
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

function classify(file, owners) {
  const clues = `${file} ${(owners.get(file) ?? []).join(' ')}`.toLowerCase();
  if (/three|village|tracker-3d|tracker-art|pole-scene|sleigh-scene|mini-scene/.test(clues)) return '3d';
  if (/admin/.test(clues)) return 'admin';
  return 'public';
}

function isClientAsset(file) {
  return CLIENT_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function measureAssets(outDir) {
  const owners = readManifestAssets(outDir);
  const staticDir = path.join(outDir, '_next', 'static');
  const scanDir = fs.existsSync(staticDir) ? staticDir : outDir;
  const totals = { public: { js: 0, css: 0 }, '3d': { js: 0, css: 0 }, admin: { js: 0, css: 0 } };
  const assets = [];
  for (const file of walk(scanDir)) {
    if (!isClientAsset(file)) continue;
    const ext = path.extname(file).toLowerCase();
    const relativePath = path.relative(outDir, file).replaceAll('\\', '/');
    const tier = classify(relativePath, owners);
    const kind = ext === '.css' ? 'css' : 'js';
    const gzipBytes = gzipSync(fs.readFileSync(file), { level: 9 }).byteLength;
    totals[tier][kind] += gzipBytes;
    assets.push({ file: relativePath, tier, kind, gzipBytes, owners: owners.get(relativePath) ?? [] });
  }
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
