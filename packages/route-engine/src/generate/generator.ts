import { createLocationId, LegacyRouteFixtureSchema, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { validateRouteGeometry } from '../geometry-validate';
import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import { validateRoute } from '../validate';
import type { RouteOverrides } from './overrides';
import { chooseCandidates } from './candidates';
import { scheduledTravelMilliseconds, sweepOrder } from './order';
import { buildReport } from './report';
import { eastwardLegReason, isEastwardDelta, isInChristmasWindow, localClock, longitudeDelta, stopDurationSeconds, stopTier } from './sweep';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratedRoute, type GeneratorConfig, type RouteReport } from './types';

type TimezoneTables = {
  zonesByCountry: Record<string, string[]>;
  zonePointsByCountry?: Record<string, { timezone: string; lat: number; lng: number }[]>;
  utcOffsetsByTimezone?: Record<string, number>;
  countryNames?: Record<string, string>;
};

export { DEFAULT_GENERATOR_LIMITS };
export type { Candidate, GeneratedRoute, GeneratorConfig, RouteReport } from './types';

function stableHash(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function normalizeCandidateTimezones(pool: Candidate[], overrides: RouteOverrides, tables?: TimezoneTables): { candidates: Candidate[]; invalidCandidateIds: string[] } {
  if (!tables) return { candidates: pool, invalidCandidateIds: [] };
  const candidates: Candidate[] = [];
  const invalidCandidateIds: string[] = [];
  for (const place of pool) {
    try {
      candidates.push(normalizeCandidateTimezone(place, overrides, tables));
    } catch (error) {
      if (!isInvalidCandidateTimezoneError(error)) throw error;
      invalidCandidateIds.push(place.id);
    }
  }
  return { candidates, invalidCandidateIds };
}

function isInvalidCandidateTimezoneError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return error.message.startsWith('No IANA timezone table for country ')
    || error.message.startsWith('Invalid candidate IANA time zone:');
}

function isSupportedIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function normalizeCandidateTimezone(place: Candidate, overrides: RouteOverrides, tables: TimezoneTables): Candidate {
  if (!isSupportedIanaTimezone(place.timezone) && !overrides.timezone?.[place.id]) {
    throw new Error(`Invalid candidate IANA time zone: ${place.name} (${place.timezone})`);
  }
  const allowed = tables.zonesByCountry[place.country];
  if (!allowed) throw new Error(`No IANA timezone table for country ${place.country} (${place.name})`);
  if (allowed.includes(place.timezone)) return requireSnapshotOffset(place);
  return timezoneForMismatch(place, overrides, tables);
}

function requireSnapshotOffset(place: Candidate): Candidate {
  if (place.utcOffsetMinutes === undefined) throw new Error(`Missing snapshot UTC offset for ${place.name}`);
  return place;
}

function timezoneForMismatch(place: Candidate, overrides: RouteOverrides, tables: TimezoneTables): Candidate {
  if (overrides.timezone?.[place.id]) throw timezoneCountryError(place);
  return nearestCountryTimezone(place, tables);
}

function timezoneCountryError(place: Candidate): Error {
  return new Error(`Timezone ${place.timezone} for ${place.name} does not belong to country ${place.country}`);
}

function nearestCountryTimezone(place: Candidate, tables: TimezoneTables): Candidate {
  const points = tables.zonePointsByCountry?.[place.country] ?? [];
  const first = points[0];
  if (!first) throw timezoneCountryError(place);
  const nearest = points.reduce((best, point) => haversineKm(place, point) < haversineKm(place, best) ? point : best, first);
  const utcOffsetMinutes = tables.utcOffsetsByTimezone?.[nearest.timezone];
  if (utcOffsetMinutes === undefined) throw new Error(`Missing committed UTC offset for ${nearest.timezone}`);
  return { ...place, timezone: nearest.timezone, utcOffsetMinutes };
}

function humanCountry(code: string, tables?: TimezoneTables): string {
  return tables?.countryNames?.[code] ?? code;
}

function speedCurve(kmh: number): string {
  if (kmh < 6_000) return 'CRUISING';
  if (kmh <= 14_000) return 'REGIONAL';
  return 'HYPERSONIC';
}

type TransitOptions = {
  from: LatLng & { utcOffsetMinutes?: number };
  to: LatLng;
  travelDurationMilliseconds: number;
  description: string;
  cameraZoom?: number;
  eastwardReason?: 'dateline' | 'offset-anomaly' | 'return';
};

