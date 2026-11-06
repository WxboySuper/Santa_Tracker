import { createLocationId, LegacyRouteFixtureSchema, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { validateRouteGeometry } from '../geometry-validate';
import type { LatLng } from '../geo';
import { haversineKm } from '../geo';
import { validateRoute } from '../validate';
import { chooseCandidates } from './candidates';
import { sweepOrder } from './order';
import { buildReport } from './report';
import { christmasArrival } from './sweep';
import type { RouteOverrides } from './overrides';
import { christmasOffset, localMinute } from './timezone';
import type { Candidate, GeneratedRoute, GeneratorConfig } from './types';

export { DEFAULT_GENERATOR_LIMITS } from './types';
export type { Candidate, GeneratedRoute, GeneratorConfig, RouteReport } from './types';

function stableHash(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
type StopContext = { config: GeneratorConfig; prior?: Candidate; lastDeparture: number };
function createStop(index: number, place: Candidate, context: StopContext) {
  const { config, prior, lastDeparture } = context;
  const target = Date.parse(christmasArrival(place.timezone, place.plannedMinute ?? config.arrivalStartMinute));
  const distance = prior ? haversineKm(prior, place) : 0;
  const travel = Math.ceil(distance / config.maxSpeedKmh * 3_600_000) + 1;
  const arrival = new Date(Math.max(target, lastDeparture + travel)).toISOString();
  const minute = localMinute(arrival, place.timezone);
  if (minute < config.arrivalStartMinute || minute > config.arrivalEndMinute) throw new Error(`${place.name} arrives outside its local window at ${arrival}`);
  const departure = new Date(Date.parse(arrival) + config.durationSeconds * 1000).toISOString();
  const id = `stop_${stableHash(place.id, config.seed).toString(36)}_${index}`;
  return { id, arrival, departure, locationId: createLocationId(id) };
}
function buildDocument(places: Candidate[], config: GeneratorConfig): { document: GeneratedRoute['document']; route: Route; coordinates: Map<string, LatLng> } {
  const routeNodes: Record<string, unknown>[] = [];
  const stops: Route['stops'] = [];
  const coordinates = new Map<string, LatLng>();
  let departureTime = 0;
  let previous: Candidate | undefined;
  for (const [index, place] of places.entries()) {
    const stop = createStop(index, place, { config, prior: previous, lastDeparture: departureTime });
    coordinates.set(stop.locationId, place);
    stops.push({ locationId: stop.locationId, arrivalIso: stop.arrival, departureIso: stop.departure, durationSeconds: config.durationSeconds });
    routeNodes.push({ id: stop.id, type: 'DELIVERY', location: { name: place.name, region: place.country, lat: place.lat, lng: place.lng, timezone_offset: christmasOffset(place.timezone) / 60 }, schedule: { arrival_utc: stop.arrival, departure_utc: stop.departure, local_arrival_time: null, time_window_status: null }, stop_experience: { duration_seconds: config.durationSeconds, camera_zoom: null, weather_condition: null, presents_delivered_at_stop: 0 }, transit_to_here: null, comment: place.category, notes: place.source ?? null, priority: 2 });
    departureTime = Date.parse(stop.departure);
    previous = place;
  }
  const route = { schemaVersion: SCHEMA_VERSION, season: 2026, stops } as Route;
  const document = { meta: { year: 2026, route_version: '1.0', generated_at: '2026-12-24T00:00:00.000Z' }, route_nodes: routeNodes };
  LegacyRouteFixtureSchema.parse(document);
  return { document, route, coordinates };
}
function validateGeneratedRoute(route: Route, coordinates: Map<string, LatLng>, config: GeneratorConfig): void {
  const validation = validateRoute(route);
  if (!validation.ok) throw new Error(`Invalid generated route: ${validation.issues.map((issue) => issue.message).join('; ')}`);
  const geometry = validateRouteGeometry(route, coordinates, { maxSpeedKmh: config.maxSpeedKmh });
  const errors = geometry.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
  if (errors.length) throw new Error(`Invalid route geometry: ${errors.join('; ')}`);
}
function addReportWarnings(report: GeneratedRoute['report'], config: GeneratorConfig): void {
  if (config.westernHours > 0 && report.westernMinimum < config.minimumStopsPerHour) report.issues.push(`Western hourly minimum ${report.westernMinimum} is below target ${config.minimumStopsPerHour}; sparse final time zones limit available verified stops.`);
  const longLegs = report.flags.filter((flag) => flag.longGap > 0).length;
  if (longLegs > 0) report.issues.push(`Distance threshold relaxed for ${longLegs} legs over ${config.maxGapKm} km to preserve the global stop mix and the 26-hour sweep.`);
}
function requireIntegerAtLeast(value: number, minimum: number, message: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(message);
  if (value < minimum) throw new Error(message);
}
function requireFiniteAtLeast(value: number, minimum: number, message: string): void {
  if (!Number.isFinite(value)) throw new Error(message);
  if (value < minimum) throw new Error(message);
}
function validateArrivalWindow(config: GeneratorConfig): void {
  requireIntegerAtLeast(config.arrivalStartMinute, 0, 'Invalid arrival window');
  requireIntegerAtLeast(config.arrivalEndMinute, 0, 'Invalid arrival window');
  if (config.arrivalEndMinute > 1439) throw new Error('Invalid arrival window');
  if (config.arrivalStartMinute > config.arrivalEndMinute) throw new Error('Invalid arrival window');
}
function validateGeneratorConfig(config: GeneratorConfig): void {
  requireIntegerAtLeast(config.seed, Number.MIN_SAFE_INTEGER, 'Invalid seed');
  requireIntegerAtLeast(config.total, 1, 'Invalid stop total');
  if (Object.keys(config.weights).length === 0) throw new Error('Category weights are required');
  validateArrivalWindow(config);
  requireIntegerAtLeast(config.durationSeconds, 1, 'Invalid stop duration');
  requireFiniteAtLeast(config.maxSpeedKmh, Number.MIN_VALUE, 'Invalid maximum speed');
  requireFiniteAtLeast(config.maxGapKm, 0, 'Invalid maximum gap');
  requireIntegerAtLeast(config.maxCountryRun, 1, 'Invalid country run limit');
  requireFiniteAtLeast(config.minimumStopsPerHour, 0, 'Invalid hourly minimum');
  requireIntegerAtLeast(config.westernHours, 0, 'Invalid western hour count');
}
export function generateRoute(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides = {}): GeneratedRoute {
  validateGeneratorConfig(config);
  const chosen = chooseCandidates(pool, config, overrides);
  const ordered = sweepOrder(chosen, config);
  const { document, route, coordinates } = buildDocument(ordered, config);
  validateGeneratedRoute(route, coordinates, config);
  const report = buildReport(ordered, route, config, coordinates);
  report.issues = validateRouteGeometry(route, coordinates, { maxSpeedKmh: config.maxSpeedKmh }).issues.map((issue) => issue.message);
  addReportWarnings(report, config);
  return { document, route, locations: ordered, report };
}
