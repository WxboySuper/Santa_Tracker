import { createLocationId, LegacyRouteFixtureSchema, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { validateRouteGeometry } from '../geometry-validate';
import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import { validateRoute } from '../validate';
import { applyCandidateOverrides, type RouteOverrides } from './overrides';
import { chooseCandidates } from './candidates';
import { sweepOrder } from './order';
import { buildReport } from './report';
import { christmasArrival } from './sweep';
import { localMinute } from './timezone';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratedRoute, type GeneratorConfig, type RouteReport } from './types';

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

function normalizeCandidateTimezones(pool: Candidate[], overrides: RouteOverrides, tables?: TimezoneTables): Candidate[] {
  const applied = applyCandidateOverrides(pool, overrides);
  if (!tables) return applied;
  return applied.map((place) => normalizeCandidateTimezone(place, overrides, tables));
}

function normalizeCandidateTimezone(place: Candidate, overrides: RouteOverrides, tables: TimezoneTables): Candidate {
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
  from: LatLng;
  to: LatLng;
  fromDeparture: number;
  toArrival: number;
  description: string;
  cameraZoom?: number;
};

function transit({ from, to, fromDeparture, toArrival, description, cameraZoom = 9 }: TransitOptions) {
  const durationSeconds = Math.max(0, Math.ceil((toArrival - fromDeparture) / 1000));
  const distanceKm = haversineKm(from, to);
  const speedKmh = durationSeconds > 0 ? legSpeedKmh(from, to, durationSeconds) ?? 0 : 0;
  return {
    description,
    duration_seconds: durationSeconds,
    distance_km: Math.round(distanceKm * 100) / 100,
    speed_curve: speedCurve(speedKmh),
    speed_kmh: Math.round(speedKmh),
    camera_zoom: cameraZoom,
  };
}

