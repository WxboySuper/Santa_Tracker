const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

/**
 * How long after takeoff the page keeps saying Santa is flying (covers Dec 24 in every timezone,
 * until Dec 25 12:00 UTC). After this the countdown rolls over to next year.
 */
export const FLIGHT_WINDOW_MS = 26 * HOUR_MS;

function takeoffForYear(year: number): number {
  return Date.UTC(year, 11, 24, 10, 0, 0);
}

export function nextTakeoff(now: Date): number {
  const year = now.getUTCFullYear();
  const target = takeoffForYear(year);
  return now.getTime() < target ? target : takeoffForYear(year + 1);
}

/**
 * The takeoff the page should count towards right now. During the flight window this is this
 * year's takeoff (already passed, so the countdown reads "done" and the page says Santa is
 * flying) instead of jumping straight to next year. Recompute it every tick so a tab left open
 * across takeoff, or across the end of the window, updates by itself.
 */
export function countdownTarget(now: Date): number {
  const takeoff = takeoffForYear(now.getUTCFullYear());
  const t = now.getTime();
  return t >= takeoff && t < takeoff + FLIGHT_WINDOW_MS ? takeoff : nextTakeoff(now);
}

export type CountdownParts = {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Split the time remaining until `target` into whole units. All zero and `done` once reached. */
export function getCountdownParts(target: number, now: Date): CountdownParts {
  const remaining = target - now.getTime();
  if (!(remaining > 0)) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    done: false,
    days: Math.floor(remaining / DAY_MS),
    hours: Math.floor((remaining % DAY_MS) / HOUR_MS),
    minutes: Math.floor((remaining % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((remaining % MINUTE_MS) / SECOND_MS),
  };
}

export function formatCountdown(target: number, now: Date, flyingText = "Santa is on his way!"): string {
  const { done, days, hours, minutes, seconds } = getCountdownParts(target, now);
  if (done) return flyingText;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
