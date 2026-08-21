import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@santa-tracker/contracts';
import { deriveJourneyState } from './state';
import { validateRoute } from './validate';

function makeRoute() {
  const base = Date.parse('2026-12-24T00:00:00.000Z');
  return {
    schemaVersion: SCHEMA_VERSION,
    season: 2026,
    stops: [
      {
        locationId: 'a',
        arrivalIso: new Date(base).toISOString(),
        departureIso: new Date(base + 60_000).toISOString(),
        durationSeconds: 60,
      },
      {
        locationId: 'b',
        arrivalIso: new Date(base + 120_000).toISOString(),
        departureIso: new Date(base + 180_000).toISOString(),
        durationSeconds: 60,
      },
    ],
  };
}

describe('@santa-tracker/route-engine', () => {
  it('validates a correct route', () => {
    const result = validateRoute(makeRoute());
    expect(result.ok).toBe(true);
  });

  it('rejects decreasing arrival times', () => {
    const route = makeRoute();
    // Move second arrival before the first arrival — violates strictly increasing constraint
    route.stops[1]!.arrivalIso = new Date(Date.parse('2026-12-23T23:59:00.000Z')).toISOString();
    route.stops[1]!.departureIso = new Date(Date.parse('2026-12-24T00:00:30.000Z')).toISOString();
    const result = validateRoute(route);
    expect(result.ok).toBe(false);
  });

  it('derives journey state before start', () => {
    const route = validateRoute(makeRoute()).route!;
    const state = deriveJourneyState(route, new Date('2026-12-23T23:59:00.000Z'));
    expect(state.currentIndex).toBeNull();
    expect(state.nextIndex).toBe(0);
    expect(state.progress).toBe(0);
  });

  it('derives journey state after completion', () => {
    const route = validateRoute(makeRoute()).route!;
    const state = deriveJourneyState(route, new Date('2026-12-24T01:00:00.000Z'));
    expect(state.isComplete).toBe(true);
    expect(state.progress).toBe(1);
  });

  it('is deterministic for same inputs', () => {
    const route = validateRoute(makeRoute()).route!;
    const now = new Date('2026-12-24T00:01:00.000Z');
    const a = deriveJourneyState(route, now);
    const b = deriveJourneyState(route, now);
    expect(a).toEqual(b);
  });
});

