import { haversineKm, type LatLng } from '../geo';
import type { Candidate, EastwardReason, StopTier } from './types';

const MINUTE_MS = 60_000;
const LOCAL_MIDNIGHT = Date.UTC(2026, 11, 25);
const PREFERRED_WINDOW_START = 22 * 60;
const PREFERRED_WINDOW_END = 6 * 60;
const HARD_WINDOW_START = 20 * 60;
const HARD_WINDOW_END = 8 * 60;

export type LocalWindowStatus = 'GREEN' | 'YELLOW' | 'RED';
type InstantOffsetOptions = { instant: number; offsetMinutes: number };
type MinuteRangeOptions = { minute: number; start: number; end: number };
type MinuteValidationOptions = { minutesAfterMidnight: number };
type LocalTimestampOptions = { formatter: Intl.DateTimeFormat; instant: number };
type TimezoneOptions = { timeZone: string };

function minuteOfLocalDay({ instant, offsetMinutes }: InstantOffsetOptions): number {
  const local = new Date(instant + offsetMinutes * MINUTE_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function isInsideOvernightWindow({ minute, start, end }: MinuteRangeOptions): boolean {
  return minute >= start || minute <= end;
}

export function localWindowStatus(options: InstantOffsetOptions): LocalWindowStatus {
  const minute = minuteOfLocalDay(options);
  if (isInsideOvernightWindow({ minute, start: PREFERRED_WINDOW_START, end: PREFERRED_WINDOW_END })) return 'GREEN';
  if (isInsideOvernightWindow({ minute, start: HARD_WINDOW_START, end: HARD_WINDOW_END })) return 'YELLOW';
  return 'RED';
}

export function localWindowPenaltyMinutes(options: InstantOffsetOptions): number {
  const minute = minuteOfLocalDay(options);
  if (isInsideOvernightWindow({ minute, start: PREFERRED_WINDOW_START, end: PREFERRED_WINDOW_END })) return 0;
  return Math.min(PREFERRED_WINDOW_START - minute, minute - PREFERRED_WINDOW_END);
}

export function localWindowDeadline({ instant, offsetMinutes }: InstantOffsetOptions): number | undefined {
  if (localWindowStatus({ instant, offsetMinutes }) === 'RED') return undefined;
  const localInstant = instant + offsetMinutes * MINUTE_MS;
  const local = new Date(localInstant);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const nextDay = minute >= HARD_WINDOW_START ? 1 : 0;
  const deadline = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + nextDay, 8);
  return deadline - offsetMinutes * MINUTE_MS;
}

export type ChristmasWindow = { startUtc: number; idealUtc: number; endUtc: number };
export type LocalClock = { year: number; month: number; day: number; hour: number; minute: number };
type ZonedMinute = { timezoneOrOffset: string | number; minutesAfterMidnight: number };
type ZonedInstant = { iso: string; timezoneOrOffset: string | number };

function validateMinute({ minutesAfterMidnight }: MinuteValidationOptions): void {
  if (!Number.isInteger(minutesAfterMidnight)) throw new Error('Arrival minute must be an integer');
  if (minutesAfterMidnight < 0 || minutesAfterMidnight >= 1440) throw new Error('Arrival minute must be on Christmas Day');
}

/** Resolve a Christmas local time from the committed December UTC offset or an IANA zone. */
export function christmasArrival({ timezoneOrOffset, minutesAfterMidnight }: ZonedMinute): string {
  validateMinute({ minutesAfterMidnight });
  if (typeof timezoneOrOffset === 'number') {
    return new Date(LOCAL_MIDNIGHT + minutesAfterMidnight * MINUTE_MS - timezoneOrOffset * MINUTE_MS).toISOString();
  }

  const formatter = createFormatter({ timeZone: timezoneOrOffset });
  const target = LOCAL_MIDNIGHT + minutesAfterMidnight * MINUTE_MS;
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const delta = target - localTimestamp({ formatter, instant });
    if (delta === 0) return new Date(instant).toISOString();
    instant += delta;
  }
  throw new Error(`Cannot resolve local arrival in ${timezoneOrOffset}`);
}

export function christmasWindow(offsetMinutes: number): ChristmasWindow {
  const midnight = Date.parse(christmasArrival({ timezoneOrOffset: offsetMinutes, minutesAfterMidnight: 0 }));
  return {
    startUtc: midnight - 60 * MINUTE_MS,
    idealUtc: Date.parse(christmasArrival({ timezoneOrOffset: offsetMinutes, minutesAfterMidnight: 60 })),
    endUtc: Date.parse(christmasArrival({ timezoneOrOffset: offsetMinutes, minutesAfterMidnight: 5 * 60 })),
  };
}

export function stopTier(place: Candidate): StopTier {
  const population = place.population ?? 0;
  if (isMajorStop(place, population)) return 'major';
  if (isCityStop(place, population)) return 'city';
  if (population >= 5_000) return 'town';
  return 'hop';
}

function isMajorStop(place: Candidate, population: number): boolean {
  const capitalWithPopulation = isCapital(place) && population >= 250_000;
  return isHeadlineLandmark(place, isCurated(place)) || population >= 1_000_000 || capitalWithPopulation;
}

function isCityStop(place: Candidate, population: number): boolean {
  return isCapital(place) || isCurated(place) || population >= 100_000;
}

function isCapital(place: Candidate): boolean {
  return place.capital === true || place.isCapital === true || place.isNationalCapital === true || place.category === 'capital';
}

