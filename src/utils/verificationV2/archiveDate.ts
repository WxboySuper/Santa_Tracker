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
