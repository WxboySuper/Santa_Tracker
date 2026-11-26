import { unzipSync } from 'fflate';
import shapefile from 'shapefile';
import requiredAdmin1Units from '../../packages/route-engine/src/generate/admin1-units.json' with { type: 'json' };

export const ADMIN1_BOUNDARY_SOURCE = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip';
const ADMIN1_COUNTRIES = new Set(['US', 'CA', 'AU']);
const REQUIRED_ADMIN1_CODES = new Set(Object.values(requiredAdmin1Units).flat());
const GEOMETRY_TOLERANCE = 1e-9;

function clean(value) {
  return typeof value === 'string' ? value.replaceAll('\0', '').trim() : '';
}

function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function crossProduct(point, start, end) {
  return (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
}

function dotProduct(point, start, end) {
  return (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
}

function segmentLengthSquared(start, end) {
  return (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
}

function pointOnSegment(point, start, end) {
  if (!validPoint(point)) return false;
  if (!validPoint(start)) return false;
  if (!validPoint(end)) return false;
  if (Math.abs(crossProduct(point, start, end)) > GEOMETRY_TOLERANCE) return false;
  const dot = dotProduct(point, start, end);
  if (dot < -GEOMETRY_TOLERANCE) return false;
  const lengthSquared = segmentLengthSquared(start, end);
  if (lengthSquared < GEOMETRY_TOLERANCE ** 2) return Math.hypot(point[0] - start[0], point[1] - start[1]) < GEOMETRY_TOLERANCE;
  return dot <= lengthSquared + GEOMETRY_TOLERANCE;
}

function crossesRay(point, start, end) {
  const startAbove = start[1] > point[1];
  const endAbove = end[1] > point[1];
  if (startAbove === endAbove) return false;
  const crossingLongitude = ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0];
  return point[0] < crossingLongitude;
}

function pointInRing(point, ring) {
  if (!validPoint(point) || !Array.isArray(ring)) return false;
  let inside = false;
  for (let index = 0, prior = ring.length - 1; index < ring.length; prior = index++) {
    const start = ring[prior];
    const end = ring[index];
    if (!validPoint(start) || !validPoint(end)) continue;
    if (pointOnSegment(point, start, end)) return true;
    if (crossesRay(point, start, end)) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings) {
  if (!Array.isArray(rings)) return false;
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
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
  if (!REQUIRED_ADMIN1_CODES.has(code)) return undefined;
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

async function downloadAdmin1Archive() {
  const response = await fetch(ADMIN1_BOUNDARY_SOURCE);
  if (!response.ok) throw new Error(`Natural Earth admin-1 download failed: ${response.status}`);
  return unzipSync(new Uint8Array(await response.arrayBuffer()));
}

async function openAdmin1Source(files) {
  const shpName = Object.keys(files).find((name) => name.endsWith('.shp'));
  const dbfName = Object.keys(files).find((name) => name.endsWith('.dbf'));
  if (!shpName) throw new Error('Natural Earth admin-1 archive is missing its .shp file');
  if (!dbfName) throw new Error('Natural Earth admin-1 archive is missing its .dbf file');
  return shapefile.open(files[shpName].buffer, files[dbfName].buffer, { encoding: 'utf-8' });
}

function sortAdmin1Features(features) {
  return features.sort((left, right) => compareText(left.country, right.country) || compareText(left.code, right.code));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export async function loadAdmin1Features() {
  const archive = await downloadAdmin1Archive();
  const source = await openAdmin1Source(archive);
  return sortAdmin1Features(await readAdmin1Features(source));
}

function requireCandidate(place) {
  if (!place || typeof place !== 'object') throw new TypeError('Admin-1 lookup requires a candidate object');
  return place;
}

function candidatePoint(place) {
  const coordinates = [
    { name: 'latitude', value: place.lat, minimum: -90, maximum: 90 },
    { name: 'longitude', value: place.lng, minimum: -180, maximum: 180 },
  ];
  for (const coordinate of coordinates) {
    if (!Number.isFinite(coordinate.value)) {
      throw new TypeError(`Candidate ${place.id ?? '(unknown)'} has a non-finite ${coordinate.name}`);
    }
    if (coordinate.value < coordinate.minimum || coordinate.value > coordinate.maximum) {
      throw new RangeError(`Candidate ${place.id ?? '(unknown)'} ${coordinate.name} is out of range`);
    }
  }
  return [place.lng, place.lat];
}

function requireAdmin1Features(features) {
  if (!Array.isArray(features)) throw new TypeError('Admin-1 lookup requires a feature array');
  return features;
}

function findAdmin1Feature(place, point, features) {
  return features.find((feature) => feature?.country === place.country && pointInFeature(point, feature));
}

export function admin1CodeAt(candidate, featureRows) {
  const place = requireCandidate(candidate);
  if (!ADMIN1_COUNTRIES.has(place.country)) return undefined;
  const point = candidatePoint(place);
  const features = requireAdmin1Features(featureRows);
  return findAdmin1Feature(place, point, features)?.code ?? null;
}
