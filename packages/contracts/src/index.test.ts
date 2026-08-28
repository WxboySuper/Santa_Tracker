import { describe, expect, it } from 'vitest';
import {
  CoordinatesSchema,
  ContractValidationError,
  ActivitySchema,
  FeatureFlagsSchema,
  RouteSchema,
  SCHEMA_VERSION,
  createLocationId,
  LocalizedContentSchema,
  LocalizedTextSchema,
  resolveLocalizedText,
  parseSnapshot,
  parseRoute,
} from './index';

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

  it('rejects unsupported versions with a typed error', () => {
    try {
      parseRoute({ schemaVersion: '2099.0.0', season: 2026, stops: [] });
      throw new Error('expected parseRoute to reject');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).code).toBe('unsupported_schema_version');
    }
    expect(() => parseRoute({ schemaVersion: SCHEMA_VERSION, season: 2026, stops: [] })).toThrow(ContractValidationError);
  });

  it('validates stable public identifiers', () => {
    expect(createLocationId('north-pole')).toBe('north-pole');
    expect(() => createLocationId('North Pole')).toThrow(TypeError);
  });

  it('rejects unsupported snapshot versions with a typed error', () => {
    try {
      parseSnapshot({ schemaVersion: '2099.0.0' });
      throw new Error('expected parseSnapshot to reject');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).code).toBe('unsupported_schema_version');
    }
  });

  it('validates snapshot reports and activity IDs', () => {
    expect(ActivitySchema.safeParse({ id: 'ornament-smash', title: 'Ornament smash' }).success).toBe(true);
    expect(ActivitySchema.safeParse({ id: 'Ornament Smash', title: 'Ornament smash' }).success).toBe(false);
  });

  it('defaults feature flags', () => {
    const flags = FeatureFlagsSchema.parse({});
    expect(flags.mapEnabled).toBe(true);
    expect(flags.adventEnabled).toBe(false);
  });

  it('keeps localized copy separate from stable content identity and numeric order', () => {
    const content = LocalizedContentSchema.parse({
      id: 'ornament-smash',
      title: { en: 'Ornament Smash', de: 'Ornament zerstoeren' },
      order: 1,
    });
    expect(content.id).toBe('ornament-smash');
    expect(resolveLocalizedText(content.title, 'fr')).toBe('Ornament Smash');
    expect(LocalizedTextSchema.safeParse({ en: 'Ready' }).success).toBe(true);
    expect(LocalizedTextSchema.safeParse({ en: '' }).success).toBe(false);
  });
});
