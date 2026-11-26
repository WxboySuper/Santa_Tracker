export type Admin1BoundaryFeature = {
  country: string;
  code: string;
  name: string;
  geometry: { type: string; coordinates?: unknown[] };
};

export const ADMIN1_BOUNDARY_SOURCE: string;
export function loadAdmin1Features(): Promise<Admin1BoundaryFeature[]>;
export function admin1CodeAt(
  place: { id?: string; country: string; lat: number; lng: number },
  features: Admin1BoundaryFeature[],
): string | undefined | null;
