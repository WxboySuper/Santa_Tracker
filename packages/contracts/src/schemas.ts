import { z } from 'zod';
import {
  SUPPORTED_SCHEMA_VERSIONS,
  SeasonModeValues,
  createActivityId,
  createLocationId,
  createPublicationId,
  createSnapshotId,
  PUBLIC_ID_PATTERN,
} from './ids';
import type { ActivityId, LocationId, PublicationId, SnapshotId } from './ids';

export type ContractErrorCode = 'invalid_input' | 'unsupported_schema_version';

export class ContractValidationError extends Error {
  readonly name = 'ContractValidationError';

  constructor(
    readonly code: ContractErrorCode,
    readonly schemaName: string,
    readonly issues: readonly z.ZodIssue[],
  ) {
    super(`${schemaName} ${code.replaceAll('_', ' ')}`);
  }
}

export const SchemaVersionSchema = z.enum(SUPPORTED_SCHEMA_VERSIONS);
export const PublicIdSchema = z.string().min(1).regex(PUBLIC_ID_PATTERN);
export const PublicationIdSchema: z.ZodType<PublicationId, z.ZodTypeDef, string> = PublicIdSchema.transform(createPublicationId);
export const LocationIdSchema: z.ZodType<LocationId, z.ZodTypeDef, string> = PublicIdSchema.transform(createLocationId);
export const SnapshotIdSchema: z.ZodType<SnapshotId, z.ZodTypeDef, string> = PublicIdSchema.transform(createSnapshotId);
export const ActivityIdSchema: z.ZodType<ActivityId, z.ZodTypeDef, string> = PublicIdSchema.transform(createActivityId);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

// ---------------------------------------------------------------------------
// Location / Route
// ---------------------------------------------------------------------------

export const LocationSchema = z.object({
  id: LocationIdSchema,
  name: z.string().min(1),
  country: z.string().min(1),
  coordinates: CoordinatesSchema,
  timezone: z.string().min(1),
  utcOffsetMinutes: z.number().int().min(-720).max(840),
  priority: z.number().int().min(0).max(10).default(5),
  description: z.string().optional(),
});

export type Location = z.infer<typeof LocationSchema>;

export const RouteStopSchema = z.object({
  locationId: LocationIdSchema,
  arrivalIso: z.string().datetime({ offset: true }),
  departureIso: z.string().datetime({ offset: true }),
  durationSeconds: z.number().int().min(0),
});

export type RouteStop = z.infer<typeof RouteStopSchema>;

export const RouteSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  season: z.number().int().min(2026),
  stops: z.array(RouteStopSchema).min(1),
});

export type Route = z.infer<typeof RouteSchema>;

export const ActivitySchema = z.object({
  id: ActivityIdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
});

export type Activity = z.infer<typeof ActivitySchema>;

// ---------------------------------------------------------------------------
// Snapshot (immutable published artifact)
// ---------------------------------------------------------------------------

export const SnapshotSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  publicationId: PublicationIdSchema,
  snapshotId: SnapshotIdSchema,
  season: z.number().int().min(2026),
  author: z.string().min(1),
  validationReport: z.object({
    valid: z.boolean(),
    issueCount: z.number().int().nonnegative().default(0),
    issues: z.array(z.object({ path: z.string().min(1), message: z.string().min(1) })).default([]),
  }),
  createdAtIso: z.string().datetime({ offset: true }),
  checksum: z.string().min(8),
  route: RouteSchema,
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

// ---------------------------------------------------------------------------
// Feature flags / Seasonal config (typed, validated at publication)
// ---------------------------------------------------------------------------

/**
 * Governance registry for scaffold feature flags.
 * Each entry records owner, default, exposure, and publication impact.
 * These four flags are **scaffold-only in #213** — they are typed and
 * publication-validated but **not yet wired** in `apps/web` (see
 * `apps/web/src/app/page.tsx:1`); no visitor toggle exists yet.
 * Follow-up issues (#214 advent, #252 map, #253 weather) will wire them
 * and add exposure. Changes require an ADR.
 *
 * @see CHANGELOG.md for disclosure and rollout notes
 * @see docs/planning/christmas-2026-reinvention.md for seasonal modes
 */
export const FEATURE_FLAG_REGISTRY = {
  adventEnabled: {
    owner: 'foundation',
    default: false,
    exposure: 'scaffold-only' as const,
    status: 'scaffold-only' as const,
    description: 'Enables 24-day Advent unlocks (Dec 1-24); gated behind seasonal mode — not yet wired',
  },
  mapEnabled: {
    owner: 'foundation',
    default: true,
    exposure: 'scaffold-only' as const,
    status: 'scaffold-only' as const,
    description: 'Enables map adapter; when false, will fall back to no-map mode — not yet wired',
  },
  weatherEnabled: {
    owner: 'foundation',
    default: false,
    exposure: 'scaffold-only' as const,
    status: 'scaffold-only' as const,
    description: 'Enables live-weather overlay (stretch, flagged; OFF by default) — not yet wired',
  },
  soundscapeEnabled: {
    owner: 'foundation',
    default: false,
    exposure: 'scaffold-only' as const,
    status: 'scaffold-only' as const,
    description: 'Enables optional soundscape with explicit opt-in — not yet wired',
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_REGISTRY;

export const FeatureFlagsSchema = z.object({
  adventEnabled: z.boolean().default(FEATURE_FLAG_REGISTRY.adventEnabled.default),
  mapEnabled: z.boolean().default(FEATURE_FLAG_REGISTRY.mapEnabled.default),
  weatherEnabled: z.boolean().default(FEATURE_FLAG_REGISTRY.weatherEnabled.default),
  soundscapeEnabled: z.boolean().default(FEATURE_FLAG_REGISTRY.soundscapeEnabled.default),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const SeasonalConfigSchema = z.object({
  mode: z.enum(SeasonModeValues),
  flags: FeatureFlagsSchema,
  activeSnapshotId: z.string().nullable(),
});

export type SeasonalConfig = z.infer<typeof SeasonalConfigSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseRoute(input: unknown): Route {
  return parseContract(RouteSchema, input, 'Route');
}

export function parseSnapshot(input: unknown): Snapshot {
  return parseContract(SnapshotSchema, input, 'Snapshot');
}

function parseContract<T extends z.ZodTypeAny>(schema: T, input: unknown, schemaName: string): z.infer<T> {
  const result = schema.safeParse(input);

  if (result.success) return result.data as z.infer<T>;

  const hasUnsupportedVersion = result.error.issues.some(
    (issue) => issue.path.length === 1 && issue.path[0] === 'schemaVersion' && issue.code === 'invalid_enum_value',
  );
  const code: ContractErrorCode = hasUnsupportedVersion ? 'unsupported_schema_version' : 'invalid_input';
  throw new ContractValidationError(code, schemaName, result.error.issues);
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  return CoordinatesSchema.safeParse(value).success;
}
