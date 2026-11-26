import { describe, expect, it } from 'vitest';
import { canAcceptLocalProposal, detourCount, eastwardCount, type RouteCost } from './order-path';

describe('local route proposals', () => {
  it('counts zero eastward legs for an empty route', () => {
    expect(eastwardCount([])).toBe(0);
  });

  it('does not assign a longitude direction to the North Pole launch', () => {
    expect(eastwardCount([{ id: 'launch-stop', name: 'Launch stop', country: 'AA', lat: 1, lng: -176,
      timezone: 'Etc/GMT', utcOffsetMinutes: 0, category: 'populated', population: 1_000 }])).toBe(0);
  });

  it('counts isolated coverage detours during local search', () => {
    const route = [
      { id: 'a', name: 'A', country: 'AA', lat: 0, lng: 0, timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 1 },
      { id: 'b', name: 'B', country: 'BB', lat: 0, lng: 10, timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 1 },
      { id: 'c', name: 'C', country: 'CC', lat: 0, lng: 1, timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 1 },
    ];
    expect(detourCount(route)).toBe(1);
  });

  it('rejects a shorter path when it adds an eastward leg or detour', () => {
    const current: RouteCost = { distance: 100, eastward: 0, detours: 0 };

    expect(canAcceptLocalProposal({ distance: 90, eastward: 1, detours: 0 }, current)).toBe(false);
    expect(canAcceptLocalProposal({ distance: 90, eastward: 0, detours: 1 }, current)).toBe(false);
    expect(canAcceptLocalProposal({ distance: 99, eastward: 0, detours: 0 }, current)).toBe(true);
  });
});