function localTimeLabel(place: Candidate, arrival: number): string {
  const minute = localMinute(new Date(arrival).toISOString(), place.utcOffsetMinutes ?? 0);
  return `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
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
  priorLocation: LatLng;
  priorDeparture: number;
};

function buildDeliveryNode({ place, index, config, tables, priorLocation, priorDeparture }: DeliveryNodeOptions): DeliveryNodeResult {
  const stopArrival = place.plannedArrivalUtc
    ? Date.parse(place.plannedArrivalUtc)
    : Date.parse(christmasArrival(place.utcOffsetMinutes ?? 0, place.plannedMinute ?? config.arrivalStartMinute));
  const stopDeparture = stopArrival + config.durationSeconds * 1000;
  const stopId = `stop_${stableHash(place.id, config.seed).toString(36)}_${index.toString().padStart(3, '0')}`;
  const locationId = createLocationId(stopId);
  const stop: Route['stops'][number] = {
    locationId,
    arrivalIso: new Date(stopArrival).toISOString(),
    departureIso: new Date(stopDeparture).toISOString(),
    durationSeconds: config.durationSeconds,
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
    stop_experience: { duration_seconds: config.durationSeconds, camera_zoom: 14, weather_condition: 'clear', presents_delivered_at_stop: 1 },
    transit_to_here: transit({
      from: priorLocation,
      to: place,
      fromDeparture: priorDeparture,
      toArrival: stopArrival,
      description: index === 0 ? `Launch to ${place.name}` : `Flight to ${place.name}`,
    }),
    notes: place.source ?? null,
    priority: place.worldCity ? 1 : 2,
  };
  return { node, stop, locationId };
}

function endNode(last: Candidate, priorDeparture: number, config: GeneratorConfig): { node: Record<string, unknown>; routeEndUtc: string } {
  const returnDistance = haversineKm(last, NORTH_POLE);
  const returnSeconds = Math.max(1, Math.ceil(returnDistance / config.targetLegSpeedKmh * 3600));
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
      transit_to_here: transit({ from: last, to: NORTH_POLE, fromDeparture: priorDeparture, toArrival: endArrival, description: 'Return to the North Pole', cameraZoom: 4 }),
    },
  };
}

function buildDocument(places: Candidate[], config: GeneratorConfig, tables?: TimezoneTables): { document: GeneratedRoute['document']; route: Route; coordinates: Map<string, LatLng>; routeEndUtc: string } {
  const takeoff = Date.parse(TAKEOFF_UTC);
  const routeNodes: Record<string, unknown>[] = [startNode()];
  const stops: Route['stops'] = [];
  const coordinates = new Map<string, LatLng>();
  let priorDeparture = takeoff;
  let priorLocation: LatLng = NORTH_POLE;
  for (const [index, place] of places.entries()) {
    const result = buildDeliveryNode({ place, index, config, tables, priorLocation, priorDeparture });
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
    const minute = localMinute(stop.arrivalIso, place.utcOffsetMinutes ?? 0);
    if (minute < config.arrivalStartMinute || minute > config.arrivalEndMinute) throw new Error(`${place.name} arrives outside its local window`);
  });
}

function validateIntegerSettings(config: GeneratorConfig): void {
  const integers: [number, number, string][] = [
    [config.seed, Number.MIN_SAFE_INTEGER, 'Invalid seed'],
    [config.total, 1, 'Invalid stop total'],
    [config.arrivalStartMinute, 0, 'Invalid arrival window'],
    [config.arrivalEndMinute, 0, 'Invalid arrival window'],
    [config.durationSeconds, 1, 'Invalid stop duration'],
    [config.maxCountryRun, 1, 'Invalid country run limit'],
    [config.maxStopsPerCountry, 1, 'Invalid country total limit'],
    [config.minArrivalGapMinutes, 1, 'Invalid minimum arrival gap'],
    [config.maxArrivalGapMinutes, 1, 'Invalid maximum arrival gap'],
  ];
  for (const [value, minimum, message] of integers) {
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(message);
  }
  if (config.arrivalEndMinute > 1439 || config.arrivalStartMinute > config.arrivalEndMinute) throw new Error('Invalid arrival window');
}

function validateSpeedAndDistanceSettings(config: GeneratorConfig): void {
  const positives: [number, string, boolean][] = [
    [config.targetLegSpeedKmh, 'Invalid target leg speed', false],
    [config.maxLegSpeedKmh, 'Invalid maximum leg speed', false],
    [config.medianLegSpeedMinKmh, 'Invalid median minimum', false],
    [config.medianLegSpeedMaxKmh, 'Invalid median maximum', false],
    [config.p90LegSpeedMaxKmh, 'Invalid p90 speed maximum', false],
    [config.maxRouteDistanceKm, 'Invalid route distance maximum', false],
    [config.minStopSeparationKm, 'Invalid minimum stop separation', true],
  ];
  for (const [value, message, allowZero] of positives) assertNonNegativeSetting(value, message, allowZero);
}

function assertNonNegativeSetting(value: number, message: string, allowZero: boolean): void {
  if (!Number.isFinite(value)) throw new Error(message);
  if (value < 0) throw new Error(message);
  if (!allowZero && value === 0) throw new Error(message);
}

function validateGeneratorConfig(config: GeneratorConfig): void {
  validateIntegerSettings(config);
  validateSpeedAndDistanceSettings(config);
  if (Object.keys(config.weights).length === 0) throw new Error('Category weights are required');
  if (!config.generatedAt || Number.isNaN(Date.parse(config.generatedAt))) throw new Error('Invalid fixed generation date');
}

type BuiltRouteValidationOptions = {
  route: Route;
  coordinates: Map<string, LatLng>;
  routeEndUtc: string;
  ordered: Candidate[];
  config: GeneratorConfig;
};

function validateBuiltRoute({ route, coordinates, routeEndUtc, ordered, config }: BuiltRouteValidationOptions): RouteReport {
  validateArrivalWindow(route, ordered, config);
  const validation = validateRoute(route);
  if (!validation.ok) throw new Error(`Invalid generated route: ${validation.issues.map((issue) => issue.message).join('; ')}`);
  const geometry = validateRouteGeometry(route, coordinates, { maxSpeedKmh: config.maxLegSpeedKmh });
  const geometryErrors = geometry.issues.filter((issue) => issue.severity === 'error');
  if (geometryErrors.length > 0) throw new Error(`Invalid route geometry: ${geometryErrors.map((issue) => issue.message).join('; ')}`);
  const report = buildReport(ordered, route, config);
  validateRouteLimits(report, routeEndUtc, config);
  addGeometryWarnings(report, geometry.issues, route, ordered);
  return report;
}

function validateRouteLimits(report: RouteReport, routeEndUtc: string, config: GeneratorConfig): void {
  if (report.maxLegSpeedKmh > config.maxLegSpeedKmh) {
    const leg = report.legs.find((item) => item.kmh > config.maxLegSpeedKmh);
    throw new Error(`Leg ${leg?.from} to ${leg?.to} requires ${Math.round(leg?.kmh ?? 0)} km/h, above ${config.maxLegSpeedKmh}`);
  }
  if (Date.parse(report.lastDepartureUtc) > Date.parse(TAKEOFF_UTC) + 27 * 3_600_000) throw new Error('Last delivery departure exceeds takeoff plus 27 hours');
  if (Date.parse(routeEndUtc) > Date.parse(TAKEOFF_UTC) + 27 * 3_600_000 + 45 * 60_000) throw new Error(`North Pole return at ${routeEndUtc} leaves less than 15 minutes inside the 28-hour flight window`);
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
  const normalizedPool = normalizeCandidateTimezones(pool, overrides, tables);
  const chosen = chooseCandidates(normalizedPool, config, overrides, tables);
  const ordered = sweepOrder(chosen, config);
  const built = buildDocument(ordered, config, tables);
  const report = validateBuiltRoute({ route: built.route, coordinates: built.coordinates, routeEndUtc: built.routeEndUtc, ordered, config });
  return { document: built.document, route: built.route, locations: ordered, report };
}
