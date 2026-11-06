import { writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import shapefile from 'shapefile';
import lookup from '@photostructure/tz-lookup';
import { coordinatesFromGeometry } from './refresh-validation.mjs';

const url = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_populated_places_simple.zip';
const response = await fetch(url);
if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const shp = files['ne_10m_populated_places_simple.shp'];
const dbf = files['ne_10m_populated_places_simple.dbf'];
if (!shp || !dbf) throw new Error('Natural Earth archive is missing its shapefile');
const source = await shapefile.open(shp.buffer, dbf.buffer, { encoding: 'utf-8' });
const places = [];
for (;;) {
  const item = await source.read();
  if (item.done) break;
  const properties = item.value.properties;
  const coordinates = coordinatesFromGeometry(item.value?.geometry);
  if (!properties.name || !properties.adm0name || !properties.ne_id) continue;
  if (!coordinates) continue;
  const { lat, lng } = coordinates;
  places.push({
    id: `ne-${properties.ne_id}`, name: properties.name, country: properties.adm0name,
    lat, lng, population: properties.pop_max, worldCity: Boolean(properties.worldcity),
    timezone: lookup(lat, lng),
  });
}
places.sort((a, b) => a.id.localeCompare(b.id, 'en'));
await writeFile(new URL('./data/places.json', import.meta.url), `${JSON.stringify(places)}\n`);
process.stdout.write(`Wrote ${places.length} populated places\n`);
