import type { Route } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import { classifyRegion, formatUtcOffset } from './regions';
import {
  detourRatio,
  eastwardLegReason,
  isEastwardDelta,
  localClock,
  longitudeDelta,
  stopTier,
} from './sweep';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig, type RouteDetourReport, type RouteLegReport, type RouteReport, type StopTier } from './types';

function countsBy(places: Candidate[], key: (place: Candidate) => string): Record<string, number> {
  return places.reduce<Record<string, number>>((counts, place) => {
    const value = key(place);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

type ActualLegOptions = {
  from: Candidate | LatLng;
  to: Candidate | LatLng;
  fromName: string;
  toName: string;
  fromDeparture: number;
  toArrival: number;
  kind: RouteLegReport['kind'];
  gapMinutes: number;
  eastwardDegrees: number;
  eastwardReason?: RouteLegReport['eastwardReason'];
};

function actualLeg(options: ActualLegOptions): RouteLegReport {
  const { from, to, fromName, toName, fromDeparture, toArrival, kind, gapMinutes, eastwardDegrees, eastwardReason } = options;
  const km = haversineKm(from, to);
  const kmh = legSpeedKmh(from, to, (toArrival - fromDeparture) / 1000) ?? 0;
  const leg: RouteLegReport = { from: fromName, to: toName, km, kmh, gapMinutes, kind, eastwardDegrees };
  if (isEastwardDelta(eastwardDegrees)) {
    if (!eastwardReason) throw new Error(`Unjustified eastward leg from ${fromName} to ${toName}`);
    leg.eastwardReason = eastwardReason;
  }
  return leg;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function routeHours(route: Route): RouteReport['hourly'] {
  const takeoff = Date.parse(TAKEOFF_UTC);
  const lastArrival = Date.parse(route.stops.at(-1)?.arrivalIso ?? TAKEOFF_UTC);
  const count = Math.floor((lastArrival - takeoff) / 3_600_000) + 1;
  return Array.from({ length: count }, (_, hour) => ({
    hour,
    count: route.stops.filter((stop) => Math.floor((Date.parse(stop.arrivalIso) - takeoff) / 3_600_000) === hour).length,
  }));
}

function deliveryLegs(places: Candidate[], route: Route): RouteLegReport[] {
  const legs: RouteLegReport[] = [];
  for (let index = 1; index < places.length; index++) {
    const from = requireValue(places[index - 1], `Missing origin for delivery leg ${index}`);
    const to = requireValue(places[index], `Missing destination for delivery leg ${index}`);
    const fromStop = requireValue(route.stops[index - 1], `Missing origin stop for delivery leg ${index}`);
    const toStop = requireValue(route.stops[index], `Missing destination stop for delivery leg ${index}`);
    const arrival = Date.parse(toStop.arrivalIso);
    const departure = Date.parse(fromStop.departureIso);
    const eastward = longitudeDelta(from, to);
    const reason = eastwardLegReason({ from, to, destinationIndex: index, arrivalUtc: arrival });
    legs.push(actualLeg({ from, to, fromName: from.name, toName: to.name, fromDeparture: departure, toArrival: arrival,
      kind: 'delivery', gapMinutes: (arrival - Date.parse(fromStop.arrivalIso)) / 60_000,
      eastwardDegrees: eastward, eastwardReason: reason }));
  }
  return legs;
}

function launchLeg(first: Candidate, firstStop: Route['stops'][number]): RouteLegReport {
  const takeoff = Date.parse(TAKEOFF_UTC);
  const arrival = Date.parse(firstStop.arrivalIso);
  const eastward = longitudeDelta(NORTH_POLE, first);
  const reason = eastwardLegReason({ from: NORTH_POLE, to: first, destinationIndex: 0, arrivalUtc: arrival });
  return actualLeg({ from: NORTH_POLE, to: first, fromName: 'North Pole', toName: first.name, fromDeparture: takeoff,
    toArrival: arrival, kind: 'launch', gapMinutes: (arrival - takeoff) / 60_000,
    eastwardDegrees: eastward, eastwardReason: reason });
}

function returnLeg(last: Candidate, lastStop: Route['stops'][number], routeEnd: number): RouteLegReport {
  const departure = Date.parse(lastStop.departureIso);
  const eastward = longitudeDelta(last, NORTH_POLE);
  return actualLeg({ from: last, to: NORTH_POLE, fromName: last.name, toName: 'North Pole', fromDeparture: departure,
    toArrival: routeEnd, kind: 'return', gapMinutes: (routeEnd - departure) / 60_000,
    eastwardDegrees: eastward, eastwardReason: isEastwardDelta(eastward) ? 'return' : undefined });
}

function detourAt(places: Candidate[], index: number): RouteDetourReport | undefined {
  const from = places[index - 1];
  const via = places[index];
  const to = places[index + 1];
  if (!from || !via || !to) return undefined;
  const ratio = detourRatio(from, via, to);
  if (ratio <= 2.5) return undefined;
  return { from: from.name, via: via.name, to: to.name, ratio };
}

function detours(places: Candidate[]): RouteDetourReport[] {
  const result: RouteDetourReport[] = [];
  for (let index = 1; index < places.length - 1; index++) {
    const detour = detourAt(places, index);
    if (detour) result.push(detour);
  }
  return result;
}

function localArrivalHistogram(places: Candidate[], route: Route): Record<string, number> {
  const histogram: Record<string, number> = {};
  places.forEach((place, index) => {
    const stop = route.stops[index];
    if (!stop) return;
    const local = localClock(stop.arrivalIso, place.utcOffsetMinutes ?? 0);
    const hour = `${local.hour.toString().padStart(2, '0')}:00`;
    histogram[hour] = (histogram[hour] ?? 0) + 1;
  });
  return Object.fromEntries(Object.entries(histogram).sort(([left], [right]) => left.localeCompare(right)));
}

function populationCoverage(places: Candidate[], pool: Candidate[]): { covered: number; total: number; share: number } {
  const populated = pool.filter((place) => (place.population ?? 0) > 0);
  const total = populated.reduce((sum, place) => sum + (place.population ?? 0), 0);
  let covered = 0;
  for (const candidate of populated) {
    if (places.some((stop) => haversineKm(candidate, stop) <= 500)) covered += candidate.population ?? 0;
  }
  return { covered, total, share: total > 0 ? covered / total : 0 };
}

function tierCounts(places: Candidate[]): Record<StopTier, number> {
  const counts: Record<StopTier, number> = { major: 0, city: 0, town: 0, hop: 0 };
  for (const place of places) counts[stopTier(place)]++;
  return counts;
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export function buildReport(places: Candidate[], route: Route, config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS, pool: Candidate[] = places): RouteReport {
  if (places.length === 0 || route.stops.length === 0) throw new Error('Cannot report an empty route');
  if (places.length !== route.stops.length) throw new Error('Report locations do not match route stops');
  const first = requireValue(places[0], 'Missing first route location');
  const firstStop = requireValue(route.stops[0], 'Missing first route stop');
  const last = requireValue(places.at(-1), 'Missing final route location');
  const lastStop = requireValue(route.stops.at(-1), 'Missing final route stop');
  const lastDeparture = Date.parse(lastStop.departureIso);
  const routeEnd = lastDeparture + travelMilliseconds(haversineKm(last, NORTH_POLE), Math.min(config.maxLegSpeedKmh, config.p90LegSpeedMaxKmh * 0.95));
  const legs = [launchLeg(first, firstStop), ...deliveryLegs(places, route), returnLeg(last, lastStop, routeEnd)];
  const speeds = legs.map((leg) => leg.kmh);
  const coverage = populationCoverage(places, pool);
  const mix = countsBy(places, (place) => place.category);
  const countryCodes = [...new Set(places.map((place) => place.country))].sort();
  return {
    seed: config.seed,
    count: places.length,
    countriesCovered: countryCodes.length,
    countryCodes,
    mix,
    stopTiers: tierCounts(places),
    continentBalance: countsBy(places, (place) => classifyRegion(place).continent),
    subregionBalance: countsBy(places, (place) => classifyRegion(place).subregion),
    offsetBalance: countsBy(places, (place) => formatUtcOffset(place.utcOffsetMinutes ?? 0)),
    hourly: routeHours(route),
    localArrivalHistogram: localArrivalHistogram(places, route),
    legs,
    eastwardLegs: legs.filter((leg) => isEastwardDelta(leg.eastwardDegrees)),
    detours: detours(places),
    longestLegs: [...legs].sort((left, right) => right.km - left.km).slice(0, 20),
    issues: [],
    medianLegSpeedKmh: percentile(speeds, 0.5),
    p90LegSpeedKmh: percentile(speeds, 0.9),
    maxLegSpeedKmh: Math.max(...speeds),
    totalDistanceKm: legs.reduce((total, leg) => total + leg.km, 0),
    populationWithin500Km: coverage.covered,
    worldPopulationEstimate: coverage.total,
    populationCoverageWithin500Km: coverage.share,
    lastDepartureUtc: new Date(lastDeparture).toISOString(),
    routeEndUtc: new Date(routeEnd).toISOString(),
  };
}

function travelMilliseconds(distanceKm: number, speedKmh: number): number {
  return Math.ceil(distanceKm / speedKmh * 3_600_000);
}
