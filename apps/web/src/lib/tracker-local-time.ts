import type { RouteNode } from "./locations";

const HOUR_MS = 3_600_000;

/** Wall-clock time at a route stop, from its IANA zone when known, otherwise from its fixed UTC offset. */
export function localTimeAt(node: RouteNode, at: number, locale = "en-GB"): string {
  const zone = (node.location as { timezone?: string }).timezone;
  if (zone) {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(at);
    } catch {
      // Unknown zone in this browser: fall back to the offset below.
    }
  }
  const offset = node.location.timezone_offset ?? 0;
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(at + offset * HOUR_MS);
}

/** "under a minute", "4 min", "1 h 5 min" for a span of milliseconds. */
export function shortDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Day of month and hour at a stop at the given instant, for festive framing ("Christmas Eve" or "Christmas morning"). */
export function localDayHour(node: RouteNode, at: number): { day: number; hour: number } {
  const zone = (node.location as { timezone?: string }).timezone;
  const shifted = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", hour: "numeric", hourCycle: "h23" }).formatToParts(at);
    return { day: Number(parts.find(p => p.type === "day")?.value), hour: Number(parts.find(p => p.type === "hour")?.value) };
  };
  if (zone) {
    try {
      return shifted(zone);
    } catch {
      // Unknown zone: fall back to the fixed offset.
    }
  }
  const date = new Date(at + (node.location.timezone_offset ?? 0) * HOUR_MS);
  return { day: date.getUTCDate(), hour: date.getUTCHours() };
}
