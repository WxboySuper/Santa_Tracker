import type { Route } from '@santa-tracker/contracts';

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

  // Find active stop: arrival <= now < departure, else between stops.
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]!;
    const arrival = Date.parse(s.arrivalIso);
    const departure = Date.parse(s.departureIso);
    if (nowMs >= arrival && nowMs < departure) {
      const total = lastDeparture - firstArrival;
      const progress = total === 0 ? 1 : Math.min(1, Math.max(0, (nowMs - firstArrival) / total));
      return { currentIndex: i, nextIndex: i + 1 < stops.length ? i + 1 : null, progress, isComplete: false };
    }
    if (i + 1 < stops.length) {
      const nextArrival = Date.parse(stops[i + 1]!.arrivalIso);
      if (nowMs >= departure && nowMs < nextArrival) {
        const total = lastDeparture - firstArrival;
        const progress = total === 0 ? 1 : Math.min(1, Math.max(0, (nowMs - firstArrival) / total));
        return { currentIndex: i, nextIndex: i + 1, progress, isComplete: false };
      }
    }
  }

  // Fallback: clamp progress
  const total = lastDeparture - firstArrival;
  const progress = total === 0 ? 1 : Math.min(1, Math.max(0, (nowMs - firstArrival) / total));
  return { currentIndex: null, nextIndex: null, progress, isComplete: false };
}
