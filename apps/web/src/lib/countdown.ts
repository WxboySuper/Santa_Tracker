const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export function nextTakeoff(now: Date): number {
  const year = now.getUTCFullYear();
  const target = Date.UTC(year, 11, 24, 10, 0, 0);
  return now.getTime() < target ? target : Date.UTC(year + 1, 11, 24, 10, 0, 0);
}

export function formatCountdown(target: number, now: Date, flyingText = "Santa is on his way!"): string {
  const remaining = target - now.getTime();
  if (remaining <= 0) return flyingText;
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((remaining % MINUTE_MS) / SECOND_MS);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
