import { formatReportDate, parseReportDate } from './stormReportParser';

describe('stormReportParser', () => {
  test('formatReportDate returns YYMMDD', () => {
    const date = new Date(2026, 0, 30); // Jan 30 2026
    expect(formatReportDate(date)).toBe('260130');
  });

  test('parseReportDate parses YYMMDD within a fixed rolling window', () => {
    const parsedDate = parseReportDate('260130', new Date(2025, 11, 31));
    expect(parsedDate.getFullYear()).toBe(2026);
    expect(parsedDate.getMonth()).toBe(0);
    expect(parsedDate.getDate()).toBe(30);
  });

  test('parseReportDate preserves pre-2000 dates and contains invalid calendar values', () => {
    expect(parseReportDate('981230', new Date(2026, 0, 30)).getFullYear()).toBe(1998);
    expect(parseReportDate('991332', new Date(2026, 0, 30)).getTime()).toBeNaN();
  });
});
