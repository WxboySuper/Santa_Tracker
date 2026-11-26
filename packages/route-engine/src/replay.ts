import type { Route } from '@santa-tracker/contracts';
import { deriveJourneyState } from './state';
import { deriveJourneyStats, type JourneyStats, type RouteStatsLocation } from './stats';

export const MIN_REPLAY_SPEED = 0.5;
export const MAX_REPLAY_SPEED = 64;

export type ReplayOptions = {
  speed?: number;
  startAt?: Date | number;
  locations: readonly RouteStatsLocation[];
  candidatePool?: readonly RouteStatsLocation[];
};

export type ReplayFrame = {
  journeyTimeMs: number;
  time: Date;
  state: ReturnType<typeof deriveJourneyState>;
  stats: JourneyStats;
  isPlaying: boolean;
  speed: number;
};

export type ReplayController = {
  play(input: { wallClockNow: number }): void;
  pause(input: { wallClockNow: number }): void;
  seek(input: { position: Date | number; wallClockNow: number }): void;
  seekFraction(input: { fraction: number; wallClockNow: number }): void;
  setSpeed(input: { speed: number; wallClockNow: number }): void;
  reset(input: { wallClockNow: number }): void;
  at(input: { wallClockNow: number }): ReplayFrame;
};

/** Create a replay controller around an immutable route and its archived location catalog. */
export function createReplay(route: Route, options: ReplayOptions): ReplayController {
  const replayRoute: Route = { ...route, stops: route.stops.map(stop => ({ ...stop })) };
  const replayLocations = options.locations.map(location => ({ ...location, coordinates: { ...location.coordinates } }));
  const replayCandidatePool = (options.candidatePool ?? options.locations).map(location => ({ ...location, coordinates: { ...location.coordinates } }));
  const hasRoute = replayRoute.stops.length > 0;
  const firstArrival = hasRoute ? parseRouteTimestamp({ value: replayRoute.stops[0]!.arrivalIso }) : undefined;
  const lastDeparture = hasRoute ? parseRouteTimestamp({ value: replayRoute.stops.at(-1)!.departureIso }) : undefined;
  validateRouteTimestamps(replayRoute);

  const initialTime = clampToRoute({ value: timestampMs({ value: options.startAt ?? firstArrival ?? 0 }), firstArrival, lastDeparture });
  let journeyAnchor = initialTime;
  let wallAnchor = 0;
  let speed = validateSpeed({ speed: options.speed ?? 1 });
  let playing = false;

  const currentAt = ({ wallClockNow }: { wallClockNow: number }) => {
    validateWallClock({ wallClockNow });
    if (!hasRoute || !playing) return journeyAnchor;
    return clampToRoute({ value: journeyAnchor + (wallClockNow - wallAnchor) * speed, firstArrival, lastDeparture });
  };
  const anchorAt = ({ journeyTimeMs, wallClockNow }: { journeyTimeMs: number; wallClockNow: number }) => {
    validateWallClock({ wallClockNow });
    const priorJourneyTime = currentAt({ wallClockNow });
    if (lastDeparture !== undefined && priorJourneyTime >= lastDeparture) playing = false;
    journeyAnchor = clampToRoute({ value: journeyTimeMs, firstArrival, lastDeparture });
    if (lastDeparture !== undefined && journeyAnchor >= lastDeparture) playing = false;
    wallAnchor = wallClockNow;
  };

  return {
    play({ wallClockNow }) {
      validateWallClock({ wallClockNow });
      if (!hasRoute) return;
      if (!playing) anchorAt({ journeyTimeMs: currentAt({ wallClockNow }), wallClockNow });
      playing = true;
    },
    pause({ wallClockNow }) {
      validateWallClock({ wallClockNow });
      if (playing) anchorAt({ journeyTimeMs: currentAt({ wallClockNow }), wallClockNow });
      playing = false;
    },
    seek({ position, wallClockNow }) {
      const target = timestampMs({ value: position });
      anchorAt({ journeyTimeMs: target, wallClockNow });
    },
    seekFraction({ fraction, wallClockNow }) {
      const target = fractionTarget({ fraction, firstArrival, lastDeparture });
      anchorAt({ journeyTimeMs: target, wallClockNow });
    },
    setSpeed({ speed: nextSpeed, wallClockNow }) {
      const validatedSpeed = validateSpeed({ speed: nextSpeed });
      anchorAt({ journeyTimeMs: currentAt({ wallClockNow }), wallClockNow });
      speed = validatedSpeed;
    },
    reset({ wallClockNow }) {
      anchorAt({ journeyTimeMs: initialTime, wallClockNow });
      playing = false;
    },
    at({ wallClockNow }) {
      const journeyTimeMs = currentAt({ wallClockNow });
      const time = new Date(journeyTimeMs);
      return {
        journeyTimeMs,
        time,
        state: deriveJourneyState(replayRoute, time),
        stats: deriveJourneyStats(replayRoute, journeyTimeMs, replayLocations, replayCandidatePool),
        isPlaying: hasRoute && playing && lastDeparture !== undefined && journeyTimeMs < lastDeparture,
        speed,
      };
    },
  };
}

