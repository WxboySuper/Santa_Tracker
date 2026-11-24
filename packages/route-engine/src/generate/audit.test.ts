import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { DEFAULT_GENERATOR_LIMITS } from './types';

describe('auditRouteDocument', () => {
  it('reports missing nodes and home endpoints as failures', () => {
    const result = auditRouteDocument({}, {
      config: {
        ...DEFAULT_GENERATOR_LIMITS,
        weights: { hub: 100 },
        requiredStopIds: ['required-stop'],
        requiredCountries: ['US'],
      },
      pool: [],
      selected: [],
      zonesByCountry: {},
      utcOffsetsByTimezone: {},
      vetoIds: [],
    });

    expect(result.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Legacy route schema')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'North Pole start and end')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Required iconic and regional stops')?.pass).toBe(false);
  });
});
