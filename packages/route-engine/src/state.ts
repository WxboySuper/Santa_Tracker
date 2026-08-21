import type { Route } from '@santa-tracker/contracts';

export type JourneyState = {
  currentIndex: number | null;
  nextIndex: number | null;
  progress: number; // 0..1
  isComplete: boolean;
};

function clampProgress(firstArrival: number, lastDeparture: number, nowMs: number): number {
  const total = lastDeparture - firstArrival;
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - firstArrival) / total));
}

type SegmentMatch = {
  currentIndex: number;
  nextIndex: number | null;
};

function isActive(nowMs: number, arrival: number, departure: number): boolean {
  return nowMs >= arrival && nowMs < departure;
}

function isBetween(nowMs: number, departure: number, nextArrival: number): boolean {
  return nowMs >= departure && nowMs < nextArrival;
}

function findActiveSegment(route: Route, nowMs: number): SegmentMatch | null {
  const stops = route.stops;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop) continue;
    const arrival = Date.parse(stop.arrivalIso);
    const departure = Date.parse(stop.departureIso);
    if (isActive(nowMs, arrival, departure)) {
      return { currentIndex: i, nextIndex: i + 1 < stops.length ? i + 1 : null };
    }
  }
  return null;
}

function findBetweenSegment(route: Route, nowMs: number): SegmentMatch | null {
  const stops = route.stops;
  for (let i = 0; i < stops.length - 1; i++) {
    const current = stops[i];
    const next = stops[i + 1];
    if (!current || !next) continue;
    const departure = Date.parse(current.departureIso);
    const nextArrival = Date.parse(next.arrivalIso);
    if (isBetween(nowMs, departure, nextArrival)) {
      return { currentIndex: i, nextIndex: i + 1 };
    }
  }
  return null;
}

function findSegment(route: Route, nowMs: number): SegmentMatch | null {
  return findActiveSegment(route, nowMs) ?? findBetweenSegment(route, nowMs);
}

/**
 * Deterministic live state from immutable route snapshot and injected time.
 * Pure function — caller provides `now`.
 */
export function deriveJourneyState(route: Route, now: Date): JourneyState {
  const stops = route.stops;

  if (stops.length === 0) {
    return { currentIndex: null, nextIndex: null, progress: 0, isComplete: false };
  }

  const nowMs = now.getTime();
  const firstArrival = Date.parse(stops[0]!.arrivalIso);
  const lastDeparture = Date.parse(stops[stops.length - 1]!.departureIso);

  if (nowMs < firstArrival) {
    return { currentIndex: null, nextIndex: 0, progress: 0, isComplete: false };
  }

  if (nowMs >= lastDeparture) {
    return { currentIndex: stops.length - 1, nextIndex: null, progress: 1, isComplete: true };
  }

  const segment = findSegment(route, nowMs);

  if (segment) {
    return {
      currentIndex: segment.currentIndex,
      nextIndex: segment.nextIndex,
      progress: clampProgress(firstArrival, lastDeparture, nowMs),
      isComplete: false,
    };
  }

  return {
    currentIndex: null,
    nextIndex: null,
    progress: clampProgress(firstArrival, lastDeparture, nowMs),
    isComplete: false,
  };
}
