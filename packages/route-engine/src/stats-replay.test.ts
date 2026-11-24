import { describe, expect, it } from 'vitest';
import { createLocationId, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { deriveJourneyStats, formatStat, type RouteStatsLocation } from './stats';
import { createReplay } from './replay';
import { deriveJourneyState } from './state';

const start = Date.parse('2026-12-24T10:00:00.000Z');
const route: Route = {
  schemaVersion: SCHEMA_VERSION,
  season: 2026,
  stops: [
    { locationId: createLocationId('a'), arrivalIso: new Date(start).toISOString(), departureIso: new Date(start + 600_000).toISOString(), durationSeconds: 600 },
    { locationId: createLocationId('b'), arrivalIso: new Date(start + 1_200_000).toISOString(), departureIso: new Date(start + 1_800_000).toISOString(), durationSeconds: 600 },
    { locationId: createLocationId('c'), arrivalIso: new Date(start + 3_000_000).toISOString(), departureIso: new Date(start + 3_600_000).toISOString(), durationSeconds: 600 },
  ],
};
const locations: RouteStatsLocation[] = [
  { id: 'a', name: 'New York', country: 'United States', timezone: 'America/New_York', coordinates: { lat: 40.7128, lng: -74.006 }, population: 8_000_000 },
  { id: 'b', name: 'London', country: 'United Kingdom', timezone: 'Europe/London', coordinates: { lat: 51.5074, lng: -0.1278 }, population: 9_000_000 },
  { id: 'c', name: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', coordinates: { lat: 35.6762, lng: 139.6503 }, population: 14_000_000 },
];
const landing = start + 3_600_000;

describe('journey stats', () => {
  it('counts from before takeoff through landing', () => {
    const before = deriveJourneyStats(route, start - 1, locations);
    expect(before.stopsVisited).toBe(0);
    expect(before.distanceTravelledKm).toBe(0);
    expect(before.remainingJourneyTimeMs).toBe(3_600_000);
    expect(before.presentsDelivered).toBe(0);

    const complete = deriveJourneyStats(route, landing, locations);
    expect(complete.stopsVisited).toBe(3);
    expect(complete.countriesVisited).toEqual(['US', 'GB', 'JP']);
    expect(complete.timeZonesCrossed).toBe(3);
    expect(complete.distanceTravelledKm).toBeGreaterThan(complete.distanceRemainingKm);
    expect(complete.distanceRemainingKm).toBe(0);
    expect(complete.remainingFlightTimeMs).toBe(0);
    expect(complete.presentsDelivered).toBe(6_200_000);
  });

  it('normalizes country names and uses locale aware number formatting', () => {
    const stats = deriveJourneyStats(route, start + 1, locations);
    expect(stats.countriesVisited).toEqual(['US']);
    expect(formatStat(1_234_567, 'en-US')).toBe('1,234,567');
    expect(formatStat(1_234_567, 'de-DE')).toBe('1.234.567');
  });

  it('is deterministic and monotonic across sampled journey instants', () => {
    const monotonicKeys = [
      'distanceTravelledKm', 'stopsVisited', 'timeZonesCrossed', 'elapsedFlightTimeMs', 'elapsedJourneyTimeMs',
      'presentsDelivered', 'cookiesEaten', 'reindeerSnacks', 'chimneysVisited',
    ] as const;
    let previous = deriveJourneyStats(route, start - 1000, locations);
    for (let index = 0; index <= 500; index++) {
      const timestamp = start - 1000 + (3_602_000 * index) / 500;
      const current = deriveJourneyStats(route, timestamp, locations);
      expect(current).toEqual(deriveJourneyStats(route, timestamp, locations));
      for (const key of monotonicKeys) expect(current[key]).toBeGreaterThanOrEqual(previous[key]);
      previous = current;
    }
  });

  it('does not allow a caller to format non-finite timestamps silently', () => {
    expect(() => deriveJourneyStats(route, Number.NaN, locations)).toThrow(RangeError);
  });
});

describe('replay controller', () => {
  it('starts at takeoff, reaches landing, and clamps out of range seeks', () => {
    const replay = createReplay(route, { locations });
    expect(replay.at(0).journeyTimeMs).toBe(start);
    replay.seek(new Date(landing + 99_000));
    expect(replay.at(0).journeyTimeMs).toBe(landing);
    expect(replay.at(0).state.isComplete).toBe(true);
    replay.seek(-50);
    expect(replay.at(0).journeyTimeMs).toBe(start);
  });

  it('returns a neutral frame for an empty route', () => {
    const emptyRoute: Route = { schemaVersion: SCHEMA_VERSION, season: 2026, stops: [] };
    const replay = createReplay(emptyRoute, { locations: [] });
    replay.play(10);
    expect(replay.at(20)).toMatchObject({
      journeyTimeMs: 0,
      isPlaying: false,
      state: { currentIndex: null, nextIndex: null, progress: 0, isComplete: false },
      stats: { stopsVisited: 0, stopsRemaining: 0, distanceTravelledKm: 0 },
    });
  });

  it('rejects invalid route timestamps with a clear error', () => {
    const invalidRoute = {
      ...route,
      stops: route.stops.map((stop, index) => index === 0 ? { ...stop, arrivalIso: 'not-a-date' } : stop),
    } as unknown as Route;
    expect(() => createReplay(invalidRoute, { locations })).toThrow('replay route contains invalid ISO timestamps');
  });

  it('rejects non-finite seeks without changing the replay anchor', () => {
    const replay = createReplay(route, { locations });
    replay.seek(0.25);
    const before = replay.at(0);
    expect(() => replay.seek(Number.NaN)).toThrow(RangeError);
    expect(() => replay.seek(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => replay.seek(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(replay.at(0)).toEqual(before);
  });

  it('pauses, seeks by fraction, changes speed, and resets from the injected wall clock', () => {
    const replay = createReplay(route, { locations, speed: 2, startAt: start + 300_000 });
    replay.play(1000);
    expect(replay.at(2000).journeyTimeMs).toBe(start + 302_000);
    replay.pause(2500);
    expect(replay.at(20_000).journeyTimeMs).toBe(start + 303_000);
    replay.seek(0.5, 20_000);
    expect(replay.at(20_000).journeyTimeMs).toBe(start + 1_800_000);
    replay.setSpeed(4, 20_000);
    replay.play(20_000);
    expect(replay.at(20_100).journeyTimeMs).toBe(start + 1_800_400);
    replay.reset(30_000);
    expect(replay.at(50_000).journeyTimeMs).toBe(start + 300_000);
  });

  it('matches live state and stats at exactly the same journey instant', () => {
    const replay = createReplay(route, { locations });
    replay.seek(start + 1_450_000);
    const frame = replay.at(0);
    expect(frame.state).toEqual(deriveJourneyState(route, frame.time));
    expect(frame.stats).toEqual(deriveJourneyStats(route, frame.time, locations));
  });

  it('does not mutate when sampling the same wall clock repeatedly', () => {
    const replay = createReplay(route, { locations, speed: 3 });
    replay.play(100);
    const first = replay.at(500);
    expect(replay.at(500)).toEqual(first);
  });

  it('rejects playback speeds outside 0.5x through 64x', () => {
    const replay = createReplay(route, { locations });
    expect(() => replay.setSpeed(0.25)).toThrow(RangeError);
    expect(() => createReplay(route, { locations, speed: 65 })).toThrow(RangeError);
  });
});
