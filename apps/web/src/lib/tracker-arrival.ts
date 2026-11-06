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
  if (place.lat != null && place.lng != null) return Math.hypot(place.lat - node.location.lat, (place.lng - node.location.lng) * Math.cos(place.lat * Math.PI / 180));
  const offset = place.timezone ? timezoneOffset(place.timezone) : 0;
  return Math.abs(offset - (node.location.timezone_offset ?? 0));
}

/** Reads a time zone's UTC offset at Christmas. */
function timezoneOffset(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(new Date("2026-12-25T12:00:00Z"));
    const label = parts.find(part => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
    return match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) + Number(match[3]) / 60) : 0;
  } catch { return 0; }
}
