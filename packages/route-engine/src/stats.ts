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

type RouteLeg = { distanceKm: number; startMs: number; endMs: number; durationMs: number };
type RouteInterval = { firstArrival: number; lastDeparture: number; boundedNow: number };
type DistanceTotals = { totalKm: number; travelledKm: number };
type FlightTotals = { elapsedMs: number; remainingMs: number };
type SpeedStats = { currentKmh: number; averageKmh: number };
type PlayfulStats = Pick<JourneyStats, 'presentsDelivered' | 'cookiesEaten' | 'reindeerSnacks' | 'chimneysVisited'>;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const nameToCode = makeCountryNameIndex();
const validCountryCodes = new Set(nameToCode.values());

/** Derive route and warm, explicitly imaginary estimates from a route snapshot and instant. */
export function deriveJourneyStats(
  route: Route,
  now: Date | number,
  locations: readonly RouteStatsLocation[],
): JourneyStats {
  const stops = route.stops;
  if (stops.length === 0) return emptyStats();

  const nowMs = timestampMs(now);
  const locationsByStop = resolveLocations(stops, locations);
  const interval = deriveRouteInterval(stops, nowMs);
  const visitedIndexes = visitedStopIndexes(stops, nowMs);
  const legs = deriveRouteLegs(stops, locationsByStop);
  const distance = deriveDistance(legs, interval.boundedNow);
  const flight = deriveFlightTime(legs, interval.boundedNow);
  const journeyTime = deriveJourneyTime(interval);
  const speed = deriveSpeed(legs, interval.boundedNow, distance.travelledKm, flight.elapsedMs);
  const playful = derivePlayfulStats(visitedIndexes, locationsByStop);

  return {
    distanceTravelledKm: distance.travelledKm,
    distanceRemainingKm: Math.max(0, distance.totalKm - distance.travelledKm),
    stopsVisited: visitedIndexes.length,
    stopsRemaining: stops.length - visitedIndexes.length,
    countriesVisited: deriveCountriesVisited(visitedIndexes, locationsByStop),
    timeZonesCrossed: deriveTimeZonesCrossed(visitedIndexes, locationsByStop),
    elapsedFlightTimeMs: flight.elapsedMs,
    remainingFlightTimeMs: flight.remainingMs,
    ...journeyTime,
    currentSpeedKmh: speed.currentKmh,
    averageSpeedKmh: speed.averageKmh,
    ...playful,
  };
}

/** Format raw numeric stats for display without baking a locale into route logic. */
export function formatStat(value: number, locale: string | string[] = 'en'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function resolveLocations(stops: Route['stops'], locations: readonly RouteStatsLocation[]): RouteStatsLocation[] {
  const byId = new Map(locations.map(location => [location.id, location]));
  return stops.map(stop => {
    const location = byId.get(stop.locationId);
    if (!location) throw new RangeError(`Missing stats location for route stop ${stop.locationId}`);
    return location;
  });
}

function deriveRouteInterval(stops: Route['stops'], nowMs: number): RouteInterval {
  const firstArrival = Date.parse(stops[0]!.arrivalIso);
  const lastDeparture = Date.parse(stops.at(-1)!.departureIso);
  return { firstArrival, lastDeparture, boundedNow: Math.min(lastDeparture, Math.max(firstArrival, nowMs)) };
}

function visitedStopIndexes(stops: Route['stops'], nowMs: number): number[] {
  return stops.flatMap((stop, index) => Date.parse(stop.arrivalIso) <= nowMs ? [index] : []);
}

function deriveCountriesVisited(indexes: number[], locations: RouteStatsLocation[]): string[] {
  return [...new Set(indexes.map(index => normalizeCountryCode(locations[index]!)).filter(isString))];
}

function deriveTimeZonesCrossed(indexes: number[], locations: RouteStatsLocation[]): number {
  return new Set(indexes.map(index => locations[index]!.timezone)).size;
}

function deriveRouteLegs(stops: Route['stops'], locations: RouteStatsLocation[]): RouteLeg[] {
  return stops.slice(0, -1).map((stop, index) => {
    const nextStop = stops[index + 1]!;
    const startMs = Date.parse(stop.departureIso);
    const endMs = Date.parse(nextStop.arrivalIso);
    return {
      distanceKm: haversineKm(locations[index]!.coordinates, locations[index + 1]!.coordinates),
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
    };
  });
}

function deriveDistance(legs: RouteLeg[], nowMs: number): DistanceTotals {
  let totalKm = 0;
  let travelledKm = 0;
  for (const leg of legs) {
    totalKm += leg.distanceKm;
    travelledKm += leg.distanceKm * legProgress(leg, nowMs);
  }
  return { totalKm, travelledKm };
}

function deriveFlightTime(legs: RouteLeg[], nowMs: number): FlightTotals {
  let elapsedMs = 0;
  let remainingMs = 0;
  for (const leg of legs) {
    elapsedMs += Math.min(leg.durationMs, Math.max(0, nowMs - leg.startMs));
    remainingMs += Math.min(leg.durationMs, Math.max(0, leg.endMs - nowMs));
  }
  return { elapsedMs, remainingMs };
}

function deriveJourneyTime(interval: RouteInterval): Pick<JourneyStats, 'elapsedJourneyTimeMs' | 'remainingJourneyTimeMs'> {
  return {
    elapsedJourneyTimeMs: Math.max(0, interval.boundedNow - interval.firstArrival),
    remainingJourneyTimeMs: Math.max(0, interval.lastDeparture - interval.boundedNow),
  };
}

function deriveSpeed(legs: RouteLeg[], nowMs: number, travelledKm: number, elapsedFlightMs: number): SpeedStats {
  const activeLeg = legs.find(leg => leg.durationMs > 0 && nowMs >= leg.startMs && nowMs < leg.endMs);
  return {
    currentKmh: activeLeg ? activeLeg.distanceKm / (activeLeg.durationMs / 3_600_000) : 0,
    averageKmh: elapsedFlightMs > 0 ? travelledKm / (elapsedFlightMs / 3_600_000) : 0,
  };
}

function derivePlayfulStats(indexes: number[], locations: RouteStatsLocation[]): PlayfulStats {
  // Estimate 20% of visited population receive presents. Missing population contributes 0.
  const population = indexes.reduce((sum, index) => sum + Math.max(0, locations[index]!.population ?? 0), 0);
  const presentsDelivered = Math.floor(population * 0.2);
  return {
    presentsDelivered,
    cookiesEaten: presentsDelivered * 2,
    reindeerSnacks: indexes.length * 9,
    chimneysVisited: Math.ceil(presentsDelivered / 4),
  };
}

function legProgress(leg: RouteLeg, nowMs: number): number {
  if (leg.durationMs === 0) return nowMs >= leg.endMs ? 1 : 0;
  return Math.min(1, Math.max(0, (nowMs - leg.startMs) / leg.durationMs));
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
