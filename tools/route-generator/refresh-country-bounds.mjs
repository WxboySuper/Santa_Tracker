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

const mapUnitsUrl = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_map_units.zip';
const mapUnitsResponse = await fetch(mapUnitsUrl);
if (!mapUnitsResponse.ok) throw new Error(`Natural Earth map-unit download failed: ${mapUnitsResponse.status}`);
const mapUnitsFiles = unzipSync(new Uint8Array(await mapUnitsResponse.arrayBuffer()));
const mapUnitsShape = mapUnitsFiles['ne_10m_admin_0_map_units.shp'];
const mapUnitsDbf = mapUnitsFiles['ne_10m_admin_0_map_units.dbf'];
if (!mapUnitsShape || !mapUnitsDbf) throw new Error('Natural Earth archive is missing its map-unit shapefile');
const mapUnits = await shapefile.open(mapUnitsShape.buffer, mapUnitsDbf.buffer, { encoding: 'utf-8' });
for (;;) {
  const item = await mapUnits.read();
  if (item.done) break;
  const properties = item.value.properties;
  const country = String(properties.ISO_A2_EH ?? properties.ISO_A2 ?? '').replaceAll('\0', '').trim();
  if (!/^[A-Z]{2}$/.test(country) || boundsByCountry[country]) continue;
  const bounds = boundsByCountry[country] ?? { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };
  visitCoordinates(item.value.geometry?.coordinates, (lng, lat) => {
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
  });
  boundsByCountry[country] = bounds;
}

// Natural Earth omits northern Cyprus, clips a coastal city in Flying Fish
// Cove and Cape Horn, and excludes remote sovereign territories from several
// country envelopes.
boundsByCountry.CY.maxLat = Math.max(boundsByCountry.CY.maxLat, 35.7);
boundsByCountry.CX.maxLat = Math.max(boundsByCountry.CX.maxLat, -10.42);
boundsByCountry.CL.minLat = Math.min(boundsByCountry.CL.minLat, -56.1);
boundsByCountry.AU.minLng = Math.min(boundsByCountry.AU.minLng, 73);
boundsByCountry.US.minLat = Math.min(boundsByCountry.US.minLat, 0);
boundsByCountry.GB.minLat = Math.min(boundsByCountry.GB.minLat, -54.5);
boundsByCountry.GB.minLng = Math.min(boundsByCountry.GB.minLng, -37);
boundsByCountry.FR.minLat = Math.min(boundsByCountry.FR.minLat, -49.5);
boundsByCountry.FR.maxLng = Math.max(boundsByCountry.FR.maxLng, 69.5);

if (Object.keys(boundsByCountry).length < 150) throw new Error('Country-bound snapshot is incomplete');
await writeFile(new URL('./data/country-bounds.json', import.meta.url), `${JSON.stringify({
  source: 'Natural Earth 1:10m Admin 0 Countries, downloaded 2026-11-24',
  sourceUrl: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/ and https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ne_10m_admin_0_map_units/',
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
