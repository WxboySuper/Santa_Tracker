import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import requiredAdmin1Units from '../../packages/route-engine/src/generate/admin1-units.json' with { type: 'json' };
import { admin1CodeAt, loadAdmin1Features } from './admin1.mjs';

const DATA_FILES = ['places.json', 'curated.json'];
const REQUIRED_ADMIN1_CODES = new Set(Object.values(requiredAdmin1Units).flat());

function candidateWithAdmin1Code(place, code) {
  const candidate = { ...place };
  delete candidate.admin1Code;
  if (code && REQUIRED_ADMIN1_CODES.has(code)) return { ...candidate, admin1Code: code };
  const existing = place.admin1Code;
  const supportedExisting = typeof existing === 'string'
    && existing.startsWith(`${place.country}-`)
    && (!['US', 'CA', 'AU'].includes(place.country) || REQUIRED_ADMIN1_CODES.has(existing));
  return supportedExisting ? { ...candidate, admin1Code: existing } : candidate;
}

function hasSupportedAdmin1Code(candidate) {
  const code = candidate.admin1Code;
  if (typeof code !== 'string') return false;
  if (!code.startsWith(`${candidate.country}-`)) return false;
  return !['US', 'CA', 'AU'].includes(candidate.country) || REQUIRED_ADMIN1_CODES.has(code);
}

function validateEnrichedCandidate(candidate, file) {
  if (!candidate || typeof candidate !== 'object') throw new TypeError(`${file} contains a non-object candidate`);
  if (candidate.admin1Code === undefined) return;
  if (!hasSupportedAdmin1Code(candidate)) {
    throw new Error(`${file} has an unsupported admin1Code for ${candidate.country} candidate ${candidate.id}`);
  }
}

function validateEnrichedCandidates(candidates, file) {
  if (!Array.isArray(candidates)) throw new TypeError(`${file} must contain a JSON array`);
  for (const candidate of candidates) validateEnrichedCandidate(candidate, file);
}

function formatCandidateError(place, error) {
  const message = error instanceof Error ? error.message : String(error);
  return `${place.country ?? '(unknown)'} ${place.id ?? '(unknown)'} ${place.name ?? '(unnamed)'}: ${message}`;
}

function enrichCandidate(place, { file, featurePolygons, assigned, unassigned, lookupErrors }) {
  if (!place || typeof place !== 'object') throw new TypeError(`${file} contains a non-object candidate`);
  let admin1Code;
  try {
    admin1Code = admin1CodeAt(place, featurePolygons);
  } catch (error) {
    lookupErrors.push(formatCandidateError(place, error));
    return candidateWithAdmin1Code(place, place.admin1Code);
  }
  if (admin1Code === undefined) return candidateWithAdmin1Code(place, place.admin1Code);
  if (admin1Code === null) {
    unassigned.push(`${place.country} ${place.id} ${place.name}`);
    return candidateWithAdmin1Code(place, place.admin1Code);
  }
  assigned.push(admin1Code);
  return candidateWithAdmin1Code(place, admin1Code);
}

async function prepareDataFile(file, featurePolygons) {
  const path = new URL(`./data/${file}`, import.meta.url);
  const source = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(source)) throw new TypeError(`${file} must contain a JSON array`);
  const assigned = [];
  const unassigned = [];
  const lookupErrors = [];
  const context = { file, featurePolygons, assigned, unassigned, lookupErrors };
  const enriched = source.map((place) => enrichCandidate(place, context));
  if (lookupErrors.length > 0) throw new Error(`${file} has invalid candidate coordinates:\n${lookupErrors.map((entry) => `- ${entry}`).join('\n')}`);
  validateEnrichedCandidates(enriched, file);
  const indentation = file === 'places.json' ? 0 : 2;
  const temporary = new URL(`./data/.${file}.${process.pid}.tmp`, import.meta.url);
  const backup = new URL(`./data/.${file}.${process.pid}.bak`, import.meta.url);
  return { file, path, temporary, backup, contents: `${JSON.stringify(enriched, null, indentation)}\n`, assigned, unassigned };
}

async function stageDataFiles(prepared) {
  await Promise.all(prepared.map(({ temporary, contents }) => writeFile(temporary, contents, 'utf8')));
}

async function installDataFiles(prepared) {
  for (const { path, backup } of prepared) await copyFile(path, backup);
  const installed = [];
  try {
    for (const item of prepared) {
      await rename(item.temporary, item.path);
      installed.push(item);
    }
  } catch (error) {
    for (const item of installed.reverse()) await copyFile(item.backup, item.path);
    throw error;
  }
}

async function cleanupStagedFiles(prepared) {
  await Promise.all(prepared.flatMap(({ temporary, backup }) => [temporary, backup])
    .map((path) => rm(path, { force: true })));
}

async function main() {
  const featurePolygons = await loadAdmin1Features();
  const prepared = [];
  try {
    for (const file of DATA_FILES) prepared.push(await prepareDataFile(file, featurePolygons));
    await stageDataFiles(prepared);
    await installDataFiles(prepared);
  } finally {
    await cleanupStagedFiles(prepared);
  }
  const assigned = prepared.flatMap((item) => item.assigned);
  const unassigned = prepared.flatMap((item) => item.unassigned);
  process.stdout.write(`Tagged ${assigned.length} US, Canadian and Australian candidates with Natural Earth admin-1 codes.\n`);
  process.stdout.write(`Unmatched candidates: ${unassigned.length}${unassigned.length ? ` (${unassigned.join('; ')})` : ''}\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Could not refresh admin-1 candidate codes: ${message}\n`);
  process.exitCode = 1;
}
