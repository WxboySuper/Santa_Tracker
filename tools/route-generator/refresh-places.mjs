import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import shapefile from 'shapefile';
import lookup from '@photostructure/tz-lookup';
import { christmasUtcOffset, coordinatesFromGeometry, countryCodeForName, timezoneForCandidate, withinCountryBounds } from './refresh-validation.mjs';

const url = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_populated_places_simple.zip';
const response = await fetch(url);
if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const shp = files['ne_10m_populated_places_simple.shp'];
const dbf = files['ne_10m_populated_places_simple.dbf'];
if (!shp || !dbf) throw new Error('Natural Earth archive is missing its shapefile');
const source = await shapefile.open(shp.buffer, dbf.buffer, { encoding: 'utf-8' });
const curated = JSON.parse(await readFile(new URL('./data/curated.json', import.meta.url), 'utf8'));
const normalizeName = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const curatedByName = new Map();
for (const place of curated) {
  const key = `${place.country}:${normalizeName(place.name)}`;
  if (!curatedByName.has(key)) curatedByName.set(key, []);
  curatedByName.get(key).push(place);
}
const places = [];
for (;;) {
  const item = await source.read();
  if (item.done) break;
  const properties = item.value.properties;
  const coordinates = coordinatesFromGeometry(item.value?.geometry);
  if (!properties.name || !properties.adm0name || !properties.ne_id) continue;
  if (!coordinates) continue;
  const { lat, lng } = coordinates;
  const id = `ne-${properties.ne_id}`;
  const country = countryCodeForName(properties.adm0name);
  if (!withinCountryBounds(country, lat, lng)) continue;
  const key = `${country}:${normalizeName(properties.name)}`;
  if ((curatedByName.get(key) ?? []).some((place) => distanceKm({ lat, lng }, place) < 100)) continue;
  const timezone = timezoneForCandidate({ id, country, lookedUpTimezone: lookup(lat, lng), lat, lng });
  places.push({
    id, name: properties.name, country,
    lat, lng, population: properties.pop_max, worldCity: Boolean(properties.worldcity),
    timezone, utcOffsetMinutes: christmasUtcOffset(timezone),
    source: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/',
  });
}
places.sort((a, b) => a.id.localeCompare(b.id, 'en'));
const uniquePlaces = [];
for (const place of places) {
  const key = `${place.country}:${normalizeName(place.name)}`;
  const duplicateIndex = uniquePlaces.findIndex((candidate) => `${candidate.country}:${normalizeName(candidate.name)}` === key
    && distanceKm(place, candidate) < 100);
  if (duplicateIndex < 0) {
    uniquePlaces.push(place);
  } else if ((place.population ?? 0) > (uniquePlaces[duplicateIndex].population ?? 0)) {
    uniquePlaces[duplicateIndex] = place;
  }
}
uniquePlaces.sort((a, b) => a.id.localeCompare(b.id, 'en'));
await writeFile(new URL('./data/places.json', import.meta.url), `${JSON.stringify(uniquePlaces)}\n`);
process.stdout.write(`Wrote ${uniquePlaces.length} populated places\n`);

function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
