import type { Route } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh, type LatLng } from './geo';

export type GeometryIssueSeverity = 'error' | 'warning';

export type GeometryIssue = {
  severity: GeometryIssueSeverity;
  path: string;
  message: string;
};

export type GeometryValidationOptions = {
  /** Legs faster than this are errors (default 40,000 km/h; chosen so the story stays "magical but legible"). */
  maxSpeedKmh?: number;
  /** Legs slower than this are warnings: Santa would look stalled on the map (default 200 km/h). */
  minSpeedKmh?: number;
  /** Gaps longer than this between departure and the next arrival are warnings (default 45 minutes). */
  maxGapSeconds?: number;
};

export type GeometryValidationResult = {
  ok: boolean;
  issues: GeometryIssue[];
  /** Total great-circle distance of the whole route in km (stops with known coordinates only). */
  totalDistanceKm: number;
};

type Limits = Required<GeometryValidationOptions>;
type Stop = Route['stops'][number];

const DEFAULTS: Limits = {
  maxSpeedKmh: 40_000,
  minSpeedKmh: 200,
  maxGapSeconds: 45 * 60,
};

/** Per-field merge: `{ ...DEFAULTS, ...options }` would let an explicit `undefined` wipe a default. */
function resolveLimits(options: GeometryValidationOptions): Limits {
  return {
    maxSpeedKmh: options.maxSpeedKmh ?? DEFAULTS.maxSpeedKmh,
    minSpeedKmh: options.minSpeedKmh ?? DEFAULTS.minSpeedKmh,
    maxGapSeconds: options.maxGapSeconds ?? DEFAULTS.maxGapSeconds,
  };
}

/** Legs shorter than this are treated as "same place" for travel-time and stall checks. */
const SAME_PLACE_KM = 1;

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function validCoordinate(point: LatLng | undefined): point is LatLng {
  return point !== undefined && inRange(point.lat, -90, 90) && inRange(point.lng, -180, 180);
}

function coordinateIssues(route: Route, coordinates: ReadonlyMap<string, LatLng>): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  route.stops.forEach((stop, i) => {
    if (validCoordinate(coordinates.get(stop.locationId))) return;
    issues.push({
      severity: 'error',
      path: `stops.${i}.locationId`,
      message: `no valid coordinates for location "${stop.locationId}"`,
    });
  });
  return issues;
}

type Leg = {
  index: number;
  prev: Stop;
  stop: Stop;
  distanceKm: number;
  gapSeconds: number;
};

function arrivalIssue(leg: Leg, severity: GeometryIssueSeverity, message: string): GeometryIssue {
  return { severity, path: `stops.${leg.index}.arrivalIso`, message };
}

/**
 * A stop must not arrive before the previous stop departs, wherever they are. `validateRoute`
 * only checks each stop's own times and that arrivals increase, so overlap is caught here.
 * An unparseable timestamp (NaN) is reported the same way.
 */
function overlapIssue(leg: Leg): GeometryIssue | null {
  if (Number.isFinite(leg.gapSeconds) && leg.gapSeconds >= 0) return null;
  return arrivalIssue(
    leg,
    'error',
    `"${leg.stop.locationId}" arrives before "${leg.prev.locationId}" departs (overlapping or invalid times)`,
  );
}

function speedIssue(leg: Leg, from: LatLng, to: LatLng, limits: Limits): GeometryIssue | null {
  const label = `${leg.prev.locationId} -> ${leg.stop.locationId}`;
  const speed = legSpeedKmh(from, to, leg.gapSeconds);

  if (speed === null) {
    // Zero travel time is fine between co-located stops but not between distinct places.
    return leg.distanceKm > SAME_PLACE_KM
      ? arrivalIssue(leg, 'error', `no travel time on leg ${label} (${Math.round(leg.distanceKm)} km apart)`)
      : null;
  }
  if (speed > limits.maxSpeedKmh) {
    return arrivalIssue(leg, 'error', `leg ${label} needs ${Math.round(speed)} km/h (max ${limits.maxSpeedKmh})`);
  }
  if (leg.distanceKm > SAME_PLACE_KM && speed < limits.minSpeedKmh) {
    return arrivalIssue(leg, 'warning', `leg ${label} is only ${Math.round(speed)} km/h; Santa will look stalled`);
  }
  return null;
}

function gapIssue(leg: Leg, limits: Limits): GeometryIssue | null {
  if (leg.gapSeconds <= limits.maxGapSeconds) return null;
  return arrivalIssue(
    leg,
    'warning',
    `${Math.round(leg.gapSeconds / 60)} min between "${leg.prev.locationId}" and "${leg.stop.locationId}"; long quiet stretch on the tracker`,
  );
}

type LocatedLeg = { leg: Leg; from: LatLng; to: LatLng };

/** The leg ending at `index`, or null when either end has no valid coordinates. */
function locatedLegAt(route: Route, index: number, coordinates: ReadonlyMap<string, LatLng>): LocatedLeg | null {
  const prev = route.stops[index - 1];
  const stop = route.stops[index];
  if (!prev || !stop) return null;
  const from = coordinates.get(prev.locationId);
  const to = coordinates.get(stop.locationId);
  if (!validCoordinate(from) || !validCoordinate(to)) return null;
  const distanceKm = haversineKm(from, to);
  const gapSeconds = (Date.parse(stop.arrivalIso) - Date.parse(prev.departureIso)) / 1000;
  return { leg: { index, prev, stop, distanceKm, gapSeconds }, from, to };
}

function legIssues(leg: Leg, from: LatLng, to: LatLng, limits: Limits): GeometryIssue[] {
  const overlap = overlapIssue(leg);
  // An overlapping leg has no meaningful speed or gap, so report only the overlap.
  const found = overlap ? [overlap] : [speedIssue(leg, from, to, limits), gapIssue(leg, limits)];
  return found.filter((issue): issue is GeometryIssue => issue !== null);
}

/**
 * Geometry and pacing checks for a route whose stops have known coordinates.
 * Pure: pass coordinates by location id. Errors fail publication; warnings are for the reviewer.
 *
 * Distances use great-circle (antimeridian-safe) geometry, so a dateline-crossing leg is measured
 * the short way. Chronology itself (departure after arrival, increasing arrivals) is checked by
 * `validateRoute`; this layer assumes it and focuses on where Santa is and how fast he moves.
 */
export function validateRouteGeometry(
  route: Route,
  coordinates: ReadonlyMap<string, LatLng>,
  options: GeometryValidationOptions = {},
): GeometryValidationResult {
  const limits = resolveLimits(options);
  const issues = coordinateIssues(route, coordinates);
  let totalDistanceKm = 0;

  for (let index = 1; index < route.stops.length; index++) {
    const located = locatedLegAt(route, index, coordinates);
    if (!located) continue;
    totalDistanceKm += located.leg.distanceKm;
    issues.push(...legIssues(located.leg, located.from, located.to, limits));
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues, totalDistanceKm };
}
