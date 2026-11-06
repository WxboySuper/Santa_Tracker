import type { RouteNode } from "./locations";
import type { ChosenPlace } from "./tracker-arrival";

const PLACE_COORDINATE_TOLERANCE = 0.03;

/** Curated coordinate choices accepted by the local-storage validator. */
export const CURATED_CITIES: ChosenPlace[] = [
  { name: "New York", lat: 40.7128, lng: -74.006, timezone: "America/New_York" },
  { name: "London", lat: 51.5072, lng: -0.1276, timezone: "Europe/London" },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, timezone: "Asia/Tokyo" },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, timezone: "Australia/Sydney" },
];

/** Accepts only a complete route stop, curated city, or valid time-zone choice. */
export function validateStoredPlace(value: unknown, route: RouteNode[]): ChosenPlace | null {
  if (!isStoredPlace(value)) return null;
  if (!hasKnownCoordinates(value, route)) return null;
  return value;
}

function isStoredPlace(value: unknown): value is ChosenPlace {
  if (!isRecord(value)) return false;
  if (!hasValidName(value)) return false;
  if (!hasValidCoordinatePair(value)) return false;
  if (!hasValidTimezone(value)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidName(value: Record<string, unknown>): boolean {
  if (typeof value.name !== "string") return false;
  return value.name.trim().length > 0;
}

function hasValidCoordinatePair(value: Record<string, unknown>): boolean {
  const hasLatitude = typeof value.lat === "number";
  const hasLongitude = typeof value.lng === "number";
  if (hasLatitude !== hasLongitude) return false;
  if (!hasLatitude) return true;
  return Number.isFinite(value.lat) && Number.isFinite(value.lng);
}

function hasValidTimezone(value: Record<string, unknown>): boolean {
  if (value.timezone === undefined) return typeof value.lat === "number";
  if (typeof value.timezone !== "string") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); }
  catch { return false; }
  if (typeof value.lat === "number") return true;
  return value.name === value.timezone;
}

function hasKnownCoordinates(value: ChosenPlace, route: RouteNode[]): boolean {
  if (value.lat === undefined || value.lng === undefined) return true;
  const routeMatch = route.some(node => matchesCoordinates(value, node.location));
  return routeMatch || CURATED_CITIES.some(city => matchesCoordinates(value, city));
}

function matchesCoordinates(value: ChosenPlace, location: { name: string; lat?: number; lng?: number }): boolean {
  if (value.name !== location.name) return false;
  if (value.lat === undefined) return false;
  if (value.lng === undefined) return false;
  if (location.lat === undefined) return false;
  if (location.lng === undefined) return false;
  if (Math.abs(value.lat - location.lat) > PLACE_COORDINATE_TOLERANCE) return false;
  return Math.abs(value.lng - location.lng) <= PLACE_COORDINATE_TOLERANCE;
}
