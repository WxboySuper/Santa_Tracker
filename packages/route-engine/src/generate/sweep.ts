import { haversineKm, type LatLng } from '../geo';
import type { Candidate, EastwardReason, StopTier } from './types';

const MINUTE_MS = 60_000;
const LOCAL_MIDNIGHT = Date.UTC(2026, 11, 25);

export type ChristmasWindow = { startUtc: number; idealUtc: number; endUtc: number };
export type LocalClock = { year: number; month: number; day: number; hour: number; minute: number };
type ZonedMinute = { timezoneOrOffset: string | number; minutesAfterMidnight: number };
type ZonedInstant = { iso: string; timezoneOrOffset: string | number };

function validateMinute(minutesAfterMidnight: number): void {
  if (!Number.isInteger(minutesAfterMidnight)) throw new Error('Arrival minute must be an integer');
  if (minutesAfterMidnight < 0 || minutesAfterMidnight >= 1440) throw new Error('Arrival minute must be on Christmas Day');
}

/** Resolve a Christmas local time from the committed December UTC offset or an IANA zone. */
export function christmasArrival({ timezoneOrOffset, minutesAfterMidnight }: ZonedMinute): string {
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
    case 'major': return 60;
    case 'city': return 30;
    case 'town': return 10;
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
  const parts = createFormatter(timezoneOrOffset).formatToParts(instant);
  const value = (name: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === name);
    if (!part) throw new Error(`Missing ${name} in formatted time`);
    return Number(part.value);
  };
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') % 24, minute: value('minute') };
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

export function longitudeDelta(from: LatLng, to: LatLng): number {
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
  const { from, to, destinationIndex, arrivalUtc } = options;
  const eastward = longitudeDelta(from, to);
  if (!isEastwardDelta(eastward)) return undefined;

  const fromOffset = offsetFor(from);
  const toOffset = offsetFor(to);
  const nearDateline = Math.abs(from.lng) >= 150 && Math.abs(to.lng) >= 150;
  const stillBeforeWestwardSweep = fromOffset === undefined
    ? destinationIndex === 0
    : fromOffset > 12 * 60;
  if (destinationIndex < 5 && stillBeforeWestwardSweep && nearDateline && toOffset !== undefined && toOffset >= 13 * 60) {
    return 'dateline';
  }

  if (fromOffset === undefined || toOffset === undefined) return undefined;
  const offsetJump = toOffset - fromOffset;
  const longitudeClockChange = eastward * 4;
  const destinationIdealUtc = Date.parse(christmasArrival({ timezoneOrOffset: toOffset, minutesAfterMidnight: 60 }));
  const sourceIdealUtc = Date.parse(christmasArrival({ timezoneOrOffset: fromOffset, minutesAfterMidnight: 60 }));
  const window = christmasWindow(toOffset);
  const destinationInWindow = arrivalUtc !== undefined && arrivalUtc >= window.startUtc && arrivalUtc <= window.endUtc;
  if (offsetJump > longitudeClockChange + 20 && destinationIdealUtc < sourceIdealUtc
    && destinationInWindow) return 'offset-anomaly';
  return undefined;
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

export function detourRatio(from: LatLng, via: LatLng, to: LatLng): number {
  const direct = haversineKm(from, to);
  if (direct === 0) return Number.POSITIVE_INFINITY;
  return (haversineKm(from, via) + haversineKm(via, to)) / direct;
}
