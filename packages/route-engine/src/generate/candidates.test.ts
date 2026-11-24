import { describe, expect, it } from 'vitest';
import { chooseCandidates } from './candidates';
import { DEFAULT_GENERATOR_LIMITS, type Candidate } from './types';

const pool: Candidate[] = Array.from({ length: 20 }, (_, index) => ({
  id: `place-${index}`,
  name: `Place ${index}`,
  country: `Country ${index}`,
  lat: index,
  lng: index,
  timezone: index < 10 ? 'America/New_York' : 'Asia/Kolkata',
  utcOffsetMinutes: index < 10 ? -300 : 330,
  category: 'hub',
  population: 2_000_000,
}));

describe('chooseCandidates', () => {
  it('filters vetoed ids before category quota selection', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 10, maxStopsPerUtcOffset: 40, weights: { hub: 1 }, endStopId: 'place-19' };
    const first = chooseCandidates(pool, config, {});
    const vetoedWest = first.find((place) => place.timezone === 'America/New_York');
    if (!vetoedWest) throw new Error('Expected a western candidate in the initial selection');

    const selected = chooseCandidates(pool, config, { veto: [vetoedWest.id] });

    expect(selected.map((place) => place.id)).not.toContain(vetoedWest.id);
    expect(selected).toHaveLength(10);
    expect(selected.every((place) => place.category === 'hub')).toBe(true);
  });

  it('selects from the configured category without a regional preference quota', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 1, maxStopsPerUtcOffset: 40, weights: { hub: 1 }, endStopId: 'place-0' };
    const selected = chooseCandidates(pool, config, {});
    expect(selected[0]?.timezone).toBe('America/New_York');
  });

  it('preserves category quota after a same-category swap', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 10, maxStopsPerUtcOffset: 40, weights: { hub: 1 }, endStopId: 'place-19' };
    const initial = chooseCandidates(pool, config, {});
    const western = initial.find((place) => place.timezone === 'America/New_York');
    const easternExtra = pool.find((place) => place.timezone === 'Asia/Kolkata' && !initial.some((selected) => selected.id === place.id));
    if (!western || !easternExtra) throw new Error('Expected west and east candidates for the swap test');
    const swapped = chooseCandidates(pool, config, { swap: { [western.id]: easternExtra.id } });
    expect(swapped.map((place) => place.id)).toContain(easternExtra.id);
    expect(swapped.every((place) => place.category === 'hub')).toBe(true);
    expect(swapped.map((place) => place.id)).toHaveLength(10);
  });

  it('reserves a stop from every required country', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 10, maxStopsPerUtcOffset: 40, weights: { hub: 1 }, endStopId: 'place-19', requiredCountries: ['Country 5'] };
    const selected = chooseCandidates(pool, config, {});
    expect(selected.some((place) => place.country === 'Country 5')).toBe(true);
  });
});
