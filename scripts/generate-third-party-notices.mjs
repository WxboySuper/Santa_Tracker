import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLicense } from './lib/license-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Curated licenses for the pinned analytics-server Python dependencies.
 * The Python packages are not installed in this repository, so their declared
 * licenses cannot be read from local manifests; this map keeps the notices
 * accurate. Any unpinned or unknown dependency defaults to 'unknown' so the
 * policy check surfaces it for review instead of mislabeling it.
 */
const PYTHON_LICENSE_MAP = {
  cfgrib: 'Apache-2.0',
  numpy: 'BSD-3-Clause',
  'scikit-image': 'BSD-3-Clause',
  shapely: 'BSD-3-Clause',
  xarray: 'Apache-2.0',
};

/** Reads and parses a package.json manifest, returning null when absent or invalid. */
const readManifest = (pkgPath) => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, pkgPath), 'utf8'));
  } catch {
    return null;
  }
};

/** Returns the license string from a string or SPDX-object field, or 'unknown'. */
const normalizeLicenseField = (license) => {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object') return typeof license.type === 'string' ? license.type : 'unknown';
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

/** Reads pinned Python requirements and their curated license declarations. */
const readPythonRequirements = () => {
  const path = resolve(ROOT, 'server/requirements.txt');
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [name, version = ''] = line.split('==');
        return { name, version, license: PYTHON_LICENSE_MAP[name] ?? 'unknown' };
      });
  } catch {
    return [];
  }
};

/**
 * Aggregates all third-party dependencies into a normalized report.
 *
 * Note: vendored runtime datasets are intentionally out of scope for this
 * report until the boundary-asset vendoring work lands (they live on the
 * geodata branch). Only package dependencies are listed here.
 */
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
  for (const dep of readPythonRequirements()) {
    entries.push({ source: 'server (python)', name: dep.name, version: dep.version, license: dep.license });
  }

  return entries;
};

/** Generates a markdown notice document from collected dependencies. */
export const renderNotices = (entries) => {
  const lines = [
    '# Third-Party Notices',
    '',
    'GFC is built on open-source software. This document lists the packages used',
    'by the shipped application, their licenses, and the policy category applied',
    'to each.',
    '',
  ];

  const sorted = [...entries].sort((a, b) => `${a.source}|${a.name}`.localeCompare(`${b.source}|${b.name}`));
  for (const entry of sorted) {
    const policy = classifyLicense(entry.license);
    lines.push(`- **${entry.name}**${entry.version ? ` ${entry.version}` : ''} (${entry.source}) — ${entry.license} — ${policy.category}`);
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
