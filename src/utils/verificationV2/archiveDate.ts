const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/**
 * Converts an ISO `YYYY-MM-DD` date (from a native date input) into the SPC
 * archive `YYMMDD` format. Values already in `YYMMDD` are returned unchanged.
 */
export const toArchiveDate = (reportDate: string): string | null => {
  const iso = reportDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }
    return `${iso[1].slice(2)}${iso[2]}${iso[3]}`;
  }

  const archive = reportDate.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (archive) {
    const year = 2000 + Number(archive[1]);
    const month = Number(archive[2]);
    const day = Number(archive[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }
    return reportDate;
  }

  return null;
};
