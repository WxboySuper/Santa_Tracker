import { readFileSync } from 'node:fs';

const countryCodeData = JSON.parse(readFileSync(new URL('./data/country-codes.json', import.meta.url), 'utf8'));
const countryZoneData = JSON.parse(readFileSync(new URL('./data/country-zones.json', import.meta.url), 'utf8'));
const countryBoundsData = JSON.parse(readFileSync(new URL('./data/country-bounds.json', import.meta.url), 'utf8'));
const draftOverrides = JSON.parse(readFileSync(new URL('./data/route-2026-overrides.json', import.meta.url), 'utf8'));
let localOverrides = {};
try {
  localOverrides = JSON.parse(readFileSync(new URL('./overrides.json', import.meta.url), 'utf8'));
} catch {
  localOverrides = {};
}
const routeOverrides = {
  ...draftOverrides,
  ...localOverrides,
  timezone: { ...draftOverrides.timezone, ...localOverrides.timezone },
};

export function claim(entity, property) {
  return entity?.claims?.[property]?.find((entry) => entry.rank !== 'deprecated' && entry.mainsnak?.datavalue)?.mainsnak.datavalue.value;
}

export function countryIdFor(entity, administrativeEntities) {
  const administrativeId = claim(entity, 'P131')?.id;
  const administrativeCountry = claim(administrativeEntities[administrativeId], 'P17')?.id;
  return administrativeCountry ?? claim(entity, 'P17')?.id;
}

function withinRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validCoordinates(lng, lat) {
  return withinRange(lng, -180, 180) && withinRange(lat, -90, 90);
}

export function coordinatesFromGeometry(geometry) {
  if (!geometry) return undefined;
  if (geometry.type !== 'Point') return undefined;
  if (!Array.isArray(geometry.coordinates)) return undefined;
  const [lng, lat] = geometry.coordinates;
  if (!validCoordinates(lng, lat)) return undefined;
  return { lat, lng };
}

export function validEarthPoint(point) {
  if (!point) return false;
  if (point.globe !== 'http://www.wikidata.org/entity/Q2') return false;
  return withinRange(point.latitude, -90, 90) && withinRange(point.longitude, -180, 180);
}

export function timezoneCorrection(id) {
  const corrections = { Q5788: 'Asia/Amman' };
  if (corrections[id]) return corrections[id];
  return undefined;
}

function normalizedCountryKey(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function countryCodeForName(value) {
  if (/^[A-Z]{2}$/.test(value)) return value;
  const code = countryCodeData.aliases[normalizedCountryKey(value)];
  if (!code) throw new Error(`No ISO 3166-1 alpha-2 mapping for country ${value}`);
  return code;
}

function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function timezoneForId(id) {
  return routeOverrides.timezone?.[id] ?? timezoneCorrection(id);
}

function validateTimezoneOverride(explicit, allowed, country, id) {
  if (!allowed.includes(explicit)) throw new Error(`Timezone override ${explicit} does not belong to ${country} (${id})`);
  return explicit;
}

function nearestTimezone({ id, country, lat, lng }) {
  const points = countryZoneData.zonePointsByCountry[country] ?? [];
  const first = points[0];
  if (!first) throw new Error(`No timezone representative point for ${country} (${id})`);
  const candidate = { lat, lng };
  return points.reduce((best, point) => distanceKm(candidate, point) < distanceKm(candidate, best) ? point : best, first).timezone;
}

export function timezoneForCandidate({ id, country, lookedUpTimezone, lat, lng }) {
  const allowed = countryZoneData.zonesByCountry[country];
  if (!allowed) throw new Error(`No IANA country timezone table for ${country} (${id})`);
  const explicit = timezoneForId(id);
  if (explicit) return validateTimezoneOverride(explicit, allowed, country, id);
  if (allowed.includes(lookedUpTimezone)) return lookedUpTimezone;
  return nearestTimezone({ id, country, lat, lng });
}

export function christmasUtcOffset(timezone) {
  const offset = countryZoneData.utcOffsetsByTimezone[timezone];
  if (!Number.isFinite(offset)) throw new Error(`No committed Christmas 2026 offset for timezone ${timezone}`);
  return offset;
}

export function withinCountryBounds(country, lat, lng) {
  const bounds = countryBoundsData.boundsByCountry[country];
  return Boolean(bounds)
    && withinRange(lat, bounds.minLat, bounds.maxLat)
    && withinRange(lng, bounds.minLng, bounds.maxLng);
}
