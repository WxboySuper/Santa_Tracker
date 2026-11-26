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
  /** START and END markers are route bounds, not delivery stops. */
  type?: 'START' | 'DELIVERY' | 'END';
};

/** Playful estimate of the total presents delivered during a full journey. */
export const PRESENTS_TOTAL = 7_000_000_000;

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
const utcOffsetBands = new Map<string, number>();

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const nameToCode = makeCountryNameIndex();
const validCountryCodes = new Set(nameToCode.values());

/** Derive route and warm, explicitly imaginary estimates from a route snapshot and instant. */
export function deriveJourneyStats(
  route: Route,
  now: Date | number,
  locations: readonly RouteStatsLocation[],
  candidatePool: readonly RouteStatsLocation[] = locations,
): JourneyStats {
  const stops = route.stops;
  if (stops.length === 0) return emptyStats();

  const nowMs = timestampMs({ value: now });
  const locationsByStop = resolveLocations(stops, locations);
  const interval = deriveRouteInterval({ stops, nowMs });
  const visitedIndexes = visitedStopIndexes({ stops, locations: locationsByStop, nowMs });
  const legs = deriveRouteLegs(stops, locationsByStop);
  const distance = deriveDistance({ legs, nowMs: interval.boundedNow });
  const flight = deriveFlightTime({ legs, nowMs: interval.boundedNow });
  const journeyTime = deriveJourneyTime(interval);
  const speed = deriveSpeed({ legs, nowMs: interval.boundedNow, travelledKm: distance.travelledKm, elapsedFlightMs: flight.elapsedMs });
  const playful = derivePlayfulStats({
    stops, routeLocations: locationsByStop, candidatePool, visitedStopCount: visitedIndexes.length, nowMs, season: route.season,
  });

  return {
    distanceTravelledKm: distance.travelledKm,
    distanceRemainingKm: Math.max(0, distance.totalKm - distance.travelledKm),
    stopsVisited: visitedIndexes.length,
    stopsRemaining: locationsByStop.filter(isDeliveryStop).length - visitedIndexes.length,
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

function deriveRouteInterval({ stops, nowMs }: { stops: Route['stops']; nowMs: number }): RouteInterval {
  const firstArrival = Date.parse(stops[0]!.arrivalIso);
  const lastDeparture = Date.parse(stops.at(-1)!.departureIso);
  return { firstArrival, lastDeparture, boundedNow: Math.min(lastDeparture, Math.max(firstArrival, nowMs)) };
}

function visitedStopIndexes({ stops, locations, nowMs }: { stops: Route['stops']; locations: RouteStatsLocation[]; nowMs: number }): number[] {
  return stops.flatMap((stop, index) => isDeliveryStop(locations[index]!) && Date.parse(stop.arrivalIso) <= nowMs ? [index] : []);
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

function deriveDistance({ legs, nowMs }: { legs: RouteLeg[]; nowMs: number }): DistanceTotals {
  let totalKm = 0;
  let travelledKm = 0;
  for (const leg of legs) {
    totalKm += leg.distanceKm;
    travelledKm += leg.distanceKm * legProgress({ leg, nowMs });
  }
  return { totalKm, travelledKm };
}

function deriveFlightTime({ legs, nowMs }: { legs: RouteLeg[]; nowMs: number }): FlightTotals {
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

function deriveSpeed({ legs, nowMs, travelledKm, elapsedFlightMs }: { legs: RouteLeg[]; nowMs: number; travelledKm: number; elapsedFlightMs: number }): SpeedStats {
  const activeLeg = legs.find(leg => leg.durationMs > 0 && nowMs >= leg.startMs && nowMs < leg.endMs);
  return {
    currentKmh: activeLeg ? activeLeg.distanceKm / (activeLeg.durationMs / 3_600_000) : 0,
    averageKmh: elapsedFlightMs > 0 ? travelledKm / (elapsedFlightMs / 3_600_000) : 0,
  };
}

function derivePlayfulStats({ stops, routeLocations, candidatePool, visitedStopCount, nowMs, season }: {
  stops: Route['stops'];
  routeLocations: RouteStatsLocation[];
  candidatePool: readonly RouteStatsLocation[];
  visitedStopCount: number;
  nowMs: number;
  season: number;
}): PlayfulStats {
  const presentsDelivered = deliveredPresents({ stops, routeLocations, candidatePool, nowMs, season });
  return {
    presentsDelivered,
    cookiesEaten: presentsDelivered * 2,
    reindeerSnacks: visitedStopCount * 9,
    chimneysVisited: Math.ceil(presentsDelivered / 4),
  };
}

function deliveredPresents({ stops, routeLocations, candidatePool, nowMs, season }: {
  stops: Route['stops'];
  routeLocations: RouteStatsLocation[];
  candidatePool: readonly RouteStatsLocation[];
  nowMs: number;
  season: number;
}): number {
  const deliveryIndexes = routeLocations.flatMap((location, index) => isDeliveryStop(location) ? [index] : []);
  if (deliveryIndexes.length === 0) return 0;
  const firstIndex = deliveryIndexes[0]!;
  const firstArrivalMs = Date.parse(stops[firstIndex]!.arrivalIso);
  const startStopIndex = findPreviousBoundary({ locations: routeLocations, index: firstIndex });
  const takeoffMs = startStopIndex === undefined ? firstArrivalMs : Date.parse(stops[startStopIndex]!.departureIso);
  if (nowMs < takeoffMs) return 0;

  const allocations = allocatePresents(deliveryIndexes, routeLocations, candidatePool, season);
  let delivered = 0;
  for (const [deliveryNumber, routeIndex] of deliveryIndexes.entries()) {
    const stop = stops[routeIndex]!;
    const arrivalMs = Date.parse(stop.arrivalIso);
    const departureMs = Date.parse(stop.departureIso);
    const previousIndex = findPreviousRouteStop({ locations: routeLocations, index: routeIndex });
    const inboundStartMs = previousIndex === undefined ? arrivalMs : Date.parse(stops[previousIndex]!.departureIso);
    const hasInboundFlight = previousIndex !== undefined && arrivalMs > inboundStartMs;
    const allocation = allocations[deliveryNumber] ?? 0;
    if (nowMs >= departureMs) {
      delivered += allocation;
      continue;
    }
    if (nowMs < arrivalMs) {
      const inboundProgress = hasInboundFlight ? linearProgress({ nowMs, startMs: inboundStartMs, endMs: arrivalMs }) : 0;
      delivered += allocation * 0.3 * inboundProgress;
      break;
    }
    const dwellProgress = linearProgress({ nowMs, startMs: arrivalMs, endMs: departureMs });
    delivered += allocation * (hasInboundFlight ? 0.3 + 0.7 * dwellProgress : dwellProgress);
    break;
  }
  // Flooring keeps the visible counter integer-valued; the underlying schedule is linear.
  if (deliveryIndexes.every(index => nowMs >= Date.parse(stops[index]!.departureIso))) return PRESENTS_TOTAL;
  const roundingTolerance = Number.EPSILON * PRESENTS_TOTAL * 2;
  return Math.min(PRESENTS_TOTAL, Math.floor(delivered + roundingTolerance));
}

function allocatePresents(
  deliveryIndexes: number[],
  routeLocations: RouteStatsLocation[],
  candidatePool: readonly RouteStatsLocation[],
  season: number,
): number[] {
  const poolByBand = sumPopulationByBand({ locations: candidatePool, season });
  const bandByStop = deliveryIndexes.map(index => utcOffsetBand({ location: routeLocations[index]!, season }));
  const routeBands = [...new Set(bandByStop)];
  const routeBandWeights = new Map(routeBands.map(band => [band,
    deliveryIndexes.reduce((sum, index, deliveryNumber) => sum + (bandByStop[deliveryNumber] === band ? populationWeight(routeLocations[index]!) : 0), 0),
  ]));
  const bandWeights = routeBands.map(band => (poolByBand.get(band) ?? 0) || (routeBandWeights.get(band) ?? 0));
  const bandAllocations = splitIntegerTotal({ total: PRESENTS_TOTAL, weights: bandWeights });
  const allocationByBand = new Map(routeBands.map((band, index) => [band, bandAllocations[index] ?? 0]));
  const result = Array.from({ length: deliveryIndexes.length }, () => 0);
  for (const band of routeBands) {
    const stopNumbers = bandByStop.flatMap((candidateBand, index) => candidateBand === band ? [index] : []);
    const weights = stopNumbers.map(stopNumber => populationWeight(routeLocations[deliveryIndexes[stopNumber]!]!));
    const allocations = splitIntegerTotal({ total: allocationByBand.get(band) ?? 0, weights });
    for (const [index, stopNumber] of stopNumbers.entries()) result[stopNumber] = allocations[index] ?? 0;
  }
  return result;
}

function sumPopulationByBand({ locations, season }: { locations: readonly RouteStatsLocation[]; season: number }): Map<number, number> {
  const totals = new Map<number, number>();
  for (const location of locations) {
    if (!isDeliveryStop(location)) continue;
    const band = utcOffsetBand({ location, season });
    totals.set(band, (totals.get(band) ?? 0) + candidatePopulation(location));
  }
  return totals;
}

function splitIntegerTotal({ total, weights }: { total: number; weights: number[] }): number[] {
  const safeWeights = weights.map(weight => Math.max(0, weight));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal === 0) return safeWeights.map((_, index) => index === safeWeights.length - 1 ? total : 0);
  const exact = safeWeights.map(weight => total * weight / weightTotal);
  const result = exact.map(Math.floor);
  const remaining = total - result.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - result[index]! }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index++) result[byRemainder[index]!.index]! += 1;
  return result;
}

function populationWeight(location: RouteStatsLocation): number {
  const population = location.population ?? 0;
  return Number.isFinite(population) ? Math.max(10_000, population) : 10_000;
}

function candidatePopulation(location: RouteStatsLocation): number {
  const population = location.population ?? 0;
  return Number.isFinite(population) ? Math.max(0, population) : 0;
}

function utcOffsetBand({ location, season }: { location: RouteStatsLocation; season: number }): number {
  const cacheKey = `${season}:${location.timezone}`;
  const cached = utcOffsetBands.get(cacheKey);
  if (cached !== undefined) return cached;
  const referenceTime = Date.UTC(season, 11, 25, 12);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: location.timezone, timeZoneName: 'longOffset' }).formatToParts(referenceTime);
  const offset = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) {
    utcOffsetBands.set(cacheKey, 0);
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  const band = match[1] === '-' ? -minutes : minutes;
  utcOffsetBands.set(cacheKey, band);
  return band;
}

