import type { Route } from '@santa-tracker/contracts';
import { clampProgress } from './progress';
import { findSegment } from './segment';

export type JourneyState = {
  currentIndex: number | null;
  nextIndex: number | null;
  progress: number; // 0..1
  isComplete: boolean;
};

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
