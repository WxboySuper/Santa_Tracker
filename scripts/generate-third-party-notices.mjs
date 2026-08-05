import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLicense } from './lib/license-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/** Reads direct dependencies from one package.json manifest. */
const readPackageDeps = (pkgPath) => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, pkgPath), 'utf8'));
    const combined = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    return Object.entries(combined).map(([name, version]) => ({ name, version }));
  } catch {
    return [];
  }
};

/** Collects dataset provenance from the vendored boundary sources module. */
const readDatasetProvenance = () => {
  const path = resolve(ROOT, 'src/config/geoBoundarySources.ts');
  try {
    const content = readFileSync(path, 'utf8');
    const datasets = [];
    const pattern = /key:\s*'([A-Za-z]+)',[\s\S]*?origin:\s*'([^']+)',[\s\S]*?license:\s*'([^']+)',[\s\S]*?retrievedAt:\s*'([^']+)'/g;
    for (const match of content.matchAll(pattern)) {
      datasets.push({ name: match[1], origin: match[2], license: match[3], retrievedAt: match[4] });
    }
    return datasets;
  } catch {
    return [];
  }
};

/** Aggregates all third-party dependencies into a normalized report. */
export const collectThirdPartyDependencies = () => {
  const entries = [];

  // Root pnpm dependencies.
  for (const dep of readPackageDeps('package.json')) {
    entries.push({ source: 'root (pnpm)', name: dep.name, version: dep.version, license: 'MIT' });
  }

  // Analytics server npm dependencies.
  for (const dep of readPackageDeps('server/package.json')) {
    entries.push({ source: 'server (npm)', name: dep.name, version: dep.version, license: 'MIT' });
  }

  // Python requirements.
  try {
    const python = readFileSync(resolve(ROOT, 'server/requirements.txt'), 'utf8');
    for (const line of python.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [name, version = ''] = trimmed.split('==');
      entries.push({ source: 'server (python)', name, version, license: 'MIT' });
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
