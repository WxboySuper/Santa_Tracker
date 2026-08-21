import type { Route } from '@santa-tracker/contracts';

export type SegmentMatch = {
  currentIndex: number;
  nextIndex: number | null;
};

function isActive(nowMs: number, arrivalMs: number, departureMs: number): boolean {
  return nowMs >= arrivalMs && nowMs < departureMs;
}

function isBetween(nowMs: number, departureMs: number, nextArrivalMs: number): boolean {
  return nowMs >= departureMs && nowMs < nextArrivalMs;
}

type ParsedStop = {
  arrivalMs: number;
  departureMs: number;
};

function parseStops(route: Route): ParsedStop[] {
  return route.stops.map((stop) => ({
    arrivalMs: Date.parse(stop.arrivalIso),
    departureMs: Date.parse(stop.departureIso),
  }));
}

export function findActiveSegment(route: Route, nowMs: number): SegmentMatch | null {
  const parsed = parseStops(route);
  for (let i = 0; i < parsed.length; i++) {
    const stop = parsed[i];
    if (!stop) continue;
    if (isActive(nowMs, stop.arrivalMs, stop.departureMs)) {
      return { currentIndex: i, nextIndex: i + 1 < parsed.length ? i + 1 : null };
    }
  }
  return null;
}

export function findBetweenSegment(route: Route, nowMs: number): SegmentMatch | null {
  const parsed = parseStops(route);
  for (let i = 0; i < parsed.length - 1; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];
    if (!current || !next) continue;
    if (isBetween(nowMs, current.departureMs, next.arrivalMs)) {
      return { currentIndex: i, nextIndex: i + 1 };
    }
  }
  return null;
}

export function findSegment(route: Route, nowMs: number): SegmentMatch | null {
  return findActiveSegment(route, nowMs) ?? findBetweenSegment(route, nowMs);
}
