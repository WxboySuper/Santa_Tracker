import type { Route } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import { classifyRegion, formatUtcOffset } from './regions';
import { compareStableIds } from './selection';
import {
  detourRatio,
  eastwardLegReason,
  isEastwardDelta,
  localClock,
  longitudeDelta,
  stopTier,
} from './sweep';
import { scheduledTravelMilliseconds } from './order';
import { admin1Coverage } from './admin1';
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
  elapsedDurationSeconds: number;
  kind: RouteLegReport['kind'];
  gapMinutes: number;
  eastwardDegrees: number;
  eastwardReason?: RouteLegReport['eastwardReason'];
};

function actualLeg(options: ActualLegOptions): RouteLegReport {
  const { from, to, fromName, toName, elapsedDurationSeconds, kind, gapMinutes, eastwardDegrees, eastwardReason } = options;
  const km = haversineKm(from, to);
  // Measure the schedule's leg interval. Window holding can only lower its
  // average speed; transit duration remains the separate in-flight estimate.
  const kmh = legSpeedKmh(from, to, elapsedDurationSeconds) ?? 0;
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
    const eastward = longitudeDelta(from, to);
    const reason = eastwardLegReason({ from, to, destinationIndex: index, arrivalUtc: arrival });
    legs.push(actualLeg({ from, to, fromName: from.name, toName: to.name,
      elapsedDurationSeconds: (arrival - Date.parse(fromStop.departureIso)) / 1000,
      kind: 'delivery', gapMinutes: (arrival - Date.parse(fromStop.arrivalIso)) / 60_000,
      eastwardDegrees: eastward, eastwardReason: reason }));
  }
  return legs;
}

function launchLeg(first: Candidate, firstStop: Route['stops'][number]): RouteLegReport {
  const arrival = Date.parse(firstStop.arrivalIso);
  const eastward = longitudeDelta(NORTH_POLE, first);
  const reason = eastwardLegReason({ from: NORTH_POLE, to: first, destinationIndex: 0, arrivalUtc: arrival });
  return actualLeg({ from: NORTH_POLE, to: first, fromName: 'North Pole', toName: first.name,
    elapsedDurationSeconds: (arrival - Date.parse(TAKEOFF_UTC)) / 1000,
    kind: 'launch', gapMinutes: (arrival - Date.parse(TAKEOFF_UTC)) / 60_000,
    eastwardDegrees: eastward, eastwardReason: reason });
}

function returnLeg(last: Candidate, lastStop: Route['stops'][number], routeEnd: number): RouteLegReport {
  const eastward = longitudeDelta(last, NORTH_POLE);
  return actualLeg({ from: last, to: NORTH_POLE, fromName: last.name, toName: 'North Pole',
    elapsedDurationSeconds: (routeEnd - Date.parse(lastStop.departureIso)) / 1000,
    kind: 'return', gapMinutes: (routeEnd - Date.parse(lastStop.departureIso)) / 60_000,
    eastwardDegrees: eastward, eastwardReason: isEastwardDelta(eastward) ? 'return' : undefined });
}

function detourAt(places: Candidate[], index: number, countryCounts: Map<string, number>): RouteDetourReport {
  const from = places[index - 1]!;
  const via = places[index]!;
  const to = places[index + 1]!;
  const ratio = detourRatio(from, via, to);
  return { from: from.name, via: via.name, viaCountry: via.country,
    viaCountryStopCount: countryCounts.get(via.country) ?? 0, to: to.name, ratio };
}

function detours(places: Candidate[]): RouteDetourReport[] {
  const countryCounts = new Map<string, number>();
  for (const place of places) countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
  const result: RouteDetourReport[] = [];
  for (let index = 1; index < places.length - 1; index++) {
    const detour = detourAt(places, index, countryCounts);
    if (detour.ratio > 2.5 && detour.viaCountryStopCount > 1) result.push(detour);
  }
  return result;
}

function localArrivalHistogram(places: Candidate[], route: Route): Record<string, number> {
  const histogram: Record<string, number> = {};
  places.forEach((place, index) => {
    const stop = route.stops[index];
    if (!stop) return;
    const local = localClock({ iso: stop.arrivalIso, timezoneOrOffset: place.utcOffsetMinutes ?? 0 });
    const hour = `${local.hour.toString().padStart(2, '0')}:00`;
    histogram[hour] = (histogram[hour] ?? 0) + 1;
  });
  return Object.fromEntries(Object.entries(histogram).sort(([left], [right]) => compareStableIds(left, right)));
}

function localArrivalRange(places: Candidate[], route: Route): { min: string; max: string } {
  const arrivals = places.flatMap((place, index) => {
    const stop = route.stops[index];
    if (!stop) return [];
    const local = localClock({ iso: stop.arrivalIso, timezoneOrOffset: place.utcOffsetMinutes ?? 0 });
    const minute = local.hour * 60 + local.minute;
    const sweepMinute = minute >= 23 * 60 ? minute - 24 * 60 : minute;
    return [{ minute: sweepMinute, label: `${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}` }];
  }).sort((left, right) => left.minute - right.minute);
  const first = arrivals[0];
  const last = arrivals.at(-1);
  if (!first || !last) throw new Error('Cannot report an empty local arrival range');
  return { min: first.label, max: last.label };
}

