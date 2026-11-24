function invalidUtcOffset(hours: number, minutes: number): boolean {
  if (hours > 14) return true;
  if (minutes > 59) return true;
  return hours === 14 && minutes !== 0;
}

export function parseUtcOffset(rawOffset: string, timezone: string): number {
  const normalized = rawOffset.replace(/^(GMT|UTC)/, '').trim() || '+00:00';
  const match = /^([+-])\s*(\d{1,2})(?::?(\d{2}))?(?::\d{2})?$/.exec(normalized);
  if (!match) throw new Error(`Invalid UTC offset for ${timezone}: ${rawOffset}`);
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  if (invalidUtcOffset(hours, minutes)) throw new Error(`Invalid UTC offset for ${timezone}: ${rawOffset}`);
  return (match[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

/** Use the committed Dec 25 offset during generation. The IANA lookup is only a test or refresh fallback. */
export function christmasOffset(timezone: string, snapshotOffsetMinutes?: number): number {
  if (snapshotOffsetMinutes !== undefined) return snapshotOffsetMinutes;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(Date.UTC(2026, 11, 25));
  const rawOffset = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (rawOffset == null) throw new Error(`Missing UTC offset for ${timezone}`);
  return parseUtcOffset(rawOffset, timezone);
}

function localParts(iso: string, timezone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (key: string): number => Number(parts.find((part) => part.type === key)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

/** Returns minutes after local midnight, or -1 when the arrival is not December 25. */
function isDecemberTwentyFifth(year: number, month: number, day: number): boolean {
  return year === 2026 && month === 12 && day === 25;
}

function minuteOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function localMinuteFromOffset(iso: string, offsetMinutes: number): number {
  const local = new Date(Date.parse(iso) + offsetMinutes * 60_000);
  if (!isDecemberTwentyFifth(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate())) return -1;
  return minuteOfDay(local.getUTCHours(), local.getUTCMinutes());
}

function localMinuteFromTimezone(iso: string, timezone: string): number {
  const local = localParts(iso, timezone);
  if (!isDecemberTwentyFifth(local.year, local.month, local.day)) return -1;
  return minuteOfDay(local.hour, local.minute);
}

export function localMinute(iso: string, timezoneOrOffset: string | number): number {
  if (typeof timezoneOrOffset === 'number') return localMinuteFromOffset(iso, timezoneOrOffset);
  return localMinuteFromTimezone(iso, timezoneOrOffset);
}

export function localDate(iso: string, timezone: string): string {
  const local = localParts(iso, timezone);
  return `${local.year.toString().padStart(4, '0')}-${local.month.toString().padStart(2, '0')}-${local.day.toString().padStart(2, '0')}`;
}
