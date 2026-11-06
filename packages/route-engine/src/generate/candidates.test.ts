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
  category: 'hub',
}));

describe('chooseCandidates', () => {
  it('filters vetoed ids before quota selection and keeps western preference on refill', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 10, weights: { hub: 1 } };
    const first = chooseCandidates(pool, config, {});
    const vetoedWest = first.find((place) => place.timezone === 'America/New_York');
    if (!vetoedWest) throw new Error('Expected a western candidate in the initial selection');

    const selected = chooseCandidates(pool, config, { veto: [vetoedWest.id] });

    expect(selected.map((place) => place.id)).not.toContain(vetoedWest.id);
    expect(selected.filter((place) => place.timezone === 'America/New_York')).toHaveLength(5);
  });

  it('prioritizes western candidates for a one-stop category quota', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 1, weights: { hub: 1 } };
    const selected = chooseCandidates(pool, config, {});
    expect(selected[0]?.timezone).toBe('America/New_York');
  });

  it('restores the western preference after a same-category swap', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 10, weights: { hub: 1 } };
    const initial = chooseCandidates(pool, config, {});
    const western = initial.find((place) => place.timezone === 'America/New_York');
    const easternExtra = pool.find((place) => place.timezone === 'Asia/Kolkata' && !initial.some((selected) => selected.id === place.id));
    if (!western || !easternExtra) throw new Error('Expected west and east candidates for the swap test');
    const swapped = chooseCandidates(pool, config, { swap: { [western.id]: easternExtra.id } });
    expect(swapped.filter((place) => place.timezone === 'America/New_York')).toHaveLength(5);
    expect(swapped.map((place) => place.id)).toHaveLength(10);
  });
});
