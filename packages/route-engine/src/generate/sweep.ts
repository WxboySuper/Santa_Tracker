const MINUTE_MS = 60_000;
const LOCAL_MIDNIGHT = Date.UTC(2026, 11, 25);
const PREFERRED_WINDOW_START = 22 * 60;
const PREFERRED_WINDOW_END = 6 * 60;
const HARD_WINDOW_START = 20 * 60;
const HARD_WINDOW_END = 8 * 60;

export type LocalWindowStatus = 'GREEN' | 'YELLOW' | 'RED';

function minuteOfLocalDay(instant: number, offsetMinutes: number): number {
  const local = new Date(instant + offsetMinutes * MINUTE_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function isInsideOvernightWindow(minute: number, start: number, end: number): boolean {
  return minute >= start || minute <= end;
}

export function localWindowStatus(instant: number, offsetMinutes: number): LocalWindowStatus {
  const minute = minuteOfLocalDay(instant, offsetMinutes);
  if (isInsideOvernightWindow(minute, PREFERRED_WINDOW_START, PREFERRED_WINDOW_END)) return 'GREEN';
  if (isInsideOvernightWindow(minute, HARD_WINDOW_START, HARD_WINDOW_END)) return 'YELLOW';
  return 'RED';
}

export function localWindowPenaltyMinutes(instant: number, offsetMinutes: number): number {
  const minute = minuteOfLocalDay(instant, offsetMinutes);
  if (isInsideOvernightWindow(minute, PREFERRED_WINDOW_START, PREFERRED_WINDOW_END)) return 0;
  return Math.min(PREFERRED_WINDOW_START - minute, minute - PREFERRED_WINDOW_END);
}

export function localWindowDeadline(instant: number, offsetMinutes: number): number | undefined {
  if (localWindowStatus(instant, offsetMinutes) === 'RED') return undefined;
  const localInstant = instant + offsetMinutes * MINUTE_MS;
  const local = new Date(localInstant);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const nextDay = minute >= HARD_WINDOW_START ? 1 : 0;
  const deadline = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + nextDay, 8);
  return deadline - offsetMinutes * MINUTE_MS;
}

function validateMinute(minutesAfterMidnight: number): void {
  if (!Number.isInteger(minutesAfterMidnight)) throw new Error('Arrival minute must be an integer');
  if (minutesAfterMidnight < 0 || minutesAfterMidnight >= 1440) throw new Error('Arrival minute must be on Christmas Day');
}

/** Resolve a Christmas local time using the committed offset when given a number. */
export function christmasArrival(timezoneOrOffset: string | number, minutesAfterMidnight: number): string {
  validateMinute(minutesAfterMidnight);
  if (typeof timezoneOrOffset === 'number') {
    return new Date(LOCAL_MIDNIGHT + minutesAfterMidnight * MINUTE_MS - timezoneOrOffset * MINUTE_MS).toISOString();
  }

  const formatter = createFormatter(timezoneOrOffset);
  const target = LOCAL_MIDNIGHT + minutesAfterMidnight * MINUTE_MS;
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const delta = target - localTimestamp(formatter, instant);
    if (delta === 0) return new Date(instant).toISOString();
    instant += delta;
  }
  throw new Error(`Cannot resolve local arrival in ${timezoneOrOffset}`);
}

function localTimestamp(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = formatter.formatToParts(instant);
  const value = (name: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === name);
    if (!part) throw new Error(`Missing ${name} in formatted time`);
    return Number(part.value);
  };
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'));
}

function createFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch (error) {
    throw new Error(`Invalid IANA time zone: ${timeZone}`, { cause: error });
  }
}
