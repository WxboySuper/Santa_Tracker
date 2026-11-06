import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import type { Candidate, GeneratorConfig, RouteReport } from './types';
import type { Route } from '@santa-tracker/contracts';

type LegSummary = { from: string; to: string; km: number; kmh: number; longGap: boolean };
function categoryMix(places: Candidate[], config: GeneratorConfig): RouteReport['mix'] {
  const weights = config.weights;
  const weightTotal = Object.values(weights).reduce((total, weight) => total + weight, 0);
  return Object.fromEntries(Object.entries(weights).map(([category, weight]) => [category, {
    count: places.filter((place) => place.category === category).length,
    target: Math.round(config.total * weight / weightTotal),
  }]));
}
function hourlyCounts(route: Route): RouteReport['hourly'] {
  const first = route.stops[0];
  const last = route.stops.at(-1);
  if (!first || !last) throw new Error('Cannot report an empty route');
  const start = Date.parse(first.arrivalIso);
  const end = Date.parse(last.arrivalIso);
  const count = Math.floor((end - start) / 3_600_000) + 1;
  return Array.from({ length: count }, (_, hour) => ({
    hour,
    count: route.stops.filter((stop) => Math.floor((Date.parse(stop.arrivalIso) - start) / 3_600_000) === hour).length,
  }));
}
function routeLegs(places: Candidate[], route: Route, config: GeneratorConfig, coordinates: Map<string, LatLng>): LegSummary[] {
  if (places.length !== route.stops.length) throw new Error('Report locations do not match route stops');
  return route.stops.slice(1).map((stop, index) => {
    const previous = route.stops[index];
    if (!previous) throw new Error(`Missing previous stop for leg ${index + 1}`);
    const from = coordinates.get(previous.locationId);
    const to = coordinates.get(stop.locationId);
    if (!from || !to) throw new Error(`Missing coordinates for leg ${index + 1}`);
    const fromPlace = places[index];
    const toPlace = places[index + 1];
    if (!fromPlace || !toPlace) throw new Error(`Missing locations for leg ${index + 1}`);
    const km = haversineKm(from, to);
    const seconds = (Date.parse(stop.arrivalIso) - Date.parse(previous.departureIso)) / 1000;
    const kmh = legSpeedKmh(from, to, seconds);
    if (kmh === null) throw new Error(`Invalid travel duration for leg ${index + 1}`);
    return {
      from: fromPlace.name, to: toPlace.name, km, kmh,
      longGap: km > config.maxGapKm,
    };
  });
}
function regionCounts(places: Candidate[]): Record<string, number> {
  return places.reduce<Record<string, number>>((counts, place) => {
    const region = place.timezone.split('/')[0] ?? 'Unknown';
    counts[region] = (counts[region] ?? 0) + 1;
    return counts;
  }, {});
}
function countFlags(places: Candidate[], legs: LegSummary[], config: GeneratorConfig): RouteReport['flags'] {
  return legs.map((leg, index) => ({
    longGap: Number(leg.longGap), fastLeg: Number(leg.kmh > config.maxSpeedKmh),
    repeatCountry: Number(places[index]?.country === places[index + 1]?.country),
  }));
}
export function buildReport(places: Candidate[], route: Route, config: GeneratorConfig, coordinates: Map<string, LatLng>): RouteReport {
  const hourly = hourlyCounts(route);
  const legs = routeLegs(places, route, config, coordinates);
  const lastHours = hourly.slice(-config.westernHours);
  return {
    seed: config.seed, count: places.length, mix: categoryMix(places, config), regionBalance: regionCounts(places), hourly,
    fastestLeg: [...legs].sort((a, b) => b.kmh - a.kmh)[0] ?? null,
    longestLegs: [...legs].sort((a, b) => b.km - a.km).slice(0, 10), flags: countFlags(places, legs, config),
    issues: [], westernMinimum: lastHours.length ? Math.min(...lastHours.map((entry) => entry.count)) : 0,
  };
}
