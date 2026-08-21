/**
 * Stable public identifiers — shared across contracts, database, and route-engine.
 * Keep these free of runtime dependencies.
 */

export const SCHEMA_VERSION = '2026.0.0' as const;

export type PublicationId = string & { readonly brand: unique symbol };
export type LocationId = string & { readonly brand: unique symbol };
export type SnapshotId = string & { readonly brand: unique symbol };
export type ActivityId = string & { readonly brand: unique symbol };

export function createPublicationId(value: string): PublicationId {
  return value as PublicationId;
}

export function createLocationId(value: string): LocationId {
  return value as LocationId;
}

export const SeasonModeValues = [
  'off-season',
  'preparation',
  'advent',
  'christmas-eve',
  'post-flight',
] as const;

export type SeasonMode = (typeof SeasonModeValues)[number];
