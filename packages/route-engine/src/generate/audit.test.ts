import { describe, expect, it } from 'vitest';
import { auditRouteDocument, coordinateAuditFailures } from './audit';
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
      countryBoundsByCode: {},
      report: { continentBalance: {}, subregionBalance: {} },
      vetoIds: [],
    });

    expect(result.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Legacy route schema')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'North Pole start and end')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Required iconic and regional stops')?.pass).toBe(false);
  });

  it('rejects a stop outside its country bounds and an alternate-source coordinate mismatch', () => {
    const naturalEarth = {
      id: 'ne-1', name: 'Sample Town', country: 'AA', timezone: 'Etc/UTC',
      lat: 8, lng: 8, category: 'underserved', source: 'https://www.naturalearthdata.com/downloads/place',
    };
    const wikidata = {
      ...naturalEarth, id: 'Q1', lat: 2, lng: 2, source: 'https://www.wikidata.org/wiki/Q1',
    };
    const failures = coordinateAuditFailures([naturalEarth], [naturalEarth, wikidata], {
      AA: { minLat: 0, maxLat: 5, minLng: 0, maxLng: 5 },
    });
    expect(failures).toHaveLength(2);
    expect(failures.join('; ')).toContain('outside the AA country bounds');
    expect(failures.join('; ')).toContain('alternate-source Q1');
  });
});
