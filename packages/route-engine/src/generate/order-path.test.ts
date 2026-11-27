import { describe, expect, it } from 'vitest';
import { acceptsRouteMetrics, bandedBoustrophedonOrder, canAcceptLocalProposal, detourCount, eastwardCount, type RouteCost } from './order-path';
import { hardDetourCount } from './order-shared';
import { DEFAULT_GENERATOR_LIMITS, type Candidate } from './types';

describe('local route proposals', () => {
  it('counts zero eastward legs for an empty route', () => {
    expect(eastwardCount([])).toBe(0);
  });

  it('does not assign a longitude direction to the North Pole launch', () => {
    expect(eastwardCount([{ id: 'launch-stop', name: 'Launch stop', country: 'AA', lat: 1, lng: -176,
      timezone: 'Etc/GMT', utcOffsetMinutes: 0, category: 'populated', population: 1_000 }])).toBe(0);
  });

  it("does not anchor band longitude ordering to the pole's placeholder longitude", () => {
    const launch = (lng: number): Candidate => ({ id: 'pole', name: 'North Pole', country: 'AQ', lat: 90, lng,
      timezone: 'Etc/GMT', utcOffsetMinutes: 0, category: 'special' });
    const countries = ['US', 'CA', 'MX'];
    const places: Candidate[] = [-170, 0, 170].map((lng, index) => ({ id: `place-${index}`, name: `Place ${index}`,
      country: countries[index]!, lat: 0, lng, timezone: 'Etc/GMT', utcOffsetMinutes: 0, category: 'populated', population: 1_000 }));

    const fromEastPole = bandedBoustrophedonOrder(places, launch(180), DEFAULT_GENERATOR_LIMITS);
    const fromArbitraryPole = bandedBoustrophedonOrder(places, launch(-90), DEFAULT_GENERATOR_LIMITS);

    expect(fromArbitraryPole.map((place) => place.id)).toEqual(fromEastPole.map((place) => place.id));
  });

  it('counts isolated coverage detours during local search', () => {
    const route = [
      { id: 'a', name: 'A', country: 'AA', lat: 0, lng: 0, timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 1 },
      { id: 'b', name: 'B', country: 'BB', lat: 0, lng: 10, timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 1 },
      { id: 'c', name: 'C', country: 'CC', lat: 0, lng: 1, timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 1 },
    ];
    expect(detourCount(route)).toBe(1);
    expect(hardDetourCount(route)).toBe(0);
  });

  it('rejects a shorter path when it adds an eastward leg or detour', () => {
    const current: RouteCost = { distance: 100, eastward: 0, detours: 0 };

    expect(canAcceptLocalProposal({ distance: 90, eastward: 1, detours: 0 }, current)).toBe(false);
    expect(canAcceptLocalProposal({ distance: 90, eastward: 0, detours: 1 }, current)).toBe(false);
    expect(canAcceptLocalProposal({ distance: 99, eastward: 0, detours: 0 }, current)).toBe(true);
  });

  it('allows a hard-detour reduction when the only extra turn is an isolated coverage detour', () => {
    const current: RouteCost = { distance: 100, eastward: 0, detours: 1, hardDetours: 1 };
    const proposal: RouteCost = { distance: 110, eastward: 0, detours: 2, hardDetours: 0 };
    expect(canAcceptLocalProposal(proposal, current)).toBe(true);
    expect(canAcceptLocalProposal({ ...proposal, eastward: 1 }, current)).toBe(false);
  });

  it('uses one acceptance rule for coverage tradeoffs and ordinary ordering moves', () => {
    const current = { eastward: 2, detours: 1, hardDetours: 0, distance: 100 };
    const reasonedCoverage = { ...current, eastward: 3, detours: 2, distance: 120 };
    const repeatedCountryViolation = { ...reasonedCoverage, hardDetours: 1 };

    expect(acceptsRouteMetrics(reasonedCoverage, current)).toBe(false);
    expect(acceptsRouteMetrics(reasonedCoverage, current, { coverageTradeoff: true })).toBe(true);
    expect(acceptsRouteMetrics(repeatedCountryViolation, current, { coverageTradeoff: true })).toBe(true);
    expect(acceptsRouteMetrics({ ...current, eastward: 4 }, current, { coverageTradeoff: true })).toBe(false);
  });

});
