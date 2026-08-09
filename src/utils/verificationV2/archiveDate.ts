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

/** SPC report windows run from 12Z through 11:59Z the following day. */
const SPC_REPORT_DAY_START_UTC = 12;

/** Returns the SPC report day containing the supplied instant. */
const currentSpcReportDay = (now: Date): Date => {
  const reportDay = new Date(now.getTime());
  if (reportDay.getUTCHours() < SPC_REPORT_DAY_START_UTC) {
    reportDay.setUTCDate(reportDay.getUTCDate() - 1);
  }
  return reportDay;
};

/**
 * True when the report date parses as a real calendar date and is on-or-before
 * the current SPC report day. SPC report days begin at 12Z and end at 11:59Z
 * the following day, so this keeps callers from enabling a report date before
 * its report window has started. Returns false for empty, malformed, or future
 * report dates.
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
    const currentReportDay = currentSpcReportDay(now);
    const currentReportDayUtc = Date.UTC(
      currentReportDay.getUTCFullYear(),
      currentReportDay.getUTCMonth(),
      currentReportDay.getUTCDate()
    );
    return archiveUtc <= currentReportDayUtc;
  }
  return false;
};

/** Formats a date as the SPC archive YYMMDD key using UTC calendar fields. */
const utcArchiveKey = (date: Date): string => {
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/** Returns the current SPC report day as an ISO date for date inputs. */
export const getCurrentSpcReportDate = (now: Date = new Date()): string => {
  const reportDay = currentSpcReportDay(now);
  const year = String(reportDay.getUTCFullYear());
  const month = String(reportDay.getUTCMonth() + 1).padStart(2, '0');
  const day = String(reportDay.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** True when the report date parses to the same archive key as the reference day. */
const isArchiveDateOn = (reportDate: string, date: Date): boolean => {
  const archiveDate = toArchiveDate(reportDate);
  return archiveDate !== null && archiveDate === utcArchiveKey(date);
};

/**
 * True when the report date resolves to the current SPC report day (12Z UTC
 * through 11:59Z the following day). SPC serves this report window from
 * today.csv instead of the dated archive file, which is not published until
 * the report day is complete.
 */
export const isTodayReportDate = (reportDate: string, now: Date = new Date()): boolean =>
  isArchiveDateOn(reportDate, currentSpcReportDay(now));

/**
 * True when the report date resolves to the SPC report day immediately before
 * the current one. SPC serves that window from yesterday.csv instead of its
 * dated archive file.
 */
export const isYesterdayReportDate = (reportDate: string, now: Date = new Date()): boolean => {
  const previousReportDay = currentSpcReportDay(now);
  previousReportDay.setUTCDate(previousReportDay.getUTCDate() - 1);
  return isArchiveDateOn(reportDate, previousReportDay);
};
