import type { Route } from '@santa-tracker/contracts';
import { deriveJourneyState } from './state';
import { deriveJourneyStats, type JourneyStats, type RouteStatsLocation } from './stats';

export const MIN_REPLAY_SPEED = 0.5;
export const MAX_REPLAY_SPEED = 64;

export type ReplayOptions = {
  speed?: number;
  startAt?: Date | number;
  locations: readonly RouteStatsLocation[];
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
  const firstArrival = Date.parse(replayRoute.stops[0]!.arrivalIso);
  const lastDeparture = Date.parse(replayRoute.stops.at(-1)!.departureIso);
  const initialTime = clamp(timestampMs(options.startAt ?? firstArrival), firstArrival, lastDeparture);
  let journeyAnchor = initialTime;
  let wallAnchor = 0;
  let speed = validateSpeed(options.speed ?? 1);
  let playing = false;

  const currentAt = (wallClockNow: number) => {
    validateWallClock(wallClockNow);
    return playing ? clamp(journeyAnchor + (wallClockNow - wallAnchor) * speed, firstArrival, lastDeparture) : journeyAnchor;
  };
  const anchorAt = (journeyTimeMs: number, wallClockNow: number) => {
    validateWallClock(wallClockNow);
    journeyAnchor = clamp(journeyTimeMs, firstArrival, lastDeparture);
    wallAnchor = wallClockNow;
  };

  return {
    play(wallClockNow = 0) {
      if (!playing) anchorAt(currentAt(wallClockNow), wallClockNow);
      playing = true;
    },
    pause(wallClockNow = 0) {
      if (playing) anchorAt(currentAt(wallClockNow), wallClockNow);
      playing = false;
    },
    seek(position, wallClockNow = 0) {
      const target = position instanceof Date
        ? timestampMs(position)
        : position >= 0 && position <= 1
          ? firstArrival + position * (lastDeparture - firstArrival)
          : position;
      anchorAt(target, wallClockNow);
    },
    setSpeed(nextSpeed, wallClockNow = 0) {
      anchorAt(currentAt(wallClockNow), wallClockNow);
      speed = validateSpeed(nextSpeed);
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
        stats: deriveJourneyStats(replayRoute, journeyTimeMs, replayLocations),
        isPlaying: playing && journeyTimeMs < lastDeparture,
        speed,
      };
    },
  };
}

function validateSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed < MIN_REPLAY_SPEED || speed > MAX_REPLAY_SPEED) {
    throw new RangeError(`speed must be between ${MIN_REPLAY_SPEED}x and ${MAX_REPLAY_SPEED}x`);
  }
  return speed;
}

function validateWallClock(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError('wall clock time must be a finite timestamp');
}

function timestampMs(value: Date | number): number {
  const result = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(result)) throw new RangeError('replay time must be a valid timestamp');
  return result;
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
