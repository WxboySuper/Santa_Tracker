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

  it('treats arrival as the start of a stop and departure as the start of transit', () => {
    const route = validateRoute(makeRoute()).route!;
    const firstArrival = Date.parse(route.stops[0]!.arrivalIso);
    const firstDeparture = Date.parse(route.stops[0]!.departureIso);

    expect(deriveJourneyState(route, new Date(firstArrival - 1))).toMatchObject({ currentIndex: null, nextIndex: 0, progress: 0 });
    expect(deriveJourneyState(route, new Date(firstArrival))).toMatchObject({ currentIndex: 0, nextIndex: 1, progress: 0 });
    expect(deriveJourneyState(route, new Date(firstArrival + 1)).currentIndex).toBe(0);
    expect(deriveJourneyState(route, new Date(firstDeparture - 1)).currentIndex).toBe(0);
    expect(deriveJourneyState(route, new Date(firstDeparture))).toMatchObject({ currentIndex: 0, nextIndex: 1 });
    expect(deriveJourneyState(route, new Date(firstDeparture + 1)).currentIndex).toBe(0);
  });

  it('treats the final arrival as active and completes at final departure', () => {
    const route = validateRoute(makeRoute()).route!;
    const last = route.stops.at(-1)!;
    const arrival = Date.parse(last.arrivalIso);
    const departure = Date.parse(last.departureIso);

    expect(deriveJourneyState(route, new Date(arrival - 1)).currentIndex).toBe(0);
    expect(deriveJourneyState(route, new Date(arrival))).toMatchObject({ currentIndex: 1, nextIndex: null });
    expect(deriveJourneyState(route, new Date(arrival + 1)).currentIndex).toBe(1);
    expect(deriveJourneyState(route, new Date(departure - 1)).isComplete).toBe(false);
    expect(deriveJourneyState(route, new Date(departure))).toMatchObject({ currentIndex: 1, nextIndex: null, progress: 1, isComplete: true });
    expect(deriveJourneyState(route, new Date(departure + 1)).isComplete).toBe(true);
  });

  it('moves directly to the next stop when one departure equals the next arrival', () => {
    const route = makeRoute();
    route.stops[0]!.departureIso = route.stops[1]!.arrivalIso;
    const parsed = validateRoute(route).route!;
    const sharedInstant = new Date(parsed.stops[1]!.arrivalIso);

    expect(deriveJourneyState(parsed, sharedInstant)).toMatchObject({ currentIndex: 1, nextIndex: null });
  });

  it('handles a route with one stop at each boundary', () => {
    const route = makeRoute();
    route.stops = [route.stops[0]!];
    const parsed = validateRoute(route).route!;
    const arrival = Date.parse(parsed.stops[0]!.arrivalIso);
    const departure = Date.parse(parsed.stops[0]!.departureIso);

    expect(deriveJourneyState(parsed, new Date(arrival - 1))).toMatchObject({ currentIndex: null, nextIndex: 0, progress: 0, isComplete: false });
    expect(deriveJourneyState(parsed, new Date(arrival))).toMatchObject({ currentIndex: 0, nextIndex: null, progress: 0, isComplete: false });
    expect(deriveJourneyState(parsed, new Date(departure - 1)).isComplete).toBe(false);
    expect(deriveJourneyState(parsed, new Date(departure))).toMatchObject({ currentIndex: 0, nextIndex: null, progress: 1, isComplete: true });
  });
});

