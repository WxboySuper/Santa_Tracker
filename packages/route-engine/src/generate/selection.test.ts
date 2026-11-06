import { describe, expect, it } from 'vitest';
import { allocateQuotas, compareStableIds, nearestNeighbour } from './selection';

describe('compareStableIds', () => {
  it('uses code-unit ordering instead of runtime locale collation', () => {
    expect(compareStableIds('a', 'B')).toBe(1);
    expect(compareStableIds('B', 'a')).toBe(-1);
  });
});

describe('allocateQuotas', () => {
  it('uses largest remainders with stable ties', () => {
    expect(allocateQuotas(7, { a: 30, b: 25, c: 20, d: 15, e: 10 })).toEqual({
      a: 2, b: 2, c: 1, d: 1, e: 1,
    });
  });

  it('rejects invalid inputs', () => {
    expect(() => allocateQuotas(2, { a: 0 })).toThrow();
    expect(() => allocateQuotas(0, { a: 1 })).toThrow(/stop total/);
    expect(() => allocateQuotas(-1, { a: 1 })).toThrow();
    expect(() => allocateQuotas(1, { a: -1, b: 2 })).toThrow();
  });
});

describe('nearestNeighbour', () => {
  it('uses great-circle distance across the date line and stable id ties', () => {
    const places = [
      { id: 'far', lat: 0, lng: 0 },
      { id: 'b', lat: 0, lng: -179 },
      { id: 'a', lat: 0, lng: 179 },
    ];
    expect(nearestNeighbour(places, { lat: 0, lng: 180 }).map((place) => place.id))
      .toEqual(['a', 'b', 'far']);
    expect(places[0]?.id).toBe('far');
  });
});
