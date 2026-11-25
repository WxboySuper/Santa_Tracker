import { haversineKm, type LatLng } from '../geo';
import type { Candidate, EastwardReason, StopTier } from './types';

const MINUTE_MS = 60_000;
const LOCAL_MIDNIGHT = Date.UTC(2026, 11, 25);

export type ChristmasWindow = { startUtc: number; idealUtc: number; endUtc: number };
export type LocalClock = { year: number; month: number; day: number; hour: number; minute: number };

function validateMinute(minutesAfterMidnight: number): void {
  if (!Number.isInteger(minutesAfterMidnight)) throw new Error('Arrival minute must be an integer');
  if (minutesAfterMidnight < 0 || minutesAfterMidnight >= 1440) throw new Error('Arrival minute must be on Christmas Day');
}

/** Resolve a Christmas local time from the committed December UTC offset or an IANA zone. */
export function christmasArrival(timezoneOrOffset: string | number, minutesAfterMidnight: number): string {
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
  const midnight = Date.parse(christmasArrival(offsetMinutes, 0));
  return {
    startUtc: midnight - 60 * MINUTE_MS,
    idealUtc: Date.parse(christmasArrival(offsetMinutes, 60)),
    endUtc: Date.parse(christmasArrival(offsetMinutes, 5 * 60)),
  };
}

export function stopTier(place: Candidate): StopTier {
  const population = place.population;
  const capital = place.capital === true || place.isCapital === true || place.isNationalCapital === true || place.category === 'capital';
  const curated = /^Q\d+$/.test(place.id) || place.source?.includes('wikidata.org/wiki/Q') === true;
  const headlineLandmark = place.headlineLandmark === true || (curated && (place.category === 'special' || place.category === 'cultural'));
  if (headlineLandmark || (population ?? 0) >= 1_000_000 || (capital && (population ?? 0) >= 250_000)) return 'major';
  if (capital || curated || (population ?? 0) >= 100_000) return 'city';
  if ((population ?? 0) >= 5_000) return 'town';
  return 'hop';
}

export function stopDurationSeconds(tier: StopTier): number {
  switch (tier) {
    case 'major': return 60;
    case 'city': return 30;
    case 'town': return 10;
    case 'hop': return 3;
  }
}

export function localClock(iso: string, timezoneOrOffset: string | number): LocalClock {
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
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

export function localMinuteInChristmasWindow(iso: string, timezoneOrOffset: string | number): number {
  const local = localClock(iso, timezoneOrOffset);
  const minute = local.hour * 60 + local.minute;
  if (local.year === 2026 && local.month === 12 && local.day === 24 && minute >= 23 * 60) return minute;
  if (local.year === 2026 && local.month === 12 && local.day === 25 && minute <= 5 * 60) return minute;
  return -1;
}

export function isInChristmasWindow(iso: string, timezoneOrOffset: string | number): boolean {
  return localMinuteInChristmasWindow(iso, timezoneOrOffset) >= 0;
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
  if (destinationIndex < 5 && nearDateline && toOffset !== undefined && toOffset >= 13 * 60) return 'dateline';

  if (fromOffset === undefined || toOffset === undefined) return undefined;
  const offsetJump = toOffset - fromOffset;
  const longitudeClockChange = eastward * 4;
  const destinationIdealUtc = Date.parse(christmasArrival(toOffset, 60));
  const sourceIdealUtc = Date.parse(christmasArrival(fromOffset, 60));
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
