import { describe, expect, it } from 'vitest';
import { haversineKm } from '../geo';
import { isInChristmasWindow, localClock, longitudeDelta } from './sweep';
import { DEFAULT_GENERATOR_LIMITS, type Candidate } from './types';
import { scheduledTravelMilliseconds, sweepOrder } from './order';

const testPlaces: Candidate[] = [
  { id: 'ki', name: 'Kiritimati', country: 'KI', lat: 1.87, lng: -157.4, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, category: 'populated', population: 7_380 },
  { id: 'fj', name: 'Nadi', country: 'FJ', lat: -17.8, lng: 177.4, timezone: 'Pacific/Fiji', utcOffsetMinutes: 780, category: 'populated', population: 42_284 },
  { id: 'nz', name: 'Wellington', country: 'NZ', lat: -41.3, lng: 174.8, timezone: 'Pacific/Auckland', utcOffsetMinutes: 780, category: 'populated', population: 215_100 },
  { id: 'au', name: 'Hobart', country: 'AU', lat: -42.9, lng: 147.3, timezone: 'Australia/Hobart', utcOffsetMinutes: 660, category: 'populated', population: 247_068 },
];

describe('midnight sweep ordering', () => {
  it('starts in the earliest reachable offset band and keeps delivery legs westward', () => {
    const ordered = sweepOrder(testPlaces);
    expect(ordered[0]?.id).toBe('ki');
    for (let index = 1; index < ordered.length; index++) {
      expect(longitudeDelta(ordered[index - 1]!, ordered[index]!)).toBeLessThanOrEqual(1);
    }
  });

  it('finishes real UTC-offset bands in westward order', () => {
    const ordered = sweepOrder(testPlaces);
    for (let index = 1; index < ordered.length; index++) {
      expect(ordered[index - 1]?.utcOffsetMinutes).toBeGreaterThanOrEqual(ordered[index]?.utcOffsetMinutes ?? -Infinity);
    }
    expect(new Set(ordered.map((place) => place.country))).toEqual(new Set(testPlaces.map((place) => place.country)));
  });

  it('sweeps north-to-south within a band, then reverses latitude direction in the next band', () => {
    const places: Candidate[] = [
      { id: 'north-a', name: 'Northern island', country: 'KI', lat: 10, lng: 170, timezone: 'Etc/GMT-14', utcOffsetMinutes: 840, category: 'populated', population: 10_000 },
      { id: 'south-a', name: 'Southern island', country: 'KI', lat: -9, lng: 170, timezone: 'Etc/GMT-14', utcOffsetMinutes: 840, category: 'populated', population: 10_000 },
      { id: 'north-b', name: 'Northern atoll', country: 'KI', lat: 9, lng: 150, timezone: 'Etc/GMT-13', utcOffsetMinutes: 780, category: 'populated', population: 10_000 },
      { id: 'south-b', name: 'Southern atoll', country: 'KI', lat: -8, lng: 150, timezone: 'Etc/GMT-13', utcOffsetMinutes: 780, category: 'populated', population: 10_000 },
    ];
    const ordered = sweepOrder(places);
    expect(ordered.slice(0, 2).map((place) => place.id)).toEqual(['north-a', 'south-a']);
    expect(ordered.slice(2, 4).map((place) => place.id)).toEqual(['south-b', 'north-b']);
  });

  it('keeps every arrival in its window and south-of-35 arrivals before 02:30', () => {
    const ordered = sweepOrder(testPlaces);
    for (const place of ordered) {
      const arrival = place.plannedArrivalUtc;
      expect(arrival).toBeDefined();
      expect(isInChristmasWindow({ iso: arrival ?? '', timezoneOrOffset: place.utcOffsetMinutes ?? 0 })).toBe(true);
      if (place.lat < -35) {
        const local = localClock({ iso: arrival ?? '', timezoneOrOffset: place.utcOffsetMinutes ?? 0 });
        const minuteOfDay = local.hour * 60 + local.minute;
        expect(minuteOfDay >= 23 * 60 || minuteOfDay <= 150).toBe(true);
      }
    }
  });

  it('schedules local hops and ocean legs below the p90 and hard speed limits', () => {
    const local = haversineKm(testPlaces[2]!, testPlaces[3]!);
    const ocean = haversineKm(testPlaces[0]!, testPlaces[3]!);
    const localSpeed = local / (scheduledTravelMilliseconds(testPlaces[2]!, testPlaces[3]!, DEFAULT_GENERATOR_LIMITS) / 3_600_000);
    const oceanSpeed = ocean / (scheduledTravelMilliseconds(testPlaces[0]!, testPlaces[3]!, DEFAULT_GENERATOR_LIMITS) / 3_600_000);
    expect(localSpeed).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.p90LegSpeedMaxKmh);
    expect(oceanSpeed).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.p90LegSpeedMaxKmh);
    expect(Math.max(localSpeed, oceanSpeed)).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.maxLegSpeedKmh);
  });

  it('produces the same candidate order for the same seed', () => {
    expect(sweepOrder(testPlaces).map((place) => place.id)).toEqual(sweepOrder(testPlaces).map((place) => place.id));
  });
});
