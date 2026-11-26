import { describe, expect, it } from 'vitest';
import { admin1Coverage, admin1UnitFor } from './admin1';
import { admin1CodeAt } from '../../../../tools/route-generator/admin1.mjs';
import type { Candidate } from './types';

const candidate = (country: string, admin1Code: string | null): Candidate => ({
  id: `${country}-${admin1Code ?? 'none'}`,
  name: 'Test place',
  country,
  lat: 0,
  lng: 0,
  timezone: 'Etc/UTC',
  utcOffsetMinutes: 0,
  category: 'populated',
  admin1Code,
});

describe('admin-1 coverage', () => {
  it('counts only required codes whose country prefix matches the candidate', () => {
    const places = [candidate('US', 'US-CA'), candidate('US', 'CA-ON'), candidate('CA', 'US-CA')];
    const coverage = admin1Coverage(places);

    expect(coverage.US.coveredCodes).toEqual(['US-CA']);
    expect(coverage.US.covered).toBe(1);
    expect(coverage.CA.covered).toBe(0);
    expect(admin1UnitFor(places[1]!)).toBeUndefined();
  });

  it('ignores candidates without an admin-1 code', () => {
    expect(admin1UnitFor(candidate('AU', null))).toBeUndefined();
  });

  it('ignores unsupported boundary geometry and validates target-country coordinates', () => {
    const features = [{ country: 'US', code: 'US-CA', name: 'California',
      geometry: { type: 'GeometryCollection', geometries: [] } }];
    expect(admin1CodeAt(candidate('US', null), features)).toBeNull();
    expect(() => admin1CodeAt({ ...candidate('US', null), lat: Number.NaN }, features)).toThrow(/non-finite latitude/);
  });
});
