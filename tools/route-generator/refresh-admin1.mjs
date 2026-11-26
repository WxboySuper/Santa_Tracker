import { readFile, rename, writeFile } from 'node:fs/promises';
import { admin1CodeAt, loadAdmin1Features } from './admin1.mjs';

const DATA_FILES = ['places.json', 'curated.json'];

function candidateWithAdmin1Code(place, code) {
  const candidate = { ...place };
  delete candidate.admin1Code;
  return code ? { ...candidate, admin1Code: code } : candidate;
}

function validateEnrichedCandidates(candidates, file) {
  if (!Array.isArray(candidates)) throw new TypeError(`${file} must contain a JSON array`);
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') throw new TypeError(`${file} contains a non-object candidate`);
    if (candidate.admin1Code === undefined) continue;
    if (typeof candidate.admin1Code !== 'string') throw new TypeError(`${file} has a non-string admin1Code for ${candidate.id}`);
    if (!candidate.admin1Code.startsWith(`${candidate.country}-`)) {
      throw new Error(`${file} has mismatched admin1Code ${candidate.admin1Code} for ${candidate.country} candidate ${candidate.id}`);
    }
  }
}

async function enrichDataFile(file, featurePolygons) {
  const path = new URL(`./data/${file}`, import.meta.url);
  const source = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(source)) throw new TypeError(`${file} must contain a JSON array`);
  const assigned = [];
  const unassigned = [];
  const enriched = source.map((place) => {
    if (!place || typeof place !== 'object') throw new TypeError(`${file} contains a non-object candidate`);
    const admin1Code = admin1CodeAt(place, featurePolygons);
    if (admin1Code === undefined) return candidateWithAdmin1Code(place, place.admin1Code);
    if (admin1Code === null) {
      unassigned.push(`${place.country} ${place.id} ${place.name}`);
      return candidateWithAdmin1Code(place, undefined);
    }
    assigned.push(admin1Code);
    return candidateWithAdmin1Code(place, admin1Code);
  });
  validateEnrichedCandidates(enriched, file);
  const indentation = file === 'places.json' ? 0 : 2;
  const temporary = new URL(`./data/.${file}.${process.pid}.tmp`, import.meta.url);
  await writeFile(temporary, `${JSON.stringify(enriched, null, indentation)}\n`, 'utf8');
  await rename(temporary, path);
  return { assigned, unassigned };
}

async function main() {
  const featurePolygons = await loadAdmin1Features();
  const totals = { assigned: [], unassigned: [] };
  for (const file of DATA_FILES) {
    const result = await enrichDataFile(file, featurePolygons);
    totals.assigned.push(...result.assigned);
    totals.unassigned.push(...result.unassigned);
  }
  process.stdout.write(`Tagged ${totals.assigned.length} US, Canadian and Australian candidates with Natural Earth admin-1 codes.\n`);
  process.stdout.write(`Unmatched candidates: ${totals.unassigned.length}${totals.unassigned.length ? ` (${totals.unassigned.join('; ')})` : ''}\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Could not refresh admin-1 candidate codes: ${message}\n`);
  process.exitCode = 1;
}
