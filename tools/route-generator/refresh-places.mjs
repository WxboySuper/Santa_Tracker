import { writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import shapefile from 'shapefile';
import lookup from '@photostructure/tz-lookup';

const url = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_populated_places_simple.zip';
const response = await fetch(url);
if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const shp = files['ne_10m_populated_places_simple.shp'];
const dbf = files['ne_10m_populated_places_simple.dbf'];
if (!shp || !dbf) throw new Error('Natural Earth archive is missing its shapefile');
const source = await shapefile.open(shp.buffer, dbf.buffer);
const places = [];
for (;;) {
  const item = await source.read();
  if (item.done) break;
  const p = item.value.properties;
  const [lng, lat] = item.value.geometry.coordinates;
  if (!p.name || !p.adm0name || !p.ne_id) continue;
  places.push({
    id: `ne-${p.ne_id}`, name: p.name, country: p.adm0name,
    lat, lng, population: p.pop_max, worldCity: Boolean(p.worldcity),
    timezone: lookup(lat, lng),
  });
}
places.sort((a, b) => a.id.localeCompare(b.id, 'en'));
await writeFile(new URL('./data/places.json', import.meta.url), `${JSON.stringify(places)}\n`);
console.log(`Wrote ${places.length} populated places`);
