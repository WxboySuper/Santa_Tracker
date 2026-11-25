import { describe, expect, it } from 'vitest';
import { christmasArrival, christmasWindow, isInChristmasWindow, stopDurationSeconds, stopTier } from './sweep';
import { christmasOffset, parseUtcOffset } from './timezone';
import type { Candidate } from './types';

describe('christmasArrival', () => {
  it('places the date-line extremes on their respective Christmas days', () => {
    expect(christmasArrival('Pacific/Kiritimati', 20)).toBe('2026-12-24T10:20:00.000Z');
    expect(christmasArrival('Pacific/Apia', 20)).toBe('2026-12-24T11:20:00.000Z');
    expect(christmasArrival('Pacific/Pago_Pago', 20)).toBe('2026-12-25T11:20:00.000Z');
    expect(christmasArrival('Etc/GMT+12', 20)).toBe('2026-12-25T12:20:00.000Z');
  });

  it('uses the December civil offset including southern hemisphere daylight time', () => {
    expect(christmasArrival('Australia/Sydney', 180)).toBe('2026-12-24T16:00:00.000Z');
    expect(christmasArrival('America/New_York', 20)).toBe('2026-12-25T05:20:00.000Z');
    expect(christmasArrival('Asia/Kolkata', 20)).toBe('2026-12-24T18:50:00.000Z');
    expect(christmasArrival('Asia/Kathmandu', 20)).toBe('2026-12-24T18:35:00.000Z');
  });

  it('rejects invalid offsets and time zones', () => {
    expect(() => christmasArrival('Pacific/Kiritimati', 1440)).toThrow();
    expect(() => christmasArrival('Invalid/Zone', 20)).toThrow(/Invalid IANA time zone/);
    expect(() => christmasArrival('UTC', Number.NaN)).toThrow(/integer/);
  });

  it('handles valid zero-offset time zones', () => {
    expect(christmasOffset({ timezone: 'UTC' })).toBe(0);
    expect(christmasOffset({ timezone: 'Africa/Abidjan' })).toBe(0);
  });

  it('builds the overnight 23:00 to 05:00 local window', () => {
    expect(christmasWindow(840)).toEqual({
      startUtc: Date.parse('2026-12-24T09:00:00.000Z'),
      idealUtc: Date.parse('2026-12-24T11:00:00.000Z'),
      endUtc: Date.parse('2026-12-24T15:00:00.000Z'),
    });
    expect(isInChristmasWindow('2026-12-24T09:00:00.000Z', 840)).toBe(true);
    expect(isInChristmasWindow('2026-12-24T15:00:00.000Z', 840)).toBe(true);
    expect(isInChristmasWindow('2026-12-24T15:01:00.000Z', 840)).toBe(false);
  });

  it('assigns dwell from population, capital and curated landmark tier', () => {
    const candidate = (overrides: Partial<Candidate>): Candidate => ({
      id: 'place', name: 'Place', country: 'AA', lat: 0, lng: 0, timezone: 'UTC', category: 'populated', ...overrides,
    });
    expect(stopTier(candidate({ population: 1_000_000 }))).toBe('major');
    expect(stopTier(candidate({ population: 250_000, capital: true }))).toBe('major');
    expect(stopTier(candidate({ population: 250_000, isNationalCapital: true }))).toBe('major');
    expect(stopTier(candidate({ population: 30_000, capital: true }))).toBe('city');
    expect(stopTier(candidate({ id: 'Q1', category: 'cultural' }))).toBe('major');
    expect(stopTier(candidate({ id: 'Q2', category: 'nature' }))).toBe('city');
    expect(stopTier(candidate({ population: 5_000 }))).toBe('town');
    expect(stopTier(candidate({ population: 0 }))).toBe('hop');
    expect(['major', 'city', 'town', 'hop'].map((tier) => stopDurationSeconds(tier as 'major' | 'city' | 'town' | 'hop')))
      .toEqual([60, 30, 10, 3]);
  });

  it('reads standard ICU long-offset forms', () => {
    expect(christmasOffset({ timezone: 'Asia/Kathmandu' })).toBe(345);
    expect(christmasOffset({ timezone: 'Asia/Kolkata' })).toBe(330);
    expect(christmasOffset({ timezone: 'America/St_Johns' })).toBe(-210);
  });

  it('accepts UTC/GMT-prefixed and single-digit offset forms', () => {
    expect(parseUtcOffset({ rawOffset: 'GMT+5:30', timezone: 'test' })).toBe(330);
    expect(parseUtcOffset({ rawOffset: 'UTC+05:30', timezone: 'test' })).toBe(330);
    expect(parseUtcOffset({ rawOffset: 'GMT-4', timezone: 'test' })).toBe(-240);
    expect(parseUtcOffset({ rawOffset: 'GMT+05:30:00', timezone: 'test' })).toBe(330);
    expect(parseUtcOffset({ rawOffset: 'GMT', timezone: 'test' })).toBe(0);
  });
});
