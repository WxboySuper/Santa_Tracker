import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import type { Candidate, GeneratorConfig, RouteReport } from './types';
import type { Route } from '@santa-tracker/contracts';

type LegSummary = { from: string; to: string; km: number; kmh: number; longGap: boolean };
function categoryMix(places: Candidate[], config: GeneratorConfig): RouteReport['mix'] {
  const weights = config.weights ?? {};
  const weightTotal = Object.values(weights).reduce((total, weight) => total + weight, 0);
  return Object.fromEntries(Object.entries(weights).map(([category, weight]) => [category, {
    count: places.filter((place) => place.category === category).length,
    target: Math.round(config.total * weight / weightTotal),
  }]));
}
function hourlyCounts(route: Route): RouteReport['hourly'] {
  const start = Date.parse(route.stops[0]?.arrivalIso ?? new Date(0).toISOString());
  const end = Date.parse(route.stops.at(-1)?.arrivalIso ?? new Date(start).toISOString());
  const count = Math.floor((end - start) / 3_600_000) + 1;
  return Array.from({ length: count }, (_, hour) => ({
    hour,
    count: route.stops.filter((stop) => Math.floor((Date.parse(stop.arrivalIso) - start) / 3_600_000) === hour).length,
  }));
}
function routeLegs(places: Candidate[], route: Route, config: GeneratorConfig, coordinates: Map<string, LatLng>): LegSummary[] {
  return route.stops.slice(1).map((stop, index) => {
    const previous = route.stops[index];
    const from = previous ? coordinates.get(previous.locationId) : undefined;
    const to = coordinates.get(stop.locationId);
    const km = from && to ? haversineKm(from, to) : 0;
    const seconds = previous ? (Date.parse(stop.arrivalIso) - Date.parse(previous.departureIso)) / 1000 : 0;
    return {
      from: places[index]?.name ?? '', to: places[index + 1]?.name ?? '', km,
      kmh: legSpeedKmh(from ?? { lat: 0, lng: 0 }, to ?? { lat: 0, lng: 0 }, seconds) ?? 0,
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