function transit({ from, to, travelDurationMilliseconds, description, cameraZoom = 9, eastwardReason }: TransitOptions) {
  const durationSeconds = Math.max(0, Math.ceil(travelDurationMilliseconds / 1000));
  const distanceKm = haversineKm(from, to);
  const speedKmh = durationSeconds > 0 ? legSpeedKmh(from, to, durationSeconds) ?? 0 : 0;
  const result: Record<string, unknown> = {
    description,
    duration_seconds: durationSeconds,
    distance_km: Math.round(distanceKm * 100) / 100,
    speed_curve: speedCurve(speedKmh),
    speed_kmh: Math.round(speedKmh),
    camera_zoom: cameraZoom,
  };
  if (isEastwardDelta(longitudeDelta(from, to))) {
    // Candidate timing rejects this path before document building. Keep this
    // fail-closed guard so a future caller cannot persist an unaudited reversal.
    if (!eastwardReason) throw new Error(`Unjustified eastward leg to ${'name' in to ? to.name : 'North Pole'}`);
    result.eastward_reason = eastwardReason;
  }
  return result;
}

function localTimeLabel(place: Candidate, arrival: number): string {
  const local = localClock({ iso: new Date(arrival).toISOString(), timezoneOrOffset: place.utcOffsetMinutes ?? 0 });
  return `${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}`;
}

function startNode(): Record<string, unknown> {
  return {
    id: 'start_north_pole_2026',
    type: 'START',
    comment: 'START at the North Pole',
    location: { name: 'North Pole', region: 'Arctic', lat: NORTH_POLE.lat, lng: NORTH_POLE.lng, timezone_offset: 0 },
    schedule: { arrival_utc: null, departure_utc: TAKEOFF_UTC, local_arrival_time: null, time_window_status: 'TAKEOFF' },
    stop_experience: { duration_seconds: 0, camera_zoom: 4, weather_condition: 'blizzard', presents_delivered_at_stop: 0 },
    transit_to_here: null,
  };
}

type DeliveryNodeResult = { node: Record<string, unknown>; stop: Route['stops'][number]; locationId: string };

type DeliveryNodeOptions = {
  place: Candidate;
  index: number;
  config: GeneratorConfig;
  tables: TimezoneTables | undefined;
  priorLocation: Candidate | LatLng;
};

function buildDeliveryNode({ place, index, config, tables, priorLocation }: DeliveryNodeOptions): DeliveryNodeResult {
  const stopArrival = place.plannedArrivalUtc
    ? Date.parse(place.plannedArrivalUtc)
    : Number.NaN;
  const tier = place.plannedStopTier ?? stopTier(place);
  const durationSeconds = place.plannedStopDurationSeconds ?? stopDurationSeconds(tier);
  if (!Number.isFinite(stopArrival)) throw new Error(`Missing sweep arrival for ${place.name}`);
  const stopDeparture = stopArrival + durationSeconds * 1000;
  const stopId = `stop_${stableHash(place.id, config.seed).toString(36)}_${index.toString().padStart(3, '0')}`;
  const locationId = createLocationId(stopId);
  const stop: Route['stops'][number] = {
    locationId,
    arrivalIso: new Date(stopArrival).toISOString(),
    departureIso: new Date(stopDeparture).toISOString(),
    durationSeconds,
  };
  const node: Record<string, unknown> = {
    id: stopId,
    type: 'DELIVERY',
    comment: place.category,
    candidate_id: place.id,
    location: {
      name: place.name,
      region: humanCountry(place.country, tables),
      country_code: place.country,
      timezone: place.timezone,
      lat: place.lat,
      lng: place.lng,
      timezone_offset: (place.utcOffsetMinutes ?? 0) / 60,
    },
    schedule: {
      arrival_utc: new Date(stopArrival).toISOString(),
      departure_utc: new Date(stopDeparture).toISOString(),
      local_arrival_time: localTimeLabel(place, stopArrival),
      time_window_status: 'GREEN',
    },
    stop_experience: { duration_seconds: durationSeconds, stop_tier: tier, camera_zoom: 14, weather_condition: 'clear', presents_delivered_at_stop: 1 },
    transit_to_here: transit({
      from: priorLocation,
      to: place,
      travelDurationMilliseconds: scheduledTravelMilliseconds(priorLocation, place, config),
      description: index === 0 ? `Launch to ${place.name}` : `Flight to ${place.name}`,
      eastwardReason: eastwardLegReason({ from: priorLocation, to: place, destinationIndex: index, arrivalUtc: stopArrival }),
    }),
    notes: place.source ?? null,
    priority: place.worldCity ? 1 : 2,
  };
  return { node, stop, locationId };
}

