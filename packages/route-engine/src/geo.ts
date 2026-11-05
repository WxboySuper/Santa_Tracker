/**
 * Spherical geometry for route legs. Pure, no I/O.
 *
 * Santa's route starts at lng 180 and crosses the antimeridian repeatedly, so a straight
 * lat/lng lerp would swing the long way round the planet (lng 179 -> -179 passing through 0).
 * Great-circle interpolation avoids that and gives the physically shortest leg.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Normalize a longitude into [-180, 180]. Values already in range (including +180) are kept. */
export function normalizeLng(lng: number): number {
  if (!Number.isFinite(lng)) return lng;
  if (lng >= -180 && lng <= 180) return lng;
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Great-circle distance in kilometres (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Average speed in km/h for a leg, or null when the duration is not positive. */
export function legSpeedKmh(a: LatLng, b: LatLng, durationSeconds: number): number | null {
  if (!(durationSeconds > 0)) return null;
  return haversineKm(a, b) / (durationSeconds / 3600);
}

/**
 * Point a fraction `t` (0..1) along the great circle from `a` to `b`.
 * Antimeridian-safe; the result longitude is within [-180, 180].
 * Coincident endpoints return the start point.
 */
export function interpolateGreatCircle(a: LatLng, b: LatLng, t: number): LatLng {
  const f = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const lat1 = toRad(a.lat);
  const lng1 = toRad(a.lng);
  const lat2 = toRad(b.lat);
  const lng2 = toRad(b.lng);

  const delta = haversineKm(a, b) / EARTH_RADIUS_KM; // angular distance in radians
  if (delta < 1e-12) return { lat: a.lat, lng: normalizeLng(a.lng) };

  const sinDelta = Math.sin(delta);
  // Near-antipodal legs have no unique great circle; fall back to a plain lerp rather than NaN.
  if (Math.abs(sinDelta) < 1e-9) {
    return { lat: a.lat + (b.lat - a.lat) * f, lng: normalizeLng(a.lng + (b.lng - a.lng) * f) };
  }

  const w1 = Math.sin((1 - f) * delta) / sinDelta;
  const w2 = Math.sin(f * delta) / sinDelta;
  const x = w1 * Math.cos(lat1) * Math.cos(lng1) + w2 * Math.cos(lat2) * Math.cos(lng2);
  const y = w1 * Math.cos(lat1) * Math.sin(lng1) + w2 * Math.cos(lat2) * Math.sin(lng2);
  const z = w1 * Math.sin(lat1) + w2 * Math.sin(lat2);

  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lng: normalizeLng(toDeg(Math.atan2(y, x))) };
}
