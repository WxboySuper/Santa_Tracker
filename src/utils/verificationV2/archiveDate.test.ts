import { isReachedArchiveDate, isTodayReportDate, toArchiveDate } from './archiveDate';

describe('isReachedArchiveDate', () => {
  const now = new Date(Date.UTC(2026, 6, 29, 12, 0, 0));

  test('returns true for today', () => {
    expect(isReachedArchiveDate('2026-07-29', now)).toBe(true);
  });

  test('returns true for past ISO dates', () => {
    expect(isReachedArchiveDate('2020-01-01', now)).toBe(true);
  });

  test('returns true for past YYMMDD dates', () => {
    expect(isReachedArchiveDate('200101', now)).toBe(true);
  });

  test('returns false for future ISO dates', () => {
    expect(isReachedArchiveDate('2099-01-01', now)).toBe(false);
  });

  test('returns false for future YYMMDD dates', () => {
    expect(isReachedArchiveDate('9901', now)).toBe(false);
  });

  test('returns false for empty or whitespace', () => {
    expect(isReachedArchiveDate('', now)).toBe(false);
    expect(isReachedArchiveDate('   ', now)).toBe(false);
  });

  test('returns false for malformed strings', () => {
    expect(isReachedArchiveDate('not a date', now)).toBe(false);
    expect(isReachedArchiveDate('2026-13-40', now)).toBe(false);
  });

  test('uses the supplied `now` reference rather than wall clock', () => {
    expect(isReachedArchiveDate('2099-01-01', new Date(Date.UTC(2200, 0, 1)))).toBe(true);
  });

  test('agrees with toArchiveDate for valid inputs', () => {
    const samples = ['2026-07-29', '2025-12-31', '9901', '240101'];
    for (const sample of samples) {
      const reached = isReachedArchiveDate(sample, now);
      const archive = toArchiveDate(sample);
      if (archive === null) {
        expect(reached).toBe(false);
      } else {
        expect(typeof reached).toBe('boolean');
      }
    }
  });
});

describe('isTodayReportDate', () => {
  const now = new Date(2026, 7, 4, 15, 30, 0); // 2026-08-04 local

  test('returns true for the current calendar day in ISO format', () => {
    expect(isTodayReportDate('2026-08-04', now)).toBe(true);
  });

  test('returns true for the current calendar day in YYMMDD format', () => {
    expect(isTodayReportDate('260804', now)).toBe(true);
  });

  test('returns false for a past date', () => {
    expect(isTodayReportDate('2026-08-03', now)).toBe(false);
    expect(isTodayReportDate('260803', now)).toBe(false);
  });

  test('returns false for a future date', () => {
    expect(isTodayReportDate('2099-01-01', now)).toBe(false);
  });

  test('returns false for empty or malformed strings', () => {
    expect(isTodayReportDate('', now)).toBe(false);
    expect(isTodayReportDate('   ', now)).toBe(false);
    expect(isTodayReportDate('not a date', now)).toBe(false);
    expect(isTodayReportDate('2026-13-40', now)).toBe(false);
  });

  test('uses the supplied `now` reference rather than wall clock', () => {
    expect(isTodayReportDate('2030-05-06', new Date(2030, 4, 6))).toBe(true);
  });
});