function endNode(last: Candidate, priorDeparture: number, config: GeneratorConfig): { node: Record<string, unknown>; routeEndUtc: string } {
  const returnSeconds = Math.max(1, Math.ceil(scheduledTravelMilliseconds(last, NORTH_POLE, config) / 1000));
  const endArrival = priorDeparture + returnSeconds * 1000;
  const endDeparture = endArrival + 1000;
  return {
    routeEndUtc: new Date(endArrival).toISOString(),
    node: {
      id: 'end_north_pole_2026',
      type: 'END',
      comment: 'END at the North Pole',
      location: { name: 'North Pole', region: 'Arctic', lat: NORTH_POLE.lat, lng: NORTH_POLE.lng, timezone_offset: 0 },
      schedule: { arrival_utc: new Date(endArrival).toISOString(), departure_utc: new Date(endDeparture).toISOString(), local_arrival_time: null, time_window_status: 'HOME' },
      stop_experience: { duration_seconds: 0, camera_zoom: 4, weather_condition: 'blizzard', presents_delivered_at_stop: 0 },
      transit_to_here: transit({ from: last, to: NORTH_POLE, travelDurationMilliseconds: scheduledTravelMilliseconds(last, NORTH_POLE, config), description: 'Return to the North Pole', cameraZoom: 4,
        eastwardReason: isEastwardDelta(longitudeDelta(last, NORTH_POLE)) ? 'return' : undefined }),
    },
  };
}

function buildDocument(places: Candidate[], config: GeneratorConfig, tables?: TimezoneTables): { document: GeneratedRoute['document']; route: Route; coordinates: Map<string, LatLng>; routeEndUtc: string } {
  const takeoff = Date.parse(TAKEOFF_UTC);
  const routeNodes: Record<string, unknown>[] = [startNode()];
  const stops: Route['stops'] = [];
  const coordinates = new Map<string, LatLng>();
  let priorDeparture = takeoff;
  let priorLocation: Candidate | LatLng = NORTH_POLE;
  for (const [index, place] of places.entries()) {
    const result = buildDeliveryNode({ place, index, config, tables, priorLocation });
    coordinates.set(result.locationId, place);
    stops.push(result.stop);
    routeNodes.push(result.node);
    priorDeparture = Date.parse(result.stop.departureIso);
    priorLocation = place;
  }

  const last = places.at(-1);
  if (!last) throw new Error('Cannot build an empty route');
  const ending = endNode(last, priorDeparture, config);
  routeNodes.push(ending.node);
  const route = { schemaVersion: SCHEMA_VERSION, season: 2026, stops } as Route;
  const document = {
    meta: { year: 2026, route_version: '2026-draft-1', generated_at: config.generatedAt },
    route_nodes: routeNodes,
  };
  LegacyRouteFixtureSchema.parse(document);
  return { document, route, coordinates, routeEndUtc: ending.routeEndUtc };
}

function validateArrivalWindow(route: Route, places: Candidate[], config: GeneratorConfig): void {
  route.stops.forEach((stop, index) => {
    const place = places[index];
    if (!place) throw new Error(`Missing candidate for route stop ${index + 1}`);
    if (!isInChristmasWindow({ iso: stop.arrivalIso, timezoneOrOffset: place.utcOffsetMinutes ?? 0 })) {
      throw new Error(`${place.name} arrives outside its local window`);
    }
  });
}

function validateIntegerSettings(config: GeneratorConfig): void {
  const integers: [number, number, string][] = [
    [config.seed, Number.MIN_SAFE_INTEGER, 'Invalid seed'],
    [config.maxStopsPerCountry, 1, 'Invalid country total limit'],
  ];
  for (const [value, minimum, message] of integers) assertSafeIntegerSetting(value, minimum, message);
}

function assertSafeIntegerSetting(value: number, minimum: number, message: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(message);
}

function validateSpeedAndDistanceSettings(config: GeneratorConfig): void {
  const positives: [number, string, boolean][] = [
    [config.localLegSpeedKmh, 'Invalid local leg speed', false],
    [config.targetLegSpeedKmh, 'Invalid target leg speed', false],
    [config.maxLegSpeedKmh, 'Invalid maximum leg speed', false],
    [config.p90LegSpeedMaxKmh, 'Invalid p90 speed maximum', false],
    [config.minStopSeparationKm, 'Invalid minimum stop separation', false],
  ];
  for (const [value, message, allowZero] of positives) assertNonNegativeSetting(value, message, allowZero);
  if (config.p90LegSpeedMaxKmh > config.maxLegSpeedKmh) throw new Error('p90 speed limit cannot exceed the hard speed limit');
}

function assertNonNegativeSetting(value: number, message: string, allowZero: boolean): void {
  if (!Number.isFinite(value)) throw new Error(message);
  if (value < 0) throw new Error(message);
  if (!allowZero && value === 0) throw new Error(message);
}

