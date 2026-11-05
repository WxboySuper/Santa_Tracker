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

/** Legs shorter than this are treated as "same place" for travel-time and stall checks. */
const SAME_PLACE_KM = 1;

function validCoordinate(point: LatLng | undefined): point is LatLng {
  return (
    point !== undefined &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
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

function speedIssue(leg: Leg, from: LatLng, to: LatLng, limits: Limits): GeometryIssue | null {
  const label = `${leg.prev.locationId} -> ${leg.stop.locationId}`;
  const speed = legSpeedKmh(from, to, leg.gapSeconds);

  if (speed === null) {
    // Zero or negative travel time between distinct places cannot be displayed.
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

function legIssues(leg: Leg, from: LatLng, to: LatLng, limits: Limits): GeometryIssue[] {
  return [speedIssue(leg, from, to, limits), gapIssue(leg, limits)].filter(
    (issue): issue is GeometryIssue => issue !== null,
  );
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
  const limits: Limits = { ...DEFAULTS, ...options };
  const issues = coordinateIssues(route, coordinates);
  let totalDistanceKm = 0;

  for (let index = 1; index < route.stops.length; index++) {
    const prev = route.stops[index - 1];
    const stop = route.stops[index];
    const from = prev && coordinates.get(prev.locationId);
    const to = stop && coordinates.get(stop.locationId);
    if (!prev || !stop || !validCoordinate(from) || !validCoordinate(to)) continue;

    const distanceKm = haversineKm(from, to);
    totalDistanceKm += distanceKm;
    const gapSeconds = (Date.parse(stop.arrivalIso) - Date.parse(prev.departureIso)) / 1000;
    issues.push(...legIssues({ index, prev, stop, distanceKm, gapSeconds }, from, to, limits));
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues, totalDistanceKm };
}
