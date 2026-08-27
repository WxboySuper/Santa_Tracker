/**
 * Stable public identifiers — shared across contracts, database, and route-engine.
 * Keep these free of runtime dependencies.
 */

export const SCHEMA_VERSION = '2026.0.0' as const;
export const SUPPORTED_SCHEMA_VERSIONS = [SCHEMA_VERSION] as const;

export const PUBLIC_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export class InvalidPublicIdError extends TypeError {
  readonly name = 'InvalidPublicIdError';

  constructor(readonly kind: string, readonly value: string) {
    super(`Invalid ${kind} identifier: ${value}`);
  }
}

export type PublicationId = string & { readonly brand: 'PublicationId' };
export type LocationId = string & { readonly brand: 'LocationId' };
export type SnapshotId = string & { readonly brand: 'SnapshotId' };
export type ActivityId = string & { readonly brand: 'ActivityId' };

export function createPublicationId(value: string): PublicationId {
  return createPublicId(value, 'publication') as PublicationId;
}

export function createLocationId(value: string): LocationId {
  return createPublicId(value, 'location') as LocationId;
}

export function createSnapshotId(value: string): SnapshotId {
  return createPublicId(value, 'snapshot') as SnapshotId;
}

export function createActivityId(value: string): ActivityId {
  return createPublicId(value, 'activity') as ActivityId;
}

function createPublicId(value: string, kind: string): string {
  if (!PUBLIC_ID_PATTERN.test(value)) {
    throw new InvalidPublicIdError(kind, value);
  }
  return value;
}

export const SeasonModeValues = [
  'off-season',
  'preparation',
  'advent',
  'christmas-eve',
  'post-flight',
] as const;

export type SeasonMode = (typeof SeasonModeValues)[number];