function validateCategoryWeights(weights: Record<string, number>): void {
  const entries = Object.entries(weights);
  if (entries.length === 0) throw new Error('Category weights are required');
  if (entries.some(([, weight]) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error('Category weights must be finite and non-negative');
  }
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Category weights must have a finite positive total');
}

function validateGeneratorConfig(config: GeneratorConfig): void {
  validateIntegerSettings(config);
  validateSpeedAndDistanceSettings(config);
  validateCategoryWeights(config.weights);
  if (!config.generatedAt || Number.isNaN(Date.parse(config.generatedAt))) throw new Error('Invalid fixed generation date');
}

type BuiltRouteValidationOptions = {
  route: Route;
  coordinates: Map<string, LatLng>;
  routeEndUtc: string;
  ordered: Candidate[];
  pool: Candidate[];
  config: GeneratorConfig;
};

function validateBuiltRoute({ route, coordinates, routeEndUtc, ordered, pool, config }: BuiltRouteValidationOptions): RouteReport {
  validateArrivalWindow(route, ordered, config);
  const validation = validateRoute(route);
  if (!validation.ok) throw new Error(`Invalid generated route: ${validation.issues.map((issue) => issue.message).join('; ')}`);
  const geometry = validateRouteGeometry(route, coordinates, { maxSpeedKmh: config.maxLegSpeedKmh });
  const geometryErrors = geometry.issues.filter((issue) => issue.severity === 'error');
  if (geometryErrors.length > 0) throw new Error(`Invalid route geometry: ${geometryErrors.map((issue) => issue.message).join('; ')}`);
  const report = buildReport(ordered, route, config, pool);
  validateRouteLimits(report, routeEndUtc, config);
  addGeometryWarnings(report, geometry.issues, route, ordered);
  return report;
}

function validateMaximumSpeed(report: RouteReport, config: GeneratorConfig): void {
  if (report.maxLegSpeedKmh <= config.maxLegSpeedKmh) return;
  const leg = report.legs.find((item) => item.kmh > config.maxLegSpeedKmh);
  throw new Error(`Leg ${leg?.from} to ${leg?.to} requires ${Math.round(leg?.kmh ?? 0)} km/h, above ${config.maxLegSpeedKmh}`);
}

function validateP90Speed(report: RouteReport, config: GeneratorConfig): void {
  if (report.p90LegSpeedKmh > config.p90LegSpeedMaxKmh) {
    throw new Error(`Route p90 ${Math.round(report.p90LegSpeedKmh)} km/h exceeds ${config.p90LegSpeedMaxKmh}`);
  }
}

function validateReturnDeadline(routeEndUtc: string): void {
  if (Date.parse(routeEndUtc) > Date.parse(RETURN_DEADLINE_UTC)) {
    throw new Error(`North Pole return at ${routeEndUtc} exceeds the 28-hour flight window`);
  }
}

function validateNoDetours(report: RouteReport): void {
  if (report.detours.length > 0) {
    throw new Error(`Route contains detours over 2.5x: ${report.detours.map((item) => item.via).join(', ')}`);
  }
}

function validateRouteLimits(report: RouteReport, routeEndUtc: string, config: GeneratorConfig): void {
  validateMaximumSpeed(report, config);
  validateP90Speed(report, config);
  validateReturnDeadline(routeEndUtc);
  validateNoDetours(report);
}

function addGeometryWarnings(report: RouteReport, geometryIssues: ReturnType<typeof validateRouteGeometry>['issues'],
  route: Route, ordered: Candidate[]): void {
  const placeNamesByLocationId = new Map<string, string>();
  ordered.forEach((place, index) => {
    const locationId = route.stops[index]?.locationId;
    if (locationId) placeNamesByLocationId.set(locationId, place.name);
  });
  report.issues.push(...geometryIssues.filter((issue) => issue.severity === 'warning').map((issue) => {
    let message = issue.message;
    for (const [locationId, name] of placeNamesByLocationId) message = message.replaceAll(locationId, name);
    return message;
  }));
}

export function generateRoute(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides = {}, tables?: TimezoneTables): GeneratedRoute {
  validateGeneratorConfig(config);
  const selection = chooseCandidates(pool, config, overrides);
  const normalized = normalizeCandidateTimezones(selection.candidates, overrides, tables);
  const chosen = normalized.candidates;
  if (chosen.length === 0) throw new Error('No eligible route candidates remain after timezone validation');
  const ordered = sweepOrder(chosen, config);
  const built = buildDocument(ordered, config, tables);
  const report = validateBuiltRoute({ route: built.route, coordinates: built.coordinates, routeEndUtc: built.routeEndUtc, ordered, pool: chosen, config });
  report.invalidCandidateIds = [...selection.invalidCandidateIds, ...normalized.invalidCandidateIds];
  report.issues.push(...report.invalidCandidateIds.map((id) => `Invalid candidate row skipped: ${id}`));
  return { document: built.document, route: built.route, locations: ordered, report };
}
