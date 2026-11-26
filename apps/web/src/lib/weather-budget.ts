/** A single global Durable Object keeps fallback requests below provider limits across colos. */
interface BudgetStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(values: Record<string, unknown>): Promise<void>;
  transaction<T>(callback: (storage: BudgetStorage) => Promise<T>): Promise<T>;
  getAlarm(): Promise<number | null>;
  setAlarm(timestamp: number): Promise<void>;
  list(options: { prefix: string }): Promise<Map<string, unknown>>;
  delete(keys: string[]): Promise<void>;
}
interface BudgetState { storage: BudgetStorage }
type BudgetRequest = { fallbackCell: string | null };
const DAY_LIMIT = 900;
const MINUTE_LIMIT = 300;
const FALLBACK_COOLDOWN_MS = 15 * 60_000;

export class WeatherFallbackBudget {
  constructor(private readonly state: BudgetState) {}

  async fetch(request: Request): Promise<Response> {
    const parsed = parseBudgetRequest(request);
    if (parsed instanceof Response) return parsed;
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const allowed = await this.consumeBudget(now, minute, parsed.fallbackCell);
    if (!allowed) {
      await this.scheduleMinuteCleanup(minute);
      return new Response(null, { status: 429 });
    }
    await this.scheduleMinuteCleanup(minute);
    return new Response(null, { status: 204 });
  }

  private async consumeBudget(now: number, minute: number, fallbackCell: string | null): Promise<boolean> {
    const day = new Date(now).toISOString().slice(0, 10);
    return this.state.storage.transaction(async storage => {
      const dayKey = `day:${day}`;
      const minuteKey = `minute:${minute}`;
      const daily = await storage.get<number>(dayKey) ?? 0;
      const perMinute = await storage.get<number>(minuteKey) ?? 0;
      if (daily >= DAY_LIMIT || perMinute >= MINUTE_LIMIT) return false;
      const fallbackKey = fallbackCell ? `fallback:${fallbackCell}` : null;
      if (fallbackKey && await wasRecentlyUsed(storage, fallbackKey, now)) return false;
      const updates: Record<string, unknown> = { [dayKey]: daily + 1, [minuteKey]: perMinute + 1 };
      if (fallbackKey) updates[fallbackKey] = now;
      await storage.put(updates);
      return true;
    });
  }

  private async scheduleMinuteCleanup(minute: number): Promise<void> {
    const existingAlarm = await this.state.storage.getAlarm();
    const cleanupAt = (minute + 2) * 60_000;
    if (existingAlarm === null || existingAlarm > cleanupAt) await this.state.storage.setAlarm(cleanupAt);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const [minuteKeys, dayKeys, fallbackKeys] = await Promise.all([
      this.state.storage.list({ prefix: "minute:" }),
      this.state.storage.list({ prefix: "day:" }),
      this.state.storage.list({ prefix: "fallback:" }),
    ]);
    const expired = [
      ...expiredMinuteKeys(minuteKeys, now),
      ...expiredDayKeys(dayKeys, now),
      ...expiredFallbackKeys(fallbackKeys, now),
    ];
    if (expired.length) await this.state.storage.delete(expired);
    const nextAlarm = nextCleanupTime(minuteKeys, dayKeys, fallbackKeys, expired, now);
    if (nextAlarm !== null) await this.state.storage.setAlarm(nextAlarm);
  }
}

function parseBudgetRequest(request: Request): BudgetRequest | Response {
  const url = new URL(request.url);
  if (url.pathname !== "/consume") return new Response(null, { status: 404 });
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const source = url.searchParams.get("source");
  const fallbackCell = source === "fallback" ? url.searchParams.get("cell") : null;
  if (source === "fallback" && (!fallbackCell || !/^cell:-?\d+\.\d{2}:-?\d+\.\d{2}$/.test(fallbackCell))) {
    return new Response(null, { status: 400 });
  }
  return { fallbackCell };
}

async function wasRecentlyUsed(storage: BudgetStorage, key: string, now: number): Promise<boolean> {
  const lastUse = await storage.get<number>(key);
  return lastUse !== undefined && now - lastUse < FALLBACK_COOLDOWN_MS;
}

function expiredMinuteKeys(keys: Map<string, unknown>, now: number): string[] {
  const minute = Math.floor(now / 60_000);
  return [...keys.keys()].filter(key => Number(key.slice("minute:".length)) < minute - 1);
}

function expiredDayKeys(keys: Map<string, unknown>, now: number): string[] {
  const today = new Date(now).toISOString().slice(0, 10);
  return [...keys.keys()].filter(key => key.slice("day:".length) < today);
}

function expiredFallbackKeys(keys: Map<string, unknown>, now: number): string[] {
  return [...keys].filter(([, value]) => typeof value === "number" && value <= now - FALLBACK_COOLDOWN_MS).map(([key]) => key);
}

function nextCleanupTime(
  minutes: Map<string, unknown>, days: Map<string, unknown>, fallbacks: Map<string, unknown>,
  expired: string[], now: number,
): number | null {
  const pendingMinutes = [...minutes.keys()].filter(key => !expired.includes(key));
  const times = pendingMinutes.map(key => (Number(key.slice("minute:".length)) + 2) * 60_000);
  times.push(...pendingFallbackDeadlines(fallbacks, expired));
  if (hasCurrentDayKey(days, expired, now)) times.push(nextUtcDay(now));
  const pending = times.filter(time => Number.isFinite(time) && time > now);
  return pending.length ? Math.min(...pending) : null;
}

function pendingFallbackDeadlines(fallbacks: Map<string, unknown>, expired: string[]): number[] {
  return [...fallbacks].filter(([key, value]) => !expired.includes(key) && typeof value === "number")
    .map(([, value]) => (value as number) + FALLBACK_COOLDOWN_MS);
}

function hasCurrentDayKey(days: Map<string, unknown>, expired: string[], now: number): boolean {
  const currentDay = `day:${new Date(now).toISOString().slice(0, 10)}`;
  return days.has(currentDay) && !expired.includes(currentDay);
}

function nextUtcDay(now: number): number {
  const today = new Date(now).toISOString().slice(0, 10);
  return Date.parse(`${today}T00:00:00.000Z`) + 24 * 60 * 60_000;
}
