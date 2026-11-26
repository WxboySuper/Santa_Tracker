import { describe, expect, it } from 'vitest';
import { admin1Coverage, admin1UnitFor } from './admin1';
import { admin1CodeAt, isSupportedAdmin1Code, normalizeAdmin1Feature } from '../../../../tools/route-generator/admin1.mjs';
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

  it('recognizes valid territory and external-territory admin-1 codes', () => {
    expect(isSupportedAdmin1Code('US', 'US-PR')).toBe(true);
    expect(isSupportedAdmin1Code('AU', 'AU-X03~')).toBe(true);
    expect(isSupportedAdmin1Code('US', 'AU-X03~')).toBe(false);
    expect(isSupportedAdmin1Code('US', 'US-XX')).toBe(false);
    expect(isSupportedAdmin1Code('US', 'US-')).toBe(false);
    expect(isSupportedAdmin1Code(null as unknown as string, 'US-CA')).toBe(false);
    expect(isSupportedAdmin1Code('US', null as unknown as string)).toBe(false);
  });

  it('loads supported external territory polygons for refresh lookups', () => {
    const feature = normalizeAdmin1Feature({
      properties: { iso_a2: 'US', iso_3166_2: 'US-PR', name: 'Puerto Rico' },
      geometry: { type: 'Polygon', coordinates: [] },
    });

    expect(feature?.code).toBe('US-PR');
  });

  it('ignores unsupported boundary geometry and validates target-country coordinates', () => {
    const features = [{ country: 'US', code: 'US-CA', name: 'California',
      geometry: { type: 'GeometryCollection', geometries: [] } }];
    expect(admin1CodeAt(candidate('US', null), features)).toBeNull();
    expect(() => admin1CodeAt({ ...candidate('US', null), lat: Number.NaN }, features)).toThrow(/non-finite latitude/);
  });

  it('validates coordinates before skipping countries without admin-1 coverage', () => {
    expect(admin1CodeAt(candidate('GB', null), [])).toBeUndefined();
    expect(() => admin1CodeAt({ ...candidate('GB', null), lng: 181 }, [])).toThrow(/longitude is out of range/);
  });
});
