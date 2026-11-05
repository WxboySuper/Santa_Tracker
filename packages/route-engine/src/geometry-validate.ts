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

const DEFAULTS: Required<GeometryValidationOptions> = {
  maxSpeedKmh: 40_000,
  minSpeedKmh: 200,
  maxGapSeconds: 45 * 60,
};

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
  const limits = { ...DEFAULTS, ...options };
  const issues: GeometryIssue[] = [];
  let totalDistanceKm = 0;

  route.stops.forEach((stop, i) => {
    const point = coordinates.get(stop.locationId);
    if (!validCoordinate(point)) {
      issues.push({
        severity: 'error',
        path: `stops.${i}.locationId`,
        message: `no valid coordinates for location "${stop.locationId}"`,
      });
    }
  });

  for (let i = 1; i < route.stops.length; i++) {
    const prev = route.stops[i - 1];
    const stop = route.stops[i];
    if (!prev || !stop) continue;
    const from = coordinates.get(prev.locationId);
    const to = coordinates.get(stop.locationId);
    if (!validCoordinate(from) || !validCoordinate(to)) continue;

    const distanceKm = haversineKm(from, to);
    totalDistanceKm += distanceKm;

    const gapSeconds = (Date.parse(stop.arrivalIso) - Date.parse(prev.departureIso)) / 1000;
    const speed = legSpeedKmh(from, to, gapSeconds);

    if (speed === null) {
      // Zero or negative travel time between distinct places is impossible to display.
      if (distanceKm > 1) {
        issues.push({
          severity: 'error',
          path: `stops.${i}.arrivalIso`,
          message: `no travel time between "${prev.locationId}" and "${stop.locationId}" (${Math.round(distanceKm)} km apart)`,
        });
      }
      continue;
    }

    if (speed > limits.maxSpeedKmh) {
      issues.push({
        severity: 'error',
        path: `stops.${i}.arrivalIso`,
        message: `leg ${prev.locationId} -> ${stop.locationId} needs ${Math.round(speed)} km/h (max ${limits.maxSpeedKmh})`,
      });
    } else if (distanceKm > 1 && speed < limits.minSpeedKmh) {
      issues.push({
        severity: 'warning',
        path: `stops.${i}.arrivalIso`,
        message: `leg ${prev.locationId} -> ${stop.locationId} is only ${Math.round(speed)} km/h; Santa will look stalled`,
      });
    }

    if (gapSeconds > limits.maxGapSeconds) {
      issues.push({
        severity: 'warning',
        path: `stops.${i}.arrivalIso`,
        message: `${Math.round(gapSeconds / 60)} min between "${prev.locationId}" and "${stop.locationId}"; long quiet stretch on the tracker`,
      });
    }
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues, totalDistanceKm };
}
