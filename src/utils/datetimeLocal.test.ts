import { toDatetimeLocal, fromDatetimeLocal, isoToDatetimeLocal } from './datetimeLocal';

describe('datetimeLocal', () => {
  describe('toDatetimeLocal', () => {
    it('formats a Date using local wall-clock components', () => {
      // Construct a Date with fixed local components (independent of TZ env).
      const date = new Date(2026, 6, 13, 9, 5);
      expect(toDatetimeLocal(date)).toBe('2026-07-13T09:05');
    });

    it('zero-pads month, day, hour, and minute', () => {
      const date = new Date(2026, 0, 4, 1, 2);
      expect(toDatetimeLocal(date)).toBe('2026-01-04T01:02');
    });
  });

  describe('fromDatetimeLocal', () => {
    it('parses a local datetime string into the same wall-clock Date', () => {
      const date = fromDatetimeLocal('2026-07-13T09:05');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(6);
      expect(date.getDate()).toBe(13);
      expect(date.getHours()).toBe(9);
      expect(date.getMinutes()).toBe(5);
    });

    it('tolerates a seconds component', () => {
      const date = fromDatetimeLocal('2026-07-13T09:05:30');
      expect(date.getSeconds()).toBe(30);
    });

    it('round-trips through toDatetimeLocal without shifting', () => {
      const value = '2026-07-13T09:05';
      expect(toDatetimeLocal(fromDatetimeLocal(value))).toBe(value);
    });
  });

  describe('isoToDatetimeLocal', () => {
    it('preserves a local wall-clock value when it has no timezone marker', () => {
      // Browsers treat a no-Z datetime string as local time.
      expect(isoToDatetimeLocal('2026-07-13T09:05')).toBe('2026-07-13T09:05');
    });

    it('converts a UTC timestamp into local wall-clock', () => {
      // 2026-07-13T09:05Z must render as local; compute expected from the same Date.
      const expected = toDatetimeLocal(new Date('2026-07-13T09:05:00.000Z'));
      expect(isoToDatetimeLocal('2026-07-13T09:05:00.000Z')).toBe(expected);
    });

    it('returns an empty string for empty input', () => {
      expect(isoToDatetimeLocal('')).toBe('');
    });

    it('midnight and DST-boundary UTC values convert without wall-clock drift', () => {
      const sample = '2026-11-01T06:00:00.000Z';
      const expected = toDatetimeLocal(new Date(sample));
      expect(isoToDatetimeLocal(sample)).toBe(expected);
    });
  });
});
