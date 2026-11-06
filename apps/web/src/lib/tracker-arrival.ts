import type { RouteNode } from "./locations";

/** A visitor's selected location, kept on the device. */
export interface ChosenPlace { name: string; lat?: number; lng?: number; timezone?: string }
/** The closest future route stop and its scheduled arrival. */
export interface ArrivalEstimate { stop: RouteNode; at: Date }

/** Curated coordinate choices accepted by the local-storage validator. */
export const CURATED_CITIES: ChosenPlace[] = [
  { name: "New York", lat: 40.7128, lng: -74.006, timezone: "America/New_York" },
  { name: "London", lat: 51.5072, lng: -0.1276, timezone: "Europe/London" },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, timezone: "Asia/Tokyo" },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, timezone: "Australia/Sydney" },
];

/** Accepts only a complete route stop, curated city, or valid time-zone choice. */
export function validateStoredPlace(value: unknown, route: RouteNode[]): ChosenPlace | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  const hasLatitude = typeof value.lat === "number";
  const hasLongitude = typeof value.lng === "number";
  if (hasLatitude !== hasLongitude) return null;
  if (hasLatitude && (!Number.isFinite(value.lat) || !Number.isFinite(value.lng))) return null;
  if (value.timezone !== undefined && (typeof value.timezone !== "string" || !isKnownTimezone(value.timezone))) return null;
  if (!hasLatitude && typeof value.timezone !== "string") return null;
  if (hasLatitude && !matchesKnownPlace(value, route)) return null;
  return value as unknown as ChosenPlace;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownTimezone(timezone: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; }
  catch { return false; }
}

function matchesKnownPlace(value: Record<string, unknown>, route: RouteNode[]): boolean {
  const name = value.name;
  const lat = value.lat;
  const lng = value.lng;
  if (typeof name !== "string" || typeof lat !== "number" || typeof lng !== "number") return false;
  const matchesCoordinates = (place: ChosenPlace) => place.name === name && place.lat === lat && place.lng === lng;
  return route.some(node => matchesCoordinates({ name: node.location.name, lat: node.location.lat, lng: node.location.lng })) || CURATED_CITIES.some(matchesCoordinates);
}

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
