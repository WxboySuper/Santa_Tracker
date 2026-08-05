import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLicense } from './lib/license-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/** Reads and parses a package.json manifest, returning null when absent or invalid. */
const readManifest = (pkgPath) => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, pkgPath), 'utf8'));
  } catch {
    return null;
  }
};

/** Normalizes a license field that may be a string or an SPDX object. */
const normalizeLicenseField = (license) => {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && typeof license.type === 'string') return license.type;
  return 'unknown';
};

/** Reads the license declared by one installed dependency from its own manifest. */
const readInstalledLicense = (name, scope = 'root') => {
  const basePath = scope === 'server' ? 'server/node_modules' : 'node_modules';
  try {
    const pkg = readManifest(`${basePath}/${name}/package.json`);
    if (pkg) return normalizeLicenseField(pkg.license);
  } catch {
    // Some scoped/pinned installs are not resolvable at this path; fall back.
  }
  if (scope === 'server') {
    return readInstalledLicense(name, 'root');
  }
  return 'unknown';
};

/** Reads direct dependencies from one package.json manifest. */
const readPackageDeps = (pkgPath) => {
  const pkg = readManifest(pkgPath);
  if (!pkg) return [];
  const combined = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.entries(combined).map(([name, version]) => ({ name, version }));
};

/** Reads a dataset's per-file provenance sidecar when present. */
const readDatasetSidecar = (name) => {
  const sidecar = resolve(ROOT, 'public/geodata', `${name}.source.json`);
  if (!existsSync(sidecar)) return null;
  try {
    return JSON.parse(readFileSync(sidecar, 'utf8'));
  } catch {
    return null;
  }
};

/** Collects dataset provenance from the vendored boundary datasets and their registry. */
const readDatasetProvenance = () => {
  const registryPath = resolve(ROOT, 'src/config/geoBoundarySources.ts');
  const datasets = [];

  // Preferred source: the typed registry introduced by the vendored-assets work.
  if (existsSync(registryPath)) {
    try {
      const content = readFileSync(registryPath, 'utf8');
      const pattern = /key:\s*'([A-Za-z]+)',[\s\S]*?origin:\s*'([^']+)',[\s\S]*?license:\s*'([^']+)',[\s\S]*?retrievedAt:\s*'([^']+)'/g;
      for (const match of content.matchAll(pattern)) {
        datasets.push({ name: match[1], origin: match[2], license: match[3], retrievedAt: match[4] });
      }
    } catch {
      // Registry unreadable; fall back to the vendored files below.
    }
  }

  // Fallback: any vendored GeoJSON dataset with a per-file provenance sidecar.
  const geodataDir = resolve(ROOT, 'public/geodata');
  if (datasets.length === 0 && existsSync(geodataDir)) {
    try {
      for (const name of readdirSync(geodataDir)) {
        if (!name.endsWith('.json') || name.endsWith('.source.json')) continue;
        const key = name.replace(/\.json$/, '');
        const meta = readDatasetSidecar(key);
        if (meta) {
          datasets.push({
            name: key,
            origin: meta.origin || '',
            license: meta.license || 'unknown',
            retrievedAt: meta.retrievedAt || '',
          });
        }
      }
    } catch {
      // Geodata directory unreadable; leave provenance empty.
    }
  }

  return datasets;
};

/** Aggregates all third-party dependencies into a normalized report. */
export const collectThirdPartyDependencies = () => {
  const entries = [];

  // Root pnpm dependencies.
  for (const dep of readPackageDeps('package.json')) {
    entries.push({ source: 'root (pnpm)', name: dep.name, version: dep.version, license: readInstalledLicense(dep.name) });
  }

  // Analytics server npm dependencies.
  for (const dep of readPackageDeps('server/package.json')) {
    entries.push({ source: 'server (npm)', name: dep.name, version: dep.version, license: readInstalledLicense(dep.name, 'server') });
  }

  // Python requirements.
  try {
    const python = readFileSync(resolve(ROOT, 'server/requirements.txt'), 'utf8');
    for (const line of python.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [name, version = ''] = trimmed.split('==');
      entries.push({ source: 'server (python)', name, version, license: 'Python-2.0' });
    }
  } catch {
    // requirements.txt absent; skip.
  }

  // Vendored runtime datasets.
  for (const dataset of readDatasetProvenance()) {
    entries.push({
      source: 'vendored dataset',
      name: dataset.name,
      version: dataset.retrievedAt,
      license: dataset.license,
      origin: dataset.origin,
    });
  }

  return entries;
};

/** Generates a markdown notice document from collected dependencies. */
export const renderNotices = (entries) => {
  const lines = [
    '# Third-Party Notices',
    '',
    'GFC is built on open-source software and datasets. This document lists the',
    'packages and datasets used by the shipped application, their licenses, and',
    'the policy category applied to each.',
    '',
  ];

  const sorted = [...entries].sort((a, b) => `${a.source}|${a.name}`.localeCompare(`${b.source}|${b.name}`));
  for (const entry of sorted) {
    const policy = classifyLicense(entry.license);
    lines.push(`- **${entry.name}**${entry.version ? ` ${entry.version}` : ''} (${entry.source}) — ${entry.license} — ${policy.category}${entry.origin ? ` — ${entry.origin}` : ''}`);
  }

  lines.push('', 'License categories: allowed, review-required, prohibited, unknown.');
  return lines.join('\n');
};

/** Writes the notice document to the repository root. */
export const writeNoticesFile = (entries, outputPath = 'THIRD_PARTY_NOTICES.md') => {
  writeFileSync(resolve(ROOT, outputPath), renderNotices(entries));
};

/** CLI entry: generate and write the notice artifact. */
const main = () => {
  const entries = collectThirdPartyDependencies();
  writeNoticesFile(entries);
  console.log(`Wrote THIRD_PARTY_NOTICES.md with ${entries.length} entries.`);
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main();
}
