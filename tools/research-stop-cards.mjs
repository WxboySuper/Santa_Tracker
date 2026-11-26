import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { permissiveLicense } from './stop-card-license.mjs';

const force = process.argv.includes('--force');
const args = process.argv.slice(2).filter((arg) => arg !== '--force');
const cacheDir = resolve('.cache/stop-card-research');
const placeId = /^(?:Q\d+|ne-\d+)$/;
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

async function cachedJson(key, url) {
  const path = resolve(cacheDir, key + '.json');
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

/** Kilometres between two points on the globe. */
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

async function entityFor(qid) {
  // The id becomes a cache file name and a URL path, so accept only a Wikidata item id.
  if (!/^Q\d+$/.test(String(qid))) throw new Error('Invalid Wikidata entity id ' + qid);
  const result = await cachedJson('wikidata-' + qid, 'https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json');
  return result?.entities?.[qid] ?? null;
}

/**
 * Find the Wikidata item for a candidate. A recorded QID is used as is. Otherwise a search hit is accepted only if
 * its English label matches the place name and its coordinates (P625) lie within MATCH_RADIUS_KM of the candidate.
 * Anything else is reported as unresolved rather than guessed, so a same-named place elsewhere is never attached.
 */
async function resolveEntity(id, candidate) {
  const recorded = /^Q\d+$/.test(id) ? id : candidate.source?.match(/wikidata\.org\/wiki\/(Q\d+)/)?.[1];
  if (recorded) return { qid: recorded, entity: await entityFor(recorded) };
  const search = new URL('https://www.wikidata.org/w/api.php');
  search.search = new URLSearchParams({ action: 'wbsearchentities', format: 'json', language: 'en', limit: '10', search: candidate.name }).toString();
  const matches = await cachedJson('wikidata-search-' + id, search);
  const wanted = String(candidate.name).toLocaleLowerCase('en');
  for (const hit of matches.search ?? []) {
    if (!/^Q\d+$/.test(String(hit.id))) continue;
    if (String(hit.label ?? '').toLocaleLowerCase('en') !== wanted) continue;
    const entity = await entityFor(hit.id);
    const coordinate = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!coordinate || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) continue;
    if (distanceKm(candidate.lat, candidate.lng, coordinate.latitude, coordinate.longitude) <= MATCH_RADIUS_KM) return { qid: hit.id, entity };
  }
  throw new Error('no Wikidata item matches ' + candidate.name + ' by name and location; record its QID in the candidate source');
}

async function commonsPhoto(id, commonsFile) {
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|extmetadata', titles: 'File:' + commonsFile });
  const result = await cachedJson('commons-' + id, 'https://commons.wikimedia.org/w/api.php?' + params);
  const page = Object.values(result.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const metadata = info.extmetadata ?? {};
  const license = permissiveLicense(metadata.LicenseShortName?.value ?? '');
  const author = plainText(metadata.Artist?.value);
  const licenseUrl = String(metadata.LicenseUrl?.value ?? '').replace(/^http:\/\//, 'https://');
  const url = String(info.thumburl ?? info.url ?? '').replace(/^http:\/\//, 'https://');
  const width = info.thumbwidth ?? info.width;
  const height = info.thumbheight ?? info.height;
  const sized = Number.isInteger(width) && width >= 1 && Number.isInteger(height) && height >= 1;
  if (!sized || !license || !author || !licenseUrl.startsWith('https://') || !url.startsWith('https://')) return null;
  return { url, width, height, author, license, license_url: licenseUrl, source_page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(commonsFile.replaceAll(' ', '_')) };
}

async function researchPlace(id) {
  const candidate = candidateById.get(id);
  if (!candidate) throw new Error('unknown candidate place ID');
  const target = resolve(output, id + '.json');
  // Curators edit drafts in place: never replace one unless asked to.
  if (!force && await exists(target)) return 'kept';
  const { qid, entity } = await resolveEntity(id, candidate);
  if (!entity) throw new Error('no Wikidata entity found');
  const title = entity.sitelinks?.enwiki?.title ?? candidate.name;
  let wikipedia = null;
  if (title) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url', titles: title }).toString();
    wikipedia = await cachedJson('wikipedia-' + id, url);
  }
  const commonsFile = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const photo = commonsFile ? await commonsPhoto(id, commonsFile) : null;
  const page = Object.values(wikipedia?.query?.pages ?? {})[0];
  const facts = (entity.claims?.P166 ?? []).slice(0, 10).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const wikidataSource = 'https://www.wikidata.org/wiki/' + qid;
  const sources = [wikidataSource, page?.fullurl, candidate.source].filter((source) => typeof source === 'string' && source.startsWith('https://'));
  const draft = { place_id: id, country: candidate.country, label: entity.labels?.en?.value ?? candidate.name ?? id, description: entity.descriptions?.en?.value ?? null, wikipedia_extract: page?.extract ?? null, wikipedia_source: page?.fullurl ?? null, wikidata_source: wikidataSource, notable_award_qids: facts, photo, note: null, topic_key: null, sources, review_status: 'draft' };
  await writeFile(target, JSON.stringify(draft, null, 2) + '\n');
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
