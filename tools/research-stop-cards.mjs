import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { permissiveLicense } from './stop-card-license.mjs';

const force = process.argv.includes('--force');
const args = process.argv.slice(2).filter((arg) => arg !== '--force');
const cacheDir = resolve('.cache/stop-card-research');
const placeId = /^(?:Q\d+|ne-\d+)$/;
const wikidataId = /^Q\d+$/;
// The output directory is optional: if the first argument is already a place ID, every argument is an ID.
const hasOutput = args.length > 0 && !placeId.test(args[0]);
const output = resolve(hasOutput ? args[0] : 'content/drafts');
const requested = hasOutput ? args.slice(1) : args;
if (!requested.length) throw new Error('Usage: node tools/research-stop-cards.mjs [--force] [output-dir] <candidate place ID> [place ID ...]');
if (requested.some((id) => !placeId.test(id))) throw new Error('Candidate IDs must be Wikidata QIDs or Natural Earth ne- IDs');
const candidates = await Promise.all(['places.json', 'curated.json'].map(async (file) => JSON.parse(await readFile(new URL('./route-generator/data/' + file, import.meta.url), 'utf8'))));
const candidateById = new Map(candidates.flat().map((place) => [place.id, place]));
const userAgent = 'SantaTrackerStopCardResearch/1.0 (candidate content research tool)';
await mkdir(cacheDir, { recursive: true });
await mkdir(output, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const MATCH_RADIUS_KM = 40;

function plainText(value) {
  let text = '';
  let insideTag = false;
  for (const character of String(value ?? '')) {
    if (character === '<') { insideTag = true; continue; }
    if (character === '>') { insideTag = false; continue; }
    if (!insideTag) text += character;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Responses are cached by the exact request URL, so a changed query, file or title never reuses a stale answer. */
async function cachedJson(url) {
  const path = resolve(cacheDir, createHash('sha256').update(String(url)).digest('hex') + '.json');
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { /* Cache miss */ }
  const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!response.ok) throw new Error('Research API returned ' + response.status + ' for ' + url);
  const result = await response.json();
  await writeFile(path, JSON.stringify(result));
  await sleep(1000);
  return result;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

const https = (value) => String(value ?? '').replace(/^http:\/\//, 'https://');
const firstClaim = (entity, property) => entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;

/** Kilometres between two points on the globe. */
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

async function entityFor(qid) {
  // The id becomes a cache file name and a URL path, so accept only a Wikidata item id.
  if (!wikidataId.test(String(qid))) throw new Error('Invalid Wikidata entity id ' + qid);
  const result = await cachedJson('https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json');
  return result.entities?.[qid] ?? null;
}

function recordedQid(id, candidate) {
  if (wikidataId.test(id)) return id;
  return candidate.source?.match(/wikidata\.org\/wiki\/(Q\d+)/)?.[1];
}

/** True when the entity has coordinates within MATCH_RADIUS_KM of the candidate. */
function nearCandidate(entity, candidate) {
  const coordinate = entity ? firstClaim(entity, 'P625') : undefined;
  if (!coordinate) return false;
  return distanceKm(candidate.lat, candidate.lng, coordinate.latitude, coordinate.longitude) <= MATCH_RADIUS_KM;
}

async function searchHits(name) {
  const search = new URL('https://www.wikidata.org/w/api.php');
  search.search = new URLSearchParams({ action: 'wbsearchentities', format: 'json', language: 'en', limit: '10', search: name }).toString();
  const matches = await cachedJson(search);
  const wanted = String(name).toLocaleLowerCase('en');
  return (matches.search ?? []).filter((hit) => wikidataId.test(String(hit.id)) && String(hit.label ?? '').toLocaleLowerCase('en') === wanted);
}

/**
 * Find the Wikidata item for a candidate. A recorded QID is used as is. Otherwise a search hit is accepted only if
 * its English label matches the place name and its coordinates (P625) lie within MATCH_RADIUS_KM of the candidate.
 * Anything else is reported as unresolved rather than guessed, so a same-named place elsewhere is never attached.
 */
async function resolveEntity(id, candidate) {
  const recorded = recordedQid(id, candidate);
  if (recorded) return { qid: recorded, entity: await entityFor(recorded) };
  for (const hit of await searchHits(candidate.name)) {
    const entity = await entityFor(hit.id);
    if (nearCandidate(entity, candidate)) return { qid: hit.id, entity };
  }
  throw new Error('no Wikidata item matches ' + candidate.name + ' by name and location; record its QID in the candidate source');
}

function photoFields(info, commonsFile) {
  const metadata = info.extmetadata ?? {};
  return {
    url: https(info.thumburl ?? info.url),
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
    author: plainText(metadata.Artist?.value),
    license: permissiveLicense(metadata.LicenseShortName?.value),
    license_url: https(metadata.LicenseUrl?.value),
    source_page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(commonsFile.replaceAll(' ', '_')),
  };
}

/** Publish a photo only with a permissive license, an author, real sizes and https links. */
function publishable(photo) {
  const checks = [
    Boolean(photo.license),
    Boolean(photo.author),
    Number.isInteger(photo.width) && photo.width >= 1,
    Number.isInteger(photo.height) && photo.height >= 1,
    photo.url.startsWith('https://'),
    photo.license_url.startsWith('https://'),
  ];
  return checks.every(Boolean);
}

async function commonsPhoto(entity) {
  const commonsFile = firstClaim(entity, 'P18');
  if (!commonsFile) return null;
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|extmetadata', titles: 'File:' + commonsFile });
  const result = await cachedJson('https://commons.wikimedia.org/w/api.php?' + params);
  const info = Object.values(result.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info) return null;
  const photo = photoFields(info, commonsFile);
  return publishable(photo) ? photo : null;
}

async function wikipediaPage(title) {
  if (!title) return undefined;
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url', titles: title }).toString();
  const result = await cachedJson(url);
  return Object.values(result.query?.pages ?? {})[0];
}

const isHttps = (source) => typeof source === 'string' && source.startsWith('https://');
const awardId = (claim) => claim.mainsnak?.datavalue?.value?.id;
const awardIds = (entity) => (entity.claims?.P166 ?? []).slice(0, 10).map(awardId).filter(Boolean);

function entityText(entity, candidate) {
  return { label: entity.labels?.en?.value ?? candidate.name, description: entity.descriptions?.en?.value ?? null };
}

function pageText(page = {}) {
  return { wikipedia_extract: page.extract ?? null, wikipedia_source: page.fullurl ?? null };
}

/**
 * A research draft has two parts. `card` holds exactly the fields content/stop-cards.json accepts, so a curator writes
 * the note and topic and copies it across as is. `research` holds the material the note is written from, never published.
 */
function buildDraft({ id, candidate, match, page, photo }) {
  const wikidataSource = 'https://www.wikidata.org/wiki/' + match.qid;
  const text = pageText(page);
  const card = {
    place_id: id,
    country: candidate.country,
    note: null,
    sources: [wikidataSource, text.wikipedia_source, candidate.source].filter(isHttps),
    topic_key: null,
    photo,
    review_status: 'draft',
  };
  const research = { ...entityText(match.entity, candidate), ...text, wikidata_source: wikidataSource, notable_award_qids: awardIds(match.entity) };
  return { card, research };
}

async function researchPlace(id) {
  const candidate = candidateById.get(id);
  if (!candidate) throw new Error('unknown candidate place ID');
  const target = resolve(output, id + '.json');
  // Curators edit drafts in place: never replace one unless asked to.
  if (!force && await exists(target)) return 'kept';
  const match = await resolveEntity(id, candidate);
  if (!match.entity) throw new Error('no Wikidata entity found');
  // Only the article the verified Wikidata item links to: a bare name search could land on a different place.
  const page = await wikipediaPage(match.entity.sitelinks?.enwiki?.title);
  const photo = await commonsPhoto(match.entity);
  await writeFile(target, JSON.stringify(buildDraft({ id, candidate, match, page, photo }), null, 2) + '\n');
  return 'written';
}

// One bad ID or a transient API error must not lose the rest of the batch: report each failure and carry on.
const outcome = { written: 0, kept: 0, failed: [] };
for (const id of [...new Set(requested)]) {
  try {
    outcome[await researchPlace(id)]++;
  } catch (error) {
    outcome.failed.push(id + ': ' + error.message);
  }
}
console.log('Wrote ' + outcome.written + ' research drafts to ' + output + '; kept ' + outcome.kept + ' existing drafts (use --force to replace)');
if (outcome.failed.length) {
  process.stderr.write('Research failed for ' + outcome.failed.length + ' place(s):\n' + outcome.failed.map((line) => '- ' + line).join('\n') + '\n');
  process.exitCode = 1;
}
