export function parseUtcOffset(rawOffset: string, timezone: string): number {
  const normalized = rawOffset.replace(/^(GMT|UTC)/, '').trim() || '+00:00';
  const match = /^([+-])\s*(\d{1,2})(?::?(\d{2}))?(?::\d{2})?$/.exec(normalized);
  if (!match) throw new Error(`Invalid UTC offset for ${timezone}: ${rawOffset}`);
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    throw new Error(`Invalid UTC offset for ${timezone}: ${rawOffset}`);
  }
  return (match[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

export function christmasOffset(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(Date.UTC(2026, 11, 25));
  const rawOffset = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (rawOffset == null) throw new Error(`Missing UTC offset for ${timezone}`);
  return parseUtcOffset(rawOffset, timezone);
}

export function localMinute(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const value = (key: string): number => Number(parts.find((part) => part.type === key)?.value);
  if (value('month') !== 12 || value('day') !== 25) return -1;
  return value('hour') * 60 + value('minute');
}
