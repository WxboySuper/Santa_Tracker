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

function actualLeg(from: Candidate | LatLng, to: Candidate | LatLng, fromName: string, toName: string, fromDeparture: number, toArrival: number, kind: RouteLegReport['kind'], gapMinutes: number, eastwardDegrees: number): RouteLegReport {
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
  if (places.length === 0 || route.stops.length === 0) throw new Error('Cannot report an empty route');
  if (places.length !== route.stops.length) throw new Error('Report locations do not match route stops');
  const legs: RouteLegReport[] = [];
  const first = places[0];
  const firstStop = route.stops[0];
  const last = places.at(-1);
  const lastStop = route.stops.at(-1);
  if (!first || !firstStop || !last || !lastStop) throw new Error('Missing route endpoint');

  const takeoff = Date.parse(TAKEOFF_UTC);
  const firstArrival = Date.parse(firstStop.arrivalIso);
  legs.push(actualLeg(NORTH_POLE, first, 'North Pole', first.name, takeoff, firstArrival, 'launch', (firstArrival - takeoff) / 60_000, 0));
  for (let index = 1; index < places.length; index++) {
    const from = places[index - 1];
    const to = places[index];
    const fromStop = route.stops[index - 1];
    const toStop = route.stops[index];
    if (!from || !to || !fromStop || !toStop) throw new Error(`Missing locations for delivery leg ${index}`);
    const gapMinutes = (Date.parse(toStop.arrivalIso) - Date.parse(fromStop.arrivalIso)) / 60_000;
    const longitudeDelta = ((to.lng - from.lng + 540) % 360) - 180;
    legs.push(actualLeg(from, to, from.name, to.name, Date.parse(fromStop.departureIso), Date.parse(toStop.arrivalIso), 'delivery', gapMinutes, longitudeDelta));
  }
  const lastDeparture = Date.parse(lastStop.departureIso);
  const returnDistance = haversineKm(last, NORTH_POLE);
  const returnMs = Math.max(1_000, Math.ceil(returnDistance / config.targetLegSpeedKmh * 3_600_000));
  const returnArrival = lastDeparture + returnMs;
  legs.push(actualLeg(last, NORTH_POLE, last.name, 'North Pole', lastDeparture, returnArrival, 'return', returnMs / 60_000, 0));

  const speeds = legs.map((leg) => leg.kmh);
  const continentBalance = countsBy(places, (place) => classifyRegion(place).continent);
  const subregionBalance = countsBy(places, (place) => classifyRegion(place).subregion);
  const offsetBalance = countsBy(places, (place) => formatUtcOffset(place.utcOffsetMinutes ?? 0));
  const deliveryLegs = legs.filter((leg) => leg.kind === 'delivery');
  const lastDepartureUtc = new Date(lastDeparture).toISOString();
  const routeEndUtc = new Date(returnArrival).toISOString();
  const issues: string[] = [];
  if (lastDeparture > takeoff + 27 * 3_600_000) issues.push(`Last delivery at ${last.name} departs after takeoff plus 27 hours`);
  if (returnArrival > takeoff + 28 * 3_600_000) issues.push(`Return from ${last.name} reaches the North Pole after the 28-hour flight window`);

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
