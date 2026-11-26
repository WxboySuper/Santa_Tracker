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
  const geometry = feature?.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  return false;
}

function normalizeAdmin1Feature(value) {
  if (!value || typeof value !== 'object') return undefined;
  const properties = value.properties ?? {};
  const country = clean(properties.iso_a2);
  const code = clean(properties.iso_3166_2);
  if (!ADMIN1_COUNTRIES.has(country)) return undefined;
  if (!code) return undefined;
  if (!value.geometry) return undefined;
  return { country, code, name: clean(properties.name), geometry: value.geometry };
}

async function readAdmin1Features(source) {
  const features = [];
  for (;;) {
    const item = await source.read();
    if (item.done) break;
    const feature = normalizeAdmin1Feature(item.value);
    if (feature) features.push(feature);
  }
  return features;
}

export async function loadAdmin1Features() {
  const response = await fetch(ADMIN1_BOUNDARY_SOURCE);
  if (!response.ok) throw new Error(`Natural Earth admin-1 download failed: ${response.status}`);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const shpName = Object.keys(files).find((name) => name.endsWith('.shp'));
  const dbfName = Object.keys(files).find((name) => name.endsWith('.dbf'));
  if (!shpName || !dbfName) throw new Error('Natural Earth admin-1 archive is missing its shapefile');
  const source = await shapefile.open(files[shpName].buffer, files[dbfName].buffer, { encoding: 'utf-8' });
  const features = await readAdmin1Features(source);
  return features.sort((left, right) => left.country.localeCompare(right.country) || left.code.localeCompare(right.code));
}

export function admin1CodeAt(place, features) {
  if (!place || typeof place !== 'object') throw new TypeError('Admin-1 lookup requires a candidate object');
  if (!ADMIN1_COUNTRIES.has(place.country)) return undefined;
  if (!Number.isFinite(place.lat)) throw new TypeError(`Candidate ${place.id ?? '(unknown)'} has a non-finite latitude`);
  if (!Number.isFinite(place.lng)) throw new TypeError(`Candidate ${place.id ?? '(unknown)'} has a non-finite longitude`);
  if (place.lat < -90 || place.lat > 90) throw new RangeError(`Candidate ${place.id ?? '(unknown)'} latitude is out of range`);
  if (place.lng < -180 || place.lng > 180) throw new RangeError(`Candidate ${place.id ?? '(unknown)'} longitude is out of range`);
  if (!Array.isArray(features)) throw new TypeError('Admin-1 lookup requires a feature array');
  const point = [place.lng, place.lat];
  return features.find((feature) => feature.country === place.country && pointInFeature(point, feature))?.code ?? null;
}
