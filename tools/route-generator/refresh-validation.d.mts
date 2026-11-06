export function claim(entity: { claims?: Record<string, unknown[]> } | undefined, property: string): unknown;
export function coordinatesFromGeometry(geometry: unknown): { lat: number; lng: number } | undefined;
export function validEarthPoint(point: unknown): boolean;
