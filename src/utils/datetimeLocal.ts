/**
 * Local datetime-local formatter/parser pair.
 *
 * `<input type="datetime-local">` interprets its value as the user's local
 * wall-clock time. The previous code produced values via
 * `new Date().toISOString().slice(0, 16)`, which formats in UTC and therefore
 * shifted the displayed time for non-UTC users. These helpers format and parse
 * strictly in the user's local timezone.
 */

/** Returns the local `YYYY-MM-DDTHH:mm` string for a Date (never UTC-shifted). */
export const toDatetimeLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Parses a `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DDTHH:mm:ss`) value as local
 * wall-clock time and returns the corresponding Date.
 */
export const fromDatetimeLocal = (value: string): Date => {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map((part) => Number(part));
  const [hours, minutes, seconds = 0] = timePart.split(':').map((part) => Number(part));
  return new Date(year, month - 1, day, hours, minutes, seconds);
};

/** Converts an ISO timestamp into the local wall-clock value for a datetime-local input. */
export const isoToDatetimeLocal = (isoString: string): string => {
  if (!isoString) {
    return '';
  }
  return toDatetimeLocal(new Date(isoString));
};
