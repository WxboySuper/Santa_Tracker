import { z } from 'zod';
import { SCHEMA_VERSION, SeasonModeValues } from './ids';

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
  id: z.string().min(1),
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
  locationId: z.string().min(1),
  arrivalIso: z.string().datetime({ offset: true }),
  departureIso: z.string().datetime({ offset: true }),
  durationSeconds: z.number().int().min(0),
});

export type RouteStop = z.infer<typeof RouteStopSchema>;

export const RouteSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  season: z.number().int().min(2026),
  stops: z.array(RouteStopSchema).min(1),
});

export type Route = z.infer<typeof RouteSchema>;

// ---------------------------------------------------------------------------
// Snapshot (immutable published artifact)
// ---------------------------------------------------------------------------

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  publicationId: z.string().min(1),
  season: z.number().int(),
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
 * These four flags are scaffold-only (no visitor toggle yet); they are
 * validated at publication and changes require an ADR.
 *
 * @see CHANGELOG.md for disclosure and rollout notes
 * @see docs/planning/christmas-2026-reinvention.md for seasonal modes
 */
export const FEATURE_FLAG_REGISTRY = {
  adventEnabled: {
    owner: 'foundation',
    default: false,
    exposure: 'publication',
    description: 'Enables 24-day Advent unlocks (Dec 1-24); gated behind seasonal mode',
  },
  mapEnabled: {
    owner: 'foundation',
    default: true,
    exposure: 'publication',
    description: 'Enables map adapter; when false, tracker falls back to no-map mode',
  },
  weatherEnabled: {
    owner: 'foundation',
    default: false,
    exposure: 'publication',
    description: 'Enables live-weather overlay (stretch, flagged; OFF by default)',
  },
  soundscapeEnabled: {
    owner: 'foundation',
    default: false,
    exposure: 'publication',
    description: 'Enables optional soundscape with explicit opt-in',
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
  return RouteSchema.parse(input);
}

export function parseSnapshot(input: unknown): Snapshot {
  return SnapshotSchema.parse(input);
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  return CoordinatesSchema.safeParse(value).success;
}

