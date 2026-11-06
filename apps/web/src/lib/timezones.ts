export interface TimezoneConfig { kind: "timezones" }

export interface PuzzleCity {
  id: "kiritimati" | "auckland" | "tokyo" | "cairo" | "london" | "honolulu";
  name: string;
  timeZone: string;
}

export interface CityClock extends PuzzleCity {
  localTime: string;
  localDate: string;
  midnightUtc: number;
  offsetMinutes: number;
}

interface CityClockOptions {
  referenceInstant: number;
  locale?: string;
}

interface ZoneInstant {
  instant: number;
  timeZone: string;
}

interface MidnightTarget {
  timeZone: string;
  year: number;
}

interface ZonedFormat extends ZoneInstant {
  locale: string;
  options: Intl.DateTimeFormatOptions;
}

export const REFERENCE_START_UTC = Date.UTC(2026, 11, 24, 10);
export const REFERENCE_END_UTC = Date.UTC(2026, 11, 25, 14);
export const PUZZLE_CITIES: PuzzleCity[] = [
  { id: "kiritimati", name: "Kiritimati", timeZone: "Pacific/Kiritimati" },
  { id: "auckland", name: "Auckland", timeZone: "Pacific/Auckland" },
  { id: "tokyo", name: "Tokyo", timeZone: "Asia/Tokyo" },
  { id: "cairo", name: "Cairo", timeZone: "Africa/Cairo" },
  { id: "london", name: "London", timeZone: "Europe/London" },
  { id: "honolulu", name: "Honolulu", timeZone: "Pacific/Honolulu" },
];

export function parseTimezones(payload: unknown): TimezoneConfig | null {
  if (!isRecord(payload) || payload.kind !== "timezones") return null;
  return { kind: "timezones" };
}

export function getCityClocks({ referenceInstant, locale = "en" }: CityClockOptions): CityClock[] {
  return PUZZLE_CITIES.map((city) => ({
    ...city,
    localTime: formatInZone({ instant: referenceInstant, timeZone: city.timeZone, locale, options: { hour: "numeric", minute: "2-digit" } }),
    localDate: formatInZone({ instant: referenceInstant, timeZone: city.timeZone, locale, options: { month: "short", day: "numeric" } }),
    midnightUtc: getDecemberMidnightUtc({ timeZone: city.timeZone, year: new Date(referenceInstant).getUTCFullYear() }),
    offsetMinutes: getUtcOffsetMinutes({ instant: referenceInstant, timeZone: city.timeZone }),
  }));
}

export function getOrderedCityIds({ referenceInstant }: Pick<CityClockOptions, "referenceInstant">): string[] {
  return getCityClocks({ referenceInstant }).sort((left, right) => left.midnightUtc - right.midnightUtc).map(({ id }) => id);
}

export function getUtcOffsetMinutes({ instant, timeZone }: ZoneInstant): number {
  const parts = getDateParts({ instant, timeZone });
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((localAsUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

export function getDecemberMidnightUtc({ timeZone, year }: MidnightTarget): number {
  const localMidnightAsUtc = Date.UTC(year, 11, 25);
  let candidate = localMidnightAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = localMidnightAsUtc - getUtcOffsetMinutes({ instant: candidate, timeZone }) * 60000;
  }
  return candidate;
}

function formatInZone({ instant, timeZone, locale, options }: ZonedFormat): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(instant);
}

function getDateParts({ instant, timeZone }: ZoneInstant): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