function fractionTarget({ fraction, firstArrival, lastDeparture }: { fraction: number; firstArrival?: number; lastDeparture?: number }): number {
  validateFraction({ fraction });
  const bounds = routeBounds({ firstArrival, lastDeparture });
  return bounds === undefined ? 0 : bounds.firstArrival + fraction * (bounds.lastDeparture - bounds.firstArrival);
}

function validateFraction({ fraction }: { fraction: number }): void {
  if (!Number.isFinite(fraction)) throw new RangeError('replay fraction must be between 0 and 1');
  if (fraction < 0) throw new RangeError('replay fraction must be between 0 and 1');
  if (fraction > 1) throw new RangeError('replay fraction must be between 0 and 1');
}

function routeBounds({ firstArrival, lastDeparture }: { firstArrival?: number; lastDeparture?: number }): { firstArrival: number; lastDeparture: number } | undefined {
  if (firstArrival === undefined) return undefined;
  if (lastDeparture === undefined) return undefined;
  return { firstArrival, lastDeparture };
}

function validateSpeed({ speed }: { speed: number }): number {
  if (!isValidSpeed({ speed })) {
    throw new RangeError(`speed must be between ${MIN_REPLAY_SPEED}x and ${MAX_REPLAY_SPEED}x`);
  }
  return speed;
}

function isValidSpeed({ speed }: { speed: number }): boolean { return isFiniteSpeed({ speed }) && isSpeedWithinBounds({ speed }); }

function isFiniteSpeed({ speed }: { speed: number }): boolean { return Number.isFinite(speed); }

function isSpeedWithinBounds({ speed }: { speed: number }): boolean {
  return speed >= MIN_REPLAY_SPEED && speed <= MAX_REPLAY_SPEED;
}

function validateRouteTimestamps(route: Route): void {
  let previousArrival = Number.NEGATIVE_INFINITY;
  let previousDeparture = Number.NEGATIVE_INFINITY;
  for (const stop of route.stops) {
    const arrival = parseRouteTimestamp({ value: stop.arrivalIso });
    const departure = parseRouteTimestamp({ value: stop.departureIso });
    if (departure <= arrival) throw new RangeError('replay route departure must be after arrival');
    if (arrival <= previousArrival) throw new RangeError('replay route arrivals must be strictly increasing');
    if (arrival < previousDeparture) throw new RangeError('replay route stops must not overlap');
    previousArrival = arrival;
    previousDeparture = departure;
  }
}

function parseRouteTimestamp({ value }: { value: string }): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new RangeError('replay route contains invalid ISO timestamps');
  return parsed;
}

function validateWallClock({ wallClockNow }: { wallClockNow: number }): void {
  if (!Number.isFinite(wallClockNow)) throw new RangeError('wall clock time must be a finite timestamp');
}

function timestampMs({ value }: { value: Date | number }): number {
  const result = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(result)) throw new RangeError('replay time must be a valid timestamp');
  return result;
}

function clampToRoute({ value, firstArrival, lastDeparture }: { value: number; firstArrival?: number; lastDeparture?: number }): number {
  if (firstArrival === undefined || lastDeparture === undefined) return value;
  return Math.min(lastDeparture, Math.max(firstArrival, value));
}
