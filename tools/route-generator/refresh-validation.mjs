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

function validCoordinates(lng, lat) {
  if (!Number.isFinite(lng)) return false;
  if (!Number.isFinite(lat)) return false;
  if (lng < -180) return false;
  if (lng > 180) return false;
  if (lat < -90) return false;
  return lat <= 90;
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
  if (!Number.isFinite(point.latitude)) return false;
  if (!Number.isFinite(point.longitude)) return false;
  if (point.latitude < -90 || point.latitude > 90) return false;
  return point.longitude >= -180 ? point.longitude <= 180 : false;
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
  const instant = Date.UTC(2026, 11, 25);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return Math.round((Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - instant) / 60_000);
}

export function withinCountryBounds(country, lat, lng) {
  const bounds = countryBoundsData.boundsByCountry[country];
  return Boolean(bounds
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= bounds.minLat && lat <= bounds.maxLat
    && lng >= bounds.minLng && lng <= bounds.maxLng);
}
