/** Pure presentation helpers for the Advent calendar. No I/O, no clock. */

/**
 * Format an unlock timestamp as a short calendar date such as "Dec 5".
 * Always rendered in UTC so server and browser agree and the label never shifts by timezone
 * (unlock times are stored as UTC instants).
 */
export function formatUnlockDate(unlockIso: string, locale: string): string {
  const date = new Date(unlockIso);
  if (Number.isNaN(date.getTime())) return unlockIso;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  } catch {
    // An unsupported locale tag must not break the page; fall back to English.
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  }
}
