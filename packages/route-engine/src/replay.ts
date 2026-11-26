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
  play(wallClockNow?: number): void;
  pause(wallClockNow?: number): void;
  seek(position: Date | number, wallClockNow?: number): void;
  setSpeed(speed: number, wallClockNow?: number): void;
  reset(wallClockNow?: number): void;
  at(wallClockNow: number): ReplayFrame;
};

/** Create a replay controller around an immutable route and its archived location catalog. */
export function createReplay(route: Route, options: ReplayOptions): ReplayController {
  const replayRoute: Route = { ...route, stops: route.stops.map(stop => ({ ...stop })) };
  const replayLocations = options.locations.map(location => ({ ...location, coordinates: { ...location.coordinates } }));
  const replayCandidatePool = (options.candidatePool ?? options.locations).map(location => ({ ...location, coordinates: { ...location.coordinates } }));
  const hasRoute = replayRoute.stops.length > 0;
  const firstArrival = hasRoute ? parseRouteTimestamp(replayRoute.stops[0]!.arrivalIso) : undefined;
  const lastDeparture = hasRoute ? parseRouteTimestamp(replayRoute.stops.at(-1)!.departureIso) : undefined;
  validateRouteTimestamps(replayRoute);

  const initialTime = clampToRoute(timestampMs(options.startAt ?? firstArrival ?? 0), firstArrival, lastDeparture);
  let journeyAnchor = initialTime;
  let wallAnchor = 0;
  let speed = validateSpeed(options.speed ?? 1);
  let playing = false;

  const currentAt = (wallClockNow: number) => {
    validateWallClock(wallClockNow);
    if (!hasRoute || !playing) return journeyAnchor;
    return clampToRoute(journeyAnchor + (wallClockNow - wallAnchor) * speed, firstArrival, lastDeparture);
  };
  const anchorAt = (journeyTimeMs: number, wallClockNow: number) => {
    validateWallClock(wallClockNow);
    journeyAnchor = clampToRoute(journeyTimeMs, firstArrival, lastDeparture);
    wallAnchor = wallClockNow;
  };

  return {
    play(wallClockNow = 0) {
      validateWallClock(wallClockNow);
      if (!hasRoute) return;
      if (!playing) anchorAt(currentAt(wallClockNow), wallClockNow);
      playing = true;
    },
    pause(wallClockNow = 0) {
      validateWallClock(wallClockNow);
      if (playing) anchorAt(currentAt(wallClockNow), wallClockNow);
      playing = false;
    },
    seek(position, wallClockNow = 0) {
      const target = seekTarget(position, firstArrival, lastDeparture);
      anchorAt(target, wallClockNow);
    },
    setSpeed(nextSpeed, wallClockNow = 0) {
      const validatedSpeed = validateSpeed(nextSpeed);
      anchorAt(currentAt(wallClockNow), wallClockNow);
      speed = validatedSpeed;
    },
    reset(wallClockNow = 0) {
      anchorAt(initialTime, wallClockNow);
      playing = false;
    },
    at(wallClockNow) {
      const journeyTimeMs = currentAt(wallClockNow);
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

function seekTarget(position: Date | number, firstArrival?: number, lastDeparture?: number): number {
  const rawPosition = timestampMs(position);
  const isFraction = typeof position === 'number'
    && firstArrival !== undefined
    && lastDeparture !== undefined
    && rawPosition >= 0
    && rawPosition <= 1;
  if (isFraction) return firstArrival + rawPosition * (lastDeparture - firstArrival);
  return rawPosition;
}

function validateSpeed(speed: number): number {
  if (!isValidSpeed(speed)) {
    throw new RangeError(`speed must be between ${MIN_REPLAY_SPEED}x and ${MAX_REPLAY_SPEED}x`);
  }
  return speed;
}

function isValidSpeed(speed: number): boolean { return isFiniteSpeed(speed) && isSpeedWithinBounds(speed); }

function isFiniteSpeed(speed: number): boolean { return Number.isFinite(speed); }

function isSpeedWithinBounds(speed: number): boolean {
  return speed >= MIN_REPLAY_SPEED && speed <= MAX_REPLAY_SPEED;
}

function validateRouteTimestamps(route: Route): void {
  for (const stop of route.stops) {
    parseRouteTimestamp(stop.arrivalIso);
    parseRouteTimestamp(stop.departureIso);
  }
}

function parseRouteTimestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new RangeError('replay route contains invalid ISO timestamps');
  return parsed;
}

function validateWallClock(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError('wall clock time must be a finite timestamp');
}

function timestampMs(value: Date | number): number {
  const result = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(result)) throw new RangeError('replay time must be a valid timestamp');
  return result;
}

function clampToRoute(value: number, firstArrival?: number, lastDeparture?: number): number {
  if (firstArrival === undefined || lastDeparture === undefined) return value;
  return Math.min(lastDeparture, Math.max(firstArrival, value));
}
