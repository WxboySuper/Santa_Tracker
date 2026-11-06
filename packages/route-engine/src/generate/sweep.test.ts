import { describe, expect, it } from 'vitest';
import { christmasArrival } from './sweep';
import { christmasOffset } from './timezone';

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
});
