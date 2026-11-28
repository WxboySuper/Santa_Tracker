import { describe, expect, it } from 'vitest';
import { christmasArrival, localWindowDeadline, localWindowPenaltyMinutes, localWindowStatus } from './sweep';
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
    expect(christmasOffset({ timezone: 'UTC' })).toBe(0);
    expect(christmasOffset({ timezone: 'Africa/Abidjan' })).toBe(0);
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

describe('localWindowStatus', () => {
  it('marks the preferred night, the hard-window shoulders, and daytime', () => {
    expect(localWindowStatus(Date.parse('2026-12-24T22:00:00Z'), 0)).toBe('GREEN');
    expect(localWindowStatus(Date.parse('2026-12-25T06:00:00Z'), 0)).toBe('GREEN');
    expect(localWindowStatus(Date.parse('2026-12-24T21:59:00Z'), 0)).toBe('YELLOW');
    expect(localWindowStatus(Date.parse('2026-12-25T07:00:00Z'), 0)).toBe('YELLOW');
    expect(localWindowStatus(Date.parse('2026-12-25T08:01:00Z'), 0)).toBe('RED');
    expect(localWindowStatus(Date.parse('2026-12-24T19:59:00Z'), 0)).toBe('RED');
  });

  it('uses the local offset for status and the next hard-window deadline', () => {
    const beforeMidnightUtc = Date.parse('2026-12-25T03:00:00Z');
    expect(localWindowStatus(beforeMidnightUtc, -300)).toBe('GREEN');
    expect(localWindowDeadline(Date.parse('2026-12-25T01:00:00Z'), 0))
      .toBe(Date.parse('2026-12-25T08:00:00Z'));
    expect(localWindowDeadline(Date.parse('2026-12-24T23:00:00Z'), 0))
      .toBe(Date.parse('2026-12-25T08:00:00Z'));
    expect(localWindowDeadline(Date.parse('2026-12-25T09:00:00Z'), 0)).toBeUndefined();
  });

  it('measures distance from the preferred window edges', () => {
    expect(localWindowPenaltyMinutes(Date.parse('2026-12-24T21:30:00Z'), 0)).toBe(30);
    expect(localWindowPenaltyMinutes(Date.parse('2026-12-25T07:00:00Z'), 0)).toBe(60);
    expect(localWindowPenaltyMinutes(Date.parse('2026-12-25T01:00:00Z'), 0)).toBe(0);
  });
});