function isDeliveryStop(location: RouteStatsLocation): boolean {
  return location.type !== 'START' && location.type !== 'END';
}

function findPreviousBoundary({ locations, index }: { locations: RouteStatsLocation[]; index: number }): number | undefined {
  for (let candidate = index - 1; candidate >= 0; candidate--) {
    if (locations[candidate]!.type === 'START') return candidate;
  }
  return findPreviousRouteStop({ locations, index });
}

function findPreviousRouteStop({ locations, index }: { locations: RouteStatsLocation[]; index: number }): number | undefined {
  for (let candidate = index - 1; candidate >= 0; candidate--) {
    if (locations[candidate]!.type !== 'END') return candidate;
  }
  return undefined;
}

function linearProgress({ nowMs, startMs, endMs }: { nowMs: number; startMs: number; endMs: number }): number {
  if (endMs <= startMs) return nowMs >= endMs ? 1 : 0;
  return Math.min(1, Math.max(0, (nowMs - startMs) / (endMs - startMs)));
}

function legProgress({ leg, nowMs }: { leg: RouteLeg; nowMs: number }): number {
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

function timestampMs({ value }: { value: Date | number }): number {
  const result = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(result)) throw new RangeError('time must be a valid timestamp');
  return result;
}

function isString(value: string | undefined): value is string { return value !== undefined; }
