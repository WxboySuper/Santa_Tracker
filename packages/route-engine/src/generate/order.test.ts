import { describe, expect, it } from 'vitest';
import { haversineKm } from '../geo';
import { eastwardLegReason, isInChristmasWindow, localClock, longitudeDelta } from './sweep';
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

  it('keeps an eastward move when the destination offset justifies it', () => {
    const places: Candidate[] = [
      { id: 'launch', name: 'Kiritimati', country: 'KI', lat: 1.87, lng: -157.4, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, category: 'populated', population: 7_380 },
      { id: 'source', name: 'Western Australia', country: 'AU', lat: -10, lng: 160, timezone: 'Australia/Brisbane', utcOffsetMinutes: 600, category: 'populated', population: 500_000 },
      { id: 'offset-anomaly', name: 'Southern atoll', country: 'KI', lat: -80, lng: 162, timezone: 'Pacific/Norfolk', utcOffsetMinutes: 660, category: 'populated', population: 10_000 },
    ];
    const ordered = sweepOrder(places);
    expect(ordered.map((place) => place.id)).toEqual(['launch', 'source', 'offset-anomaly']);
    const from = ordered[1]!;
    const to = ordered[2]!;
    expect(longitudeDelta(from, to)).toBeGreaterThan(1);
    expect(eastwardLegReason({
      from,
      to,
      destinationIndex: 2,
      arrivalUtc: Date.parse(to.plannedArrivalUtc ?? ''),
    })).toBe('offset-anomaly');
  });

  it('does not treat a same-offset eastward jog as a justified exception', () => {
    const from: Candidate = {
      id: 'west', name: 'West', country: 'AA', lat: 10, lng: 20,
      timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 20_000,
    };
    const to: Candidate = {
      id: 'east', name: 'East', country: 'AA', lat: 10, lng: 24,
      timezone: 'Etc/UTC', utcOffsetMinutes: 0, category: 'populated', population: 20_000,
    };
    expect(longitudeDelta(from, to)).toBeGreaterThan(1);
    expect(eastwardLegReason({ from, to, destinationIndex: 8, arrivalUtc: Date.parse('2026-12-25T00:00:00Z') })).toBeUndefined();
  });

  it('keeps long Hong Kong to mainland China legs at regional speed', () => {
    const hongKong: Candidate = {
      id: 'hong-kong', name: 'Hong Kong', country: 'HK', lat: 22.3193, lng: 114.1694,
      timezone: 'Asia/Hong_Kong', utcOffsetMinutes: 480, category: 'populated', population: 7_000_000,
    };
    const beijing: Candidate = {
      id: 'beijing', name: 'Beijing', country: 'CN', lat: 39.9042, lng: 116.4074,
      timezone: 'Asia/Shanghai', utcOffsetMinutes: 480, category: 'populated', population: 21_000_000,
    };
    const distance = haversineKm(hongKong, beijing);
    const travel = scheduledTravelMilliseconds(hongKong, beijing, DEFAULT_GENERATOR_LIMITS);
    expect(distance).toBeGreaterThan(1_500);
    expect(distance / (travel / 3_600_000)).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.localLegSpeedKmh);
  });

  it('selects the feasible subset when the per-country cap prevents full-pool inclusion', () => {
    const places: Candidate[] = Array.from({ length: 13 }, (_, index) => ({
      id: `same-country-${index}`,
      name: `Place ${index}`,
      country: 'AA',
      lat: 1 + index * 0.3,
      lng: 177,
      timezone: 'Pacific/Fiji',
      utcOffsetMinutes: 780,
      category: 'populated',
      population: 20_000,
    }));
    expect(sweepOrder(places)).toHaveLength(DEFAULT_GENERATOR_LIMITS.maxStopsPerCountry);
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
    const localTravel = scheduledTravelMilliseconds(testPlaces[2]!, testPlaces[3]!, DEFAULT_GENERATOR_LIMITS);
    const oceanTravel = scheduledTravelMilliseconds(testPlaces[0]!, testPlaces[3]!, DEFAULT_GENERATOR_LIMITS);
    expect(localTravel % 1000).toBe(0);
    expect(oceanTravel % 1000).toBe(0);
    const localSpeed = local / (localTravel / 3_600_000);
    const oceanSpeed = ocean / (oceanTravel / 3_600_000);
    expect(localSpeed).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.p90LegSpeedMaxKmh);
    expect(oceanSpeed).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.p90LegSpeedMaxKmh);
    expect(Math.max(localSpeed, oceanSpeed)).toBeLessThanOrEqual(DEFAULT_GENERATOR_LIMITS.maxLegSpeedKmh);
  });

  it('produces the same candidate order for the same seed', () => {
    expect(sweepOrder(testPlaces).map((place) => place.id)).toEqual(sweepOrder(testPlaces).map((place) => place.id));
  });
});
