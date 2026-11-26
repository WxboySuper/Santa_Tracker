import { unzipSync } from 'fflate';
import shapefile from 'shapefile';

export const ADMIN1_BOUNDARY_SOURCE = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip';
const ADMIN1_COUNTRIES = new Set(['US', 'CA', 'AU']);

function clean(value) {
  return typeof value === 'string' ? value.replaceAll('\0', '').trim() : '';
}

function pointOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < -1e-9) return false;
  const lengthSquared = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  if (lengthSquared < 1e-18) return Math.hypot(point[0] - start[0], point[1] - start[1]) < 1e-9;
  return dot <= lengthSquared + 1e-9;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, prior = ring.length - 1; index < ring.length; prior = index++) {
    const start = ring[prior];
    const end = ring[index];
    if (!start || !end) continue;
    if (pointOnSegment(point, start, end)) return true;
    const crosses = (start[1] > point[1]) !== (end[1] > point[1])
      && point[0] < ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings) {
  const [outer, ...holes] = rings;
  return !!outer && pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
}

function pointInFeature(point, feature) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

export async function loadAdmin1Features() {
  const response = await fetch(ADMIN1_BOUNDARY_SOURCE);
  if (!response.ok) throw new Error(`Natural Earth admin-1 download failed: ${response.status}`);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const shpName = Object.keys(files).find((name) => name.endsWith('.shp'));
  const dbfName = Object.keys(files).find((name) => name.endsWith('.dbf'));
  if (!shpName || !dbfName) throw new Error('Natural Earth admin-1 archive is missing its shapefile');
  const source = await shapefile.open(files[shpName].buffer, files[dbfName].buffer, { encoding: 'utf-8' });
  const features = [];
  for (;;) {
    const item = await source.read();
    if (item.done) break;
    const properties = item.value.properties;
    const country = clean(properties.iso_a2);
    const code = clean(properties.iso_3166_2);
    if (!ADMIN1_COUNTRIES.has(country) || !code || !item.value.geometry) continue;
    features.push({ country, code, name: clean(properties.name), geometry: item.value.geometry });
  }
  return features.sort((left, right) => left.country.localeCompare(right.country) || left.code.localeCompare(right.code));
}

export function admin1CodeAt(place, features) {
  if (!ADMIN1_COUNTRIES.has(place.country)) return undefined;
  const point = [place.lng, place.lat];
  return features.find((feature) => feature.country === place.country && pointInFeature(point, feature))?.code ?? null;
}
