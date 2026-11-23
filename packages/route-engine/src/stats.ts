import type { Route } from '@santa-tracker/contracts';
import { haversineKm } from './geo';

/** Immutable location details joined to a route stop by `id`. */
export type RouteStatsLocation = {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  timezone: string;
  coordinates: { lat: number; lng: number };
  population?: number;
};

export type JourneyStats = {
  distanceTravelledKm: number;
  distanceRemainingKm: number;
  stopsVisited: number;
  stopsRemaining: number;
  countriesVisited: string[];
  timeZonesCrossed: number;
  elapsedFlightTimeMs: number;
  remainingFlightTimeMs: number;
  elapsedJourneyTimeMs: number;
  remainingJourneyTimeMs: number;
  currentSpeedKmh: number;
  averageSpeedKmh: number;
  /** Magical estimates, not measured delivery telemetry. */
  presentsDelivered: number;
  cookiesEaten: number;
  reindeerSnacks: number;
  chimneysVisited: number;
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const nameToCode = makeCountryNameIndex();
const validCountryCodes = new Set(nameToCode.values());

/** Derive route and warm, explicitly imaginary estimates from a route snapshot and instant. */
export function deriveJourneyStats(
  route: Route,
  now: Date | number,
  locations: readonly RouteStatsLocation[],
): JourneyStats {
  const nowMs = timestampMs(now);
  const stops = route.stops;
  if (stops.length === 0) return emptyStats();
  const locationById = new Map(locations.map(location => [location.id, location]));
  const resolved = stops.map(stop => {
    const location = locationById.get(stop.locationId);
    if (!location) throw new RangeError(`Missing stats location for route stop ${stop.locationId}`);
    return location;
  });
  const firstArrival = Date.parse(stops[0]!.arrivalIso);
  const lastDeparture = Date.parse(stops.at(-1)!.departureIso);
  const boundedTime = Math.min(lastDeparture, Math.max(firstArrival, nowMs));
  const visitedIndexes = stops.flatMap((stop, index) => Date.parse(stop.arrivalIso) <= nowMs ? [index] : []);
  const countriesVisited = [...new Set(visitedIndexes.map(index => normalizeCountryCode(resolved[index]!)).filter(isString))];
  const timezones = new Set<string>();
  for (const index of visitedIndexes) timezones.add(resolved[index]!.timezone);

  let totalDistanceKm = 0;
  let distanceTravelledKm = 0;
  let elapsedFlightTimeMs = 0;
  let remainingFlightTimeMs = 0;
  let currentSpeedKmh = 0;
  for (let index = 0; index < stops.length - 1; index++) {
    const from = resolved[index]!;
    const to = resolved[index + 1]!;
    const distanceKm = haversineKm(from.coordinates, to.coordinates);
    const startMs = Date.parse(stops[index]!.departureIso);
    const endMs = Date.parse(stops[index + 1]!.arrivalIso);
    const durationMs = Math.max(0, endMs - startMs);
    const progress = durationMs === 0 ? (boundedTime >= endMs ? 1 : 0) : Math.min(1, Math.max(0, (boundedTime - startMs) / durationMs));
    totalDistanceKm += distanceKm;
    distanceTravelledKm += distanceKm * progress;
    elapsedFlightTimeMs += Math.min(durationMs, Math.max(0, boundedTime - startMs));
    remainingFlightTimeMs += Math.min(durationMs, Math.max(0, endMs - boundedTime));
    if (durationMs > 0 && boundedTime >= startMs && boundedTime < endMs) currentSpeedKmh = distanceKm / (durationMs / 3_600_000);
  }

  const elapsedJourneyTimeMs = Math.max(0, boundedTime - firstArrival);
  const remainingJourneyTimeMs = Math.max(0, lastDeparture - boundedTime);
  const stopsVisited = visitedIndexes.length;
  // The route file contains population only in location metadata. Treat absent values as 0.
  // 20% of each visited stop's population is a deliberately theatrical present estimate.
  const populationServed = visitedIndexes.reduce((sum, index) => sum + Math.max(0, resolved[index]!.population ?? 0), 0);
  const presentsDelivered = Math.floor(populationServed * 0.2);
  return {
    distanceTravelledKm,
    distanceRemainingKm: Math.max(0, totalDistanceKm - distanceTravelledKm),
    stopsVisited,
    stopsRemaining: stops.length - stopsVisited,
    countriesVisited,
    timeZonesCrossed: timezones.size,
    elapsedFlightTimeMs,
    remainingFlightTimeMs,
    elapsedJourneyTimeMs,
    remainingJourneyTimeMs,
    currentSpeedKmh,
    averageSpeedKmh: elapsedFlightTimeMs > 0 ? distanceTravelledKm / (elapsedFlightTimeMs / 3_600_000) : 0,
    presentsDelivered,
    cookiesEaten: presentsDelivered * 2,
    reindeerSnacks: stopsVisited * 9,
    chimneysVisited: Math.ceil(presentsDelivered / 4),
  };
}

/** Format raw numeric stats for display without baking a locale into route logic. */
export function formatStat(value: number, locale: string | string[] = 'en'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function normalizeCountryCode(location: RouteStatsLocation): string | undefined {
  const explicit = location.countryCode?.trim().toUpperCase();
  if (explicit) {
    const normalizedCode = codeAliases[explicit] ?? explicit;
    if (validCountryCodes.has(normalizedCode)) return normalizedCode;
  }
  const normalized = normalizeCountryName(location.country);
  return aliases[normalized] ?? nameToCode.get(normalized);
}

function makeCountryNameIndex(): Map<string, string> {
  const result = new Map<string, string>();
  for (let first = 65; first <= 90; first++) for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    if (code === 'UK') continue;
    const name = regionNames.of(code);
    if (name && name !== code) result.set(normalizeCountryName(name), code);
  }
  return result;
}

function normalizeCountryName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

const aliases: Record<string, string> = {
  'america': 'US', 'great britain': 'GB', 'uk': 'GB', 'united kingdom': 'GB', 'usa': 'US', 'united states of america': 'US',
  'south korea': 'KR', 'north korea': 'KP', 'russia': 'RU', 'ivory coast': 'CI', 'czech republic': 'CZ',
  'vatican city': 'VA', 'taiwan': 'TW', 'palestine': 'PS',
};

const codeAliases: Record<string, string> = { UK: 'GB', EL: 'GR' };

function emptyStats(): JourneyStats {
  return { distanceTravelledKm: 0, distanceRemainingKm: 0, stopsVisited: 0, stopsRemaining: 0, countriesVisited: [], timeZonesCrossed: 0, elapsedFlightTimeMs: 0, remainingFlightTimeMs: 0, elapsedJourneyTimeMs: 0, remainingJourneyTimeMs: 0, currentSpeedKmh: 0, averageSpeedKmh: 0, presentsDelivered: 0, cookiesEaten: 0, reindeerSnacks: 0, chimneysVisited: 0 };
}

function timestampMs(value: Date | number): number {
  const result = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(result)) throw new RangeError('time must be a valid timestamp');
  return result;
}

function isString(value: string | undefined): value is string { return value !== undefined; }
