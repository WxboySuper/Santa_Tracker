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

export function findActiveSegment(route: Route, nowMs: number): SegmentMatch | null {
  const stops = route.stops;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop) continue;
    const arrivalMs = Date.parse(stop.arrivalIso);
    const departureMs = Date.parse(stop.departureIso);
    if (isActive(nowMs, arrivalMs, departureMs)) {
      return { currentIndex: i, nextIndex: i + 1 < stops.length ? i + 1 : null };
    }
  }
  return null;
}

export function findBetweenSegment(route: Route, nowMs: number): SegmentMatch | null {
  const stops = route.stops;
  for (let i = 0; i < stops.length - 1; i++) {
    const current = stops[i];
    const next = stops[i + 1];
    if (!current || !next) continue;
    const departureMs = Date.parse(current.departureIso);
    const nextArrivalMs = Date.parse(next.arrivalIso);
    if (isBetween(nowMs, departureMs, nextArrivalMs)) {
      return { currentIndex: i, nextIndex: i + 1 };
    }
  }
  return null;
}

export function findSegment(route: Route, nowMs: number): SegmentMatch | null {
  return findActiveSegment(route, nowMs) ?? findBetweenSegment(route, nowMs);
}
