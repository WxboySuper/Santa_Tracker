import type { RouteNode } from "./locations";

/** A visitor's selected location, kept on the device. */
export interface ChosenPlace { name: string; lat?: number; lng?: number; timezone?: string }
/** The closest future route stop and its scheduled arrival. */
export interface ArrivalEstimate { stop: RouteNode; at: Date }

/** Finds the closest future stop for a coordinate or time-zone choice. */
export function estimateArrival(place: ChosenPlace, route: RouteNode[], now: Date): ArrivalEstimate | null {
  const candidates = route.filter(node => Date.parse(node.schedule?.arrival_utc ?? "") >= now.getTime());
  if (!candidates.length) return null;
  const stop = candidates.reduce((nearest, node) => distance(place, node) < distance(place, nearest) ? node : nearest);
  const arrival = stop.schedule?.arrival_utc;
  return arrival ? { stop, at: new Date(arrival) } : null;
}

/** Measures coordinate distance or time-zone offset when coordinates are absent. */
function distance(place: ChosenPlace, node: RouteNode): number {
  if (place.lat !== undefined && place.lng !== undefined) return Math.hypot(place.lat - node.location.lat, (place.lng - node.location.lng) * Math.cos(place.lat * Math.PI / 180));
  const arrival = node.schedule?.arrival_utc;
  const offset = place.timezone && arrival ? timezoneOffset(place.timezone, new Date(arrival)) : 0;
  return Math.abs(offset - (node.location.timezone_offset ?? 0));
}

/** Reads a time zone's UTC offset at the candidate stop's arrival instant. */
function timezoneOffset(timezone: string, instant: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
    const localAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    if (!Number.isFinite(localAsUtc)) return 0;
    return (localAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 3_600_000;
  } catch { return 0; }
}
