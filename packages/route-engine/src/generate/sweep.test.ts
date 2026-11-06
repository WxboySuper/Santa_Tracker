import { describe, expect, it } from 'vitest';
import { christmasArrival } from './sweep';
import { christmasOffset, parseUtcOffset } from './timezone';

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
    expect(christmasOffset('UTC')).toBe(0);
    expect(christmasOffset('Africa/Abidjan')).toBe(0);
  });

  it('reads standard ICU long-offset forms', () => {
    expect(christmasOffset('Asia/Kathmandu')).toBe(345);
    expect(christmasOffset('Asia/Kolkata')).toBe(330);
    expect(christmasOffset('America/St_Johns')).toBe(-210);
  });

  it('accepts UTC/GMT-prefixed and single-digit offset forms', () => {
    expect(parseUtcOffset('GMT+5:30', 'test')).toBe(330);
    expect(parseUtcOffset('UTC+05:30', 'test')).toBe(330);
    expect(parseUtcOffset('GMT-4', 'test')).toBe(-240);
    expect(parseUtcOffset('GMT+05:30:00', 'test')).toBe(330);
    expect(parseUtcOffset('GMT', 'test')).toBe(0);
  });
});
