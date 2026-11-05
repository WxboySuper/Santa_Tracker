const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export function nextTakeoff(now: Date): number {
  const year = now.getUTCFullYear();
  const target = Date.UTC(year, 11, 24, 10, 0, 0);
  return now.getTime() < target ? target : Date.UTC(year + 1, 11, 24, 10, 0, 0);
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
