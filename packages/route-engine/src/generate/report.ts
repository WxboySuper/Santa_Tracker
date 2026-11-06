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
type LegContext = { places: Candidate[]; config: GeneratorConfig; coordinates: Map<string, LatLng>; route: Route };
function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null) throw new Error(message);
  if (value === undefined) throw new Error(message);
  return value;
}
function routeLeg(context: LegContext, stop: Route['stops'][number], index: number): LegSummary {
  const legNumber = index + 1;
  const prior = requireValue(context.route.stops[index], `Missing previous stop for leg ${legNumber}`);
  const from = requireValue(context.coordinates.get(prior.locationId), `Missing coordinates for leg ${legNumber}`);
  const to = requireValue(context.coordinates.get(stop.locationId), `Missing coordinates for leg ${legNumber}`);
  const fromPlace = requireValue(context.places[index], `Missing locations for leg ${legNumber}`);
  const toPlace = requireValue(context.places[index + 1], `Missing locations for leg ${legNumber}`);
  const km = haversineKm(from, to);
  const seconds = (Date.parse(stop.arrivalIso) - Date.parse(prior.departureIso)) / 1000;
  const kmh = requireValue(legSpeedKmh(from, to, seconds), `Invalid travel duration for leg ${legNumber}`);
  return { from: fromPlace.name, to: toPlace.name, km, kmh, longGap: km > context.config.maxGapKm };
}
function routeLegs(context: LegContext): LegSummary[] {
  if (context.places.length !== context.route.stops.length) throw new Error('Report locations do not match route stops');
  return context.route.stops.slice(1).map((stop, index) => routeLeg(context, stop, index));
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
  const legs = routeLegs({ places, config, coordinates, route });
  const lastHours = hourly.slice(-config.westernHours);
  return {
    seed: config.seed, count: places.length, mix: categoryMix(places, config), regionBalance: regionCounts(places), hourly,
    fastestLeg: [...legs].sort((a, b) => b.kmh - a.kmh)[0] ?? null,
    longestLegs: [...legs].sort((a, b) => b.km - a.km).slice(0, 10), flags: countFlags(places, legs, config),
    issues: [], westernMinimum: lastHours.length ? Math.min(...lastHours.map((entry) => entry.count)) : 0,
  };
}