function isCurated(place: Candidate): boolean {
  return /^Q\d+$/.test(place.id) || place.source?.includes('wikidata.org/wiki/Q') === true;
}

function isHeadlineLandmark(place: Candidate, curated: boolean): boolean {
  if (place.headlineLandmark === true) return true;
  return curated && (place.category === 'special' || place.category === 'cultural');
}

export function stopDurationSeconds(tier: StopTier): number {
  switch (tier) {
    case 'major': return 30;
    case 'city': return 20;
    case 'town': return 5;
    case 'hop': return 3;
  }
}

export function localClock({ iso, timezoneOrOffset }: ZonedInstant): LocalClock {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) throw new Error(`Invalid arrival time: ${iso}`);
  if (typeof timezoneOrOffset === 'number') {
    const local = new Date(instant + timezoneOrOffset * MINUTE_MS);
    return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(),
      hour: local.getUTCHours(), minute: local.getUTCMinutes() };
  }
  const parts = createFormatter({ timeZone: timezoneOrOffset }).formatToParts(instant);
  const value = (name: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === name);
    if (!part) throw new Error(`Missing ${name} in formatted time`);
    return Number(part.value);
  };
  const date = new Date(Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute')));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

export function localMinuteInChristmasWindow({ iso, timezoneOrOffset }: ZonedInstant): number {
  const local = localClock({ iso, timezoneOrOffset });
  const minute = local.hour * 60 + local.minute;
  if (isLateChristmasEve(local, minute) || isEarlyChristmasDay(local, minute)) return minute;
  return -1;
}

function isLateChristmasEve(local: LocalClock, minute: number): boolean {
  return local.year === 2026 && local.month === 12 && local.day === 24 && minute >= 23 * 60;
}

function isEarlyChristmasDay(local: LocalClock, minute: number): boolean {
  return local.year === 2026 && local.month === 12 && local.day === 25 && minute <= 5 * 60;
}

export function isInChristmasWindow(options: ZonedInstant): boolean {
  return localMinuteInChristmasWindow(options) >= 0;
}

export function isInSouthernChristmasWindow(options: ZonedInstant): boolean {
  const local = localClock(options);
  const minute = local.hour * 60 + local.minute;
  return isInChristmasWindow(options) && (minute >= 23 * 60 || minute <= 150);
}

export function longitudeDelta(from: LatLng, to: LatLng): number {
  // At either pole every longitude names the same point, so it cannot define
  // eastward or westward route progress.
  if (Math.abs(from.lat) === 90 || Math.abs(to.lat) === 90) return 0;
  return ((to.lng - from.lng + 540) % 360) - 180;
}

export function isEastwardDelta(delta: number): boolean {
  return delta > 1;
}

function offsetFor(place: LatLng & { utcOffsetMinutes?: number }): number | undefined {
  return place.utcOffsetMinutes;
}

export function eastwardLegReason(options: {
  from: LatLng & { utcOffsetMinutes?: number };
  to: Candidate;
  destinationIndex: number;
  arrivalUtc?: number;
}): EastwardReason | undefined {
  const { from, to, arrivalUtc } = options;
  const eastward = longitudeDelta(from, to);
  if (!isEastwardDelta(eastward)) return undefined;
  const fromOffset = offsetFor(from);
  const toOffset = offsetFor(to);

  const nearDateline = Math.abs(from.lng) >= 150 && Math.abs(to.lng) >= 150;
  const fromLongitude = ((from.lng + 180) % 360 + 360) % 360 - 180;
  const toLongitude = ((to.lng + 180) % 360 + 360) % 360 - 180;
  const crossesDateline = Math.abs(toLongitude - fromLongitude) > 180;
  // A genuine eastward crossing of the International Date Line remains a
  // dateline crossing wherever it occurs in the westward sweep.
  if (nearDateline && crossesDateline) {
    return 'dateline';
  }

  if (fromOffset === undefined || toOffset === undefined) return undefined;
  const offsetJump = toOffset - fromOffset;
  const longitudeClockChange = eastward * 4;
  const destinationIdealUtc = Date.parse(christmasArrival({ timezoneOrOffset: toOffset, minutesAfterMidnight: 60 }));
  const sourceIdealUtc = Date.parse(christmasArrival({ timezoneOrOffset: fromOffset, minutesAfterMidnight: 60 }));
  const window = christmasWindow(toOffset);
  const destinationInWindow = arrivalUtc !== undefined && arrivalUtc >= window.startUtc && arrivalUtc <= window.endUtc;
  const offsetAdvancesTheClock = offsetJump > longitudeClockChange + 10 && destinationIdealUtc < sourceIdealUtc;
  const smallOffsetReset = offsetJump < 0 && offsetJump >= -120
    && destinationIdealUtc > sourceIdealUtc;
  if ((offsetAdvancesTheClock || smallOffsetReset) && destinationInWindow) return 'offset-anomaly';
  return undefined;
}

function localTimestamp({ formatter, instant }: LocalTimestampOptions): number {
  const parts = formatter.formatToParts(instant);
  const value = (name: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === name);
    if (!part) throw new Error(`Missing ${name} in formatted time`);
    return Number(part.value);
  };
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'));
}

function createFormatter({ timeZone }: TimezoneOptions): Intl.DateTimeFormat {
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

export function detourRatio(from: LatLng, via: LatLng, to: LatLng): number {
  const direct = haversineKm(from, to);
  if (direct === 0) return Number.MAX_SAFE_INTEGER;
  return (haversineKm(from, via) + haversineKm(via, to)) / direct;
}
