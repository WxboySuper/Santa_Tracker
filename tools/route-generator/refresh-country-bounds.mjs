import { writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import shapefile from 'shapefile';

const url = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip';
const response = await fetch(url);
if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const shape = files['ne_10m_admin_0_countries.shp'];
const dbf = files['ne_10m_admin_0_countries.dbf'];
if (!shape || !dbf) throw new Error('Natural Earth archive is missing its country shapefile');

const source = await shapefile.open(shape.buffer, dbf.buffer, { encoding: 'utf-8' });
const boundsByCountry = {};
for (;;) {
  const item = await source.read();
  if (item.done) break;
  const properties = item.value.properties;
  const country = String(properties.ISO_A2_EH ?? properties.ISO_A2 ?? '').replaceAll('\0', '').trim();
  if (!/^[A-Z]{2}$/.test(country)) continue;
  const bounds = boundsByCountry[country] ?? { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };
  visitCoordinates(item.value.geometry?.coordinates, (lng, lat) => {
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
  });
  boundsByCountry[country] = bounds;
}

if (Object.keys(boundsByCountry).length < 150) throw new Error('Country-bound snapshot is incomplete');
await writeFile(new URL('./data/country-bounds.json', import.meta.url), `${JSON.stringify({
  source: 'Natural Earth 1:10m Admin 0 Countries, downloaded 2026-11-24',
  sourceUrl: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/',
  boundsByCountry,
}, null, 2)}\n`);
process.stdout.write(`Wrote bounding boxes for ${Object.keys(boundsByCountry).length} countries\n`);

function visitCoordinates(value, visit) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    visit(value[0], value[1]);
    return;
  }
  for (const child of value) visitCoordinates(child, visit);
}
