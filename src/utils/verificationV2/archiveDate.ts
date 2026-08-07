const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

interface ArchivePattern {
  regex: RegExp;
  year: (match: RegExpMatchArray) => number;
  month: (match: RegExpMatchArray) => number;
  day: (match: RegExpMatchArray) => number;
  format: (match: RegExpMatchArray) => string;
}

const ARCHIVE_PATTERNS: ArchivePattern[] = [
  {
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    year: (match) => Number(match[1]),
    month: (match) => Number(match[2]),
    day: (match) => Number(match[3]),
    format: (match) => `${match[1].slice(2)}${match[2]}${match[3]}`,
  },
  {
    regex: /^(\d{2})(\d{2})(\d{2})$/,
    year: (match) => 2000 + Number(match[1]),
    month: (match) => Number(match[2]),
    day: (match) => Number(match[3]),
    format: (match) => match[0],
  },
];

/**
 * Converts an ISO `YYYY-MM-DD` date (from a native date input) into the SPC
 * archive `YYMMDD` format. Values already in `YYMMDD` are returned unchanged.
 */
export const toArchiveDate = (reportDate: string): string | null => {
  for (const pattern of ARCHIVE_PATTERNS) {
    const match = reportDate.match(pattern.regex);
    if (!match) {
      continue;
    }

    const year = pattern.year(match);
    const month = pattern.month(match);
    const day = pattern.day(match);
    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }

    return pattern.format(match);
  }

  return null;
};

/**
 * True when the report date parses as a real calendar date and is on-or-before
 * the supplied reference (default: today, UTC). Returns false for empty,
 * malformed, or future dates so callers can gate work that should never run
 * against an archive that does not exist yet.
 */
export const isReachedArchiveDate = (reportDate: string, now: Date = new Date()): boolean => {
  for (const pattern of ARCHIVE_PATTERNS) {
    const match = reportDate.match(pattern.regex);
    if (!match) {
      continue;
    }
    const year = pattern.year(match);
    const month = pattern.month(match);
    const day = pattern.day(match);
    if (!isValidCalendarDate(year, month, day)) {
      return false;
    }
    const archiveUtc = Date.UTC(year, month - 1, day);
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return archiveUtc <= todayUtc;
  }
  return false;
};

/** Formats a date as the SPC archive YYMMDD key for the local calendar day. */
const localArchiveKey = (date: Date): string => {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/** True when the report date parses to the same archive key as the reference day. */
const isArchiveDateOn = (reportDate: string, date: Date): boolean => {
  const archiveDate = toArchiveDate(reportDate);
  return archiveDate !== null && archiveDate === localArchiveKey(date);
};

/**
 * True when the report date resolves to the current calendar day (local time).
 * SPC serves the current day's reports from today.csv instead of the dated
 * archive file (which is not published until the report day is complete), so
 * callers route same-day requests to the live feed. Returns false for empty,
 * malformed, or non-current dates.
 */
export const isTodayReportDate = (reportDate: string, now: Date = new Date()): boolean =>
  isArchiveDateOn(reportDate, now);

/**
 * True when the report date resolves to the previous calendar day (local time).
 * SPC withholds the dated archive file for the previous day too, serving those
 * reports from yesterday.csv instead, so callers route them to the live feed.
 * Returns false for empty, malformed, or non-previous dates.
 */
export const isYesterdayReportDate = (reportDate: string, now: Date = new Date()): boolean =>
  isArchiveDateOn(reportDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
