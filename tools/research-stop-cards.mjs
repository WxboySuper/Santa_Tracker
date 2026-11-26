import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const cacheDir = resolve('.cache/stop-card-research');
const output = resolve(args[0] ?? 'content/drafts');
const requested = args.slice(1);
if (!requested.length) throw new Error('Usage: node tools/research-stop-cards.mjs <output-dir> <candidate place ID> [place ID ...]');
const candidates = await Promise.all(['places.json', 'curated.json'].map(async (file) => JSON.parse(await readFile(new URL('./route-generator/data/' + file, import.meta.url), 'utf8'))));
const candidateById = new Map(candidates.flat().map((place) => [place.id, place]));
const userAgent = 'SantaTrackerStopCardResearch/1.0 (candidate content research tool)';
await mkdir(cacheDir, { recursive: true });
await mkdir(output, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
for (const id of [...new Set(requested)]) {
  const candidate = candidateById.get(id);
  const qid = /^Q\d+$/.test(id) ? id : candidate?.source?.match(/wikidata\.org\/wiki\/(Q\d+)/)?.[1];
  const entityResult = qid ? await cachedJson('wikidata-' + qid, 'https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json') : null;
  const entity = entityResult?.entities?.[qid];
  if (!entity && !candidate) throw new Error('Unknown candidate place ID: ' + id);
  const title = entity?.sitelinks?.enwiki?.title ?? candidate?.name;
  let wikipedia = null;
  if (title) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url', titles: title }).toString();
    wikipedia = await cachedJson('wikipedia-' + id, url);
  }
  const commonsFile = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  let photo = null;
  if (commonsFile) {
    const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|extmetadata', titles: 'File:' + commonsFile });
    const result = await cachedJson('commons-' + id, 'https://commons.wikimedia.org/w/api.php?' + params);
    const page = Object.values(result.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    const metadata = info?.extmetadata ?? {};
    const license = metadata.LicenseShortName?.value ?? '';
    const author = metadata.Artist?.value?.replace(/<[^>]+>/g, '').trim() ?? '';
    const normalizedLicense = license.startsWith('CC0') ? 'CC0' : /public domain/i.test(license) ? 'Public domain' : /^CC BY-SA/.test(license) ? 'CC BY-SA' : /^CC BY/.test(license) ? 'CC BY' : null;
    if (info && normalizedLicense && author && metadata.LicenseUrl?.value) photo = { url: info.thumburl ?? info.url, width: info.thumbwidth ?? info.width, height: info.thumbheight ?? info.height, author, license: normalizedLicense, license_url: metadata.LicenseUrl.value, source_page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(commonsFile.replaceAll(' ', '_')) };
  }
  const pages = Object.values(wikipedia?.query?.pages ?? {});
  const page = pages[0];
  const facts = (entity?.claims?.P166 ?? []).slice(0, 10).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const wikidataSource = qid ? 'https://www.wikidata.org/wiki/' + qid : candidate.source;
  const draft = { place_id: id, country: candidate?.country ?? null, label: entity?.labels?.en?.value ?? candidate?.name ?? id, description: entity?.descriptions?.en?.value ?? null, wikipedia_extract: page?.extract ?? null, wikipedia_source: page?.fullurl ?? null, wikidata_source: wikidataSource, notable_award_qids: facts, photo, note: null, topic_key: null, sources: [wikidataSource, ...(page?.fullurl ? [page.fullurl] : [])], review_status: 'draft' };
  await writeFile(resolve(output, id + '.json'), JSON.stringify(draft, null, 2) + '\n');
}
console.log('Wrote ' + new Set(requested).size + ' research drafts to ' + output);