function hasPopulationData(place: Candidate, seen: Set<string>): boolean {
  if (!place?.id) return false;
  if (!Number.isFinite(place.population) || (place.population ?? 0) <= 0) return false;
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
  if (seen.has(place.id)) return false;
  seen.add(place.id);
  return true;
}

function populationCandidates(pool: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return pool.filter((place) => hasPopulationData(place, seen));
}

function isWithinCoverageRadius(candidate: Candidate, places: Candidate[]): boolean {
  return places.some((stop) => haversineKm(candidate, stop) <= 500);
}

function populationCoverage(places: Candidate[], pool: Candidate[]): { covered: number; total: number; share: number } {
  const populated = populationCandidates(pool);
  const total = populated.reduce((sum, place) => sum + (place.population ?? 0), 0);
  const covered = populated.filter((candidate) => isWithinCoverageRadius(candidate, places))
    .reduce((sum, place) => sum + (place.population ?? 0), 0);
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

function buildRouteLegs(places: Candidate[], route: Route, config: GeneratorConfig): {
  legs: RouteLegReport[];
  lastDeparture: number;
  routeEnd: number;
} {
  const first = requireValue(places[0], 'Missing first route location');
  const firstStop = requireValue(route.stops[0], 'Missing first route stop');
  const last = requireValue(places.at(-1), 'Missing final route location');
  const lastStop = requireValue(route.stops.at(-1), 'Missing final route stop');
  const lastDeparture = Date.parse(lastStop.departureIso);
  const routeEnd = lastDeparture + scheduledTravelMilliseconds(last, NORTH_POLE, config);
  const legs = [launchLeg(first, firstStop), ...deliveryLegs(places, route),
    returnLeg(last, lastStop, routeEnd)];
  return { legs, lastDeparture, routeEnd };
}

function countryCodes(places: Candidate[]): string[] {
  return [...new Set(places.map((place) => place.country))].sort();
}

function candidateCountryCodes(pool: Candidate[]): string[] {
  const codes = pool.flatMap((place) =>
    typeof place?.country === 'string' && place.country.trim() ? [place.country] : []);
  return [...new Set(codes)].sort();
}

function offsetShares(pool: Candidate[], value: (places: Candidate[]) => number): Record<string, number> {
  const groups = new Map<string, Candidate[]>();
  for (const place of pool) {
    if (!place || !Number.isFinite(place.utcOffsetMinutes)) continue;
    const offset = formatUtcOffset(place.utcOffsetMinutes ?? 0);
    const band = groups.get(offset) ?? [];
    band.push(place);
    groups.set(offset, band);
  }
  const totals = [...groups.values()].map(value);
  const total = totals.reduce((sum, item) => sum + item, 0);
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => compareStableIds(left, right))
    .map(([offset, places]) => [offset, total > 0 ? value(places) / total : 0]));
}

function bandPopulation(places: Candidate[]): number {
  return places.reduce((sum, place) => sum + Math.max(0, place.population ?? 0), 0);
}

function bandLandCellCount(places: Candidate[]): number {
  const cells = new Set(places.map((place) => {
    const normalizedLng = ((place.lng + 180) % 360 + 360) % 360 - 180;
    return `${Math.floor((place.lat + 90) / 2)}:${Math.floor((normalizedLng + 180) / 2)}`;
  }));
  return cells.size;
}

function uncoveredCountryReasons(uncovered: string[], pool: Candidate[], selected: Candidate[], minimumSeparationKm: number): RouteReport['uncoveredCountryReasons'] {
  return uncovered.map((code) => {
    const candidates = pool.filter((place) => place.country === code);
    let reason: string;
    if (candidates.length === 0) {
      reason = 'No candidate rows exist for this country or territory in the committed place snapshot.';
    } else {
      const conflicts = candidates.map((candidate) => selected.map((place) => ({ place, km: haversineKm(candidate, place) }))
        .sort((left, right) => left.km - right.km)[0])
        .filter((nearest): nearest is { place: Candidate; km: number } => nearest !== undefined && nearest.km < minimumSeparationKm);
      if (conflicts.length === candidates.length) {
        const closest = conflicts.sort((left, right) => left.km - right.km)[0];
        reason = closest
          ? `Every candidate is within ${minimumSeparationKm} km of a selected stop; the closest conflict is ${closest.place.name} (${closest.place.country}) at ${closest.km.toFixed(1)} km.`
          : `Every candidate is within the ${minimumSeparationKm} km minimum separation of another selected stop.`;
      } else if (candidates.every((place) => place.lat < -35)) {
        const names = candidates.map((place) => place.name).slice(0, 3).join(', ');
        reason = `The only candidate${candidates.length === 1 ? '' : 's'} (${names}) lie south of 35°S; none fit before the 02:30 southern-local cutoff while preserving the westbound schedule and return deadline.`;
      } else {
        reason = `Candidate rows exist, but none could be inserted while preserving the local-time window, ${minimumSeparationKm} km separation, reasoned westward legs, speed limits, and return deadline.`;
      }
    }
    return { code, candidateCount: candidates.length, reason };
  });
}

