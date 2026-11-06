import { describe, expect, it } from 'vitest';
import { claim, coordinatesFromGeometry, validEarthPoint } from '../../../../tools/route-generator/refresh-validation.mjs';

describe('route refresh data validation', () => {
  it('returns no claim for missing or malformed entities', () => {
    expect(claim(undefined, 'P625')).toBeUndefined();
    expect(claim({ claims: {} }, 'P625')).toBeUndefined();
  });

  it('accepts only finite, in-range Natural Earth point coordinates', () => {
    expect(coordinatesFromGeometry({ type: 'Point', coordinates: [180, 90] })).toEqual({ lat: 90, lng: 180 });
    expect(coordinatesFromGeometry(null)).toBeUndefined();
    expect(coordinatesFromGeometry({ type: 'LineString', coordinates: [[0, 0]] })).toBeUndefined();
    expect(coordinatesFromGeometry({ type: 'Point', coordinates: [181, 0] })).toBeUndefined();
    expect(coordinatesFromGeometry({ type: 'Point', coordinates: [0, Number.NaN] })).toBeUndefined();
  });

  it('accepts only finite Earth points in Wikidata bounds', () => {
    expect(validEarthPoint({ globe: 'http://www.wikidata.org/entity/Q2', latitude: 90, longitude: 180 })).toBe(true);
    expect(validEarthPoint(undefined)).toBe(false);
    expect(validEarthPoint({ globe: 'moon', latitude: 0, longitude: 0 })).toBe(false);
    expect(validEarthPoint({ globe: 'http://www.wikidata.org/entity/Q2', latitude: 91, longitude: 0 })).toBe(false);
  });
});
