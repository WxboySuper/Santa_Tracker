import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { admin1CodeAt, isSupportedAdmin1Code, loadAdmin1Features, missingRequiredAdmin1Codes } from './admin1.mjs';

const DATA_FILES = ['places.json', 'curated.json'];
const TARGET_ADMIN1_COUNTRIES = new Set(['US', 'CA', 'AU']);

function isTargetAdmin1Candidate(place) {
  return typeof place.country === 'string' && TARGET_ADMIN1_COUNTRIES.has(place.country.trim().toUpperCase());
}

function isSupportedExistingCode(place, code) {
  return isSupportedAdmin1Code(place.country, code);
}

function normalizedSupportedCode(place, code) {
  if (typeof code !== 'string' || !isSupportedExistingCode(place, code)) return undefined;
  return code.trim().toUpperCase();
}

export function candidateWithAdmin1Code(place, code, preserveExisting = true) {
  if (!isTargetAdmin1Candidate(place)) return { ...place };
  const replacement = normalizedSupportedCode(place, code);
  if (replacement !== undefined) return { ...place, admin1Code: replacement };
  if (code === null) return { ...place, admin1Code: null };
  if (preserveExisting && place.admin1Code === null) return { ...place, admin1Code: null };
  const previous = preserveExisting ? normalizedSupportedCode(place, place.admin1Code) : undefined;
  if (previous !== undefined) return { ...place, admin1Code: previous };
  const { admin1Code: _discarded, ...candidate } = place;
  return candidate;
}

function hasSupportedAdmin1Code(candidate) {
  return isSupportedExistingCode(candidate, candidate.admin1Code);
}

function validateEnrichedCandidate(candidate, file) {
  if (!candidate || typeof candidate !== 'object') throw new TypeError(`${file} contains a non-object candidate`);
  if (candidate.admin1Code === undefined || candidate.admin1Code === null) return;
  if (!isTargetAdmin1Candidate(candidate)) return;
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

function lookupAdmin1Code(place, { file, featurePolygons, lookupErrors }) {
  try {
    return admin1CodeAt(place, featurePolygons);
  } catch (error) {
    lookupErrors.push(formatCandidateError(place, error));
    return undefined;
  }
}

function enrichCandidate(place, context) {
  if (!place || typeof place !== 'object') throw new TypeError(`${context.file} contains a non-object candidate`);
  const admin1Code = lookupAdmin1Code(place, context);
  if (admin1Code === undefined) return candidateWithAdmin1Code(place, place.admin1Code);
  if (admin1Code === null) {
    context.unassigned.push(`${place.country} ${place.id} ${place.name}`);
    return candidateWithAdmin1Code(place, null);
  }
  context.assigned.push(admin1Code);
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
  return { file, path, temporary, contents: `${JSON.stringify(enriched, null, indentation)}\n`, candidates: enriched, assigned, unassigned };
}

async function installDataFile({ path, temporary, contents }) {
  try {
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function main() {
  const featurePolygons = await loadAdmin1Features();
  const prepared = [];
  for (const file of DATA_FILES) prepared.push(await prepareDataFile(file, featurePolygons));
  const missingCodes = missingRequiredAdmin1Codes(prepared.flatMap((item) => item.candidates));
  if (missingCodes.length > 0) throw new Error(`admin-1 refresh would leave required coverage missing: ${missingCodes.join(', ')}`);
  // Each rename is atomic. If the process stops between files, rerun this offline tool.
  for (const item of prepared) await installDataFile(item);
  const assigned = prepared.flatMap((item) => item.assigned);
  const unassigned = prepared.flatMap((item) => item.unassigned);
  process.stdout.write(`Tagged ${assigned.length} US, Canadian and Australian candidates with Natural Earth admin-1 codes.\n`);
  process.stdout.write(`Unmatched candidates: ${unassigned.length}${unassigned.length ? ` (${unassigned.join('; ')})` : ''}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not refresh admin-1 candidate codes: ${message}\n`);
    process.exitCode = 1;
  }
}
