import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { admin1CodeAt, isSupportedAdmin1Code, loadAdmin1Features, missingRequiredAdmin1Codes } from './admin1.mjs';

const DATA_FILES = ['places.json', 'curated.json'];
const TRANSACTION_MARKER = new URL('./data/.admin1-refresh-transaction.json', import.meta.url);
const COMMITTED_MARKER = new URL('./data/.admin1-refresh-committed', import.meta.url);
const TARGET_ADMIN1_COUNTRIES = new Set(['US', 'CA', 'AU']);

function isTargetAdmin1Candidate(place) {
  return typeof place.country === 'string' && TARGET_ADMIN1_COUNTRIES.has(place.country.trim().toUpperCase());
}

function isSupportedExistingCode(place, code) {
  return isSupportedAdmin1Code(place.country, code);
}

function hasUnsupportedExistingCode(place) {
  if (!isTargetAdmin1Candidate(place)) return false;
  const code = place.admin1Code;
  return code !== undefined && code !== null && !isSupportedExistingCode(place, code);
}

function normalizedSupportedCode(place, code) {
  if (typeof code !== 'string' || !isSupportedExistingCode(place, code)) return undefined;
  return code.trim().toUpperCase();
}

function preferredAdmin1Code(place, code, preserveExisting) {
  const requested = normalizedSupportedCode(place, code);
  if (requested) return requested;
  if (!preserveExisting) return undefined;
  if (place.admin1Code === null) return null;
  return normalizedSupportedCode(place, place.admin1Code);
}

export function candidateWithAdmin1Code(place, code, preserveExisting = true) {
  if (!isTargetAdmin1Candidate(place)) return { ...place };
  if (hasUnsupportedExistingCode(place)) {
    throw new Error(`Unsupported admin1Code for ${place.country} candidate ${place.id}`);
  }
  const admin1Code = preferredAdmin1Code(place, code, preserveExisting);
  if (admin1Code !== undefined) return { ...place, admin1Code };
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
    return candidateWithAdmin1Code(place, place.admin1Code);
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
  const backup = new URL(`./data/.${file}.${process.pid}.bak`, import.meta.url);
  return { file, path, temporary, backup, contents: `${JSON.stringify(enriched, null, indentation)}\n`, candidates: enriched, assigned, unassigned };
}

async function stageDataFiles(prepared) {
  await Promise.all(prepared.map(({ temporary, contents }) => writeFile(temporary, contents, 'utf8')));
}

async function installDataFiles(prepared) {
  if (prepared.length !== DATA_FILES.length || prepared.some(({ file }) => !DATA_FILES.includes(file))) {
    throw new Error('refusing to install an incomplete admin-1 data set');
  }
  for (const { path, backup } of prepared) await copyFile(path, backup);
  const manifest = prepared.map(({ file }) => ({ file, backup: `.${file}.${process.pid}.bak` }));
  await writeFile(TRANSACTION_MARKER, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx' });
  const installed = [];
  try {
    for (const item of prepared) {
      await rename(item.temporary, item.path);
      installed.push(item);
    }
    await writeFile(COMMITTED_MARKER, '', { flag: 'wx' });
  } catch (error) {
    for (const item of installed.reverse()) await copyFile(item.backup, item.path);
    await rm(TRANSACTION_MARKER, { force: true });
    await rm(COMMITTED_MARKER, { force: true });
    throw error;
  }
  await rm(TRANSACTION_MARKER, { force: true });
  await rm(COMMITTED_MARKER, { force: true });
}

async function readTransactionManifest() {
  try {
    return JSON.parse(await readFile(TRANSACTION_MARKER, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function backupPrefixFor(file) {
  return `.${file}.`;
}

function backupProcessId(entry) {
  if (typeof entry?.backup !== 'string') return undefined;
  const prefix = backupPrefixFor(entry?.file);
  if (!entry.backup.startsWith(prefix)) return undefined;
  if (!entry.backup.endsWith('.bak')) return undefined;
  return entry.backup.slice(prefix.length, -4);
}

function isDataFile(file) {
  return DATA_FILES.includes(file);
}

function isNumericBackupProcessId(processId) {
  return typeof processId === 'string' && /^\d+$/.test(processId);
}

function backupNameForEntry(entry) {
  const processId = backupProcessId(entry);
  if (!isDataFile(entry?.file)) throw new Error('admin-1 refresh marker contains an invalid backup path');
  if (!isNumericBackupProcessId(processId)) throw new Error('admin-1 refresh marker contains an invalid backup path');
  return { file: entry.file, backup: entry.backup };
}

function validateTransactionManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length !== DATA_FILES.length) {
    throw new Error('admin-1 refresh marker is invalid; refusing to read candidate data');
  }
  return manifest.map(backupNameForEntry);
}

async function restoreBackupEntry(entry) {
  await copyFile(new URL(`./data/${entry.backup}`, import.meta.url), new URL(`./data/${entry.file}`, import.meta.url));
}

async function transactionWasCommitted() {
  try {
    await readFile(COMMITTED_MARKER, 'utf8');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function recoverInterruptedInstall() {
  const manifest = await readTransactionManifest();
  if (!manifest) {
    await rm(COMMITTED_MARKER, { force: true });
    return;
  }
  if (await transactionWasCommitted()) {
    await rm(TRANSACTION_MARKER, { force: true });
    await rm(COMMITTED_MARKER, { force: true });
    return;
  }
  const entries = validateTransactionManifest(manifest);
  for (const entry of entries) await restoreBackupEntry(entry);
  await rm(TRANSACTION_MARKER, { force: true });
  await rm(COMMITTED_MARKER, { force: true });
}

async function cleanupStagedFiles(prepared) {
  const pending = await readFile(TRANSACTION_MARKER, 'utf8').then(() => true, (error) => error?.code !== 'ENOENT');
  const paths = prepared.flatMap(({ temporary, backup }) => pending ? [temporary] : [temporary, backup]);
  await Promise.all(paths.map((path) => rm(path, { force: true })));
}

async function main() {
  await recoverInterruptedInstall();
  const featurePolygons = await loadAdmin1Features();
  const prepared = [];
  try {
    for (const file of DATA_FILES) prepared.push(await prepareDataFile(file, featurePolygons));
    const missingCodes = missingRequiredAdmin1Codes(prepared.flatMap((item) => item.candidates));
    if (missingCodes.length > 0) throw new Error(`admin-1 refresh would leave required coverage missing: ${missingCodes.join(', ')}`);
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

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not refresh admin-1 candidate codes: ${message}\n`);
    process.exitCode = 1;
  }
}
