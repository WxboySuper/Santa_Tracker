import { interpolateGreatCircle, type LatLng } from "@santa-tracker/route-engine";

/** Web Mercator cannot represent the poles, so keep projected points within its extent. */
export function positionToView(position: LatLng): [number, number] {
  return [position.lng, Math.max(-85.05112878, Math.min(85.05112878, position.lat))];
}

export function applyInitialCamera(hasSantaPosition: boolean, camera: { centerOnSanta: () => void; fitRoute: () => void }): void {
  if (hasSantaPosition) {
    camera.centerOnSanta();
    return;
  }
  camera.fitRoute();
}

export function hasValidMapExtent(extent: number[]): boolean {
  return extent.every(Number.isFinite);
}

/** Sample the same great circle used for Santa, splitting at the map's world boundary. */
export function splitGreatCircle(start: LatLng, end: LatLng): LatLng[][] {
  const pieces: LatLng[][] = [[start]];
  for (let i = 1; i <= 64; i++) {
    const point = interpolateGreatCircle(start, end, i / 64);
    const piece = pieces[pieces.length - 1]!;
    const previous = piece[piece.length - 1]!;
    const delta = point.lng - previous.lng;
    if (Math.abs(delta) <= 180) {
      piece.push(point);
      continue;
    }
    const edge = delta < 0 ? 180 : -180;
    const unwrapped = point.lng + (delta < 0 ? 360 : -360);
    const fraction = (edge - previous.lng) / (unwrapped - previous.lng);
    const lat = previous.lat + (point.lat - previous.lat) * fraction;
    piece.push({ lat, lng: edge });
    pieces.push([{ lat, lng: -edge }, point]);
  }
  return pieces;
}

/** Initial great-circle bearing from one point to another, in radians clockwise from north. */
export function bearingBetween(from: LatLng, to: LatLng): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}
