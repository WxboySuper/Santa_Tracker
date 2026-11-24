import type { Route } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import { allocateQuotas } from './selection';
import { classifyRegion, formatUtcOffset } from './regions';
import { NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig, type RouteLegReport, type RouteReport } from './types';

function categoryMix(places: Candidate[], config: GeneratorConfig): RouteReport['mix'] {
  const quotas = allocateQuotas(config.total, config.weights);
  return Object.fromEntries(Object.entries(quotas).map(([category, target]) => [category, {
    count: places.filter((place) => place.category === category).length,
    target,
  }]));
}

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
};

function actualLeg({ from, to, fromName, toName, fromDeparture, toArrival, kind, gapMinutes, eastwardDegrees }: ActualLegOptions): RouteLegReport {
  const km = haversineKm(from, to);
  const kmh = legSpeedKmh(from, to, (toArrival - fromDeparture) / 1000) ?? 0;
  return { from: fromName, to: toName, km, kmh, gapMinutes, kind, eastwardDegrees };
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

export function buildReport(places: Candidate[], route: Route, config: GeneratorConfig): RouteReport {
  validateReportInput(places, route);
  const endpoints = reportEndpoints(places, route);
  const { first, firstStop, last, lastStop } = endpoints;
  const takeoff = Date.parse(TAKEOFF_UTC);
  const lastDeparture = Date.parse(lastStop.departureIso);
  const returnArrival = lastDeparture + returnTravelTime(last, config);
  const legs = [
    launchLeg(first, firstStop, takeoff),
    ...deliveryLegs(places, route),
    returnLeg(last, lastStop, returnArrival),
  ];
  const issues = routeTimingIssues(last.name, lastDeparture, returnArrival, takeoff);
  return createRouteReport({ places, route, config, legs, issues, lastDeparture, returnArrival });
}

type ReportEndpoints = {
  first: Candidate;
  firstStop: Route['stops'][number];
  last: Candidate;
  lastStop: Route['stops'][number];
};

function reportEndpoints(places: Candidate[], route: Route): ReportEndpoints {
  const first = requireValue(places[0], 'Missing first route location');
  const firstStop = requireValue(route.stops[0], 'Missing first route stop');
  const last = requireValue(places.at(-1), 'Missing final route location');
  const lastStop = requireValue(route.stops.at(-1), 'Missing final route stop');
  return { first, firstStop, last, lastStop };
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function validateReportInput(places: Candidate[], route: Route): void {
  if (places.length === 0 || route.stops.length === 0) throw new Error('Cannot report an empty route');
  if (places.length !== route.stops.length) throw new Error('Report locations do not match route stops');
}

function launchLeg(first: Candidate, firstStop: Route['stops'][number], takeoff: number): RouteLegReport {
  const firstArrival = Date.parse(firstStop.arrivalIso);
  return actualLeg({ from: NORTH_POLE, to: first, fromName: 'North Pole', toName: first.name, fromDeparture: takeoff,
    toArrival: firstArrival, kind: 'launch', gapMinutes: (firstArrival - takeoff) / 60_000, eastwardDegrees: 0 });
}

function deliveryLegs(places: Candidate[], route: Route): RouteLegReport[] {
  const legs: RouteLegReport[] = [];
  for (let index = 1; index < places.length; index++) {
    const { from, to, fromStop, toStop } = deliveryLegContext(places, route, index);
    const gapMinutes = (Date.parse(toStop.arrivalIso) - Date.parse(fromStop.arrivalIso)) / 60_000;
    const longitudeDelta = ((to.lng - from.lng + 540) % 360) - 180;
    legs.push(actualLeg({ from, to, fromName: from.name, toName: to.name, fromDeparture: Date.parse(fromStop.departureIso),
      toArrival: Date.parse(toStop.arrivalIso), kind: 'delivery', gapMinutes, eastwardDegrees: longitudeDelta }));
  }
  return legs;
}

function deliveryLegContext(places: Candidate[], route: Route, index: number): {
  from: Candidate;
  to: Candidate;
  fromStop: Route['stops'][number];
  toStop: Route['stops'][number];
} {
  const from = requireValue(places[index - 1], `Missing origin for delivery leg ${index}`);
  const to = requireValue(places[index], `Missing destination for delivery leg ${index}`);
  const fromStop = requireValue(route.stops[index - 1], `Missing origin stop for delivery leg ${index}`);
  const toStop = requireValue(route.stops[index], `Missing destination stop for delivery leg ${index}`);
  return { from, to, fromStop, toStop };
}

function returnTravelTime(last: Candidate, config: GeneratorConfig): number {
  const returnDistance = haversineKm(last, NORTH_POLE);
  return Math.max(1_000, Math.ceil(returnDistance / config.targetLegSpeedKmh * 3_600) * 1_000);
}

function returnLeg(last: Candidate, lastStop: Route['stops'][number], returnArrival: number): RouteLegReport {
  const lastDeparture = Date.parse(lastStop.departureIso);
  const gapSeconds = (returnArrival - lastDeparture) / 1000;
  return actualLeg({ from: last, to: NORTH_POLE, fromName: last.name, toName: 'North Pole', fromDeparture: lastDeparture,
    toArrival: returnArrival, kind: 'return', gapMinutes: gapSeconds / 60, eastwardDegrees: 0 });
}

function routeTimingIssues(lastName: string, lastDeparture: number, returnArrival: number, takeoff: number): string[] {
  const issues: string[] = [];
  if (lastDeparture > takeoff + 27 * 3_600_000) issues.push(`Last delivery at ${lastName} departs after takeoff plus 27 hours`);
  if (returnArrival > takeoff + 27 * 3_600_000 + 45 * 60_000) issues.push(`Return from ${lastName} leaves less than 15 minutes inside the 28-hour flight window`);
  return issues;
}

type CreateRouteReportOptions = {
  places: Candidate[];
  route: Route;
  config: GeneratorConfig;
  legs: RouteLegReport[];
  issues: string[];
  lastDeparture: number;
  returnArrival: number;
};

function createRouteReport(options: CreateRouteReportOptions): RouteReport {
  const { places, route, config, legs, issues, lastDeparture, returnArrival } = options;

  const speeds = legs.map((leg) => leg.kmh);
  const continentBalance = countsBy(places, (place) => classifyRegion(place).continent);
  const subregionBalance = countsBy(places, (place) => classifyRegion(place).subregion);
  const offsetBalance = countsBy(places, (place) => formatUtcOffset(place.utcOffsetMinutes ?? 0));
  const deliveryLegs = legs.filter((leg) => leg.kind === 'delivery');
  const lastDepartureUtc = new Date(lastDeparture).toISOString();
  const routeEndUtc = new Date(returnArrival).toISOString();

  return {
    seed: config.seed,
    count: places.length,
    mix: categoryMix(places, config),
    continentBalance,
    subregionBalance,
    offsetBalance,
    hourly: routeHours(route),
    legs,
    longestLegs: [...legs].sort((a, b) => b.km - a.km).slice(0, 10),
    issues,
    medianLegSpeedKmh: percentile(speeds, 0.5),
    p90LegSpeedKmh: percentile(speeds, 0.9),
    maxLegSpeedKmh: Math.max(...speeds),
    totalDistanceKm: legs.reduce((total, leg) => total + leg.km, 0),
    eastwardLegsOverEightDegrees: deliveryLegs.filter((leg) => leg.eastwardDegrees > 8).length,
    uninhabitedIslandStops: places.filter((place) => config.uninhabitedIslandIds.includes(place.id)).length,
    lastDepartureUtc,
    routeEndUtc,
  };
}
