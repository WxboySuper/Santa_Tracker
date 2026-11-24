export function claim(entity: { claims?: Record<string, unknown[]> } | undefined, property: string): unknown;
export function countryIdFor(entity: { claims?: Record<string, unknown[]> } | undefined, administrativeEntities: Record<string, { claims?: Record<string, unknown[]> }>): string | undefined;
export function coordinatesFromGeometry(geometry: unknown): { lat: number; lng: number } | undefined;
export function validEarthPoint(point: unknown): boolean;
export function timezoneCorrection(id: string): string | undefined;
export function countryCodeForName(value: string): string;
export function timezoneForCandidate(options: { id: string; country: string; lookedUpTimezone: string; lat: number; lng: number }): string;
export function christmasUtcOffset(timezone: string): number;