function subnationalNote(coverage: RouteReport['admin1Coverage']): string {
  const summaries = Object.entries(coverage).map(([country, entry]) => `${country} ${entry.covered}/${entry.required}`);
  const missing = Object.entries(coverage).flatMap(([country, entry]) => entry.missingCodes.map((code) => `${country} ${code}`));
  const noUsStates = coverage.US.covered === 0 ? ' There is no US state coverage.' : '';
  return missing.length
    ? `Natural Earth admin-1 coverage: ${summaries.join(', ')}. Missing: ${missing.join(', ')}.${noUsStates}`
    : `Natural Earth admin-1 coverage complete: ${summaries.join(', ')}.`;
}

function legDistanceSummary(places: Candidate[], legs: RouteLegReport[]): {
  deliveryLegCount: number;
  shortDeliveryLegCount: number;
  shareDeliveryLegsUnder300Km: number;
} {
  const deliveryLegCount = Math.max(0, places.length - 1);
  const shortDeliveryLegCount = legs.filter((leg) => leg.kind === 'delivery' && leg.km < 300).length;
  const shareDeliveryLegsUnder300Km = deliveryLegCount > 0
    ? shortDeliveryLegCount / deliveryLegCount
    : 0;
  return { deliveryLegCount, shortDeliveryLegCount, shareDeliveryLegsUnder300Km };
}

function speedSummary(legs: RouteLegReport[]): {
  medianLegSpeedKmh: number;
  p90LegSpeedKmh: number;
  maxLegSpeedKmh: number;
} {
  const speeds = legs.map((leg) => leg.kmh);
  return {
    medianLegSpeedKmh: percentile(speeds, 0.5),
    p90LegSpeedKmh: percentile(speeds, 0.9),
    maxLegSpeedKmh: Math.max(...speeds),
  };
}

export function buildReport(places: Candidate[], route: Route, config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS, pool: Candidate[] = places): RouteReport {
  if (places.length === 0 || route.stops.length === 0) throw new Error('Cannot report an empty route');
  if (places.length !== route.stops.length) throw new Error('Report locations do not match route stops');
  const routeLegSummary = buildRouteLegs(places, route, config);
  const { legs, lastDeparture, routeEnd } = routeLegSummary;
  const coverage = populationCoverage(places, pool);
  const mix = countsBy(places, (place) => place.category);
  const coveredCountries = countryCodes(places);
  const availableCountries = candidateCountryCodes(pool);
  const missingCountries = availableCountries.filter((code) => !coveredCountries.includes(code));
  const adminCoverage = admin1Coverage(places);
  const legDistances = legDistanceSummary(places, legs);
  const speeds = speedSummary(legs);
  const arrivals = localArrivalRange(places, route);
  return {
    seed: config.seed,
    count: places.length,
    candidateCount: pool.length,
    invalidCandidateIds: [],
    unselectedCandidateCount: Math.max(0, pool.length - places.length),
    countriesCovered: coveredCountries.length,
    countryCodes: coveredCountries,
    uncoveredCountryCodes: missingCountries,
    uncoveredCountryReasons: uncoveredCountryReasons(missingCountries, pool, places, config.minStopSeparationKm),
    admin1Coverage: adminCoverage,
    mix,
    stopTiers: tierCounts(places),
    continentBalance: countsBy(places, (place) => classifyRegion(place).continent),
    subregionBalance: countsBy(places, (place) => classifyRegion(place).subregion),
    offsetBalance: countsBy(places, (place) => formatUtcOffset(place.utcOffsetMinutes ?? 0)),
    offsetPopulationShare: offsetShares(pool, bandPopulation),
    offsetLandCoverageShare: offsetShares(pool, bandLandCellCount),
    hourly: routeHours(route),
    localArrivalHistogram: localArrivalHistogram(places, route),
    localArrivalMin: arrivals.min,
    localArrivalMax: arrivals.max,
    ...legDistances,
    subnationalCoverageNote: subnationalNote(adminCoverage),
    legs,
    eastwardLegs: legs.filter((leg) => isEastwardDelta(leg.eastwardDegrees)),
    detours: detours(places),
    longestLegs: [...legs].sort((left, right) => right.km - left.km).slice(0, 20),
    issues: [],
    ...speeds,
    totalDistanceKm: legs.reduce((total, leg) => total + leg.km, 0),
    populationWithin500Km: coverage.covered,
    worldPopulationEstimate: coverage.total,
    populationCoverageWithin500Km: coverage.share,
    lastDepartureUtc: new Date(lastDeparture).toISOString(),
    routeEndUtc: new Date(routeEnd).toISOString(),
  };
}
