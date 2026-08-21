import { describe, expect, it } from 'vitest';
import { CoordinatesSchema, FeatureFlagsSchema, RouteSchema, SCHEMA_VERSION } from './index';

describe('@santa-tracker/contracts', () => {
  it('validates coordinates', () => {
    expect(CoordinatesSchema.safeParse({ lat: 90, lng: 180 }).success).toBe(true);
    expect(CoordinatesSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
  });

  it('rejects route with wrong schema version', () => {
    const result = RouteSchema.safeParse({
      schemaVersion: '0.0.0',
      season: 2026,
      stops: [{ locationId: 'a', arrivalIso: new Date().toISOString(), departureIso: new Date().toISOString(), durationSeconds: 60 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid route', () => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 60000).toISOString();
    const route = RouteSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      season: 2026,
      stops: [{ locationId: 'north-pole', arrivalIso: now, departureIso: later, durationSeconds: 60 }],
    });
    expect(route.stops).toHaveLength(1);
  });

  it('defaults feature flags', () => {
    const flags = FeatureFlagsSchema.parse({});
    expect(flags.mapEnabled).toBe(true);
    expect(flags.adventEnabled).toBe(false);
  });
});

