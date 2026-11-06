import { readFile, writeFile } from 'node:fs/promises';
import lookup from '@photostructure/tz-lookup';
import { claim, countryIdFor, timezoneCorrection, validEarthPoint } from './refresh-validation.mjs';

const seeds = JSON.parse(await readFile(new URL('./data/curated-seeds.json', import.meta.url), 'utf8'));
const ids = Object.values(seeds).flat();
if (new Set(ids).size !== ids.length) throw new Error('Duplicate curated QID');

async function entities(idsToFetch) {
  const result = {};
  for (let i = 0; i < idsToFetch.length; i += 40) {
    const params = new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: idsToFetch.slice(i, i + 40).join('|'), props: 'labels|claims', languages: 'en' });
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'SantaRouteGenerator/1.0 (https://github.com/WxboySuper/Santa_Tracker)' },
    });
    if (!response.ok) throw new Error(`Wikidata request failed: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    Object.assign(result, data.entities);
  }
  return result;
}

const items = await entities(ids);
const administrativeIds = [...new Set(ids.map((id) => claim(items[id], 'P131')?.id).filter(Boolean))];
const administrativeEntities = await entities(administrativeIds);
const countryIds = [...new Set(ids.map((id) => countryIdFor(items[id], administrativeEntities)).filter(Boolean))];
const countries = await entities(countryIds);
const places = [];
for (const [category, categoryIds] of Object.entries(seeds)) {
  for (const id of categoryIds) {
    const entity = items[id];
    const point = claim(entity, 'P625');
    const countryId = countryIdFor(entity, administrativeEntities);
    const name = entity?.labels?.en?.value;
    const country = countries[countryId]?.labels?.en?.value;
    if (!name || !country || !validEarthPoint(point)) {
      throw new Error(`${id} lacks an English label, country, or Earth coordinates`);
    }
    const { latitude: lat, longitude: lng } = point;
    const lookedUpTimezone = lookup(lat, lng);
    const timezone = timezoneCorrection(id) ?? lookedUpTimezone;
    places.push({ id, name, country, lat, lng, timezone, category, source: `https://www.wikidata.org/wiki/${id}` });
  }
}
await writeFile(new URL('./data/curated.json', import.meta.url), `${JSON.stringify(places, null, 2)}\n`);
console.log(`Wrote ${places.length} curated places`);
